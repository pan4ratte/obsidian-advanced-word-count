import type { Editor, MarkdownFileInfo, TextFileView } from "obsidian";

// ── Canvas ──────────────────────────────────────────────────────────────────────
//
// In a canvas the counters show one of three things, the narrowest that applies:
// the card being edited (or the text selected in it), the selected cards, or the
// whole canvas. Text cards count their text; note cards count the note, or just
// the heading or block the card shows. Other cards — images, PDFs, web pages,
// nested canvases — hold no text to count, and neither do group or arrow labels.

export const VIEW_TYPE_CANVAS = "canvas";

/** A card with something to count: a text card's text, or a note card's note. */
export type CanvasCard =
  | { type: "text"; text: string }
  | { type: "file"; file: string; subpath: string };

interface CanvasNodeLike {
  id: string;
  type?: unknown;
  text?: unknown;
  file?: unknown;
  subpath?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
}

// The canvas internals the counters read. None of this is public API, so every
// member is optional and checked before use; see canvasState in main.ts.
export interface CanvasViewInternal extends TextFileView {
  canvas?: {
    // The canvas as last saved into the view — refreshed whenever a card is added,
    // removed or finishes editing, so it is a new object after every change.
    data?: { nodes?: unknown };
    selection?: Set<{ id?: unknown }>;
  };
}

function box(node: CanvasNodeLike): { x: number; y: number; right: number; bottom: number } | null {
  const { x, y, width, height } = node;
  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") return null;
  return { x, y, right: x + width, bottom: y + height };
}

/**
 * The cards to count in a canvas's `nodes`, in canvas order. With `selected`, only
 * the cards with those ids — a selected group standing for every card that sits
 * wholly inside it, as it does when the group is moved. A card is taken once
 * however many selected groups hold it. Note cards are returned whatever file
 * they show; the caller drops what isn't a Markdown note.
 */
export function canvasCards(nodes: unknown, selected?: ReadonlySet<string>): CanvasCard[] {
  if (!Array.isArray(nodes)) return [];
  const all = nodes.filter((n): n is CanvasNodeLike =>
    !!n && typeof n === "object" && typeof (n as CanvasNodeLike).id === "string");

  let taken = all;
  if (selected) {
    const groups = all.filter((n) => n.type === "group" && selected.has(n.id)).map(box)
      .filter((b) => b !== null);
    taken = all.filter((n) => {
      if (selected.has(n.id)) return true;
      const b = box(n);
      return !!b && groups.some((g) => b.x >= g.x && b.y >= g.y && b.right <= g.right && b.bottom <= g.bottom);
    });
  }

  const cards: CanvasCard[] = [];
  for (const node of taken) {
    if (node.type === "text" && typeof node.text === "string") {
      cards.push({ type: "text", text: node.text });
    } else if (node.type === "file" && typeof node.file === "string" && node.file) {
      cards.push({ type: "file", file: node.file, subpath: typeof node.subpath === "string" ? node.subpath : "" });
    }
  }
  return cards;
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

/** The canvas's cards as last saved into the view. */
export function canvasNodes(view: CanvasViewInternal): unknown {
  const data = view.canvas?.data;
  if (data && Array.isArray(data.nodes)) return data.nodes;
  // Internals not as expected: read the same data through the public API.
  try {
    return (JSON.parse(view.getViewData()) as { nodes?: unknown }).nodes;
  } catch {
    return [];
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
