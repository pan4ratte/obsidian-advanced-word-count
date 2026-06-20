import { requestUrl } from "obsidian";
import type WordCountPlugin from "./main";
import { DEFAULT_EXTENSION_REPO_URL } from "./metrics";
import {
  Extension,
  ExtensionIndex,
  ExtensionIndexEntry,
  ExtensionRegistry,
  validateExtension,
} from "./extensions";

// ── Extension manager ───────────────────────────────────────────────────────────
//
// Owns the download / install / uninstall lifecycle and the persistence bridge
// between settings.installedExtensions (data.json) and the live ExtensionRegistry
// the counting pipeline reads from. Network access goes through Obsidian's
// requestUrl so it isn't subject to browser CORS. No remote code is ever executed:
// downloads are plain JSON, validated by validateExtension before they're trusted.

export class ExtensionManager {
  constructor(
    private plugin: WordCountPlugin,
    private registry: ExtensionRegistry,
  ) {}

  /** (Re)populate the live registry from the persisted definitions. Call on load. */
  load(): void {
    this.registry.set(this.installed());
  }

  // ── Persisted state ──────────────────────────────────────────────────────────

  /** The installed definitions, persisted in settings.installedExtensions. */
  installed(): Extension[] {
    const list = this.plugin.settings.installedExtensions;
    return Array.isArray(list) ? (list as Extension[]) : [];
  }

  isInstalled(id: string): boolean {
    return this.installed().some((e) => e.id === id);
  }

  /** The `updated` date of the installed copy, or null. Used for update detection. */
  installedDate(id: string): string | null {
    const found = this.installed().find((e) => e.id === id);
    return found && typeof found.updated === "string" ? found.updated : null;
  }

  private async persist(list: Extension[]): Promise<void> {
    this.plugin.settings.installedExtensions = list;
    await this.plugin.saveSettings();
  }

  // ── Remote catalogue ─────────────────────────────────────────────────────────

  /** Base URL of the extensions folder, always ending in "/". */
  private baseUrl(): string {
    const raw = (this.plugin.settings.extensionRepoUrl || "").trim() || DEFAULT_EXTENSION_REPO_URL;
    return raw.endsWith("/") ? raw : raw + "/";
  }

  /** Download and parse the repo's index.json catalogue. */
  async fetchIndex(): Promise<ExtensionIndexEntry[]> {
    const res = await requestUrl({ url: this.baseUrl() + "index.json" });
    const data = res.json as ExtensionIndex;
    if (!data || !Array.isArray(data.extensions)) {
      throw new Error("Malformed extension index (missing \"extensions\" array)");
    }
    return data.extensions;
  }

  /** Download a single extension's JSON and validate it into an Extension. */
  async fetchExtension(entry: ExtensionIndexEntry): Promise<Extension> {
    const path = entry.path || `${entry.id}.json`;
    const res = await requestUrl({ url: this.baseUrl() + path });
    const result = validateExtension(res.json);
    if (!result.ok) {
      throw new Error(`Invalid extension "${entry.id}": ${result.error}`);
    }
    return result.ext;
  }

  // ── Install / uninstall ──────────────────────────────────────────────────────

  /**
   * Install (or upgrade) an extension: validate, replace any prior copy with the
   * same id, register it live and persist. Returns the stored definition.
   */
  async install(ext: Extension): Promise<Extension> {
    const result = validateExtension(ext);
    if (!result.ok) throw new Error(`Invalid extension: ${result.error}`);
    const valid = result.ext;

    const next = this.installed().filter((e) => e.id !== valid.id);
    next.push(valid);
    this.registry.add(valid);
    await this.persist(next);
    return valid;
  }

  /**
   * Remove an extension and prune every per-preset reference to it (enable flags
   * and any warning/goal rules) so nothing dangling is left behind.
   */
  async uninstall(id: string): Promise<void> {
    this.registry.remove(id);

    for (const p of this.plugin.settings.presets) {
      if (p.extMetrics) delete p.extMetrics[id];
      if (p.extSettings) delete p.extSettings[id];
      if (Array.isArray(p.rules)) p.rules = p.rules.filter((r) => r.metric !== id);
    }

    await this.persist(this.installed().filter((e) => e.id !== id));
  }

  /** Download an extension by catalogue entry and install it in one step. */
  async installFromIndex(entry: ExtensionIndexEntry): Promise<Extension> {
    return this.install(await this.fetchExtension(entry));
  }
}
