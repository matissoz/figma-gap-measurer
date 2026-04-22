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
| `inspect_node` | Returns typography, colors, layout, spacing for a node and its children |
| `measure_gaps` | Calculates gaps between direct children of a frame |
| `get_file_structure` | Lists pages and top-level frames with their node IDs |

## Usage with Claude Code

Just paste a Figma URL:

> "Implement this section: https://www.figma.com/design/abc123/MyDesign?node-id=1-234"

Claude Code will use the MCP to fetch the exact specs and implement them.

## Workflow

### Desktop-first
1. Share a Figma URL for the page/section
2. Claude inspects each section via the MCP
3. Implements with exact typography, colors, spacing

### Mobile responsive
1. Share the mobile frame URL after desktop is done
2. Claude compares mobile specs with existing desktop code
3. Adds responsive classes (sm:, md:) without changing desktop styles

## License

MIT
