import { describe, it, expect, afterEach } from "vitest";
import { __setRequestUrlHandler } from "./obsidian-stub";
import { ExtensionManager } from "../extension-manager";
import { ExtensionRegistry, Extension, ExtensionIndexEntry } from "../extensions";
import type WordCountPlugin from "../main";

const REPO = "https://example.test/extensions/";

// A stand-in for the bits of the plugin the manager touches: persisted settings and
// saveSettings(). Cast at the call site — the manager never reaches further.
const fakePlugin = () => ({
  settings: { installedExtensions: [] as Extension[], presets: [], extensionRepoUrl: REPO },
  saveSettings: async () => {},
});

const manager = (plugin: ReturnType<typeof fakePlugin>) =>
  new ExtensionManager(plugin as unknown as WordCountPlugin, new ExtensionRegistry());

const entry = (updated: string): ExtensionIndexEntry => ({
  id: "demo",
  storeName: "Demo",
  description: "A demo metric.",
  author: "t",
  type: "metric",
  updated,
  path: "metrics/demo.json",
});

const file = (updated: string) => ({
  id: "demo",
  storeName: "Demo",
  description: "A demo metric.",
  author: "t",
  type: "metric",
  updated,
  toggleLabel: "Demo",
  count: { pattern: "\\bdemo\\b", flags: "g" },
});

// Serve the catalogue index and the one extension file under test.
const serve = (body: unknown, index: ExtensionIndexEntry[] = []) =>
  __setRequestUrlHandler((url) => {
    if (url === `${REPO}metrics/demo.json`) return body;
    if (url === `${REPO}index.json`) return { extensions: index };
    throw new Error(`unexpected request: ${url}`);
  });

afterEach(() => __setRequestUrlHandler(null));

describe("ExtensionManager update detection", () => {
  it("records the catalogue's date when the downloaded file's is older", async () => {
    // The store offers an update because the entry is dated newer than the installed
    // copy. If the file's own (stale) date were stored, the entry would still look
    // newer afterwards and the "Update" button would never go away.
    const plugin = fakePlugin();
    const m = manager(plugin);
    serve(file("2026-07-06"), [entry("2026-07-26")]);

    await m.installFromIndex(entry("2026-07-26"), [entry("2026-07-26")]);

    expect(m.installedDate("demo")).toBe("2026-07-26");
    // Nothing left on offer: the auto-updater no longer re-downloads it either
    // (the same comparison the browse modal's "Update" button is drawn from).
    expect(await m.updateAll()).toEqual([]);
  });

  it("keeps the file's own date when it's the newer of the two", async () => {
    const plugin = fakePlugin();
    const m = manager(plugin);
    serve(file("2026-07-26"));

    await m.installFromIndex(entry("2026-07-06"), [entry("2026-07-06")]);

    expect(m.installedDate("demo")).toBe("2026-07-26");
  });

  it("takes the catalogue's date when the file carries none", async () => {
    const plugin = fakePlugin();
    const m = manager(plugin);
    const undated = file("2026-07-06") as Record<string, unknown>;
    delete undated.updated;
    serve(undated);

    await m.installFromIndex(entry("2026-07-26"), [entry("2026-07-26")]);

    expect(m.installedDate("demo")).toBe("2026-07-26");
  });
});
