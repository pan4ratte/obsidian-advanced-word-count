import type { Editor, MarkdownFileInfo, TextFileView } from "obsidian";
import type { CountSource } from "./embeds";

// ── Canvas ──────────────────────────────────────────────────────────────────────
//
// In a canvas the counters show one of three things, the narrowest that applies:
// the card being edited (or the text selected in it), the selected cards, or the
// whole canvas. Text cards count their text; note cards count the note, or just
// the heading or block the card shows. Other cards — images, PDFs, web pages,
// nested canvases — hold no text to count, and group and arrow labels are only
// counted when a setting extension asks for them (see CanvasOptions).
//
// The cards and arrows being counted make up the count's scope, which canvas
// metric extensions (cards, connections, …) count in place of text.

export const VIEW_TYPE_CANVAS = "canvas";

/**
 * The kinds of card in a canvas. A file card is a "note" when it shows a Markdown
 * note and a "file" for anything else (an image, a PDF, another canvas).
 */
export type CanvasCardType = "text" | "note" | "file" | "link" | "group";
export const CANVAS_CARD_TYPES: CanvasCardType[] = ["text", "note", "file", "link", "group"];

/** The labels a canvas can carry besides its cards' content. */
export type CanvasLabelType = "group" | "arrow";
export const CANVAS_LABEL_TYPES: CanvasLabelType[] = ["group", "arrow"];

export interface CanvasCard {
  id: string;
  type: CanvasCardType;
  // A text card's text, or a group's label; "" for other cards.
  text: string;
  // The path a note or file card shows, or a link card's URL; "" for other cards.
  target: string;
  // The "#Heading" / "#^block" a note card shows; "" for the whole note.
  subpath: string;
  // Whether an arrow starts or ends at the card anywhere in the canvas — not just
  // within the scope, so a selected card linked to an unselected one is connected.
  connected: boolean;
}

export interface CanvasArrow {
  from: string;
  to: string;
  label: string;
}

/** The cards and arrows a canvas count is taken from. */
export interface CanvasScope {
  cards: CanvasCard[];
  // The arrows touching at least one card in the scope: every arrow of the whole
  // canvas, or the ones leading into, out of or between the selected cards.
  arrows: CanvasArrow[];
}

/** What setting extensions change about a canvas count; see canvasTextSources. */
export interface CanvasOptions {
  skipCards: ReadonlySet<CanvasCardType>;
  labels: ReadonlySet<CanvasLabelType>;
}

export const NO_CANVAS_OPTIONS: CanvasOptions = { skipCards: new Set(), labels: new Set() };

// The canvas internals the counters read. None of this is public API, so every
// member is optional and checked before use; see canvasCount in main.ts.
export interface CanvasViewInternal extends TextFileView {
  canvas?: {
    // The canvas as last saved into the view — refreshed whenever a card or arrow
    // is added, removed or finishes editing, so it is a new object after every change.
    data?: { nodes?: unknown; edges?: unknown };
    selection?: Set<{ id?: unknown }>;
  };
}

type Box = { x: number; y: number; right: number; bottom: number };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function box(node: Record<string, unknown>): Box | null {
  const { x, y, width, height } = node;
  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") return null;
  return { x, y, right: x + width, bottom: y + height };
}

/**
 * The scope of a canvas count from the canvas's `nodes` and `edges`, cards in
 * canvas order. With `selected`, only the cards with those ids — a selected group
 * standing for every card that sits wholly inside it, as it does when the group is
 * moved. A card is taken once however many selected groups hold it. Malformed
 * cards and arrows, and cards of a kind Obsidian doesn't have, are left out.
 */
export function canvasScope(nodes: unknown, edges: unknown, selected?: ReadonlySet<string>): CanvasScope {
  const allArrows: CanvasArrow[] = [];
  for (const e of Array.isArray(edges) ? (edges as unknown[]) : []) {
    const edge = e as Record<string, unknown> | null;
    if (!edge || typeof edge.fromNode !== "string" || typeof edge.toNode !== "string") continue;
    allArrows.push({ from: edge.fromNode, to: edge.toNode, label: str(edge.label) });
  }
  const connected = new Set(allArrows.flatMap((a) => [a.from, a.to]));

  const all: { card: CanvasCard; box: Box | null }[] = [];
  for (const n of Array.isArray(nodes) ? (nodes as unknown[]) : []) {
    const node = n as Record<string, unknown> | null;
    if (!node || typeof node.id !== "string") continue;
    const card: CanvasCard = { id: node.id, type: "text", text: "", target: "", subpath: "", connected: connected.has(node.id) };
    if (node.type === "text") {
      card.text = str(node.text);
    } else if (node.type === "file") {
      card.target = str(node.file);
      if (!card.target) continue;
      card.type = /\.md$/i.test(card.target) ? "note" : "file";
      card.subpath = card.type === "note" ? str(node.subpath) : "";
    } else if (node.type === "link") {
      card.type = "link";
      card.target = str(node.url);
    } else if (node.type === "group") {
      card.type = "group";
      card.text = str(node.label);
    } else {
      continue;
    }
    all.push({ card, box: box(node) });
  }

  if (!selected) return { cards: all.map((c) => c.card), arrows: allArrows };

  const groups = all.filter((c) => c.card.type === "group" && selected.has(c.card.id)).map((c) => c.box)
    .filter((b) => b !== null);
  const cards = all.filter(({ card, box: b }) =>
    selected.has(card.id)
    || (!!b && groups.some((g) => b.x >= g.x && b.y >= g.y && b.right <= g.right && b.bottom <= g.bottom)))
    .map((c) => c.card);
  const ids = new Set(cards.map((c) => c.id));
  return { cards, arrows: allArrows.filter((a) => ids.has(a.from) || ids.has(a.to)) };
}

/**
 * What to count as text in a scope, in canvas order: text cards and note cards,
 * then — when `options` asks for them — group labels and arrow labels. Card kinds
 * in `options.skipCards` are left out. A note card is passed on as the note to
 * read; the caller drops what isn't a Markdown note.
 */
export function canvasTextSources(scope: CanvasScope, canvasPath: string, options: CanvasOptions = NO_CANVAS_OPTIONS): CountSource[] {
  const sources: CountSource[] = [];
  for (const card of scope.cards) {
    if (options.skipCards.has(card.type)) continue;
    if (card.type === "text" || (card.type === "group" && options.labels.has("group"))) {
      if (card.text) sources.push({ text: card.text, path: canvasPath });
    } else if (card.type === "note") {
      sources.push({ file: card.target, subpath: card.subpath });
    }
  }
  if (options.labels.has("arrow")) {
    for (const arrow of scope.arrows) if (arrow.label) sources.push({ text: arrow.label, path: canvasPath });
  }
  return sources;
}

// The cards counted when a metric names no kinds: everything but groups, which
// arrange the cards rather than being cards of their own.
const COUNTED_CARD_TYPES: CanvasCardType[] = ["text", "note", "file", "link"];

/**
 * How many cards of the given kinds the scope holds. `connected` narrows them to
 * the cards with (true) or without (false) an arrow; `distinct` counts the cards
 * showing the same note, file or web page once.
 */
export function countCanvasCards(
  scope: CanvasScope,
  spec: { cardTypes?: CanvasCardType[]; connected?: boolean; distinct?: boolean } = {},
): number {
  const types = spec.cardTypes && spec.cardTypes.length > 0 ? spec.cardTypes : COUNTED_CARD_TYPES;
  const cards = scope.cards.filter((c) =>
    types.includes(c.type) && (spec.connected === undefined || c.connected === spec.connected));
  if (!spec.distinct) return cards.length;
  return new Set(cards.map((c) => (c.target ? `${c.type}:${c.target}` : `#${c.id}`))).size;
}

/** Whether `view` is a canvas. */
export function isCanvasView(view: unknown): view is CanvasViewInternal {
  return !!view && typeof (view as TextFileView).getViewType === "function"
    && (view as TextFileView).getViewType() === VIEW_TYPE_CANVAS;
}

/** The ids of the cards selected in a canvas, or none when that can't be read. */
export function canvasSelection(view: CanvasViewInternal): string[] {
  const selection = view.canvas?.selection;
  if (!(selection instanceof Set)) return [];
  const ids: string[] = [];
  for (const node of selection) if (typeof node?.id === "string") ids.push(node.id);
  return ids;
}

/** The canvas's cards and arrows as last saved into the view. */
export function canvasData(view: CanvasViewInternal): { nodes: unknown; edges: unknown } {
  const data = view.canvas?.data;
  if (data && Array.isArray(data.nodes)) return { nodes: data.nodes, edges: data.edges };
  // Internals not as expected: read the same data through the public API.
  try {
    const parsed = JSON.parse(view.getViewData()) as { nodes?: unknown; edges?: unknown };
    return { nodes: parsed.nodes, edges: parsed.edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}

/**
 * The editor of the card being edited in the active canvas, with the component
 * that owns it. A card becomes the workspace's active editor as soon as it is
 * selected, but only has an editor while it is being edited.
 */
export function canvasCardEditor(info: MarkdownFileInfo | null, view: CanvasViewInternal): { editor: Editor; info: MarkdownFileInfo } | null {
  if (!info || (info as unknown) === view) return null;
  try {
    const editor = info.editor;
    return editor ? { editor, info } : null;
  } catch {
    // Some editor components throw rather than return nothing when not editing.
    return null;
  }
}
