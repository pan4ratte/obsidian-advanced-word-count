import { App, Plugin, PluginSettingTab, Setting, MarkdownView, ButtonComponent } from "obsidian";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Preset {
  id: string;
  name: string;

  // Page
  wordsPerPage: number;

  // Metric visibility
  showWords: boolean;
  showPages: boolean;
  showLines: boolean;
  showParagraphs: boolean;
  showMarkdownLinks: boolean;
  showWikiLinks: boolean;
  showCitekeys: boolean;

  // Word count inclusions / exclusions
  countMdLinksAsWords: boolean;
  countWikiLinkDisplayText: boolean; // count [[Page|Alias]] display text
  ignoreWikiLinks: boolean;          // strip wikilinks entirely (overrides display text)
  countCitekeysAsWords: boolean;
  ignoreComments: boolean;           // strip %% %% and <!-- --> before counting
}

interface WordCountSettings {
  activePresetId: string;
  presets: Preset[];
}

interface Metrics {
  words: number;
  pages: string;
  lines: number;
  paragraphs: number;
  markdownLinks: number;
  wikiLinks: number;
  citekeys: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultPreset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: crypto.randomUUID(),
    name: "Default",
    wordsPerPage: 250,
    showWords: true,
    showPages: true,
    showLines: false,
    showParagraphs: false,
    showMarkdownLinks: false,
    showWikiLinks: false,
    showCitekeys: false,
    countMdLinksAsWords: false,
    countWikiLinkDisplayText: false,
    ignoreWikiLinks: false,
    countCitekeysAsWords: false,
    ignoreComments: true,
    ...overrides,
  };
}

const DEFAULT_SETTINGS: WordCountSettings = {
  activePresetId: "",
  presets: [],
};

// ── Plugin ────────────────────────────────────────────────────────────────────

export default class WordCountPlugin extends Plugin {
  settings: WordCountSettings;
  statusBarItem: HTMLElement;
  private registeredCommandIds: Set<string> = new Set();

  async onload() {
    await this.loadSettings();

    if (this.settings.presets.length === 0) {
      const first = defaultPreset({ name: "Default" });
      this.settings.presets.push(first);
      this.settings.activePresetId = first.id;
      await this.saveSettings();
    }

    if (!this.getActivePreset()) {
      this.settings.activePresetId = this.settings.presets[0].id;
      await this.saveSettings();
    }

    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.style.cursor = "pointer";
    this.statusBarItem.addEventListener("click", () => this.cyclePreset());

    this.registerAllPresetCommands();

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.updateCount())
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => this.updateCount())
    );

    this.addSettingTab(new WordCountSettingTab(this.app, this));
    this.updateCount();
  }

  // ── Preset helpers ────────────────────────────────────────────────────────

  getActivePreset(): Preset | undefined {
    return this.settings.presets.find(
      (p) => p.id === this.settings.activePresetId
    );
  }

  async activatePreset(id: string) {
    this.settings.activePresetId = id;
    await this.saveSettings();
    this.updateCount();
  }

  cyclePreset() {
    const presets = this.settings.presets;
    if (presets.length <= 1) return;
    const idx = presets.findIndex((p) => p.id === this.settings.activePresetId);
    const next = presets[(idx + 1) % presets.length];
    this.activatePreset(next.id);
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  registerAllPresetCommands() {
    for (const preset of this.settings.presets) {
      this.registerPresetCommand(preset);
    }
  }

  registerPresetCommand(preset: Preset) {
    const cmdId = `word-count-activate-preset-${preset.id}`;
    if (this.registeredCommandIds.has(cmdId)) return;
    this.addCommand({
      id: cmdId,
      name: `Activate preset: ${preset.name}`,
      callback: () => this.activatePreset(preset.id),
    });
    this.registeredCommandIds.add(cmdId);
  }

  removePresetCommand(preset: Preset) {
    const cmdId = `word-count-activate-preset-${preset.id}`;
    (this.app as any).commands?.removeCommand(`${this.manifest.id}:${cmdId}`);
    this.registeredCommandIds.delete(cmdId);
  }

  refreshPresetCommands() {
    for (const cmdId of this.registeredCommandIds) {
      const presetId = cmdId.replace("word-count-activate-preset-", "");
      if (!this.settings.presets.find((p) => p.id === presetId)) {
        (this.app as any).commands?.removeCommand(`${this.manifest.id}:${cmdId}`);
        this.registeredCommandIds.delete(cmdId);
      }
    }
    for (const preset of this.settings.presets) {
      this.registerPresetCommand(preset);
      const fullId = `${this.manifest.id}:word-count-activate-preset-${preset.id}`;
      const cmd = (this.app as any).commands?.commands?.[fullId];
      if (cmd) cmd.name = `Activate preset: ${preset.name}`;
    }
  }

  // ── Counters ──────────────────────────────────────────────────────────────

  countWords(text: string, preset: Preset): number {
    let t = text;

    // Strip frontmatter
    t = t.replace(/^---[\s\S]*?---\n?/, "");

    // Comments — strip before anything else so comment content never leaks in
    if (preset.ignoreComments) {
      t = t.replace(/%%[\s\S]*?%%/g, " ");           // Obsidian comments %% ... %%
      t = t.replace(/<!--[\s\S]*?-->/g, " ");         // HTML comments <!-- ... -->
    }

    // Code (always excluded — code is never prose)
    t = t
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ");

    // Images (always excluded)
    t = t.replace(/!\[.*?\]\(.*?\)/g, " ");

    // MD links
    if (preset.countMdLinksAsWords) {
      t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // keep label
      t = t.replace(/\([^)]*\)\[([^\]]*)\]/g, "$1"); // reversed — keep label
    } else {
      t = t.replace(/\[.*?\]\(.*?\)/g, " ");
      t = t.replace(/\(.*?\)\[.*?\]/g, " ");
    }

    // Wiki links — two independent decisions:
    //   ignoreWikiLinks  → strip entirely regardless of display text setting
    //   countWikiLinkDisplayText → when NOT ignoring, extract display text as words
    if (preset.ignoreWikiLinks) {
      t = t.replace(/\[\[.*?\]\]/g, " ");
    } else if (preset.countWikiLinkDisplayText) {
      // [[Page|Alias]] → "Alias", [[Page]] → "Page"
      t = t.replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_, page, alias) =>
        (alias.trim() || page.trim()).replace(/#.*$/, "").trim()
      );
    } else {
      t = t.replace(/\[\[.*?\]\]/g, " ");
    }

    // Citekeys
    if (preset.countCitekeysAsWords) {
      t = t.replace(/\[@([^\]]+)\]/g, "$1");
    } else {
      t = t.replace(/\[@[^\]]*\]/g, " ");
    }

    const cleaned = t
      .replace(/#{1,6}\s/g, " ")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/~~(.*?)~~/g, "$1")
      .replace(/>\s/g, " ")
      .replace(/[-*+]\s/g, " ")
      .replace(/\d+\.\s/g, " ")
      .replace(/\|/g, " ")
      .trim();

    if (!cleaned) return 0;
    return cleaned.split(/\s+/).filter((w) => w.length > 0).length;
  }

  countLines(text: string): number {
    return text ? text.split("\n").length : 0;
  }

  countParagraphs(text: string): number {
    if (!text) return 0;
    const stripped = text.replace(/^---[\s\S]*?---\n?/, "");
    return stripped.split(/\n{2,}/).filter((b) => b.trim().length > 0).length;
  }

  countMarkdownLinks(text: string): number {
    const standard = (text.match(/\[.*?\]\(.*?\)/g) ?? []).filter(
      (m) => !m.startsWith("!")
    );
    const reversed = text.match(/\(.*?\)\[.*?\]/g) ?? [];
    return standard.length + reversed.length;
  }

  countWikiLinks(text: string): number {
    return (text.match(/\[\[.*?\]\]/g) ?? []).length;
  }

  countCitekeys(text: string): number {
    return (text.match(/\[@[^\]]+\]/g) ?? []).length;
  }

  // ── Status bar ────────────────────────────────────────────────────────────

  buildStatusText(preset: Preset, metrics: Metrics): string {
    const parts: string[] = [];
    if (preset.showWords)         parts.push(`Words: ${metrics.words}`);
    if (preset.showPages)         parts.push(`Pages: ${metrics.pages}`);
    if (preset.showLines)         parts.push(`Lines: ${metrics.lines}`);
    if (preset.showParagraphs)    parts.push(`Paras: ${metrics.paragraphs}`);
    if (preset.showMarkdownLinks) parts.push(`MD Links: ${metrics.markdownLinks}`);
    if (preset.showWikiLinks)     parts.push(`Wiki Links: ${metrics.wikiLinks}`);
    if (preset.showCitekeys)      parts.push(`Citekeys: ${metrics.citekeys}`);
    return parts.join("  |  ");
  }

  updateCount() {
    const preset = this.getActivePreset();
    if (!preset) { this.statusBarItem.setText("No preset"); return; }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) { this.statusBarItem.setText(""); return; }

    const text = view.getViewData();
    const words = this.countWords(text, preset);
    const metrics: Metrics = {
      words,
      pages: (words / preset.wordsPerPage).toFixed(1),
      lines: this.countLines(text),
      paragraphs: this.countParagraphs(text),
      markdownLinks: this.countMarkdownLinks(text),
      wikiLinks: this.countWikiLinks(text),
      citekeys: this.countCitekeys(text),
    };

    const label = this.settings.presets.length > 1 ? `[${preset.name}]  ` : "";
    const stats = this.buildStatusText(preset, metrics);
    this.statusBarItem.setText(label + (stats || "No metrics enabled"));
    this.statusBarItem.title =
      this.settings.presets.length > 1
        ? `Active preset: ${preset.name} — Click to cycle`
        : `Preset: ${preset.name}`;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

class WordCountSettingTab extends PluginSettingTab {
  plugin: WordCountPlugin;

  constructor(app: App, plugin: WordCountPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async save() {
    this.plugin.refreshPresetCommands();
    await this.plugin.saveSettings();
    this.plugin.updateCount();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Word Count & Pages" });

    new Setting(containerEl)
      .setName("Presets")
      .setDesc(
        "Each preset has its own metrics and becomes a command palette command."
      )
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText("+ Add preset")
          .setCta()
          .onClick(async () => {
            const preset = defaultPreset({
              name: `Preset ${this.plugin.settings.presets.length + 1}`,
            });
            this.plugin.settings.presets.push(preset);
            await this.save();
            this.display();
          })
      );

    for (const preset of this.plugin.settings.presets) {
      this.renderPreset(containerEl, preset);
    }
  }

  renderPreset(containerEl: HTMLElement, preset: Preset) {
    const isActive = preset.id === this.plugin.settings.activePresetId;

    const card = containerEl.createDiv();
    card.style.cssText = `
      border: 1px solid var(--background-modifier-border);
      border-radius: 8px; padding: 16px; margin: 12px 0;
      background: var(--background-secondary);
      ${isActive ? "border-color: var(--interactive-accent);" : ""}
    `;

    // ── Header ──────────────────────────────────────────────────────────────
    const header = card.createDiv();
    header.style.cssText =
      "display:flex; align-items:center; gap:10px; margin-bottom:14px;";

    if (isActive) {
      const badge = header.createEl("span", { text: "ACTIVE" });
      badge.style.cssText = `
        font-size:10px; font-weight:700; letter-spacing:.05em;
        background:var(--interactive-accent); color:var(--text-on-accent);
        border-radius:4px; padding:2px 6px;
      `;
    }

    const nameInput = header.createEl("input", { type: "text" });
    nameInput.value = preset.name;
    nameInput.placeholder = "Preset name";
    nameInput.style.cssText = `
      flex:1; font-size:15px; font-weight:600; background:transparent;
      border:none; border-bottom:1px solid var(--background-modifier-border);
      color:var(--text-normal); outline:none; padding:2px 4px;
    `;
    nameInput.addEventListener("change", async () => {
      preset.name = nameInput.value.trim() || "Unnamed";
      await this.save();
    });

    if (!isActive) {
      const actBtn = header.createEl("button", { text: "Set active" });
      actBtn.style.cssText = `
        font-size:12px; padding:3px 10px; border-radius:4px; cursor:pointer;
        background:var(--interactive-normal);
        border:1px solid var(--background-modifier-border); color:var(--text-normal);
      `;
      actBtn.addEventListener("click", async () => {
        await this.plugin.activatePreset(preset.id);
        this.display();
      });
    }

    const canDelete = this.plugin.settings.presets.length > 1;
    const delBtn = header.createEl("button", { text: "✕" });
    delBtn.title = "Delete preset";
    delBtn.style.cssText = `
      font-size:13px; padding:3px 8px; border-radius:4px; cursor:pointer;
      background:transparent; border:1px solid var(--background-modifier-border);
      color:var(--text-muted); ${!canDelete ? "opacity:.3; pointer-events:none;" : ""}
    `;
    delBtn.addEventListener("click", async () => {
      if (!canDelete) return;
      this.plugin.removePresetCommand(preset);
      this.plugin.settings.presets = this.plugin.settings.presets.filter(
        (p) => p.id !== preset.id
      );
      if (this.plugin.settings.activePresetId === preset.id) {
        this.plugin.settings.activePresetId = this.plugin.settings.presets[0].id;
      }
      await this.save();
      this.display();
    });

    // ── Words per page ──────────────────────────────────────────────────────
    const wppRow = card.createDiv();
    wppRow.style.cssText =
      "display:flex; align-items:center; gap:8px; margin-bottom:14px;";
    const wppLabel = wppRow.createEl("span", { text: "Words per page:" });
    wppLabel.style.cssText =
      "font-size:13px; color:var(--text-muted); white-space:nowrap;";

    const wppInput = wppRow.createEl("input", { type: "number" });
    wppInput.value = String(preset.wordsPerPage);
    wppInput.min = "1";
    wppInput.style.cssText = `
      width:80px; padding:3px 6px; border-radius:4px;
      border:1px solid var(--background-modifier-border);
      background:var(--background-primary); color:var(--text-normal);
    `;
    wppInput.addEventListener("change", async () => {
      const n = parseInt(wppInput.value);
      if (!isNaN(n) && n > 0) {
        preset.wordsPerPage = n;
        await this.save();
      }
    });
    wppRow.createEl("span", { text: "words = 1 page" }).style.cssText =
      "font-size:12px; color:var(--text-muted);";

    // ── Section: Status bar metrics ─────────────────────────────────────────
    this.sectionHeader(card, "Status bar metrics");

    const visGrid = card.createDiv();
    visGrid.style.cssText = `
      display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
      gap:6px; margin-bottom:16px;
    `;

    const visToggles: { key: keyof Preset; label: string }[] = [
      { key: "showWords",         label: "Word count" },
      { key: "showPages",         label: "Page count" },
      { key: "showLines",         label: "Line count" },
      { key: "showParagraphs",    label: "Paragraph count" },
      { key: "showMarkdownLinks", label: "Markdown links" },
      { key: "showWikiLinks",     label: "Wiki links" },
      { key: "showCitekeys",      label: "Citekeys" },
    ];

    for (const t of visToggles) {
      this.renderToggleChip(visGrid, preset, t.key, t.label);
    }

    // ── Section: Word count options ─────────────────────────────────────────
    this.sectionHeader(card, "Word count — include as words");

    const note = card.createEl("p", {
      text: "Control which markup tokens contribute to the word count.",
    });
    note.style.cssText =
      "font-size:12px; color:var(--text-muted); margin:0 0 10px;";

    const wcGrid = card.createDiv();
    wcGrid.style.cssText =
      "display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:6px;";

    const wcToggles: { key: keyof Preset; label: string; hint: string }[] = [
      {
        key: "countMdLinksAsWords",
        label: "MD link labels",
        hint: "Count [label](url) label text as words. Off = strip entirely.",
      },
      {
        key: "ignoreWikiLinks",
        label: "Ignore wiki links entirely",
        hint: "Strip [[…]] from word count completely. Overrides the display text option below.",
      },
      {
        key: "countWikiLinkDisplayText",
        label: "Wiki link display text",
        hint: "Count [[Page|Alias]] or [[Page]] text as words. Has no effect if 'Ignore wiki links' is on.",
      },
      {
        key: "countCitekeysAsWords",
        label: "Citekey tokens",
        hint: "Count [@citekey] as a word. Off = strip entirely.",
      },
      {
        key: "ignoreComments",
        label: "Ignore comments",
        hint: "Strip Obsidian comments (%% … %%) and HTML comments (<!-- … -->) before counting words.",
      },
    ];

    for (const t of wcToggles) {
      this.renderToggleChip(wcGrid, preset, t.key, t.label, t.hint);
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  sectionHeader(parent: HTMLElement, text: string) {
    const h = parent.createEl("p", { text });
    h.style.cssText = `
      font-size:11px; font-weight:700; letter-spacing:.06em;
      text-transform:uppercase; color:var(--text-muted); margin:0 0 8px;
    `;
  }

  renderToggleChip(
    parent: HTMLElement,
    preset: Preset,
    key: keyof Preset,
    label: string,
    hint?: string
  ) {
    const row = parent.createDiv();
    row.style.cssText = `
      display:flex; align-items:center; justify-content:space-between;
      padding:6px 10px; border-radius:6px;
      background:var(--background-primary);
      border:1px solid var(--background-modifier-border);
      cursor:pointer;
    `;
    if (hint) row.title = hint;

    const labelEl = row.createEl("span", { text: label });
    labelEl.style.cssText =
      "font-size:13px; color:var(--text-normal); pointer-events:none;";

    const toggle = row.createDiv({ cls: "checkbox-container" });
    if (preset[key]) toggle.addClass("is-enabled");
    toggle.style.pointerEvents = "none";

    row.addEventListener("click", async () => {
      (preset[key] as boolean) = !(preset[key] as boolean);
      toggle.toggleClass("is-enabled", preset[key] as boolean);
      await this.save();
    });
  }
}