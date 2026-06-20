import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ExtensionRegistry, validateExtension, Extension, ExtensionIndex } from "../extensions";
import { computeFull, defaultPreset, Preset } from "../metrics";

// The shipped catalogue lives in ../extensions (one JSON per extension + index.json).
const extDir = join(dirname(fileURLToPath(import.meta.url)), "..", "extensions");
const readJson = (file: string): unknown => JSON.parse(readFileSync(join(extDir, file), "utf8"));
const extFiles = readdirSync(extDir).filter((f) => f.endsWith(".json") && f !== "index.json");

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
      if (r.ext.version !== entry.version) problems.push(`${path}: version mismatch`);
    }
    expect(problems).toEqual([]);
  });

  it("every extension file is listed in index.json", () => {
    const index = readJson("index.json") as ExtensionIndex;
    const listed = new Set(index.extensions.map((e) => e.path || `${e.id}.json`));
    const unlisted = extFiles.filter((f) => !listed.has(f));
    expect(unlisted).toEqual([]);
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
});
