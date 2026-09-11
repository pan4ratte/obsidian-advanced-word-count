import { describe, it, expect } from "vitest";
import { parseEmbeds, removeEmbeds, expandEmbeds, EmbedLink, EmbeddedNote } from "../embeds";

// Each embed as "path#subpath", for compact comparisons.
const targets = (text: string) => parseEmbeds(text).map((l) => l.path + l.subpath);

describe("parseEmbeds", () => {
  it("reads wiki embeds with their heading/block subpath and drops the alias", () => {
    expect(targets("![[Note]] ![[Other#Heading|alias]] ![[Third#^block]]"))
      .toEqual(["Note", "Other#Heading", "Third#^block"]);
    expect(parseEmbeds("![[Other#Heading|alias]]")[0]).toMatchObject({ path: "Other", subpath: "#Heading" });
  });

  it("drops the backslash that escapes an alias pipe inside a table", () => {
    expect(targets("| ![[Note\\|alias]] |")).toEqual(["Note"]);
  });

  it("reads Markdown embeds, decoding the URL and skipping external links", () => {
    expect(targets("![](My%20note.md#Some%20heading) ![x](<Other note.md>) ![img](https://x.com/a.png)"))
      .toEqual(["My note.md#Some heading", "Other note.md"]);
  });

  it("ignores plain links and embeds that Obsidian doesn't render", () => {
    const text = [
      "---",
      "cover: ![[Frontmatter]]",
      "---",
      "[[Link]] [md](Note.md)",
      "`![[Inline code]]`",
      "%% ![[Comment]] %%",
      "<!-- ![[Html comment]] -->",
      "```",
      "![[Fenced]]",
      "```",
      "![[Kept]]",
    ].join("\n");
    expect(targets(text)).toEqual(["Kept"]);
  });

  it("treats an unclosed code fence as running to the end", () => {
    expect(targets("![[Before]]\n~~~\n![[Inside]]")).toEqual(["Before"]);
  });

  it("reports where each embed sits in the original text, skipped regions included", () => {
    const text = "`![[x]]` then ![[Note]]";
    const [link] = parseEmbeds(text);
    expect(text.slice(link.start, link.end)).toBe("![[Note]]");
  });
});

describe("removeEmbeds", () => {
  const remove = (text: string) => removeEmbeds(text, parseEmbeds(text));

  it("cuts an embed out of the line around it", () => {
    expect(remove("see ![[A]] here")).toBe("see  here");
  });

  it("takes a line holding only an embed with it", () => {
    expect(remove("intro\n![[A]]\noutro")).toBe("intro\noutro");
    expect(remove("intro\n  ![[A]]  \noutro")).toBe("intro\noutro");
    expect(remove("![[A]]\nmore")).toBe("more");
    expect(remove("intro\n![[A]]")).toBe("intro");
    expect(remove("![[A]]")).toBe("");
  });

  it("leaves no empty line behind for consecutive embed lines", () => {
    expect(remove("x\n![[A]]\n![[B]]")).toBe("x");
    expect(remove("![[A]]\n![[B]]\nmore")).toBe("more");
    expect(remove("para\n\n![[A]]\n![[B]]\n\nnext")).toBe("para\n\n\nnext");
  });

  it("keeps the embeds it isn't given", () => {
    const text = "![[Keep]] and ![[Drop]]";
    expect(removeEmbeds(text, parseEmbeds(text).slice(1))).toBe("![[Keep]] and ");
  });
});

describe("expandEmbeds", () => {
  // A tiny vault: note name → text. Links resolve by exact name.
  const vault = (notes: Record<string, string | null>) =>
    (link: EmbedLink): EmbeddedNote | null =>
      link.path in notes ? { path: link.path, text: notes[link.path] } : null;

  it("returns the note, then every embedded note, nested embeds included", () => {
    const resolve = vault({ A: "a\n![[B]]", B: "b ![[C]]", C: "c" });
    expect(expandEmbeds("root ![[A]]", "Root", resolve)).toEqual([
      { text: "root ", hiddenEmbeds: 1 },
      { text: "a", hiddenEmbeds: 1 },
      { text: "b ", hiddenEmbeds: 1 },
      { text: "c", hiddenEmbeds: 0 },
    ]);
  });

  it("counts a note once per embed", () => {
    const texts = expandEmbeds("![[A]]\n![[A]]", "Root", vault({ A: "a" })).map((t) => t.text);
    expect(texts).toEqual(["", "a", "a"]);
  });

  it("leaves embeds that aren't notes in the text", () => {
    expect(expandEmbeds("![[Missing]] ![[image.png]]", "Root", vault({}))).toEqual([
      { text: "![[Missing]] ![[image.png]]", hiddenEmbeds: 0 },
    ]);
  });

  it("removes the embed of a note with nothing to count yet, adding no text", () => {
    expect(expandEmbeds("a ![[Loading]]", "Root", vault({ Loading: null }))).toEqual([
      { text: "a ", hiddenEmbeds: 1 },
    ]);
  });

  it("stops at a note already on the embed chain, still removing its link", () => {
    const resolve = vault({ Root: "root ![[A]]", A: "a ![[B]]", B: "b ![[A]] ![[Root]]" });
    expect(expandEmbeds("root ![[A]]", "Root", resolve)).toEqual([
      { text: "root ", hiddenEmbeds: 1 },
      { text: "a ", hiddenEmbeds: 1 },
      { text: "b  ", hiddenEmbeds: 2 },
    ]);
  });

  it("passes the embedding note's path so links resolve relative to it", () => {
    const seen: string[] = [];
    const resolve = (link: EmbedLink, from: string): EmbeddedNote | null => {
      seen.push(`${from} → ${link.path}`);
      return link.path === "A" ? { path: "folder/A.md", text: "![[B]]" } : null;
    };
    expandEmbeds("![[A]]", "Root.md", resolve);
    expect(seen).toEqual(["Root.md → A", "folder/A.md → B"]);
  });

  it("stops following nested embeds past the depth limit", () => {
    // N0 → N1 → N2 → … each a distinct note, so only the depth cap ends it.
    const resolve = (link: EmbedLink): EmbeddedNote => {
      const n = Number(link.path.slice(1));
      return { path: link.path, text: `![[N${n + 1}]]` };
    };
    // The note itself plus ten levels of embeds.
    expect(expandEmbeds("![[N1]]", "N0", resolve).length).toBe(11);
  });
});
