# Design Inspector — Figma Plugin

A Figma plugin that annotates your designs with gaps, typography, and color info — so you can screenshot everything AI coding tools need in two shots.

## Why

When building from Figma designs with Claude Code (or similar), you need to communicate:
- **Gaps & spacing** between elements
- **Typography** — font family, size, weight, line height
- **Colors** — fill and stroke hex values

This plugin overlays all of that onto your design in one click. Take an annotated screenshot, clear it, take a clean screenshot — done.

## Commands

| Command | What it does |
|---|---|
| **Annotate all** | Overlays gaps + typography + colors for selected elements. The all-in-one option. |
| Measure gaps between selected | Shows gap measurements between all selected elements |
| Measure to all siblings | Select 1 element → shows gaps to every sibling + parent padding |
| Inspect colors & typography | Shows fill/stroke colors, font info, and text children details |
| Clear annotations | Removes all measurement overlays |

## Workflow

1. Select the section/component you want to implement
2. Run **Annotate all** → screenshot the annotated view
3. Run **Clear annotations** → screenshot the clean view
4. Paste both screenshots into Claude Code with your implementation request

## Setup

> **Important:** You must use the **Figma desktop app** to import local plugins. The browser version of Figma does not support importing plugins from a manifest file. Once imported via the desktop app, the plugin will also be available in Figma for browser.

1. Clone this repo
2. Install dependencies and build:
   ```bash
   npm install
   npx tsc
   ```
3. Open the **Figma desktop app**
4. Go to **Plugins → Development → Import plugin from manifest**
5. Point to the `manifest.json` in this folder
6. Right-click any element → **Plugins → Design Inspector**

## Development

```bash
# Install dependencies
npm install

# Build (compiles code.ts → code.js)
npx tsc

# Watch mode
npx tsc --watch
```

## How annotations look

- **Gap lines**: Pink dashed lines with pixel values in pink badges
- **Info tags**: Dark tooltips showing dimensions, colors (hex + style/variable names), and typography details
- All annotations are placed in a locked group called "🔍 Gap Measurements" that won't interfere with your design

## License

MIT
