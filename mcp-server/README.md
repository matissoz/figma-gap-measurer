# Figma Design Inspector — MCP Server

An MCP server that gives AI coding tools (Claude Code, etc.) direct access to Figma design specs — typography, colors, spacing, gaps, layout — without screenshots.

## Setup

### 1. Get a Figma Personal Access Token

1. Go to [Figma Settings → Account](https://www.figma.com/settings) (or Figma desktop → menu → Settings)
2. Scroll to **Personal access tokens**
3. Generate a new token, copy it

### 2. Build the server

```bash
cd mcp-server
npm install
npm run build
```

### 3. Add to Claude Code

Run this in your terminal:

```bash
claude mcp add figma-design-inspector -- node /FULL/PATH/TO/figma-gap-measurer/mcp-server/dist/index.js
```

Then set the token:

```bash
export FIGMA_ACCESS_TOKEN=your_token_here
```

Or add it to your shell profile (`~/.zshrc` / `~/.bashrc`):

```bash
echo 'export FIGMA_ACCESS_TOKEN=your_token_here' >> ~/.zshrc
```

### Alternative: Add via settings JSON

Add to `~/.claude/settings.json` or project `.claude/settings.json`:

```json
{
  "mcpServers": {
    "figma-design-inspector": {
      "command": "node",
      "args": ["/FULL/PATH/TO/figma-gap-measurer/mcp-server/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `inspect_node` | Returns typography, colors, layout, spacing, position, and applied styles for a node and its children. Includes node IDs for drilling down. Flags full-width and centered elements. |
| `measure_gaps` | Calculates gaps between children of a frame. Supports **recursive mode** (`depth` param) to measure gaps at ALL levels in one call — gives the full spacing picture for an entire page. |
| `get_file_structure` | Lists pages and top-level frames with their node IDs and dimensions. |
| `export_image` | Exports a Figma node as PNG, JPG, SVG, or PDF at 2x scale (retina). |
| `optimize_image` | Converts images to WebP/AVIF with compression and optional resizing. Always run after `export_image`. |

## Output features

The inspect output includes smart annotations to help catch common design patterns:

- **Node IDs** — every node shows its ID (e.g., `[FRAME] Hero (257:2524)`), so you can drill into any child with `inspect_node` or `measure_gaps`
- **Position data** — `Position: x=80, y=466` for every element, so you can calculate spacing between siblings and detect alignment
- **`⚠ Full-width (matches parent)`** — flags elements that stretch edge-to-edge (hero images, CTA backgrounds)
- **`↔ Centered horizontally in parent`** — flags horizontally centered elements (titles, content containers)
- **Flex alignment** — `Main-axis align: CENTER` / `Cross-axis align: CENTER` show when elements are centered via flexbox (maps to CSS `justify-content` / `align-items`). Only non-default values shown.

## Logging

All tool calls and Figma API requests are logged to **stderr** with timestamps and durations. This doesn't interfere with MCP stdio transport. Example:

```
[14:23:01.123] inspect_node called — file_key=abc123 node_id=257:2524 depth=4
[14:23:01.124] API → GET /files/abc123/nodes?ids=257:2524&geometry=paths
[14:23:01.892] API ✓ 200 (768ms)
[14:23:01.895]   inspect_node done (772ms) — 142 lines
```

## Usage with Claude Code

Just paste a Figma URL:

> "Implement this section: https://www.figma.com/design/abc123/MyDesign?node-id=1-234"

Claude Code will use the MCP to fetch the exact specs and implement them.

## Workflow

### Desktop-first
1. Share a Figma URL for the page/section
2. Use `get_file_structure` to find frames and node IDs
3. Use `inspect_node` on each section to get exact specs
4. Use `measure_gaps` with `depth=2-3` to get ALL spacing at every level
5. Use `export_image` + `optimize_image` for any images/icons
6. Implement section by section, top to bottom

### Mobile responsive
1. Share the mobile frame URL after desktop is done
2. Inspect the mobile frame to compare with desktop specs
3. Add responsive classes (sm:, md:) without changing desktop styles

### Common design patterns the MCP helps catch

| Pattern | What to look for in output |
|---|---|
| **Full-width hero/CTA** | Image frame marked `⚠ Full-width`, title/content frame marked `↔ Centered` with smaller width |
| **Page background color** | `Fill:` on the top-level page frame — don't assume white (`#F4F4F4` is common) |
| **Badge/pill labels** | Small frame with `Radius: 12px`, `Fill: #FFFFFF`, and icon + text children |
| **Per-corner radius** | `Radius: 0 0 32 32` means only bottom corners are rounded |
| **Gap vs padding** | `Gap: 16px` = CSS flexbox gap, `Padding: 64 64 64 64` = CSS padding |
| **Flex alignment** | `Main-axis align: CENTER` = justify-content: center, `Cross-axis align: CENTER` = align-items: center. MIN = start (default, hidden). |
| **Content-fit elements** | Child much smaller than parent (126px in 544px column) → needs `w-fit` / `self-start`, not stretched |

## License

MIT
