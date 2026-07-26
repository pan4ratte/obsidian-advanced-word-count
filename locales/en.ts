const en = {
  // ── Default values ─────────────────────────────────────────────────────────
  defaultPresetName: "New preset",
  unnamedPreset: "Unnamed",
  newPresetName: (n: number) => `Preset ${n}`,

  // ── Commands ───────────────────────────────────────────────────────────────
  commandActivatePreset: (name: string) => `Switch to ${name} preset`,
  commandOpenView: "Open metrics panel",

  // ── Status bar ─────────────────────────────────────────────────────────────
  statusNoMetrics: "No metrics enabled",
  statusTooltipSingle: (name: string) => `${name}`,
  statusTooltipCycle: (name: string) => `${name}`,

  // Status bar metric labels, keyed by MetricKey. The status bar shows
  // "<label>: <value>"; a custom label (see settingsCustomLabels*) replaces the
  // label, or drops it entirely when set to an empty string.
  statusLabels: {
    wordsWithSpaces: "Words",
    charsWithSpaces: "Chars",
    charsWithoutSpaces: "Chars (no spaces)",
    pages: "Pages",
    readingTime: "Reading time",
    lines: "Lines",
    paragraphs: "Paras",
    markdownLinks: "MD Links",
    wikiLinks: "Wikilinks",
    citekeys: "Citekeys",
    embeds: "Embeds",
    footnotes: "Footnotes",
  },
  // Follows the reading-time value in the status bar ("Reading time: 3.4 min").
  statusReadingTimeUnit: "min",

  // ── Settings page ──────────────────────────────────────────────────────────
  settingsHeading: "Advanced Word Count settings",
  settingsDescription: "This plugin lets you create complex word-count presets for the status bar or the right pane, switch between them with one click, set goals and limit warnings, and much more. Thanks to community extensions — presets, metrics and advanced settings — the plugin flexibly adapts to writing, academic and other purposes.",
  settingsSectionGeneral: "General",
  settingsSectionPresets: "Presets & extensions",
  settingsPresetsStoreName: "Manage presets and extensions",
  settingsPresetsStoreDesc: "Create your own counter presets, or install community presets, metrics and settings.",
  settingsAddPreset: "Create preset",
  settingsSeparatorName: "Status bar metrics separator",
  settingsSeparatorDesc: "Type the characters that will visually separate metrics in the status bar",
  settingsHideDefaultName: "Hide default Obsidian word counter",
  settingsHideDefaultDesc: "Disables Obsidian word count core plugin",
  settingsDisplayMethodName: "Counters display method",
  settingsDisplayMethodDesc: "Choose where your counter presets are displayed",
  displayMethodStatusBar: "Status bar",
  displayMethodRightPane: "Right pane",
  displayMethodBoth: "Status bar + Right pane",
  settingsRightPaneLayoutName: "Right pane metrics layout",
  settingsRightPaneLayoutDesc: "Choose how metric blocks are arranged in the right pane",
  rightPaneLayoutOne: "One column",
  rightPaneLayoutTwo: "Two columns",
  settingsLimitWarningsDisplayName: "Limit warnings display method",
  settingsLimitWarningsDisplayDesc: "Choose where limit warnings are visible",

  // ── Right pane view ────────────────────────────────────────────────────────
  viewTitle: "Advanced Word Count",
  viewNoFile: "Open a note to see metrics",

  // Preset card header
  badgeActive: "Active",
  badgeInactive: "Inactive",
  btnShareTooltip: "Share preset (export files to suggest for the catalogue)",
  btnDeleteTooltip: "Delete preset",
  inputNamePlaceholder: "Enter preset name",
  presetExportedNotice: (name: string) =>
    `Exported "${name}": preset file + index entry.`,

  // Preset export dialog
  exportModalTitle: "Share preset",
  exportFieldName: "Preset name (English)",
  exportFieldAuthor: "Author",
  exportAuthorPlaceholder: "Your name or nickname",
  exportFieldDescription: "Description (English)",
  exportLocalizedNote: "Filling in the fields below is optional — if you leave them empty, the English text is used.",
  exportFieldNameRu: "Preset name (Russian)",
  exportFieldDescriptionRu: "Description (Russian)",
  exportInstruction: "After export you'll get two files and can add your preset to the community store: upload the preset file to the repository as-is, and paste the index-entry file's contents at the end of the repository's index.json.",
  exportConfirm: "Export",
  exportCancel: "Cancel",
  exportOpenRepo: "Open repository",
  exportMissingFields: "Fill in the preset name, author and description first.",

  // Words per page row
  wppLabel: "Count",
  wppSuffix: "words as one page",

  // Reading time speed selector
  readingTimeUnit: "MIN.",
  readingTimeLabel: "Calculate reading time for:",
  readingSpeedAverage: "Average reader (250 WPM)",
  readingSpeedFast: "Fast reader (400 WPM)",
  readingSpeedComplex: "Complex text (150 WPM)",

  // Section headers
  sectionStatusBar: "Metrics",
  sectionStatusBarNote: "Choose which metrics are displayed in the counter, or connect community extensions installed from the store",
  sectionWordCountOptions: "Words and characters: advanced settings",
  sectionWordCountOptionsNote:
    "Fine-tune the counting rules for formatting elements when counting words and characters, or connect community extensions installed from the store",

  // Warnings & goals
  limitsTitle: "Warnings and goals",
  limitsDesc: "Warning colors a metric orange when ≥90% is reached and red at ≥100%. Goal colors a metric green at ≥100%",
  warningsSubtitle: "Warnings",
  goalsSubtitle: "Goals",
  addWarning: "New warning",
  addGoal: "New goal",
  limitSelectMetric: "Select a metric…",
  btnRemoveLimit: "Remove",

  // ── Delete confirmation modal ──────────────────────────────────────────────
  deleteConfirmTitle: "Delete preset",
  deleteConfirmMessage: (name: string) => `Are you sure you want to delete "${name}" preset? This action is irreversible.`,
  deleteConfirmYes: "Yes, delete",
  deleteConfirmNo: "Cancel",

  // ── Extensions ─────────────────────────────────────────────────────────────
  settingsBrowseExtensions: "Extensions store",
  settingsAutoUpdateExtensionsName: "Automatically update community extensions",
  settingsAutoUpdateExtensionsDesc:
    "Check for updates to installed community extensions when Obsidian starts",
  extAutoUpdatedNotice: (count: number) =>
    `Updated ${count} ${count === 1 ? "extension" : "extensions"}`,

  // ── Custom labels ──────────────────────────────────────────────────────────
  settingsCustomLabelsName: "Set custom labels",
  settingsCustomLabelsDesc: "Change labels of any metric to your liking",
  settingsCustomLabelsButton: "Labels manager",
  labelsModalTitle: "Metric labels manager",
  labelsModalNote: "Rename any metric, or clear a field to hide its name.",
  labelsSearchPlaceholder: "Search metrics…",
  labelsFilterAll: "All",
  labelsFilterBuiltin: "Built-in",
  labelsFilterDownloaded: "Downloaded",
  labelsTypeBuiltin: "Built-in metric",
  labelsTypeDownloaded: "Downloaded metric",
  labelsFieldStatusBar: "Status bar",
  labelsFieldRightPane: "Right pane",
  labelsNoLabelPlaceholder: "No label",
  labelsReset: "Reset to default",
  labelsNoResults: "No metrics match your search",

  // Browse modal
  extModalTitle: "Extensions store",
  extSearchPlaceholder: "Search extensions…",
  extLoading: "Loading extensions…",
  extLoadError: "Couldn't load extensions. Check your connection and try again.",
  extRetry: "Retry",
  extNoResults: "No extensions match your search",
  extEmptyCatalogue: "No extensions are available yet",
  extInstall: "Install",
  extInstallPreset: "Add preset",
  extUpdate: "Update",
  extInstalling: "Installing…",
  extTypeMetric: "Metric",
  extTypeSetting: "Setting",
  extTypePreset: "Preset",
  extUninstall: "Uninstall",
  extByAuthor: (author: string) => `by ${author}`,
  extInstalledNotice: (name: string) => `Installed "${name}"`,
  extInstalledWithDepsNotice: (name: string, deps: number) =>
    `Installed "${name}" and ${deps} ${deps === 1 ? "dependency" : "dependencies"}`,
  extPresetInstalledNotice: (name: string, exts: number) =>
    exts > 0
      ? `Added preset "${name}" and ${exts} ${exts === 1 ? "extension" : "extensions"}`
      : `Added preset "${name}"`,
  extInstallFailed: (msg: string) => `Install failed: ${msg}`,
  extUninstalledNotice: (name: string) => `Uninstalled "${name}"`,
  extUninstallFailed: (msg: string) => `Uninstall failed: ${msg}`,
  extUninstallConfirmTitle: "Remove extension?",
  extUninstallConfirmMessage: (name: string, dependents: string) =>
    `"${name}" is required by ${dependents}. Removing it may stop ${dependents.indexOf(",") === -1 ? "it" : "them"} from working.`,
  extUninstallConfirmYes: "Remove anyway",
  extUninstallConfirmNo: "Cancel",

  // Browse modal — type filter chips
  extFilterAll: "All",
  extFilterMetrics: "Metrics",
  extFilterSettings: "Advanced settings",
  extFilterPresets: "Presets",
  extFilterLocal: "Local",

  // Browse modal — "Local" filter (test a self-developed extension from a file)
  extLocalIntroTitle: "Test your community extension locally",
  extLocalIntroDesc:
    "Use this page to add community metrics or settings that you develop to the plugin. After that you can test your extension locally",
  extLocalAdd: "Add from file",
  extLocalInstalledNotice: (name: string) => `Added local extension "${name}"`,
  extLocalInstallFailed: (msg: string) => `Couldn't add extension: ${msg}`,

  // Per-preset connect (dropdowns in the metric / setting section headers)
  connectAddMetric: "Community extensions…",
  connectAddSetting: "Connect a setting…",
  connectInstallFirst: "Community extensions…",

  // ── Status bar metric toggles ──────────────────────────────────────────────
  toggles: {
    showWordsWithSpaces: {
      label: "Words",
      hint: "Counts words, based on the advanced settings",
    },
    showCharsWithSpaces: {
      label: "Characters (with spaces)",
      hint: "Counts characters and spaces, based on the advanced settings",
    },
    showCharsWithoutSpaces: {
      label: "Characters (without spaces)",
      hint: "Counts characters, ignores spaces, based on the advanced settings",
    },
    showPages: {
      label: "Pages",
      hint: "Counts pages, based on the number of words per page, specified above",
    },
    showReadingTime: {
      label: "Reading time",
      hint: "Estimates reading time in minutes from the word count and the chosen reading speed",
    },
    showLines: {
      label: "Lines",
      hint: "Counts lines, including blank lines",
    },
    showParagraphs: {
      label: "Paragraphs",
      hint: "Counts paragraphs, excluding blank lines",
    },
    showMarkdownLinks: {
      label: "Markdown links",
      hint: "Counts [label](url) and (url)[label] links",
    },
    showWikiLinks: {
      label: "Wikilinks",
      hint: "Counts [[wiki]] and [[wiki|label]] links",
    },
    showCitekeys: {
      label: "Citekeys",
      hint: "Counts [@citekey] references",
    },
    showEmbeds: {
      label: "Embeds",
      hint: "Counts ![[...]], ![](...) and HTML embeds (<img>, <iframe>, <video>, …)",
    },
    showFootnotes: {
      label: "Footnotes",
      hint: "Counts only complete footnotes ([^1] with a [^1]: definition, or inline ^[…])",
    },
  },

  // ── Word count option toggles ──────────────────────────────────────────────
  wordCountOptions: {
    countMdLinksAsWords: {
      label: "Count links display text",
      hint: `Off: [label](url) → label and url will be counted
On: only label will be counted`,
    },
    ignoreWikiLinks: {
      label: "Ignore wikilinks",
      hint: `Off: wikilinks text will be counted
On: wikilinks will be ignored`,
    },
    countWikiLinkDisplayText: {
      label: "Count wikilinks display text",
      hint: `Off: [[wiki|label]] → wiki and label will be counted
On: only label will be counted`,
    },
    countCitekeysAsWords: {
      label: "Ignore citekeys",
      hint: `Off: citekeys text will be counted
On: citekeys will be ignored`,
    },
    ignoreComments: {
      label: "Ignore comments",
      hint: `Off: comments %% … %% and <!-- … --> text will be counted
On: comments will be ignored`,
    },
    ignoreHtmlTags: {
      label: "Ignore HTML tags",
      hint: `Off: HTML tags like <b> … </b> are counted
On: tags are ignored, only words and symbols inside them are counted`,
    },
  },
} as const;

type Stringified<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, unknown>
    ? Stringified<T[K]>
    : T[K];
};
export type Locale = Stringified<typeof en>;
export default en;
