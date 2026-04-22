#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  parseFigmaUrl,
  getFilePages,
  getNode,
  getFileStyles,
  exportImage,
  inspectNode,
  measureGaps,
  measureGapsRecursive,
  formatInspection,
  formatGaps,
  formatGapsRecursive,
  log,
} from './figma-api.js';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

const server = new McpServer(
  {
    name: 'figma-design-inspector',
    version: '1.0.0',
  },
  {
    capabilities: { tools: {} },
    instructions: `# Figma Design Inspector MCP

This server inspects Figma designs and returns structured data about typography, colors, spacing, layout, and gaps between elements.

## Available Tools

### inspect_node
Inspect a Figma node by URL or file key + node ID. Returns the full design spec: typography (font, size, weight, line height), colors (fills, strokes, gradients), layout (dimensions, padding, gaps, border radius), and applied styles.

### measure_gaps
Measure gaps/spacing between children of a Figma frame. Supports recursive mode (depth > 0) to measure gaps at ALL levels in one call — use this to get the full spacing picture for an entire page before implementing.

### get_file_structure
List all pages and top-level frames in a Figma file. Use this to find node IDs.

### export_image
Export an image/icon/illustration node from Figma as PNG, JPG, SVG, or PDF. Saves to a local path at 2x scale for retina.

### optimize_image
ALWAYS run this after export_image or when adding any image to the project. Converts to WebP (default) for optimal web performance. Can also resize images.

## Workflow for implementing designs

### Desktop-first implementation
1. User provides a Figma URL or screenshot of the full page
2. Use \`get_file_structure\` to find sections/frames
3. Use \`inspect_node\` on each section to get exact specs
4. Use \`measure_gaps\` with depth=2-3 to get ALL spacing between elements at every level
5. Implement section by section, top to bottom
6. After each section, verify dimensions match the specs

### Mobile responsive adjustments
When the user provides a mobile view (screenshot or Figma URL):
1. Inspect the mobile frame to get mobile-specific values
2. Compare with existing desktop implementation
3. Only add/modify responsive classes (sm:, md: breakpoints) — do NOT change desktop styles
4. Common mobile adjustments: font sizes, padding, gaps, layout direction (row→column), hiding elements

### Working from screenshots
If the user provides a screenshot instead of a Figma URL:
1. Split the page into logical sections (hero, features, footer, etc.)
2. Work section by section from top to bottom
3. For each section, identify: typography sizes, colors, spacing/gaps, layout structure
4. Implement one section at a time, verify, then move to the next

## Common design patterns to watch for

### Full-width image with contained content (Hero / CTA sections)
A very common pattern: a background image or color stretches full viewport width, but the text/content inside is centered within a max-width container. Look for:
- A frame marked "⚠ Full-width (matches parent)" — the image/background stretches edge-to-edge
- A smaller child frame with different width — this is the content container
- The content child is typically centered (auto margins) with a max-width
- Border radius often only on specific corners (e.g., bottom-only: \`0 0 32 32\`) — check \`rectangleCornerRadii\` for per-corner values
Implementation: the outer wrapper is full-width with the bg image, the inner content div has \`max-width\` + \`mx-auto\`.

### Page/section background color
Always check the Fill color on parent frames — this is the page/section background. Common values:
- \`#F4F4F4\` (light gray/ash) — NOT white, needs explicit \`bg-tertiary\` or similar
- \`#FFFFFF\` (white) — only assume white if explicitly set
If the background isn't \`#FFFFFF\`, you MUST set it explicitly in the implementation.

### Badge/pill components
Small frames with: border-radius ≥ 8px, horizontal layout, small padding (4-12px), background fill, icon + text children. These are decorative labels above section titles. Check:
- Background fill color (often white on gray backgrounds)
- Icon fill color and size
- Text size, weight, letter-spacing, color
- Border-radius (usually fully rounded or large value)

### Spacing: padding vs gap
- \`itemSpacing\` in Figma = CSS \`gap\` (flexbox)
- \`paddingTop/Right/Bottom/Left\` = CSS \`padding\`
- These are different and must both be implemented correctly`,
  },
);

// ── Tool: inspect_node ──

server.tool(
  'inspect_node',
  'Inspect a Figma node — returns typography, colors, spacing, layout, and styles for the node and its children. Accepts a Figma URL or file_key + node_id.',
  {
    url: z.string().optional().describe('Figma URL (e.g. https://www.figma.com/design/FILE_KEY/Name?node-id=X-Y)'),
    file_key: z.string().optional().describe('Figma file key (alternative to URL)'),
    node_id: z.string().optional().describe('Node ID (alternative to URL)'),
    depth: z.number().optional().describe('How deep to inspect children (default 4, max 8)'),
  },
  async (args) => {
    log(`inspect_node called — url=${args.url} file_key=${args.file_key} node_id=${args.node_id} depth=${args.depth}`);
    const start = Date.now();
    try {
      let fileKey: string;
      let nodeId: string;

      if (args.url) {
        const parsed = parseFigmaUrl(args.url);
        fileKey = parsed.fileKey;
        nodeId = parsed.nodeId ?? '0:1';
      } else if (args.file_key && args.node_id) {
        fileKey = args.file_key;
        nodeId = args.node_id;
      } else {
        return { content: [{ type: 'text' as const, text: 'Error: Provide either a Figma URL or file_key + node_id' }] };
      }

      log(`  Fetching node ${nodeId} from file ${fileKey}`);
      const [node, styles] = await Promise.all([
        getNode(fileKey, nodeId),
        getFileStyles(fileKey),
      ]);

      const maxDepth = Math.min(args.depth ?? 4, 8);
      const inspection = inspectNode(node, styles, 0, maxDepth);
      const text = formatInspection(inspection);

      log(`  inspect_node done (${Date.now() - start}ms) — ${text.split('\n').length} lines`);
      return { content: [{ type: 'text' as const, text }] };
    } catch (err: any) {
      log(`  inspect_node error: ${err.message}`);
      return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
    }
  },
);

// ── Tool: measure_gaps ──

server.tool(
  'measure_gaps',
  'Measure gaps/spacing between children of a Figma frame. Use depth > 0 to recursively measure gaps at ALL levels (sections, cards, etc.) in one call — gives the full spacing picture for an entire page.',
  {
    url: z.string().optional().describe('Figma URL of the parent frame'),
    file_key: z.string().optional().describe('Figma file key (alternative to URL)'),
    node_id: z.string().optional().describe('Node ID (alternative to URL)'),
    depth: z.number().optional().describe('How many levels deep to measure recursively (default 0 = direct children only, max 4). Use 2-3 for full-page gap analysis.'),
  },
  async (args) => {
    log(`measure_gaps called — url=${args.url} file_key=${args.file_key} node_id=${args.node_id} depth=${args.depth}`);
    const start = Date.now();
    try {
      let fileKey: string;
      let nodeId: string;

      if (args.url) {
        const parsed = parseFigmaUrl(args.url);
        fileKey = parsed.fileKey;
        nodeId = parsed.nodeId ?? '0:1';
      } else if (args.file_key && args.node_id) {
        fileKey = args.file_key;
        nodeId = args.node_id;
      } else {
        return { content: [{ type: 'text' as const, text: 'Error: Provide either a Figma URL or file_key + node_id' }] };
      }

      const node = await getNode(fileKey, nodeId);
      const maxDepth = Math.min(args.depth ?? 0, 4);

      if (maxDepth > 0) {
        // Recursive mode — measure gaps at all levels
        const results = measureGapsRecursive(node, 0, maxDepth);
        const text = formatGapsRecursive(results);
        log(`  measure_gaps recursive done (${Date.now() - start}ms) — ${results.length} frames with gaps`);
        return { content: [{ type: 'text' as const, text: `Recursive gaps in "${node.name}" (depth ${maxDepth}):\n\n${text}` }] };
      } else {
        // Direct children only
        const gaps = measureGaps(node);
        const text = formatGaps(gaps);
        log(`  measure_gaps done (${Date.now() - start}ms) — ${gaps.length} gaps found`);
        return { content: [{ type: 'text' as const, text: `Gaps in "${node.name}":\n\n${text}` }] };
      }
    } catch (err: any) {
      log(`  measure_gaps error: ${err.message}`);
      return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
    }
  },
);

// ── Tool: get_file_structure ──

server.tool(
  'get_file_structure',
  'List all pages and top-level frames in a Figma file. Use this to discover node IDs for further inspection.',
  {
    url: z.string().optional().describe('Figma URL'),
    file_key: z.string().optional().describe('Figma file key (alternative to URL)'),
  },
  async (args) => {
    log(`get_file_structure called — url=${args.url} file_key=${args.file_key}`);
    const start = Date.now();
    try {
      let fileKey: string;

      if (args.url) {
        fileKey = parseFigmaUrl(args.url).fileKey;
      } else if (args.file_key) {
        fileKey = args.file_key;
      } else {
        return { content: [{ type: 'text' as const, text: 'Error: Provide either a Figma URL or file_key' }] };
      }

      const pages = await getFilePages(fileKey);
      const lines: string[] = [];

      for (const page of pages) {
        lines.push(`Page: ${page.name} (${page.id})`);
        for (const frame of page.frames) {
          lines.push(`  [${frame.type}] ${frame.name} (${frame.id}) — ${frame.width}x${frame.height}`);
        }
      }

      log(`  get_file_structure done (${Date.now() - start}ms) — ${pages.length} pages`);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    } catch (err: any) {
      log(`  get_file_structure error: ${err.message}`);
      return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
    }
  },
);

// ── Tool: export_image ──

server.tool(
  'export_image',
  'Export an image/icon/illustration from Figma and save it to a local path. Exports at 2x scale by default for retina. Supports PNG, JPG, SVG, PDF.',
  {
    url: z.string().optional().describe('Figma URL of the node to export'),
    file_key: z.string().optional().describe('Figma file key (alternative to URL)'),
    node_id: z.string().optional().describe('Node ID (alternative to URL)'),
    format: z.enum(['png', 'jpg', 'svg', 'pdf']).optional().describe('Export format (default: png)'),
    scale: z.number().optional().describe('Export scale (default: 2 for retina)'),
    output_path: z.string().describe('Absolute path to save the exported file (e.g. /Users/.../public/assets/images/hero.png)'),
  },
  async (args) => {
    log(`export_image called — output=${args.output_path} format=${args.format} scale=${args.scale}`);
    const start = Date.now();
    try {
      let fileKey: string;
      let nodeId: string;

      if (args.url) {
        const parsed = parseFigmaUrl(args.url);
        fileKey = parsed.fileKey;
        nodeId = parsed.nodeId ?? '0:1';
      } else if (args.file_key && args.node_id) {
        fileKey = args.file_key;
        nodeId = args.node_id;
      } else {
        return { content: [{ type: 'text' as const, text: 'Error: Provide either a Figma URL or file_key + node_id' }] };
      }

      const format = args.format ?? 'png';
      const scale = args.scale ?? 2;
      const buffer = await exportImage(fileKey, nodeId, format, scale);

      // Ensure directory exists
      await fs.mkdir(path.dirname(args.output_path), { recursive: true });
      await fs.writeFile(args.output_path, buffer);

      const stats = await fs.stat(args.output_path);
      const sizeKB = (stats.size / 1024).toFixed(1);

      log(`  export_image done (${Date.now() - start}ms) — ${sizeKB} KB`);
      return {
        content: [{
          type: 'text' as const,
          text: `Exported ${format.toUpperCase()} at ${scale}x to ${args.output_path} (${sizeKB} KB)\n\nTip: Run optimize_image on this file to convert to WebP/AVIF for production.`,
        }],
      };
    } catch (err: any) {
      log(`  export_image error: ${err.message}`);
      return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
    }
  },
);

// ── Tool: optimize_image ──

server.tool(
  'optimize_image',
  'Optimize an image for web: converts to WebP (default) or AVIF, resizes if needed, and compresses. Always use this after export_image or when adding any image to the project.',
  {
    input_path: z.string().describe('Absolute path to the source image'),
    output_path: z.string().optional().describe('Output path (defaults to same path with .webp extension)'),
    format: z.enum(['webp', 'avif', 'png', 'jpg']).optional().describe('Output format (default: webp)'),
    quality: z.number().optional().describe('Quality 1-100 (default: 80 for webp, 65 for avif)'),
    max_width: z.number().optional().describe('Max width in pixels — will resize proportionally if larger'),
    max_height: z.number().optional().describe('Max height in pixels — will resize proportionally if larger'),
  },
  async (args) => {
    log(`optimize_image called — input=${args.input_path} format=${args.format}`);
    const start = Date.now();
    try {
      const format = args.format ?? 'webp';
      const inputPath = args.input_path;

      // Determine output path
      const ext = format === 'jpg' ? '.jpg' : `.${format}`;
      const outputPath = args.output_path ?? inputPath.replace(/\.[^.]+$/, ext);

      // Read input file stats
      const inputStats = await fs.stat(inputPath);
      const inputSizeKB = inputStats.size / 1024;

      // Build sharp pipeline
      let pipeline = sharp(inputPath);

      // Resize if max dimensions specified
      if (args.max_width || args.max_height) {
        pipeline = pipeline.resize({
          width: args.max_width,
          height: args.max_height,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Apply format-specific compression
      switch (format) {
        case 'webp':
          pipeline = pipeline.webp({ quality: args.quality ?? 80 });
          break;
        case 'avif':
          pipeline = pipeline.avif({ quality: args.quality ?? 65 });
          break;
        case 'png':
          pipeline = pipeline.png({ quality: args.quality ?? 80, compressionLevel: 9 });
          break;
        case 'jpg':
          pipeline = pipeline.jpeg({ quality: args.quality ?? 80, mozjpeg: true });
          break;
      }

      // Get metadata before saving
      const metadata = await sharp(inputPath).metadata();

      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await pipeline.toFile(outputPath);

      const outputStats = await fs.stat(outputPath);
      const outputSizeKB = outputStats.size / 1024;
      const savings = ((1 - outputSizeKB / inputSizeKB) * 100).toFixed(1);

      const lines = [
        `Optimized: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`,
        `Format: ${format.toUpperCase()} (quality: ${args.quality ?? (format === 'avif' ? 65 : 80)})`,
        `Original: ${inputSizeKB.toFixed(1)} KB (${metadata.width}x${metadata.height})`,
        `Optimized: ${outputSizeKB.toFixed(1)} KB`,
        `Savings: ${savings}%`,
      ];

      // If we resized
      if (args.max_width || args.max_height) {
        const outMeta = await sharp(outputPath).metadata();
        lines.push(`Resized to: ${outMeta.width}x${outMeta.height}`);
      }

      log(`  optimize_image done (${Date.now() - start}ms) — ${lines[3]}`);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    } catch (err: any) {
      log(`  optimize_image error: ${err.message}`);
      return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
    }
  },
);

// ── Start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
