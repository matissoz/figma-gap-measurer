const MEASUREMENT_GROUP_NAME = "🔍 Gap Measurements";
const LABEL_COLOR: RGB = { r: 1, g: 0.22, b: 0.37 }; // #FF3860
const LINE_COLOR: RGB = { r: 1, g: 0.22, b: 0.37 };
const INFO_COLOR: RGB = { r: 0.15, g: 0.15, b: 0.15 }; // #262626
const LEADER_COLOR: RGB = { r: 0.4, g: 0.4, b: 0.4 };
const TAG_MARGIN = 40; // px gap between design edge and info tags
const TAG_SPACING = 12; // px between stacked tags

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  node: SceneNode;
}

function getBounds(node: SceneNode): Bounds {
  const x = node.absoluteTransform[0][2];
  const y = node.absoluteTransform[1][2];
  const width = node.width;
  const height = node.height;
  return {
    x, y, width, height,
    right: x + width,
    bottom: y + height,
    centerX: x + width / 2,
    centerY: y + height / 2,
    node,
  };
}

interface Gap {
  from: Bounds;
  to: Bounds;
  direction: "horizontal" | "vertical";
  distance: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// ── Gap calculation ──

function calculateGaps(a: Bounds, b: Bounds): Gap[] {
  const gaps: Gap[] = [];
  const verticalOverlap = a.bottom > b.y && b.bottom > a.y;
  const horizontalOverlap = a.right > b.x && b.right > a.x;

  if (verticalOverlap) {
    const midY = (Math.max(a.y, b.y) + Math.min(a.bottom, b.bottom)) / 2;
    if (a.right <= b.x) {
      gaps.push({ from: a, to: b, direction: "horizontal", distance: Math.round(b.x - a.right), startX: a.right, startY: midY, endX: b.x, endY: midY });
    } else if (b.right <= a.x) {
      gaps.push({ from: b, to: a, direction: "horizontal", distance: Math.round(a.x - b.right), startX: b.right, startY: midY, endX: a.x, endY: midY });
    }
  }

  if (horizontalOverlap) {
    const midX = (Math.max(a.x, b.x) + Math.min(a.right, b.right)) / 2;
    if (a.bottom <= b.y) {
      gaps.push({ from: a, to: b, direction: "vertical", distance: Math.round(b.y - a.bottom), startX: midX, startY: a.bottom, endX: midX, endY: b.y });
    } else if (b.bottom <= a.y) {
      gaps.push({ from: b, to: a, direction: "vertical", distance: Math.round(a.y - b.bottom), startX: midX, startY: b.bottom, endX: midX, endY: a.y });
    }
  }

  if (!verticalOverlap && !horizontalOverlap) {
    const hDist = a.right <= b.x ? b.x - a.right : b.right <= a.x ? a.x - b.right : 0;
    const vDist = a.bottom <= b.y ? b.y - a.bottom : b.bottom <= a.y ? a.y - b.bottom : 0;
    if (hDist > 0) {
      const midY = (a.centerY + b.centerY) / 2;
      gaps.push({ from: a, to: b, direction: "horizontal", distance: Math.round(hDist), startX: a.right <= b.x ? a.right : b.right, startY: midY, endX: a.right <= b.x ? b.x : a.x, endY: midY });
    }
    if (vDist > 0) {
      const midX = (a.centerX + b.centerX) / 2;
      gaps.push({ from: a, to: b, direction: "vertical", distance: Math.round(vDist), startX: midX, startY: a.bottom <= b.y ? a.bottom : b.bottom, endX: midX, endY: a.bottom <= b.y ? b.y : a.y });
    }
  }

  return gaps;
}

// Only keep gaps between nearest neighbors (no element sitting between them)
function filterToNearestNeighbors(allBounds: Bounds[]): Gap[] {
  const gaps: Gap[] = [];

  for (let i = 0; i < allBounds.length; i++) {
    const a = allBounds[i];

    // Find nearest neighbor to the RIGHT of a
    let nearestRight: { bound: Bounds; dist: number } | null = null;
    for (let j = 0; j < allBounds.length; j++) {
      if (i === j) continue;
      const b = allBounds[j];
      // b must be to the right and have vertical overlap
      const vertOverlap = a.bottom > b.y && b.bottom > a.y;
      if (vertOverlap && b.x >= a.right) {
        const dist = b.x - a.right;
        if (!nearestRight || dist < nearestRight.dist) {
          nearestRight = { bound: b, dist };
        }
      }
    }

    // Find nearest neighbor BELOW a
    let nearestBelow: { bound: Bounds; dist: number } | null = null;
    for (let j = 0; j < allBounds.length; j++) {
      if (i === j) continue;
      const b = allBounds[j];
      const horizOverlap = a.right > b.x && b.right > a.x;
      if (horizOverlap && b.y >= a.bottom) {
        const dist = b.y - a.bottom;
        if (!nearestBelow || dist < nearestBelow.dist) {
          nearestBelow = { bound: b, dist };
        }
      }
    }

    if (nearestRight) {
      const g = calculateGaps(a, nearestRight.bound);
      for (const gap of g) {
        if (gap.direction === "horizontal") gaps.push(gap);
      }
    }

    if (nearestBelow) {
      const g = calculateGaps(a, nearestBelow.bound);
      for (const gap of g) {
        if (gap.direction === "vertical") gaps.push(gap);
      }
    }
  }

  // Deduplicate (A→B and B→A produce same gap)
  const seen = new Set<string>();
  return gaps.filter((gap) => {
    const key = `${gap.startX},${gap.startY},${gap.endX},${gap.endY}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Drawing primitives ──

function createLine(x1: number, y1: number, x2: number, y2: number, color: RGB = LINE_COLOR, dashed: boolean = true): LineNode {
  const line = figma.createLine();
  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const angle = Math.atan2(y2 - y1, x2 - x1);

  line.resize(Math.max(length, 0.01), 0);
  line.x = x1;
  line.y = y1;
  line.rotation = -angle * (180 / Math.PI);
  line.strokes = [{ type: "SOLID", color }];
  line.strokeWeight = 1;
  if (dashed) line.dashPattern = [4, 4];

  return line;
}

function createEndCap(x: number, y: number, direction: "horizontal" | "vertical"): LineNode {
  const cap = figma.createLine();
  const capSize = 6;

  if (direction === "horizontal") {
    cap.resize(0.01, 0);
    cap.x = x;
    cap.y = y - capSize / 2;
    cap.rotation = -90;
    cap.resize(capSize, 0);
  } else {
    cap.resize(capSize, 0);
    cap.x = x - capSize / 2;
    cap.y = y;
  }

  cap.strokes = [{ type: "SOLID", color: LINE_COLOR }];
  cap.strokeWeight = 1;
  return cap;
}

function createGapLabel(text: string, x: number, y: number, direction: "horizontal" | "vertical"): FrameNode {
  const frame = figma.createFrame();
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisAlignItems = "CENTER";
  frame.counterAxisAlignItems = "CENTER";
  frame.paddingLeft = 6;
  frame.paddingRight = 6;
  frame.paddingTop = 4;
  frame.paddingBottom = 4;
  frame.cornerRadius = 6;
  frame.fills = [{ type: "SOLID", color: LABEL_COLOR }];
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";

  const textNode = figma.createText();
  textNode.characters = text;
  textNode.fontSize = 13;
  textNode.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  textNode.fontName = { family: "Inter", style: "Bold" };
  frame.appendChild(textNode);

  if (direction === "horizontal") {
    frame.x = x;
    frame.y = y - 20;
  } else {
    frame.x = x + 8;
    frame.y = y;
  }

  return frame;
}

function drawGap(gap: Gap, group: GroupNode): void {
  if (gap.distance <= 0) return;

  const line = createLine(gap.startX, gap.startY, gap.endX, gap.endY);
  const cap1 = createEndCap(gap.startX, gap.startY, gap.direction);
  const cap2 = createEndCap(gap.endX, gap.endY, gap.direction);
  const midX = (gap.startX + gap.endX) / 2;
  const midY = (gap.startY + gap.endY) / 2;
  const label = createGapLabel(`${gap.distance}`, midX, midY, gap.direction);

  for (const node of [line, cap1, cap2, label]) {
    group.appendChild(node);
  }
}

// ── Info tags (positioned outside the design) ──

function createInfoTag(lines: string[], bgColor: RGB, x: number, y: number): FrameNode {
  const frame = figma.createFrame();
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.paddingLeft = 10;
  frame.paddingRight = 10;
  frame.paddingTop = 8;
  frame.paddingBottom = 8;
  frame.itemSpacing = 3;
  frame.cornerRadius = 8;
  frame.fills = [{ type: "SOLID", color: bgColor }];
  frame.effects = [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 2 }, radius: 8, spread: 0, visible: true, blendMode: "NORMAL" }];

  for (const line of lines) {
    const textNode = figma.createText();
    textNode.characters = line;
    textNode.fontSize = 11;
    textNode.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    textNode.fontName = { family: "Inter", style: "Regular" };
    frame.appendChild(textNode);
  }

  frame.x = x;
  frame.y = y;

  return frame;
}

function createLeaderLine(fromX: number, fromY: number, toX: number, toY: number, group: GroupNode): void {
  const line = createLine(fromX, fromY, toX, toY, LEADER_COLOR, true);
  line.strokeWeight = 0.5;
  line.dashPattern = [3, 3];
  line.opacity = 0.6;
  group.appendChild(line);

  // Small dot at the element end
  const dot = figma.createEllipse();
  dot.resize(4, 4);
  dot.x = fromX - 2;
  dot.y = fromY - 2;
  dot.fills = [{ type: "SOLID", color: LEADER_COLOR }];
  group.appendChild(dot);
}

// ── Element outline ──

function drawElementOutline(bounds: Bounds, group: GroupNode): void {
  const rect = figma.createRectangle();
  rect.x = bounds.x;
  rect.y = bounds.y;
  rect.resize(bounds.width, bounds.height);
  rect.fills = [];
  rect.strokes = [{ type: "SOLID", color: { r: 0.47, g: 0.32, b: 0.85 } }]; // Purple
  rect.strokeWeight = 1;
  rect.dashPattern = [6, 4];
  rect.opacity = 0.7;
  group.appendChild(rect);

  // Dimension label at bottom center
  const dimLabel = figma.createFrame();
  dimLabel.layoutMode = "HORIZONTAL";
  dimLabel.primaryAxisAlignItems = "CENTER";
  dimLabel.counterAxisAlignItems = "CENTER";
  dimLabel.paddingLeft = 4;
  dimLabel.paddingRight = 4;
  dimLabel.paddingTop = 1;
  dimLabel.paddingBottom = 1;
  dimLabel.cornerRadius = 3;
  dimLabel.fills = [{ type: "SOLID", color: { r: 0.47, g: 0.32, b: 0.85 } }];
  dimLabel.primaryAxisSizingMode = "AUTO";
  dimLabel.counterAxisSizingMode = "AUTO";

  const dimText = figma.createText();
  dimText.characters = `${Math.round(bounds.width)} × ${Math.round(bounds.height)}`;
  dimText.fontSize = 9;
  dimText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  dimText.fontName = { family: "Inter", style: "Bold" };
  dimLabel.appendChild(dimText);

  dimLabel.x = bounds.right + 6;
  dimLabel.y = bounds.bottom - 14;
  group.appendChild(dimLabel);
}

// ── Helpers ──

function getOrCreateMeasurementGroup(): GroupNode {
  clearMeasurements();
  const temp = figma.createLine();
  temp.resize(0.01, 0);
  temp.opacity = 0;
  const group = figma.group([temp], figma.currentPage);
  group.name = MEASUREMENT_GROUP_NAME;
  group.locked = true;
  return group;
}

function clearMeasurements(): void {
  for (const child of figma.currentPage.children) {
    if (child.name === MEASUREMENT_GROUP_NAME) {
      child.remove();
    }
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function getStyleName(styleId: string | typeof figma.mixed | undefined): string | null {
  if (!styleId || styleId === figma.mixed) return null;
  try {
    const style = figma.getStyleById(styleId as string);
    if (style) return style.name;
  } catch (_) {}
  return null;
}

function getColorsFromNode(node: SceneNode): string[] {
  const colors: string[] = [];

  // Resolve fill style name
  const fillStyleName = "fillStyleId" in node ? getStyleName((node as any).fillStyleId) : null;
  // Resolve stroke style name
  const strokeStyleName = "strokeStyleId" in node ? getStyleName((node as any).strokeStyleId) : null;

  if ("fills" in node) {
    const fills = node.fills;
    if (Array.isArray(fills)) {
      for (const fill of fills) {
        if (fill.type === "SOLID" && fill.visible !== false) {
          const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
          const opacity = fill.opacity !== undefined && fill.opacity < 1 ? ` ${Math.round(fill.opacity * 100)}%` : "";
          const label = fillStyleName ? `Fill: ${hex}${opacity} (${fillStyleName})` : `Fill: ${hex}${opacity}`;
          colors.push(label);
        }
      }
    }
  }
  if ("strokes" in node) {
    const strokes = node.strokes;
    if (Array.isArray(strokes)) {
      for (const stroke of strokes) {
        if (stroke.type === "SOLID" && stroke.visible !== false) {
          const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
          const label = strokeStyleName ? `Stroke: ${hex} (${strokeStyleName})` : `Stroke: ${hex}`;
          colors.push(label);
        }
      }
    }
  }
  return colors;
}

function getTypographyFromNode(node: SceneNode): string[] {
  const info: string[] = [];
  if (node.type !== "TEXT") return info;
  const textNode = node as TextNode;

  // Check for text style name
  const textStyleName = "textStyleId" in textNode ? getStyleName((textNode as any).textStyleId) : null;

  const fontName = textNode.fontName;
  if (fontName !== figma.mixed) {
    const fontLabel = textStyleName ? `${fontName.family} ${fontName.style} (${textStyleName})` : `${fontName.family} ${fontName.style}`;
    info.push(fontLabel);
  } else if (textStyleName) {
    info.push(`Style: ${textStyleName}`);
  }

  const parts: string[] = [];
  const fontSize = textNode.fontSize;
  if (fontSize !== figma.mixed) parts.push(`${fontSize}px`);

  const lineHeight = textNode.lineHeight;
  if (lineHeight !== figma.mixed) {
    if (lineHeight.unit === "PIXELS") parts.push(`LH: ${lineHeight.value}px`);
    else if (lineHeight.unit === "PERCENT") parts.push(`LH: ${Math.round(lineHeight.value)}%`);
  }

  const fontWeight = textNode.fontWeight;
  if (fontWeight !== figma.mixed) parts.push(`W: ${fontWeight}`);

  const letterSpacing = textNode.letterSpacing;
  if (letterSpacing !== figma.mixed && letterSpacing.value !== 0) {
    parts.push(`LS: ${Math.round(letterSpacing.value * 100) / 100}${letterSpacing.unit === "PIXELS" ? "px" : "%"}`);
  }

  if (parts.length > 0) info.push(parts.join(" · "));
  return info;
}

const MAX_TEXT_PREVIEW = 18;

function truncate(text: string, max: number = MAX_TEXT_PREVIEW): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function getVariablesFromNode(node: SceneNode): string[] {
  const vars: string[] = [];
  try {
    if ("boundVariables" in node) {
      const bound = (node as any).boundVariables;
      if (bound) {
        for (const [prop, binding] of Object.entries(bound)) {
          if (binding && typeof binding === "object") {
            const bindings = Array.isArray(binding) ? binding : [binding];
            for (const b of bindings) {
              if (b && (b as any).id) {
                try {
                  const variable = figma.variables.getVariableById((b as any).id);
                  if (variable) {
                    vars.push(`${prop}: ${variable.name}`);
                  }
                } catch (_) {}
              }
            }
          }
        }
      }
    }
  } catch (_) {}
  return vars;
}

function buildNodeInfo(node: SceneNode): string[] {
  const lines: string[] = [];

  // Header
  lines.push(node.name);

  // Colors of the node itself
  const colors = getColorsFromNode(node);
  if (colors.length > 0) lines.push(...colors);

  // Variables
  const vars = getVariablesFromNode(node);
  if (vars.length > 0) lines.push(...vars);

  // Typography if it's a text node
  const typo = getTypographyFromNode(node);
  if (typo.length > 0) lines.push(...typo);

  // Text children for container nodes
  if (node.type !== "TEXT" && "findAll" in node) {
    const textChildren = (node as FrameNode).findAll((n) => n.type === "TEXT") as TextNode[];
    for (const child of textChildren.slice(0, 6)) {
      const childTypo = getTypographyFromNode(child);
      const childColors = getColorsFromNode(child);
      const childVars = getVariablesFromNode(child);
      lines.push("─────────");
      lines.push(`"${truncate(child.characters)}"`);
      if (childColors.length > 0) lines.push(childColors.join(" · "));
      if (childVars.length > 0) lines.push(...childVars);
      if (childTypo.length > 0) lines.push(...childTypo);
    }
  }

  return lines;
}

// ── Main commands ──

async function measureSelected(): Promise<void> {
  const selection = figma.currentPage.selection;
  if (selection.length < 2) {
    figma.notify("Select at least 2 elements");
    return;
  }

  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  const group = getOrCreateMeasurementGroup();
  const bounds = selection.map(getBounds);

  const gaps = filterToNearestNeighbors(bounds);
  for (const gap of gaps) drawGap(gap, group);

  if (gaps.length === 0) { figma.notify("No gaps found"); group.remove(); }
  else figma.notify(`📏 ${gaps.length} gap${gaps.length > 1 ? "s" : ""}`);
}

async function measureSiblings(): Promise<void> {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    figma.notify("Select exactly 1 element");
    return;
  }

  const selected = selection[0];
  const parent = selected.parent;
  if (!parent || parent.type === "PAGE") {
    figma.notify("Element must be inside a frame");
    return;
  }

  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  const group = getOrCreateMeasurementGroup();
  const selectedBounds = getBounds(selected);
  let count = 0;

  for (const sibling of parent.children) {
    if (sibling.id === selected.id || !sibling.visible) continue;
    for (const gap of calculateGaps(selectedBounds, getBounds(sibling))) {
      drawGap(gap, group);
      count++;
    }
  }

  if ("absoluteTransform" in parent) {
    const pb = getBounds(parent as SceneNode);
    const sb = selectedBounds;
    const edges: { dist: number; dir: "horizontal" | "vertical"; sX: number; sY: number; eX: number; eY: number }[] = [
      { dist: Math.round(sb.x - pb.x), dir: "horizontal", sX: pb.x, sY: sb.centerY, eX: sb.x, eY: sb.centerY },
      { dist: Math.round(pb.right - sb.right), dir: "horizontal", sX: sb.right, sY: sb.centerY, eX: pb.right, eY: sb.centerY },
      { dist: Math.round(sb.y - pb.y), dir: "vertical", sX: sb.centerX, sY: pb.y, eX: sb.centerX, eY: sb.y },
      { dist: Math.round(pb.bottom - sb.bottom), dir: "vertical", sX: sb.centerX, sY: sb.bottom, eX: sb.centerX, eY: pb.bottom },
    ];
    for (const e of edges) {
      if (e.dist > 0) {
        drawGap({ from: sb, to: sb, direction: e.dir, distance: e.dist, startX: e.sX, startY: e.sY, endX: e.eX, endY: e.eY }, group);
        count++;
      }
    }
  }

  if (count === 0) { figma.notify("No gaps found"); group.remove(); }
  else figma.notify(`📏 ${count} gap${count > 1 ? "s" : ""} to siblings & parent`);
}

async function inspectProperties(): Promise<void> {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify("Select elements to inspect");
    return;
  }

  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  const group = getOrCreateMeasurementGroup();

  // Find the rightmost edge of all selected elements
  let maxRight = -Infinity;
  let minY = Infinity;
  for (const node of selection) {
    const b = getBounds(node);
    if (b.right > maxRight) maxRight = b.right;
    if (b.y < minY) minY = b.y;
  }

  const tagX = maxRight + TAG_MARGIN;
  let tagY = minY;

  for (const node of selection) {
    const bounds = getBounds(node);
    const info = buildNodeInfo(node);

    // Draw outline around element
    drawElementOutline(bounds, group);

    // Create info tag to the right
    const tag = createInfoTag(info, INFO_COLOR, tagX, tagY);
    group.appendChild(tag);

    // Leader line from element to tag
    createLeaderLine(bounds.right, bounds.centerY, tagX, tagY + 10, group);

    // Estimate tag height and advance Y
    const estimatedHeight = info.length * 16 + 16;
    tagY += estimatedHeight + TAG_SPACING;
  }

  figma.notify(`🎨 Inspecting ${selection.length} element${selection.length > 1 ? "s" : ""}`);
}

async function annotateAll(): Promise<void> {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify("Select elements to annotate");
    return;
  }

  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  const group = getOrCreateMeasurementGroup();
  let gapCount = 0;

  // 1. Gaps — nearest neighbors only
  if (selection.length >= 2) {
    const bounds = selection.map(getBounds);
    const gaps = filterToNearestNeighbors(bounds);
    for (const gap of gaps) {
      drawGap(gap, group);
      gapCount++;
    }
  }

  // 2. Single element: gaps to nearest siblings + parent padding
  if (selection.length === 1) {
    const selected = selection[0];
    const parent = selected.parent;
    if (parent && parent.type !== "PAGE") {
      const sb = getBounds(selected);
      const siblingBounds = parent.children
        .filter((s) => s.id !== selected.id && s.visible)
        .map(getBounds);
      const allBounds = [sb, ...siblingBounds];
      const gaps = filterToNearestNeighbors(allBounds);
      // Only draw gaps that involve the selected element
      for (const gap of gaps) {
        const involvesSelected =
          (Math.abs(gap.startX - sb.right) < 1 || Math.abs(gap.endX - sb.x) < 1 ||
           Math.abs(gap.startY - sb.bottom) < 1 || Math.abs(gap.endY - sb.y) < 1 ||
           Math.abs(gap.startX - sb.x) < 1 || Math.abs(gap.endX - sb.right) < 1 ||
           Math.abs(gap.startY - sb.y) < 1 || Math.abs(gap.endY - sb.bottom) < 1);
        if (involvesSelected) {
          drawGap(gap, group);
          gapCount++;
        }
      }

      // Parent edge distances
      if ("absoluteTransform" in parent) {
        const pb = getBounds(parent as SceneNode);
        const edges: { dist: number; dir: "horizontal" | "vertical"; sX: number; sY: number; eX: number; eY: number }[] = [
          { dist: Math.round(sb.x - pb.x), dir: "horizontal", sX: pb.x, sY: sb.centerY, eX: sb.x, eY: sb.centerY },
          { dist: Math.round(pb.right - sb.right), dir: "horizontal", sX: sb.right, sY: sb.centerY, eX: pb.right, eY: sb.centerY },
          { dist: Math.round(sb.y - pb.y), dir: "vertical", sX: sb.centerX, sY: pb.y, eX: sb.centerX, eY: sb.y },
          { dist: Math.round(pb.bottom - sb.bottom), dir: "vertical", sX: sb.centerX, sY: sb.bottom, eX: sb.centerX, eY: pb.bottom },
        ];
        for (const e of edges) {
          if (e.dist > 0) {
            drawGap({ from: sb, to: sb, direction: e.dir, distance: e.dist, startX: e.sX, startY: e.sY, endX: e.eX, endY: e.eY }, group);
            gapCount++;
          }
        }
      }
    }
  }

  // 3. Info tags to the right, sorted top to bottom
  const sortedNodes = [...selection].sort((a, b) => {
    const aB = getBounds(a);
    const bB = getBounds(b);
    return aB.y - bB.y;
  });

  let maxRight = -Infinity;
  let minY = Infinity;
  for (const node of sortedNodes) {
    const b = getBounds(node);
    if (b.right > maxRight) maxRight = b.right;
    if (b.y < minY) minY = b.y;
  }

  const tagX = maxRight + TAG_MARGIN;
  let tagY = minY;

  for (const node of sortedNodes) {
    const bounds = getBounds(node);
    const info = buildNodeInfo(node);

    drawElementOutline(bounds, group);

    const tag = createInfoTag(info, INFO_COLOR, tagX, tagY);
    group.appendChild(tag);

    createLeaderLine(bounds.right, bounds.centerY, tagX, tagY + 10, group);

    const estimatedHeight = info.length * 16 + 16;
    tagY += estimatedHeight + TAG_SPACING;
  }

  const parts: string[] = [];
  if (gapCount > 0) parts.push(`${gapCount} gaps`);
  parts.push(`${sortedNodes.length} inspected`);
  figma.notify(`🔍 ${parts.join(", ")} — screenshot, then Clear`);
}

// ── Command handler ──

if (figma.command === "annotate-all") {
  annotateAll().then(() => figma.closePlugin());
} else if (figma.command === "measure-selected") {
  measureSelected().then(() => figma.closePlugin());
} else if (figma.command === "measure-siblings") {
  measureSiblings().then(() => figma.closePlugin());
} else if (figma.command === "inspect") {
  inspectProperties().then(() => figma.closePlugin());
} else if (figma.command === "clear") {
  clearMeasurements();
  figma.notify("🧹 Cleared");
  figma.closePlugin();
}
