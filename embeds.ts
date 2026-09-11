import { App, TFile, resolveSubpath } from "obsidian";
import type { CountedText } from "./metrics";

// ── Embedded notes ──────────────────────────────────────────────────────────────
//
// With settings.countEmbeddedNotes on, a note's metrics are summed with those of
// every note it embeds. Obsidian renders embeds recursively, so nested embeds are
// followed too, with a note never re-entering its own embed chain (A → B → A).
// The embed links themselves are dropped from the text: the reader sees the
// embedded content in their place, and that content is counted instead.
//
// The counting pipeline is synchronous and runs on every keystroke, so embedded
// notes are read from an in-memory copy: a note not read yet is skipped for that
// pass, loaded in the background, and the count is redrawn once it arrives.

// How deep nested embeds are followed, and how many texts a single count may take
// in — guards against a vault whose embeds fan out without end.
const MAX_EMBED_DEPTH = 10;
const MAX_EMBEDDED_NOTES = 1000;

/**
 * One embed in a note's text: the link path, its "#Heading" / "#^block" subpath
 * ("" for none), and where the embed sits in the text.
 */
export interface EmbedLink {
  path: string;
  subpath: string;
  start: number;
  end: number;
}

/**
 * The note an embed points at. `text` is the note's text (or just the embedded
 * section), or null when there is nothing to count: the note isn't read yet, the
 * section doesn't exist, or the note is the embedding one itself.
 */
export interface EmbeddedNote {
  path: string;
  text: string | null;
}

// Regions where Obsidian renders no embeds: frontmatter, fenced code (an unclosed
// fence runs to the end of the note), comments, and inline code.
const NON_RENDERED = [
  /^---[\s\S]*?---/,
  /^[ \t]*(`{3,}|~{3,})[\s\S]*?(?:^[ \t]*\1|(?![\s\S]))/gm,
  /%%[\s\S]*?%%/g,
  /<!--[\s\S]*?-->/g,
  /`[^`\n]*`/g,
];

// ![[Note#Heading|alias]] or ![alt](Note.md#Heading), the URL optionally in <…>.
const EMBED = /!\[\[([^\]]+)\]\]|!\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]*)[^)]*\)/g;

function splitSubpath(target: string): { path: string; subpath: string } {
  const hash = target.indexOf("#");
  return hash === -1
    ? { path: target.trim(), subpath: "" }
    : { path: target.slice(0, hash).trim(), subpath: target.slice(hash).trim() };
}

/**
 * Every embed in a note's text that could point at another note, in order. Image,
 * PDF and other file embeds are included too — telling them apart takes the
 * vault, so the caller drops whatever doesn't resolve to a Markdown note.
 */
export function parseEmbeds(text: string): EmbedLink[] {
  // Blank out (rather than cut) the regions to skip, so match offsets still point
  // into the original text. Line breaks stay, as the patterns above rely on them.
  let s = text;
  for (const re of NON_RENDERED) s = s.replace(re, (m) => m.replace(/[^\n]/g, " "));

  const links: EmbedLink[] = [];
  for (const m of s.matchAll(EMBED)) {
    const at = { start: m.index, end: m.index + m[0].length };
    if (m[1] !== undefined) {
      // Drop the alias / size, and the backslash that escapes "|" inside a table.
      links.push({ ...splitSubpath(m[1].split("|")[0].replace(/\\$/, "")), ...at });
      continue;
    }
    let url = m[2].replace(/^<|>$/g, "");
    if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) continue; // web or other external link
    try {
      url = decodeURIComponent(url);
    } catch {
      // Malformed escape: keep the URL as written.
    }
    links.push({ ...splitSubpath(url), ...at });
  }
  return links;
}

/**
 * `text` without the given embeds. An embed alone on its line takes the line with
 * it, so it leaves no empty line or paragraph behind for the counters to find.
 */
export function removeEmbeds(text: string, links: EmbedLink[]): string {
  let out = "";
  let pos = 0;
  for (const link of links) {
    let { start, end } = link;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const newline = text.indexOf("\n", end);
    const lineEnd = newline === -1 ? text.length : newline;
    if (!text.slice(lineStart, start).trim() && !text.slice(end, lineEnd).trim()) {
      // Take the line with the break before it — or, when that one is already
      // gone (the first line, or the previous line was an embed too), the break
      // after it.
      if (lineStart > pos) {
        start = lineStart - 1;
        end = lineEnd;
      } else {
        start = lineStart;
        end = newline === -1 ? lineEnd : newline + 1;
      }
    }
    out += text.slice(pos, start);
    pos = end;
  }
  return out + text.slice(pos);
}

/**
 * The texts to count for a note: the note itself followed by every note embedded
 * in it, nested embeds included, one entry per embed — a note embedded twice is
 * counted twice, just as it is shown twice. Each text has its note embeds removed
 * and tallied in `hiddenEmbeds`, so the Embeds metric still counts them.
 *
 * `resolve` maps an embed to its note, or null when it isn't a note embed at all
 * (an image, a missing note), which is left in the text like any other. A note
 * already on the chain of embeds that led to it isn't entered again, so a cycle
 * can't recurse forever.
 */
export function expandEmbeds(
  text: string,
  sourcePath: string,
  resolve: (link: EmbedLink, sourcePath: string) => EmbeddedNote | null,
): CountedText[] {
  const out: CountedText[] = [];
  const walk = (text: string, sourcePath: string, chain: string[]) => {
    const entry: CountedText = { text };
    out.push(entry);
    const notes: EmbedLink[] = [];
    for (const link of parseEmbeds(text)) {
      const note = resolve(link, sourcePath);
      if (!note) continue;
      notes.push(link);
      if (note.text === null || chain.includes(note.path)) continue;
      if (chain.length > MAX_EMBED_DEPTH || out.length >= MAX_EMBEDDED_NOTES) continue;
      walk(note.text, note.path, [...chain, note.path]);
    }
    entry.text = removeEmbeds(text, notes);
    entry.hiddenEmbeds = notes.length;
  };
  walk(text, sourcePath, [sourcePath]);
  return out;
}

/**
 * Resolves embeds against the vault and keeps the embedded notes' text in memory.
 * Only notes embedded by the last count are kept, so the cache never outgrows the
 * note on screen.
 */
export class EmbeddedNotes {
  private contents = new Map<string, string>();
  private loading = new Set<string>();

  /** @param onLoad Called once background reads settle, to redraw the count. */
  constructor(private readonly app: App, private readonly onLoad: () => void) {}

  /** The texts to count for `text`, a note at `sourcePath` (see expandEmbeds). */
  expand(text: string, sourcePath: string): CountedText[] {
    const used = new Set<string>();
    const texts = expandEmbeds(text, sourcePath, (link, from) => {
      // "![[#Heading]]" embeds part of the embedding note itself — already counted.
      if (!link.path) return { path: from, text: null };
      const file = this.app.metadataCache.getFirstLinkpathDest(link.path, from);
      if (!file || file.extension !== "md") return null;
      used.add(file.path);
      const content = this.contents.get(file.path);
      if (content === undefined) {
        this.load(file);
        return { path: file.path, text: null };
      }
      if (!link.subpath) return { path: file.path, text: content };
      // A heading or block embed shows just that section of the note.
      const cache = this.app.metadataCache.getFileCache(file);
      const section = cache ? resolveSubpath(cache, link.subpath) : null;
      const text = section ? content.slice(section.start.offset, section.end?.offset) : null;
      return { path: file.path, text };
    });
    for (const path of this.contents.keys()) if (!used.has(path)) this.contents.delete(path);
    return texts;
  }

  private load(file: TFile): void {
    if (this.loading.has(file.path)) return;
    this.loading.add(file.path);
    void this.app.vault.cachedRead(file)
      // An unreadable note counts as empty rather than being retried on every count.
      .catch(() => "")
      .then((data) => {
        this.contents.set(file.path, data);
        this.loading.delete(file.path);
        if (this.loading.size === 0) this.onLoad();
      });
  }

  /**
   * Take in a note's new text after Obsidian re-indexes it. Returns true when the
   * note is one of the embedded notes being counted, i.e. the count is now stale.
   */
  update(file: TFile, data: string): boolean {
    if (!this.contents.has(file.path)) return false;
    this.contents.set(file.path, data);
    return true;
  }

  /** Drop a deleted or renamed note. Returns true when it was being counted. */
  forget(path: string): boolean {
    return this.contents.delete(path);
  }

  clear(): void {
    this.contents.clear();
  }
}
