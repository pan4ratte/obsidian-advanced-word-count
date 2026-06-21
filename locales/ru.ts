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
  statusReadingTime: (n: string) => `Время чтения: ${n} мин`,
  statusLines: (n: number) => `Строк: ${n}`,
  statusParas: (n: number) => `Абзацев: ${n}`,
  statusMdLinks: (n: number) => `MD ссылок: ${n}`,
  statusWikiLinks: (n: number) => `Викиссылок: ${n}`,
  statusCitekeys: (n: number) => `Цитирований: ${n}`,
  statusEmbeds: (n: number) => `Вложений: ${n}`,
  statusFootnotes: (n: number) => `Сносок: ${n}`,

  // ── Settings page ──────────────────────────────────────────────────────────
  settingsHeading: "Настройки Advanced Word Count",
  settingsDescription: "Данный плагин позволяет создавать сложные пресеты счётчиков слов для строки состояния или правой боковой панели, переключаться между ними одним нажатием, ставить цели и предупреждения о достижении лимитов и многое другое. Плагин создан с в академическом контексте, поэтому доступна тонкая настройка подсчёта [@цитирований], [[викиссылок]], сносок и других элементов оформления.",
  settingsSectionGeneral: "Основные",
  settingsSectionPresets: "Пресеты и расширения",
  settingsPresetsName: "Создать пресет счётчика",
  settingsPresetsDesc: "Позволяют создавать индивидуальные наборы метрик для разных писательских целей",
  settingsAddPreset: "Новый пресет",
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
  btnShareTooltip: "Поделиться пресетом (экспорт файла для предложения в каталог)",
  btnDeleteTooltip: "Удалить пресет",
  inputNamePlaceholder: "Введите имя пресета",
  presetExportedNotice: (name: string) =>
    `Пресет "${name}" экспортирован. Заполните автора/описание и откройте pull request, чтобы предложить его.`,

  // Words per page row
  wppLabel: "Считать",
  wppSuffix: "слов за одну страницу",

  // Reading time speed selector
  readingTimeUnit: "МИН.",
  readingTimeLabel: "Рассчитать время чтения для:",
  readingSpeedAverage: "Средний читатель (250 сл/мин)",
  readingSpeedFast: "Быстрый читатель (400 сл/мин)",
  readingSpeedComplex: "Сложный текст (150 сл/мин)",

  // Section headers
  sectionStatusBar: "Метрики",
  sectionStatusBarNote: "Выберите, какие метрики будут отображены в счётчике или подключите расширения сообщества, установленные из магазина",
  sectionWordCountOptions: "Слова и символы: расширенные настройки",
  sectionWordCountOptionsNote:"Настройте правила подсчёта элементов форматирования при подсчёте слов и символов или подключите расширения сообщества, установленные из магазина",

  // Warnings & goals
  limitsTitle: "Предупреждения и цели",
  limitsDesc: "Предупреждение окрашивает метрику в оранжевый при достижении ≥90%, в красный при ≥100%. Цель окрашивает метрику в зелёный при ≥100%",
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

  // ── Extensions ─────────────────────────────────────────────────────────────
  settingsAddExtensionsName: "Расширения сообщества",
  settingsAddExtensionsDesc: "Установите дополнительные метрики и настройки из магазина расширений",
  settingsBrowseExtensions: "Магазин расширений",
  settingsAutoUpdateExtensionsName: "Автоматически обновлять установленные расширения сообщества",
  settingsAutoUpdateExtensionsDesc:
    "Проверять каталог при запуске и обновлять установленные расширения, когда доступна новая версия",
  extAutoUpdatedNotice: (count: number) => {
    const m10 = count % 10, m100 = count % 100;
    const word = m10 === 1 && m100 !== 11 ? "расширение"
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "расширения"
      : "расширений";
    return `Обновлено ${count} ${word}`;
  },

  // Browse modal
  extModalTitle: "Магазин расширений",
  extSearchPlaceholder: "Поиск расширений…",
  extLoading: "Загружаем расширения…",
  extLoadError: "Не удалось загрузить расширения: проверьте подключение и попробуйте снова",
  extRetry: "Повторить",
  extNoResults: "Нет расширений по вашему запросу",
  extEmptyCatalogue: "Пока нет доступных расширений",
  extInstall: "Установить",
  extInstallPreset: "Добавить пресет",
  extUpdate: "Обновить",
  extInstalling: "Установка…",
  extTypeMetric: "Метрика",
  extTypeSetting: "Настройка",
  extTypePreset: "Пресет",
  extUninstall: "Удалить",
  extByAuthor: (author: string) => `Автор: ${author}`,
  extInstalledNotice: (name: string) => `Установлено: "${name}"`,
  extInstalledWithDepsNotice: (name: string, deps: number) => {
    const m10 = deps % 10, m100 = deps % 100;
    const word = m10 === 1 && m100 !== 11 ? "зависимость"
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "зависимости"
      : "зависимостей";
    return `Установлено: "${name}" и ${deps} ${word}`;
  },
  extPresetInstalledNotice: (name: string, exts: number) => {
    if (exts === 0) return `Добавлен пресет "${name}"`;
    const m10 = exts % 10, m100 = exts % 100;
    const word = m10 === 1 && m100 !== 11 ? "расширение"
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "расширения"
      : "расширений";
    return `Добавлен пресет "${name}" и ${exts} ${word}`;
  },
  extInstallFailed: (msg: string) => `Ошибка установки: ${msg}`,
  extUninstalledNotice: (name: string) => `Удалено: "${name}"`,
  extUninstallFailed: (msg: string) => `Ошибка удаления: ${msg}`,
  extUninstallConfirmTitle: "Удалить расширение?",
  extUninstallConfirmMessage: (name: string, dependents: string) =>
    `Расширение "${name}" требуется для ${dependents}. После удаления ${dependents.indexOf(",") === -1 ? "оно может" : "они могут"} перестать работать.`,
  extUninstallConfirmYes: "Всё равно удалить",
  extUninstallConfirmNo: "Отмена",

  // Browse modal — type filter chips
  extFilterAll: "Все",
  extFilterMetrics: "Метрики",
  extFilterSettings: "Расширенные настройки",
  extFilterPresets: "Пресеты",

  // Per-preset connect (dropdowns in the metric / setting section headers)
  connectAddMetric: "Расширения сообщества…",
  connectAddSetting: "Подключить настройку…",
  connectInstallFirst: "Расширения сообщетсва…",

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
    showReadingTime: {
      label: "Время чтения",
      hint: "Оценивает время чтения в минутах на основе количества слов и выбранной скорости чтения",
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
      hint: "Считает вложения ![[...]] и ![](...)",
    },
    showFootnotes: {
      label: "Сноски",
      hint: "Считает только полные сноски ([^1] с определением [^1]: или строчные ^[…])",
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
    ignoreHtmlTags: {
      label: "Игнорировать HTML-теги",
      hint: `Выкл.: HTML-теги вида <b> … </b> подсчитываются
Вкл.: теги игнорируются, считаются только слова и символы внутри них`,
    },
  },
} as const;

export type Locale = typeof ru;
export default ru;
