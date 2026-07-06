import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ExtensionRegistry, resolveInstallOrder, validateExtension, Extension, ExtensionIndex } from "../extensions";
import { computeFull, defaultPreset, Preset } from "../metrics";

// The shipped catalogue lives in ../extensions: index.json plus one JSON per
// extension, grouped into metrics/, settings/ and presets/ subfolders.
const extDir = join(dirname(fileURLToPath(import.meta.url)), "..", "extensions");
const readJson = (file: string): unknown => JSON.parse(readFileSync(join(extDir, file), "utf8"));

// Every extension file, as a forward-slash path relative to extDir (e.g.
// "metrics/headings.json"), recursing the type subfolders. Matches the `path`
// values in index.json.
const listExtFiles = (rel = ""): string[] =>
  readdirSync(join(extDir, rel)).flatMap((name) => {
    const childRel = rel ? `${rel}/${name}` : name;
    if (statSync(join(extDir, childRel)).isDirectory()) return listExtFiles(childRel);
    return childRel.endsWith(".json") && childRel !== "index.json" ? [childRel] : [];
  });
const extFiles = listExtFiles();

describe("shipped extension catalogue", () => {
  it("every extension file validates", () => {
    const failures = extFiles
      .map((f) => ({ f, r: validateExtension(readJson(f)) }))
      .filter((x) => !x.r.ok)
      .map((x) => `${x.f}: ${x.r.ok ? "" : x.r.error}`);
    expect(failures).toEqual([]);
  });

  it("index.json entries match their extension files", () => {
    const index = readJson("index.json") as ExtensionIndex;
    expect(Array.isArray(index.extensions)).toBe(true);

    const problems: string[] = [];
    for (const entry of index.extensions) {
      const path = entry.path || `${entry.id}.json`;
      if (!extFiles.includes(path)) { problems.push(`${entry.id}: missing file ${path}`); continue; }
      const r = validateExtension(readJson(path));
      if (!r.ok) { problems.push(`${path}: ${r.error}`); continue; }
      if (r.ext.id !== entry.id) problems.push(`${path}: id "${r.ext.id}" ≠ index "${entry.id}"`);
      if (r.ext.type !== entry.type) problems.push(`${path}: type mismatch`);
    }
    expect(problems).toEqual([]);
  });

  it("every extension file is listed in index.json", () => {
    const index = readJson("index.json") as ExtensionIndex;
    const listed = new Set(index.extensions.map((e) => e.path || `${e.id}.json`));
    const unlisted = extFiles.filter((f) => !listed.has(f));
    expect(unlisted).toEqual([]);
  });

  it("every declared dependency resolves within the catalogue, with no cycles", () => {
    const index = readJson("index.json") as ExtensionIndex;
    const known = new Set(index.extensions.map((e) => e.id));
    const problems: string[] = [];
    for (const entry of index.extensions) {
      for (const dep of entry.dependencies || []) {
        if (!known.has(dep)) problems.push(`${entry.id}: unknown dependency "${dep}"`);
      }
      // resolveInstallOrder throws on a cycle; surface it as a readable failure.
      try {
        resolveInstallOrder(entry.id, index.extensions, () => false);
      } catch (e) {
        problems.push(`${entry.id}: ${(e as Error).message}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("shipped extensions behave", () => {
  // A registry holding every shipped extension, and a preset that enables them all.
  const allDefs: Extension[] = extFiles.map((f) => {
    const r = validateExtension(readJson(f));
    if (!r.ok) throw new Error(`${f}: ${r.error}`);
    return r.ext;
  });
  const reg = new ExtensionRegistry();
  reg.set(allDefs);

  const enableAll = (): Preset => {
    const p = defaultPreset();
    const metrics: Record<string, boolean> = (p.extMetrics = {});
    const settings: Record<string, boolean> = (p.extSettings = {});
    for (const d of allDefs) (d.type === "metric" ? metrics : settings)[d.id] = true;
    return p;
  };
  const metricsOf = (text: string) => computeFull(text, enableAll(), reg).ext;
  const wordsOf = (text: string) => computeFull(text, enableAll(), reg).values.wordsWithSpaces;

  it("counts headings", () => {
    expect(metricsOf("# A\n## B\nnot a heading\n### C")["headings"]).toBe(3);
  });

  it("counts HTML and Obsidian comments", () => {
    const c = (text: string) => metricsOf(text)["comment-count"];
    expect(c("a <!-- html comment --> b")).toBe(1);
    expect(c("a %% obsidian comment %% b")).toBe(1);
    // Both kinds together, plus a multiline HTML comment.
    expect(c("<!-- one -->\ntext %% two %%\n<!--\nmultiline\n-->")).toBe(3);
    // No comments.
    expect(c("just plain text with no comments")).toBe(0);
  });

  it("counts tasks: total, done and open", () => {
    const e = metricsOf("- [ ] a\n- [x] b\n- [X] c\n- [ ] d");
    expect(e["tasks-total"]).toBe(4);
    expect(e["tasks-done"]).toBe(2);
    expect(e["tasks-open"]).toBe(2);
  });

  it("counts distinct citekeys, ignoring repeats, emails and wikilinks", () => {
    const e = metricsOf("[@smith2020] and [@smith2020; @jones2019]; mail me@example.com; [[@wiki]]");
    expect(e["distinct-citekeys"]).toBe(2); // smith2020, jones2019
  });

  it("derives citations per page from the built-in metrics", () => {
    expect(reg.computeRatios(enableAll(), { citekeys: 6, pages: 2 })["citations-per-page"]).toBe(3);
  });

  it("counts Pandoc generated footnotes: complete footnotes plus citation groups", () => {
    const pf = (text: string) => metricsOf(text)["pandoc-footnotes"];
    // Each citation bracket is one footnote, however many @keys it bundles.
    expect(pf("[@smith2020]")).toBe(1);
    expect(pf("[@smith2020; @jones2019]")).toBe(1);
    expect(pf("[see @smith2020, p. 33; also @jones2019]")).toBe(1);
    expect(pf("[-@smith2020]")).toBe(1);
    // Separate citation groups each become their own footnote.
    expect(pf("text [@a] more [@b; @c] end")).toBe(2);
    // Complete Markdown footnotes (paired + inline) add on top of citation groups.
    expect(pf("text[^1] [@smith2020]\n\n[^1]: def")).toBe(2);
    expect(pf("an inline ^[note] and [@a]")).toBe(2);
    // Orphan footnotes don't count.
    expect(pf("orphan[^1] reference")).toBe(0);
    // Citekeys are detected exactly like the built-in citekey counter: only @keys
    // inside [ ] brackets, with wikilinks and markdown links stripped first.
    expect(pf("[[@wiki]] and [mail @me](http://x.com)")).toBe(0);
    expect(pf("a bare @smith2020 outside brackets")).toBe(0);
    // Like the built-in counter, code is NOT stripped, so a citation in code counts.
    expect(pf("`[@code]`")).toBe(1);
    // A citation already inside a footnote doesn't generate a second footnote — it
    // renders within that note. Definition body: the footnote counts, the citation doesn't.
    expect(pf("text[^1]\n\n[^1]: See [@smith2020] for details.")).toBe(1);
    // Inline footnote wrapping a citation: one footnote, citation not counted again.
    expect(pf("text^[see @smith2020]")).toBe(1);
    expect(pf("text^[see [@smith2020]]")).toBe(1);
    // A body citation still counts alongside a footnote whose definition also cites.
    expect(pf("text[^1] and [@jones2019]\n\n[^1]: See [@smith2020].")).toBe(2);
  });

  it("counts only resolved reference-style links (intersect)", () => {
    // [docs][ref] is defined; [missing][nope] is an orphan; image refs are excluded.
    const text = "See [docs][ref] and [missing][nope], plus ![pic][img].\n\n[ref]: https://example.com";
    expect(metricsOf(text)["reference-links"]).toBe(1);
  });

  it("ignore-math strips inline and block math from word counts", () => {
    expect(wordsOf("a $x + y$ b $$z = 1$$ c")).toBe(3); // a, b, c
    expect(wordsOf("let $a$ be")).toBe(2); // let, be
  });

  it("ignore-math leaves currency alone (Pandoc rules)", () => {
    // Two dollar amounts on a line must NOT be treated as one math span.
    expect(wordsOf("I paid $5 and $10 today")).toBe(6);            // I paid $5 and $10 today
    expect(wordsOf("between $20,000 and $30,000 total")).toBe(5);  // between $20,000 and $30,000 total
    expect(wordsOf("a range of $5-$9 here")).toBe(5);              // a range of $5-$9 here
  });

  it("ignore-tables strips table rows", () => {
    expect(wordsOf("text\n| a | b |\n| --- | --- |\nmore")).toBe(2); // text, more
  });

  it("ignore-urls strips bare URLs", () => {
    expect(wordsOf("see https://example.com/page now")).toBe(2); // see, now
  });

  it("ignore-strikethrough strips struck-through text", () => {
    expect(wordsOf("keep ~~remove this~~ keep")).toBe(2); // keep, keep
  });

  it("ignore-dataview-fields strips inline fields", () => {
    expect(wordsOf("text [rating:: 5] end")).toBe(2); // text, end
  });

  // ── Extracted from the former built-ins ──────────────────────────────────────

  it("counts complete tables (former built-in metric)", () => {
    expect(metricsOf("| H1 | H2 |\n| --- | --- |\n| a | b |")["tables"]).toBe(1);
    // A table without leading/trailing pipes still counts.
    expect(metricsOf("H1 | H2\n--- | ---\na | b")["tables"]).toBe(1);
    // A plain pipe line that isn't a table doesn't count.
    expect(metricsOf("a | b | c\njust text")["tables"]).toBe(0);
  });

  it("counts #tags, excluding numeric-only tags and mid-word hashes (former built-in)", () => {
    expect(metricsOf("#todo #project/work #123 word#notag")["tags"]).toBe(2);
  });

  it("ignore-code strips fenced and inline code (former built-in setting)", () => {
    expect(wordsOf("hello ```js\ncode here``` world")).toBe(2); // hello, world
    expect(wordsOf("alpha `beta` gamma")).toBe(2);              // alpha, gamma
  });
});
