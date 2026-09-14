import { describe, it, expect } from "vitest";
import type { App, MarkdownFileInfo } from "obsidian";
import {
  canvasCards,
  canvasCardEditor,
  canvasNodes,
  canvasSelection,
  isCanvasView,
  CanvasViewInternal,
} from "../canvas";
import { EmbeddedNotes } from "../embeds";
import { computeMetrics, defaultPreset } from "../metrics";

const text = (id: string, t: string, at: Partial<Record<"x" | "y" | "width" | "height", number>> = {}) =>
  ({ id, type: "text", text: t, x: 0, y: 0, width: 100, height: 100, ...at });
const note = (id: string, file: string, subpath?: string) =>
  ({ id, type: "file", file, subpath, x: 0, y: 0, width: 100, height: 100 });

// A canvas view as the counters see it: only the members canvas.ts reads.
const view = (
  canvas: CanvasViewInternal["canvas"],
  viewData = "",
  type = "canvas",
): CanvasViewInternal => ({ canvas, getViewType: () => type, getViewData: () => viewData }) as unknown as CanvasViewInternal;

describe("canvasCards", () => {
  it("takes text cards and note cards, leaving out the rest", () => {
    const nodes = [
      text("a", "Hello"),
      note("b", "Notes/B.md", "#Heading"),
      note("c", "image.png"),
      { id: "d", type: "link", url: "https://example.com" },
      { id: "e", type: "group", label: "Group label" },
    ];
    expect(canvasCards(nodes)).toEqual([
      { type: "text", text: "Hello" },
      { type: "file", file: "Notes/B.md", subpath: "#Heading" },
      { type: "file", file: "image.png", subpath: "" },
    ]);
  });

  it("tolerates malformed canvas data", () => {
    expect(canvasCards(undefined)).toEqual([]);
    expect(canvasCards({ nodes: [] })).toEqual([]);
    expect(canvasCards([null, 3, { type: "text", text: "no id" }, { id: "x", type: "text" }, note("y", "")])).toEqual([]);
  });

  it("takes only the selected cards when given a selection", () => {
    const nodes = [text("a", "one"), text("b", "two"), text("c", "three")];
    expect(canvasCards(nodes, new Set(["a", "c"]))).toEqual([
      { type: "text", text: "one" },
      { type: "text", text: "three" },
    ]);
    expect(canvasCards(nodes, new Set())).toEqual([]);
  });

  it("lets a selected group stand for the cards wholly inside it, each once", () => {
    const nodes = [
      { id: "g1", type: "group", x: 0, y: 0, width: 500, height: 500 },
      { id: "g2", type: "group", x: 0, y: 0, width: 300, height: 300 },
      text("inside-both", "a", { x: 10, y: 10 }),
      text("inside-g1", "b", { x: 350, y: 350 }),
      text("overlapping", "c", { x: 450, y: 450 }),
      text("outside", "d", { x: 900, y: 900 }),
    ];
    expect(canvasCards(nodes, new Set(["g1", "g2"])).map((c) => c.type === "text" && c.text)).toEqual(["a", "b"]);
    expect(canvasCards(nodes, new Set(["g2", "inside-g1"])).map((c) => c.type === "text" && c.text)).toEqual(["a", "b"]);
  });
});

describe("canvas view helpers", () => {
  it("recognises a canvas view", () => {
    expect(isCanvasView(view({}))).toBe(true);
    expect(isCanvasView(view({}, "", "markdown"))).toBe(false);
    expect(isCanvasView(null)).toBe(false);
  });

  it("reads the selected card ids, or none without a selection", () => {
    const selection = new Set([{ id: "a" }, { id: "b" }, {}]);
    expect(canvasSelection(view({ selection }))).toEqual(["a", "b"]);
    expect(canvasSelection(view({}))).toEqual([]);
    expect(canvasSelection(view(undefined))).toEqual([]);
  });

  it("reads the cards from the canvas, falling back to the view data", () => {
    const nodes = [text("a", "live")];
    expect(canvasNodes(view({ data: { nodes } }, '{"nodes":[]}'))).toBe(nodes);
    expect(canvasNodes(view(undefined, JSON.stringify({ nodes: [text("b", "saved")] })))).toEqual([text("b", "saved")]);
    expect(canvasNodes(view(undefined, "not json"))).toEqual([]);
  });

  it("finds the editor of the card being edited, not of one merely selected", () => {
    const v = view({});
    const editor = { getValue: () => "card" };
    const editing = { editor } as unknown as MarkdownFileInfo;
    expect(canvasCardEditor(editing, v)).toEqual({ editor, info: editing });
    expect(canvasCardEditor({ editor: undefined } as unknown as MarkdownFileInfo, v)).toBeNull();
    const throwing = { get editor(): never { throw new TypeError("no edit mode"); } } as unknown as MarkdownFileInfo;
    expect(canvasCardEditor(throwing, v)).toBeNull();
    expect(canvasCardEditor(null, v)).toBeNull();
    // The canvas view itself is never a card.
    expect(canvasCardEditor(Object.assign(v, { editor }) as unknown as MarkdownFileInfo, v)).toBeNull();
  });
});

describe("EmbeddedNotes.count", () => {
  // A vault of Markdown notes by path, read back instantly; links resolve by name.
  const notesApp = (notes: Record<string, string>) => {
    const file = (path: string) => (path in notes ? { path, extension: path.split(".").pop() } : null);
    return {
      vault: {
        getFileByPath: file,
        cachedRead: (f: { path: string }) => Promise.resolve(notes[f.path]),
      },
      metadataCache: {
        getFirstLinkpathDest: (link: string) => file(`${link}.md`),
        getFileCache: () => null,
      },
    } as unknown as App;
  };

  // Counts once to start the background reads, waits for them, then counts again.
  const countWords = async (notes: Record<string, string>, sources: Parameters<EmbeddedNotes["count"]>[0], follow: boolean) => {
    let loaded!: () => void;
    const done = new Promise<void>((resolve) => (loaded = resolve));
    const cache = new EmbeddedNotes(notesApp(notes), () => loaded());
    const first = cache.count(sources, follow);
    if (sources.some((s) => "file" in s) || follow) await done;
    const texts = cache.count(sources, follow);
    return { first, texts, words: computeMetrics(texts, defaultPreset()).wordsWithSpaces };
  };

  it("sums text cards and note cards, skipping notes not read yet and non-notes", async () => {
    const notes = { "B.md": "three more words", "pic.png": "" };
    const sources = [
      { text: "two words", path: "Board.canvas" },
      { file: "B.md", subpath: "" },
      { file: "pic.png", subpath: "" },
      { file: "Missing.md", subpath: "" },
    ];
    const { first, words } = await countWords(notes, sources, false);
    expect(first).toEqual([{ text: "two words" }]);
    expect(words).toBe(5);
  });

  it("follows embeds in cards only when asked to", async () => {
    const notes = { "A.md": "embedded note text", "B.md": "card ![[A]]" };
    const sources = [{ text: "text card ![[A]]", path: "Board.canvas" }, { file: "B.md", subpath: "" }];
    expect((await countWords(notes, sources, true)).words).toBe(2 + 1 + 3 + 3);
    // Without following, the embed links stay in the text as they are.
    expect((await countWords(notes, sources, false)).texts).toEqual([
      { text: "text card ![[A]]" },
      { text: "card ![[A]]" },
    ]);
  });
});
