/*
 * Regenerates the catalogue from the extension files, in two steps:
 *
 *   extensions/{metrics,settings,presets}/*.json   ← the single source of truth
 *     → extensions/index.json                       (one entry per file)
 *       → the "official catalogue" tables in README.md / README_RU.md
 *
 * So editing an extension's storeName/description/updated/dependencies/i18n — or
 * adding, moving or deleting a file — is enough: its index entry and the README
 * tables follow. Index entries are derived, never hand-written; anything in an
 * entry that isn't derivable from the extension file is dropped.
 *
 * Existing entries keep their position in the array (the catalogue's display
 * order); entries for new files are appended, and entries whose file is gone are
 * removed.
 *
 * The generated tables sit between two fixed prose lines in each README — an intro
 * ("The official catalogue currently includes:") and an outro ("Want to build your
 * own?"). Everything between those anchors is replaced; the surrounding prose is
 * left alone. (Prose anchors are used instead of HTML comment markers because
 * Obsidian's plugin linter flags `<!-- -->` in a README as leftover template text.)
 *
 * Run:    npm run docs:catalogue                  (rewrite index.json + the READMEs)
 * Check:  node scripts/gen-catalogue.js --check    (exit 1 if either is stale)
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const extDir = path.join(root, "extensions");
const indexPath = path.join(extDir, "index.json");

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

const loadIndex = () => JSON.parse(fs.readFileSync(indexPath, "utf8"));

// ── index.json, derived from the extension files ──────────────────────────────

// Every extension file as a forward-slash path relative to extensions/ (e.g.
// "metrics/headings.json"), recursing the type subfolders. Sorted so a rebuild is
// deterministic whatever order the filesystem hands them back in.
const listExtFiles = (rel = "") =>
  fs
    .readdirSync(path.join(extDir, rel))
    .flatMap((name) => {
      const childRel = rel ? `${rel}/${name}` : name;
      if (fs.statSync(path.join(extDir, childRel)).isDirectory()) return listExtFiles(childRel);
      return childRel.endsWith(".json") && childRel !== "index.json" ? [childRel] : [];
    })
    .sort();

// The browse modal only needs the name/description translated before it downloads
// a file, so an entry's i18n carries just those two fields (locales that translate
// neither are dropped).
const indexI18n = (i18n) => {
  if (!i18n || typeof i18n !== "object") return undefined;
  const out = {};
  for (const tag of Object.keys(i18n)) {
    const src = i18n[tag] || {};
    const loc = {};
    for (const f of ["storeName", "description"]) if (src[f]) loc[f] = src[f];
    if (Object.keys(loc).length > 0) out[tag] = loc;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

// The catalogue row for one extension file. Key order matches the hand-written
// entries so regenerating an unchanged catalogue is a no-op diff.
const entryFrom = (ext, relPath) => {
  const entry = { id: ext.id, storeName: ext.storeName, description: ext.description, author: ext.author };
  if (ext.updated) entry.updated = ext.updated;
  const i18n = indexI18n(ext.i18n);
  if (i18n) entry.i18n = i18n;
  entry.type = ext.type;
  if (Array.isArray(ext.dependencies) && ext.dependencies.length > 0) entry.dependencies = ext.dependencies.slice();
  entry.path = relPath;
  return entry;
};

/**
 * Rebuild the catalogue from the extension files, keeping the order of `current`
 * (entries whose file still exists stay put), appending entries for new files and
 * dropping entries whose file is gone. Returns the new index plus what changed.
 */
const buildIndex = (current = loadIndex()) => {
  const byId = new Map();
  for (const rel of listExtFiles()) {
    let ext;
    try {
      ext = JSON.parse(fs.readFileSync(path.join(extDir, rel), "utf8"));
    } catch (e) {
      throw new Error(`${rel}: invalid JSON — ${e.message}`);
    }
    for (const k of ["id", "storeName", "description", "author", "type"]) {
      if (typeof ext[k] !== "string" || ext[k].length === 0) throw new Error(`${rel}: missing or invalid "${k}"`);
    }
    const clash = byId.get(ext.id);
    if (clash) throw new Error(`duplicate id "${ext.id}" (${clash.path} and ${rel})`);
    byId.set(ext.id, entryFrom(ext, rel));
  }

  const currentEntries = (current && current.extensions) || [];
  const extensions = [];
  const kept = new Set();
  for (const e of currentEntries) {
    if (byId.has(e.id) && !kept.has(e.id)) {
      extensions.push(byId.get(e.id));
      kept.add(e.id);
    }
  }
  const added = [];
  for (const [id, entry] of byId) {
    if (kept.has(id)) continue;
    extensions.push(entry);
    added.push(id);
  }
  const removed = currentEntries.filter((e) => !byId.has(e.id)).map((e) => e.id);
  return { index: { extensions }, added, removed };
};

const serializeIndex = (index) => `${JSON.stringify(index, null, 2)}\n`;

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

// Rebuild index.json from the extension files. Returns the index the READMEs are
// then generated from (the fresh one, even in --check mode, so a check reports the
// truth about both files).
const syncIndex = ({ check } = {}) => {
  const { index, added, removed } = buildIndex();
  const next = serializeIndex(index);
  if (fs.readFileSync(indexPath, "utf8") === next) {
    if (check) console.log("✓ extensions/index.json: entries up to date");
    return { index, stale: false };
  }
  if (check) {
    console.error(`✗ extensions/index.json: entries are stale — run "npm run docs:catalogue"`);
    return { index, stale: true };
  }
  fs.writeFileSync(indexPath, next);
  const note = [
    added.length > 0 ? `+${added.join(", +")}` : null,
    removed.length > 0 ? `-${removed.join(", -")}` : null,
  ].filter(Boolean).join("; ");
  console.log(`✓ extensions/index.json: entries regenerated${note ? ` (${note})` : ""}`);
  return { index, stale: false };
};

const run = ({ check } = {}) => {
  const synced = syncIndex({ check });
  const index = synced.index;
  let stale = synced.stale;
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

module.exports = { LANGS, TYPES, loadIndex, buildIndex, serializeIndex, buildBlock, readmePath };

if (require.main === module) run({ check: process.argv.includes("--check") });
