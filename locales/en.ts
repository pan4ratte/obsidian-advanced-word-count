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

  // Status bar metric labels
  statusWords: (n: number) => `Words: ${n}`,
  statusChars: (n: number) => `Chars: ${n}`,
  statusCharsNoSpaces: (n: number) => `Chars (no spaces): ${n}`,
  statusPages: (n: string) => `Pages: ${n}`,
  statusReadingTime: (n: string) => `Reading time: ${n} min`,
  statusLines: (n: number) => `Lines: ${n}`,
  statusParas: (n: number) => `Paras: ${n}`,
  statusMdLinks: (n: number) => `MD Links: ${n}`,
  statusWikiLinks: (n: number) => `Wikilinks: ${n}`,
  statusCitekeys: (n: number) => `Citekeys: ${n}`,
  statusEmbeds: (n: number) => `Embeds: ${n}`,
  statusFootnotes: (n: number) => `Footnotes: ${n}`,

  // ── Settings page ──────────────────────────────────────────────────────────
  settingsHeading: "Advanced Word Count settings",
  settingsDescription: "This plugin allows you to create complex word counting presets for the status bar and right pane tab, cycle them with one click, set goals and limit warnings ставить and more. Plugin was created in the academic context and you can fine-tune [@citekeys], [[wikilinks]], footnotes and other fomatting elements counting methods.",
  settingsSectionGeneral: "General",
  settingsSectionPresets: "Presets",
  settingsPresetsName: "Create preset",
  settingsPresetsDesc: "Allow to create individual metric sets for different writing purposes",
  settingsAddPreset: "New preset",
  settingsSeparatorName: "Status bar metrics separator",
  settingsSeparatorDesc: "Specify the look of metrics separator by typing anything",
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
  btnDeleteTooltip: "Delete preset",
  inputNamePlaceholder: "Enter preset name",

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
  sectionStatusBar: "Counter metrics",
  sectionStatusBarNote: "Choose, which metrics will be displayed in the counter",
  sectionWordCountOptions: "Words and characters: advanced settings",
  sectionWordCountOptionsNote:
    "Fine-tune counting rules of formatting elements when words and characters are counted",

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
  settingsAddExtensionsName: "Add extensions",
  settingsAddExtensionsDesc:
    "Browse community extensions that add new metrics or advanced settings, then connect them to your presets below",
  settingsBrowseExtensions: "Browse extensions",

  // Browse modal
  extModalTitle: "Browse extensions",
  extSearchPlaceholder: "Search extensions…",
  extLoading: "Loading extensions…",
  extLoadError: "Couldn't load extensions. Check your connection and try again.",
  extRetry: "Retry",
  extNoResults: "No extensions match your search",
  extEmptyCatalogue: "No extensions are available yet",
  extInstall: "Install",
  extInstalling: "Installing…",
  extInstalled: "Installed",
  extUpdate: "Update",
  extTypeMetric: "Metric",
  extTypeSetting: "Setting",
  extUninstall: "Uninstall",
  extByAuthor: (author: string) => `by ${author}`,
  extInstalledNotice: (name: string) => `Installed "${name}"`,
  extInstallFailed: (msg: string) => `Install failed: ${msg}`,
  extUninstalledNotice: (name: string) => `Uninstalled "${name}"`,
  extUninstallFailed: (msg: string) => `Uninstall failed: ${msg}`,

  // Browse modal — install-state filter chips
  extFilterAll: "All",
  extFilterInstalled: "Installed",
  extFilterNotInstalled: "Not installed",

  // Per-preset connect
  sectionConnectExtensions: "Connect extensions",
  sectionConnectExtensionsNote: "Enable installed extensions for this preset",
  connectExtensionPlaceholder: "Connect an extension…",
  connectNoneInstalled: 'No extensions installed yet — use "Add extensions" above',
  connectRemoveTooltip: "Disconnect from this preset",

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
      label: "Blocks",
      hint: "Counts blocks of text, excluding blank lines",
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
      hint: "Counts ![[...]] and ![](...) embeds",
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
