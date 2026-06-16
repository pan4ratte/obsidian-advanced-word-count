const ru = {
  // ── Default values ─────────────────────────────────────────────────────────
  defaultPresetName: "Новый пресет",
  unnamedPreset: "Без названия",
  newPresetName: (n: number) => `Пресет ${n}`,

  // ── Commands ───────────────────────────────────────────────────────────────
  commandActivatePreset: (name: string) => `Переключиться на пресет ${name}`,
  commandOpenView: "Открыть панель счётчиков",

  // ── Status bar ─────────────────────────────────────────────────────────────
  statusNoMetrics: "Нет включённых счётчиков",
  statusTooltipSingle: (name: string) => `${name}`,
  statusTooltipCycle: (name: string) => `${name}`,

  // Status bar metric labels
  statusWords: (n: number) => `Слов: ${n}`,
  statusChars: (n: number) => `Символов: ${n}`,
  statusCharsNoSpaces: (n: number) => `Символов (без пробелов): ${n}`,
  statusPages: (n: string) => `Страниц: ${n}`,
  statusLines: (n: number) => `Строк: ${n}`,
  statusParas: (n: number) => `Абзацев: ${n}`,
  statusMdLinks: (n: number) => `MD ссылок: ${n}`,
  statusWikiLinks: (n: number) => `Викиссылок: ${n}`,
  statusCitekeys: (n: number) => `Цитирований: ${n}`,
  statusEmbeds: (n: number) => `Вложений: ${n}`,
  statusTables: (n: number) => `Таблиц: ${n}`,
  statusTags: (n: number) => `Тегов: ${n}`,

  // ── Settings page ──────────────────────────────────────────────────────────
  settingsHeading: "Настройки Advanced Word Count",
  settingsDescription: "Данный плагин позволяет создавать сложные пресеты счётчиков слов, которые отображаются в строке состояния. Пресеты можно переключать нажатием на строку состояния или через палитру команд. Плагин создан с ориентацией на использование в академическом контексте, поэтому вы можете тонко настраивать подсчёт [@цитирований] и [[викиссылок]].",
  settingsSectionGeneral: "Основные",
  settingsSectionPresets: "Пресеты",
  settingsPresetsName: "Создать пресет",
  settingsPresetsDesc: "Пресеты позволяют индивидуально настраивать наборы метрик для разных писательских целей",
  settingsAddPreset: "Добавить пресет",
  settingsSeparatorName: "Разделитель метрик в строке состояния",
  settingsSeparatorDesc: "Введите символы, которые будут визуально разделять метрики в строке состояния",
  settingsHideDefaultName: "Скрыть стандартный счётчик слов Obsidian",
  settingsHideDefaultDesc: "Отключает встроенный плагин подсчёта слов Obsidian",
  settingsDisplayMethodName: "Способ отображения счётчиков",
  settingsDisplayMethodDesc: "Выберите, где будут отображаться пресеты счётчиков",
  displayMethodStatusBar: "Строка состояния",
  displayMethodRightPane: "Правая панель",
  displayMethodBoth: "Строка состояния + Правая панель",
  settingsRightPaneLayoutName: "Макет счётчиков в правой панели",
  settingsRightPaneLayoutDesc: "Выберите, каким образом метрики будут отображаться в правой панели",
  rightPaneLayoutOne: "Один столбец",
  rightPaneLayoutTwo: "Два столбца",
  settingsLimitWarningsDisplayName: "Способ отображения предупреждений о лимитах",
  settingsLimitWarningsDisplayDesc: "Выберите, где будут показаны предупреждения о лимитах",

  // ── Right pane view ────────────────────────────────────────────────────────
  viewTitle: "Advanced Word Count",
  viewNoFile: "Откройте заметку, чтобы увидеть метрики",

  // Preset card header
  badgeActive: "Активный",
  badgeInactive: "Неактивный",
  btnDeleteTooltip: "Удалить пресет",
  inputNamePlaceholder: "Введите имя пресета",

  // Words per page row
  wppLabel: "Считать",
  wppSuffix: "слов за одну страницу",

  // Section headers
  sectionStatusBar: "Счётчики в строке состояния",
  sectionStatusBarNote: "Выберите, какие метрики будут отображены в строке состояния",
  sectionWordCountOptions: "Слова и символы: расширенные настройки",
  sectionWordCountOptionsNote:
    "Настройте правила подсчёта элементов форматирования при подсчёте слов и символов",

  // Warnings & goals
  limitsTitle: "Предупреждения и цели",
  limitsDesc: "Предупреждения окрашивают метрику в оранжевый при достижении ≥90%, и в красный при ≥100%. Цели окрашивают метрику в зелёный при достижении ≥100%",
  warningsSubtitle: "Предупреждения",
  goalsSubtitle: "Цели",
  addWarning: "Новое предупреждение",
  addGoal: "Новая цель",
  limitSelectMetric: "Выберите метрику…",
  btnRemoveLimit: "Удалить",

  // ── Delete confirmation modal ──────────────────────────────────────────────
  deleteConfirmTitle: "Удалить пресет",
  deleteConfirmMessage: (name: string) => `Вы уверены, что хотите удалить пресет "${name}"? Это действие нельзя отменить.`,
  deleteConfirmYes: "Да, удалить",
  deleteConfirmNo: "Отменить",

  // ── Status bar metric toggles ──────────────────────────────────────────────
  toggles: {
    showWordsWithSpaces: {
      label: "Слова",
      hint: "Считает слова на основании расширенных настроек",
    },
    showCharsWithSpaces: {
      label: "Символы (с пробелами)",
      hint: "Считает символы и пробелы на основании расширенных настроек",
    },
    showCharsWithoutSpaces: {
      label: "Символы (без пробелов)",
      hint: "Считает символы на основании расширенных настроек, игнорирует пробелы",
    },
    showPages: {
      label: "Страницы",
      hint: "Считает страницы на основании количества слов на страницу, указанного выше",
    },
    showLines: {
      label: "Строки",
      hint: "Считает строки, в том числе пустые",
    },
    showParagraphs: {
      label: "Абзацы",
      hint: "Считает абзацы, исключая пустые строки",
    },
    showMarkdownLinks: {
      label: "Ссылки markdown",
      hint: "Считает ссылки [label](url) и (url)[label]",
    },
    showWikiLinks: {
      label: "Викиссылки",
      hint: "Считает ссылки [[wiki]] и [[wiki|label]]",
    },
    showCitekeys: {
      label: "Цитирования",
      hint: "Считает [@цитирования]",
    },
    showEmbeds: {
      label: "Вложения",
      hint: "Считает вложения ![[...]]",
    },
    showTables: {
      label: "Таблицы",
      hint: "Считает полные таблицы",
    },
    showTags: {
      label: "Теги",
      hint: "Считает #теги",
    },
  },

  // ── Word count option toggles ──────────────────────────────────────────────
  wordCountOptions: {
    countMdLinksAsWords: {
      label: "Считать отображаемый текст ссылок",
      hint: `Выкл.: [label](url) → label и url будут подсчитаны
Вкл.: только label будет подсчитан`,
    },
    ignoreWikiLinks: {
      label: "Игнорировать викиссылки",
      hint: `Выкл.: текст викиссылок будет подсчитан
Вкл.: викиссылки будут игнорироваться`,
    },
    countWikiLinkDisplayText: {
      label: "Считать отображаемый текст викиссылок",
      hint: `Выкл.: [[wiki|label]] → wiki и label будут подсчитаны
Вкл.: только label будет подсчитан`,
    },
    countCitekeysAsWords: {
      label: "Игнорировать ключи цитрования",
      hint: `Выкл.: текст ключей цитрования будет подсчитан
Вкл.: ключи цитирования будут игнорироваться`,
    },
    ignoreComments: {
      label: "Игнорировать комментарии",
      hint: `Выкл.: текст в %% … %% и <!-- … --> будет подсчитан
Вкл.: комментарии будут игнорироваться`,
    },
    ignoreCode: {
      label: "Игнорировать код",
      hint: `Выкл.: подсчитываются строчный код \`…\` и блоки кода \`\`\` … \`\`\`
Вкл.: код игнорируется`,
    },
    ignoreHtmlTags: {
      label: "Игнорировать HTML-теги",
      hint: `Выкл.: HTML-теги вида <b> … </b> подсчитываются
Вкл.: теги игнорируются, считаются только слова и символы внутри них`,
    },
  },
} as const;

export type Locale = typeof ru;
export default ru;
