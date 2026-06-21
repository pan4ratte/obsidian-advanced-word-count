import { requestUrl } from "obsidian";
import type WordCountPlugin from "./main";
import type { Preset } from "./metrics";
import { DEFAULT_EXTENSION_REPO_URL } from "./metrics";
import {
  Extension,
  ExtensionIndex,
  ExtensionIndexEntry,
  ExtensionRegistry,
  findDependents,
  materializePreset,
  resolveInstallOrder,
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

  /** Installed extensions that depend on `id` — i.e. would break if it's removed. */
  dependents(id: string): Extension[] {
    return findDependents(id, this.installed());
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

  /**
   * Download an extension by catalogue entry and install it, pulling in any
   * required dependencies first. `index` is the catalogue used to resolve the
   * dependency tree; it's fetched if not supplied. Returns every extension newly
   * installed in this call, dependencies first and the requested one last.
   */
  async installFromIndex(entry: ExtensionIndexEntry, index?: ExtensionIndexEntry[]): Promise<Extension[]> {
    const catalogue = index ?? (await this.fetchIndex());
    const { order, missing } = resolveInstallOrder(entry.id, catalogue, (id) => this.isInstalled(id));
    if (missing.length > 0) {
      throw new Error(`Missing required dependencies: ${missing.join(", ")}`);
    }
    const installed: Extension[] = [];
    for (const e of order) {
      installed.push(await this.install(await this.fetchExtension(e)));
    }
    return installed;
  }

  /**
   * Install a shareable preset: download every community extension it uses (and
   * their transitive dependencies), skipping anything already installed, then
   * return a fresh `Preset` for the caller to add to `settings.presets`. The
   * preset itself is NOT stored in `installedExtensions` — it becomes a normal
   * user preset. Returns the new preset plus how many extensions were downloaded.
   */
  async installPresetFromIndex(
    entry: ExtensionIndexEntry,
    index?: ExtensionIndexEntry[],
  ): Promise<{ preset: Preset; extCount: number }> {
    const catalogue = index ?? (await this.fetchIndex());
    const ext = await this.fetchExtension(entry);
    if (ext.type !== "preset") throw new Error(`"${entry.id}" is not a preset extension`);

    let extCount = 0;
    for (const depId of ext.dependencies || []) {
      if (this.isInstalled(depId)) continue; // already have it (and, with it, its deps)
      const { order, missing } = resolveInstallOrder(depId, catalogue, (id) => this.isInstalled(id));
      if (missing.length > 0) {
        throw new Error(`Missing required extensions in catalogue: ${missing.join(", ")}`);
      }
      for (const e of order) {
        await this.install(await this.fetchExtension(e));
        extCount++;
      }
    }
    return { preset: materializePreset(ext), extCount };
  }

  /**
   * Update every installed extension whose catalogue copy is newer (its `updated`
   * date is lexically greater than the installed one). Fetches the index once and
   * reuses it for dependency resolution. Returns the updated definitions; a single
   * failed download is skipped so one bad entry doesn't abort the rest.
   */
  async updateAll(): Promise<Extension[]> {
    const index = await this.fetchIndex();
    const updated: Extension[] = [];
    for (const entry of index) {
      const installedDate = this.installedDate(entry.id);
      if (!installedDate || !entry.updated || entry.updated <= installedDate) continue;
      try {
        const batch = await this.installFromIndex(entry, index);
        updated.push(batch[batch.length - 1]); // the entry itself is installed last
      } catch {
        // Leave the current copy in place if its update can't be fetched/validated.
      }
    }
    return updated;
  }
}
