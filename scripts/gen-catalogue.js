/*
 * Regenerates the "official catalogue" tables in README.md / README_RU.md from
 * extensions/index.json, so the docs can't drift from the store.
 *
 * The generated tables sit between two fixed prose lines in each README — an intro
 * ("The official catalogue currently includes:") and an outro ("Want to build your
 * own?"). Everything between those anchors is replaced; the surrounding prose is
 * left alone. (Prose anchors are used instead of HTML comment markers because
 * Obsidian's plugin linter flags `<!-- -->` in a README as leftover template text.)
 *
 * Run:    npm run docs:catalogue                  (rewrite the READMEs)
 * Check:  node scripts/gen-catalogue.js --check    (exit 1 if a README is stale)
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

// The three sections, in display order.
const TYPES = ["metric", "setting", "preset"];

// Per-language anchors (the static lines the tables sit between), section headings
// and column labels.
const LANGS = {
  en: {
    file: "README.md",
    intro: "The official catalogue currently includes:",
    outro: "Want to build your own?",
    headings: { metric: "Metrics", setting: "Advanced settings", preset: "Presets" },
    cols: ["Name", "Description"],
  },
  ru: {
    file: "README_RU.md",
    intro: "Официальный каталог на данный момент включает:",
    outro: "Хотите создать своё?",
    headings: { metric: "Метрики", setting: "Расширенные настройки", preset: "Пресеты" },
    cols: ["Название", "Описание"],
  },
};

const loadIndex = () =>
  JSON.parse(fs.readFileSync(path.join(root, "extensions", "index.json"), "utf8"));

// The localized display name/description for an entry (English base; other locales
// fall back to the base when a field is missing).
const field = (entry, lang, key) => {
  if (lang === "en") return entry[key];
  const loc = entry.i18n && entry.i18n[lang];
  return (loc && loc[key]) || entry[key];
};

// Make a description safe inside a Markdown table cell: escape pipes, and wrap the
// inline tokens that GitHub would otherwise render (math, strikethrough, highlight)
// in backticks so they show verbatim.
const cell = (s) =>
  s
    .replace(/\|/g, "\\|")
    .replace(/\$\$[^$]*\$\$|\$[^$\n]+\$|~~[^~]+~~|==[^=]+==/g, (m) => "`" + m + "`");

const table = (entries, lang, type) => {
  const cfg = LANGS[lang];
  const rows = entries
    .filter((e) => e.type === type)
    .map((e) => `| ${field(e, lang, "storeName")} | ${cell(field(e, lang, "description"))} |`);
  return [
    `**${cfg.headings[type]}**`,
    "",
    `| ${cfg.cols[0]} | ${cfg.cols[1]} |`,
    "| :--- | :---------- |",
    ...rows,
  ].join("\n");
};

// The generated block (between the anchors) for one language.
const buildBlock = (lang, index = loadIndex()) =>
  TYPES.map((type) => table(index.extensions, lang, type)).join("\n\n");

const readmePath = (lang) => path.join(root, LANGS[lang].file);

// Splice a freshly built block between the intro/outro anchors; returns the new
// file text, or null when either anchor is missing.
const spliceBlock = (text, lang, index) => {
  const cfg = LANGS[lang];
  const introIdx = text.indexOf(cfg.intro);
  if (introIdx === -1) return null;
  const introEnd = introIdx + cfg.intro.length;
  const outroIdx = text.indexOf(cfg.outro, introEnd);
  if (outroIdx === -1) return null;
  const before = text.slice(0, introEnd);
  const after = text.slice(outroIdx);
  return `${before}\n\n${buildBlock(lang, index)}\n\n${after}`;
};

const run = ({ check } = {}) => {
  const index = loadIndex();
  let stale = false;
  for (const lang of Object.keys(LANGS)) {
    const file = readmePath(lang);
    const text = fs.readFileSync(file, "utf8");
    const next = spliceBlock(text, lang, index);
    if (next === null) {
      console.error(`! ${LANGS[lang].file}: catalogue anchors not found`);
      stale = true;
      continue;
    }
    if (next === text) {
      if (check) console.log(`✓ ${LANGS[lang].file}: catalogue up to date`);
      continue;
    }
    if (check) {
      console.error(`✗ ${LANGS[lang].file}: catalogue is stale — run "npm run docs:catalogue"`);
      stale = true;
    } else {
      fs.writeFileSync(file, next);
      console.log(`✓ ${LANGS[lang].file}: catalogue regenerated`);
    }
  }
  if (stale) process.exitCode = 1;
};

module.exports = { LANGS, TYPES, loadIndex, buildBlock, readmePath };

if (require.main === module) run({ check: process.argv.includes("--check") });
