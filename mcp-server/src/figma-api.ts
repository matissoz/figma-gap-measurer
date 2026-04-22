// Figma REST API client

const FIGMA_API = 'https://api.figma.com/v1';

/** Log to stderr so it doesn't interfere with MCP stdio transport */
export function log(message: string, ...args: any[]) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}] ${message}`, ...args);
}

function getToken(): string {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) throw new Error('FIGMA_ACCESS_TOKEN environment variable is required');
  return token;
}

async function figmaFetch(path: string): Promise<any> {
  log(`API → GET ${path}`);
  const start = Date.now();
  const res = await fetch(`${FIGMA_API}${path}`, {
    headers: { 'X-Figma-Token': getToken() },
  });
  const elapsed = Date.now() - start;
  if (!res.ok) {
    const text = await res.text();
    log(`API ✗ ${res.status} (${elapsed}ms)`);
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const waitSecs = retryAfter ? parseInt(retryAfter, 10) : 60;
      throw new Error(
        `Figma API rate limit exceeded (429). ` +
        `Try again in ~${waitSecs} seconds. ` +
        `Options: (1) Wait ${waitSecs}s and retry, or (2) reduce the number of concurrent API calls (use lower depth values, inspect fewer nodes at once).`
      );
    }
    throw new Error(`Figma API ${res.status}: ${text}`);
  }
  log(`API ✓ ${res.status} (${elapsed}ms)`);
  return res.json();
}

// ── Parse Figma URL ──

export function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } {
  // https://www.figma.com/design/FILE_KEY/Name?node-id=X-Y
  // https://www.figma.com/file/FILE_KEY/Name?node-id=X-Y
  const match = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
  if (!match) throw new Error(`Invalid Figma URL: ${url}`);
  const fileKey = match[1];

  const nodeMatch = url.match(/node-id=([^&]+)/);
  const nodeId = nodeMatch ? decodeURIComponent(nodeMatch[1]) : undefined;

  return { fileKey, nodeId };
}

// ── File structure ──

export async function getFilePages(fileKey: string): Promise<any> {
  const data = await figmaFetch(`/files/${fileKey}?depth=2`);
  return data.document.children.map((page: any) => ({
    id: page.id,
    name: page.name,
    frames: page.children?.map((f: any) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      width: f.absoluteBoundingBox?.width,
      height: f.absoluteBoundingBox?.height,
    })) ?? [],
  }));
}

// ── Get node tree ──

export async function getNode(fileKey: string, nodeId: string): Promise<any> {
  const data = await figmaFetch(`/files/${fileKey}/nodes?ids=${nodeId}&geometry=paths`);
  const node = data.nodes[nodeId];
  if (!node) throw new Error(`Node ${nodeId} not found`);
  return node.document;
}

// ── Color helpers ──

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function extractColors(node: any): string[] {
  const colors: string[] = [];
  if (node.fills) {
    for (const fill of node.fills) {
      if (fill.type === 'SOLID' && fill.visible !== false) {
        const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
        const opacity = fill.opacity != null && fill.opacity < 1
          ? ` ${Math.round(fill.opacity * 100)}%` : '';
        colors.push(`Fill: ${hex}${opacity}`);
      }
      if (fill.type === 'GRADIENT_LINEAR') {
        const stops = fill.gradientStops?.map((s: any) =>
          `${rgbToHex(s.color.r, s.color.g, s.color.b)} ${Math.round(s.position * 100)}%`
        ).join(' → ');
        colors.push(`Gradient: ${stops}`);
      }
    }
  }
  if (node.strokes) {
    for (const stroke of node.strokes) {
      if (stroke.type === 'SOLID' && stroke.visible !== false) {
        colors.push(`Stroke: ${rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b)}`);
      }
    }
  }
  return colors;
}

// ── Typography helpers ──

function extractTypography(node: any): string[] {
  if (node.type !== 'TEXT') return [];
  const info: string[] = [];
  const style = node.style;
  if (!style) return info;

  const parts: string[] = [];
  if (style.fontFamily) parts.push(`${style.fontFamily} ${style.fontPostScriptName?.split('-').pop() || ''}`);
  if (style.fontSize) parts.push(`${style.fontSize}px`);
  if (style.lineHeightPx) parts.push(`LH: ${Math.round(style.lineHeightPx)}px`);
  else if (style.lineHeightPercent) parts.push(`LH: ${Math.round(style.lineHeightPercent)}%`);
  if (style.fontWeight) parts.push(`W: ${style.fontWeight}`);
  if (style.letterSpacing && style.letterSpacing !== 0) parts.push(`LS: ${style.letterSpacing}px`);

  if (parts.length > 0) info.push(parts.join(' · '));

  // Text content (120 chars to preserve meaningful content)
  if (node.characters) {
    const text = node.characters.length > 120
      ? node.characters.slice(0, 120) + '…'
      : node.characters;
    info.push(`Text: "${text}"`);
  }

  return info;
}

// ── Layout helpers ──

function extractLayout(node: any): string[] {
  const info: string[] = [];
  const box = node.absoluteBoundingBox;
  if (box) {
    info.push(`Size: ${Math.round(box.width)} × ${Math.round(box.height)}`);
    info.push(`Position: x=${Math.round(box.x)}, y=${Math.round(box.y)}`);
  }

  if (node.layoutMode) {
    info.push(`Layout: ${node.layoutMode}`);
    if (node.itemSpacing != null) info.push(`Gap: ${node.itemSpacing}px`);
    if (node.paddingLeft || node.paddingRight || node.paddingTop || node.paddingBottom) {
      info.push(`Padding: ${node.paddingTop ?? 0} ${node.paddingRight ?? 0} ${node.paddingBottom ?? 0} ${node.paddingLeft ?? 0}`);
    }
    // Flex alignment — maps to CSS justify-content (main axis) and align-items (cross axis)
    if (node.primaryAxisAlignItems && node.primaryAxisAlignItems !== 'MIN') {
      info.push(`Main-axis align: ${node.primaryAxisAlignItems}`);
    }
    if (node.counterAxisAlignItems && node.counterAxisAlignItems !== 'MIN') {
      info.push(`Cross-axis align: ${node.counterAxisAlignItems}`);
    }
    if (node.layoutWrap === 'WRAP') {
      info.push(`Wrap: yes`);
    }
  }

  if (node.cornerRadius) info.push(`Radius: ${node.cornerRadius}px`);
  if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    if (tl === tr && tr === br && br === bl) {
      info.push(`Radius: ${tl}px`);
    } else {
      info.push(`Radius: ${tl} ${tr} ${br} ${bl}`);
    }
  }

  if (node.opacity != null && node.opacity < 1) {
    info.push(`Opacity: ${Math.round(node.opacity * 100)}%`);
  }

  return info;
}

// ── Bound variables / styles ──

function extractStyles(node: any, fileStyles: Record<string, any>): string[] {
  const info: string[] = [];
  if (node.styles) {
    for (const [type, styleId] of Object.entries(node.styles)) {
      const style = fileStyles[styleId as string];
      if (style) info.push(`${type} style: ${style.name}`);
    }
  }
  return info;
}

// ── Build node inspection ──

export interface NodeInspection {
  id: string;
  name: string;
  type: string;
  layout: string[];
  colors: string[];
  typography: string[];
  styles: string[];
  children?: NodeInspection[];
}

export function inspectNode(
  node: any,
  fileStyles: Record<string, any> = {},
  depth: number = 0,
  maxDepth: number = 4,
  parentBox?: { x: number; y: number; width: number; height: number },
): NodeInspection {
  const layout = extractLayout(node);

  // Compare child position/size relative to parent
  const box = node.absoluteBoundingBox;
  if (parentBox && box) {
    if (Math.abs(box.width - parentBox.width) < 2) {
      layout.push('⚠ Full-width (matches parent)');
    }
    // Detect horizontal centering within parent
    if (parentBox.x !== undefined && box.width < parentBox.width) {
      const leftOffset = box.x - parentBox.x;
      const rightOffset = (parentBox.x + parentBox.width) - (box.x + box.width);
      if (Math.abs(leftOffset - rightOffset) < 4) {
        layout.push('↔ Centered horizontally in parent');
      }
    }
  }

  const result: NodeInspection = {
    id: node.id,
    name: node.name,
    type: node.type,
    layout,
    colors: extractColors(node),
    typography: extractTypography(node),
    styles: extractStyles(node, fileStyles),
  };

  if (node.children && depth < maxDepth) {
    const currentBox = box ? { x: box.x, y: box.y, width: box.width, height: box.height } : undefined;
    result.children = node.children
      .filter((c: any) => c.visible !== false)
      .map((child: any) => inspectNode(child, fileStyles, depth + 1, maxDepth, currentBox));
  }

  return result;
}

// ── Gap calculation ──

interface Bounds {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GapMeasurement {
  from: string;
  to: string;
  direction: 'horizontal' | 'vertical';
  gap: number;
}

export function measureGaps(node: any): GapMeasurement[] {
  if (!node.children) return [];

  const children: Bounds[] = node.children
    .filter((c: any) => c.visible !== false && c.absoluteBoundingBox)
    .map((c: any) => ({
      name: c.name,
      x: c.absoluteBoundingBox.x,
      y: c.absoluteBoundingBox.y,
      width: c.absoluteBoundingBox.width,
      height: c.absoluteBoundingBox.height,
    }));

  const gaps: GapMeasurement[] = [];

  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i];
      const b = children[j];

      // Check vertical overlap (horizontal gap)
      const yOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (yOverlap > 0) {
        const hGap = Math.abs(
          Math.min(a.x, b.x) === a.x
            ? b.x - (a.x + a.width)
            : a.x - (b.x + b.width)
        );
        if (hGap > 0 && hGap < 500) {
          gaps.push({
            from: a.name,
            to: b.name,
            direction: 'horizontal',
            gap: Math.round(hGap),
          });
        }
      }

      // Check horizontal overlap (vertical gap)
      const xOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      if (xOverlap > 0) {
        const vGap = Math.abs(
          Math.min(a.y, b.y) === a.y
            ? b.y - (a.y + a.height)
            : a.y - (b.y + b.height)
        );
        if (vGap > 0 && vGap < 500) {
          gaps.push({
            from: a.name,
            to: b.name,
            direction: 'vertical',
            gap: Math.round(vGap),
          });
        }
      }
    }
  }

  // Sort by gap size and deduplicate nearest
  return gaps.sort((a, b) => a.gap - b.gap);
}

/** Recursively measure gaps at all levels of the tree */
export interface RecursiveGapResult {
  parent: string;
  parentId: string;
  gaps: GapMeasurement[];
}

export function measureGapsRecursive(
  node: any,
  depth: number = 0,
  maxDepth: number = 3,
): RecursiveGapResult[] {
  const results: RecursiveGapResult[] = [];

  const gaps = measureGaps(node);
  if (gaps.length > 0) {
    results.push({
      parent: node.name,
      parentId: node.id,
      gaps,
    });
  }

  if (node.children && depth < maxDepth) {
    for (const child of node.children) {
      if (child.visible !== false && child.children) {
        results.push(...measureGapsRecursive(child, depth + 1, maxDepth));
      }
    }
  }

  return results;
}

export function formatGapsRecursive(results: RecursiveGapResult[]): string {
  if (results.length === 0) return 'No gaps found at any level.';
  return results.map(r => {
    const header = `── "${r.parent}" (${r.parentId}) ──`;
    const gapLines = r.gaps.map(g =>
      `  ${g.direction === 'horizontal' ? '↔' : '↕'} ${g.gap}px: "${g.from}" → "${g.to}"`
    ).join('\n');
    return `${header}\n${gapLines}`;
  }).join('\n\n');
}

// ── Export image ──

export async function exportImage(
  fileKey: string,
  nodeId: string,
  format: 'png' | 'svg' | 'jpg' | 'pdf' = 'png',
  scale: number = 2,
): Promise<Buffer> {
  const data = await figmaFetch(
    `/images/${fileKey}?ids=${nodeId}&format=${format}&scale=${scale}`
  );

  const imageUrl = data.images?.[nodeId];
  if (!imageUrl) throw new Error(`No image URL returned for node ${nodeId}`);

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Get file styles ──

export async function getFileStyles(fileKey: string): Promise<Record<string, any>> {
  const data = await figmaFetch(`/files/${fileKey}?depth=1`);
  return data.styles ?? {};
}

// ── Format inspection as text ──

export function formatInspection(node: NodeInspection, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];

  lines.push(`${pad}[${node.type}] ${node.name} (${node.id})`);
  for (const l of node.layout) lines.push(`${pad}  ${l}`);
  for (const c of node.colors) lines.push(`${pad}  ${c}`);
  for (const t of node.typography) lines.push(`${pad}  ${t}`);
  for (const s of node.styles) lines.push(`${pad}  ${s}`);

  if (node.children) {
    for (const child of node.children) {
      lines.push(formatInspection(child, indent + 1));
    }
  }

  return lines.join('\n');
}

export function formatGaps(gaps: GapMeasurement[]): string {
  if (gaps.length === 0) return 'No gaps found between children.';
  return gaps.map(g =>
    `${g.direction === 'horizontal' ? '↔' : '↕'} ${g.gap}px: "${g.from}" → "${g.to}"`
  ).join('\n');
}
