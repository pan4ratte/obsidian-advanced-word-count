# Contributing a community extension

Thanks for helping grow **Advanced Word Count**! This folder is the catalogue of
**community extensions** — small add-ons that each contribute one new **metric** or
one new **advanced (word-count) setting** to the plugin's presets. This guide walks
you through building one and opening a pull request.

Extensions are **pure declarative JSON** — they contain *no executable code*. A
metric is a regular expression plus a count mode; a setting is a regular-expression
find/replace applied while a note is preprocessed. That keeps every extension safe
to download, review and store (no remote-code execution), in line with Obsidian's
plugin guidelines. The plugin downloads `index.json` from this folder, then fetches
and validates each extension file on demand.

> **No code, no build step.** You only add/edit JSON files. The only tooling you
> need is Node.js to run the validation tests.

## What you can build

- **A metric** (`type: "metric"`) — a counted number shown in the status bar / right
  pane (e.g. sentences, headings, distinct citekeys, a ratio of two other metrics).
- **A setting** (`type: "setting"`) — an advanced toggle that transforms the text
  before word/character counting (e.g. "ignore highlights", "ignore math").
- **A preset** (`type: "preset"`) — a ready-made preset bundling toggle states,
  advanced settings, warning/goal rules and the metric/setting extensions it uses.
  Installing it adds the preset and downloads those extensions automatically. The
  easiest way to make one is the **Share** button on a preset (see
  [Preset extensions](#preset-extensions-type-preset)).

If the plugin's existing count [modes](#metric-extensions-type-metric) can express
what you want, you can almost certainly ship it as an extension without touching the
plugin's code.

## Quick start

1. **Fork & clone** [`pan4ratte/obsidian-advanced-word-count`](https://github.com/pan4ratte/obsidian-advanced-word-count),
   then create a branch:
   ```bash
   git clone https://github.com/<you>/obsidian-advanced-word-count
   cd obsidian-advanced-word-count
   git checkout -b add-<your-extension-id>
   ```
2. **Add your extension file** in the subfolder for its type — `extensions/metrics/`,
   `extensions/settings/` or `extensions/presets/` — as `<your-id>.json` (see
   [Anatomy of an extension](#anatomy-of-an-extension)). Include a `title` and an
   `updated` date.
3. **Register it** in [`extensions/index.json`](index.json) — add an entry with the
   same `id`, `name`, `author`, `type` and `updated`, and a `path` pointing at your
   file (e.g. `"metrics/<your-id>.json"`). Mirror `dependencies` / translated `i18n`
   if you use them.
4. **Validate locally:**
   ```bash
   npm install
   npm test
   ```
   See [Testing your extension](#testing-your-extension) for what this checks.
5. *(Optional)* **Try it live in Obsidian** — see [Testing your extension](#testing-your-extension).
6. **Open a pull request** against `main` and complete the
   [PR checklist](#pull-request-checklist).

## Anatomy of an extension

### Common fields (every extension)

| Field            | Required | Notes                                               |
| ---------------- | -------- | --------------------------------------------------- |
| `id`             | yes      | Unique, `^[a-z0-9][a-z0-9-]*$` (kebab-case)          |
| `name`           | yes      | Display name shown in the browse modal              |
| `description`    | yes      | One-line summary                                    |
| `author`         | yes      | Your name or handle                                 |
| `type`           | yes      | `"metric"`, `"setting"` or `"preset"`               |
| `label`          | metric/setting | Name shown in the right-pane metric block and the connect dropdown (not used by presets) |
| `title`          | metric/setting | Short title shown in the preset's connect toggle (not used by presets) |
| `updated`        | no       | ISO date (`YYYY-MM-DD`); a date newer than the installed copy surfaces an "Update" |
| `hint`           | no       | Tooltip (use `\n` for a second line)                |
| `defaultEnabled` | no       | Whether new presets enable it by default (`false`)  |
| `i18n`           | no       | Per-locale translations of the display fields (see [Localization](#localization-i18n)) |
| `dependencies`   | no       | Array of other extension `id`s this one needs installed (see [Dependencies](#dependencies)) |
| `minPluginVersion` | no     | Reserved for future compatibility gating            |

### Folder layout

Extension files are grouped by type so the catalogue stays easy to navigate:

```
extensions/
  index.json        ← the single catalogue (one entry per extension)
  metrics/          ← type: "metric"  files
  settings/         ← type: "setting" files
  presets/          ← type: "preset"  files
```

There is **one** `index.json` for the whole catalogue — it's the single source of
truth the installer uses to resolve dependencies across types (a preset, for
instance, can depend on both a metric and a setting). Each entry's `path` points
into the matching subfolder.

### The catalogue entry (`index.json`)

Every extension also gets a row in [`index.json`](index.json). It carries the fields
the browse modal needs *before* downloading the file:

```json
{
  "extensions": [
    {
      "id": "sentence-count",
      "name": "Sentence count",
      "description": "Counts sentences …",
      "author": "you",
      "type": "metric",
      "path": "metrics/sentence-count.json"
    }
  ]
}
```

`path` is the file's location relative to `index.json` (e.g.
`"metrics/<id>.json"`); it defaults to `<id>.json` at the catalogue root, so with
the type subfolders you should always set it explicitly. If your extension declares
`dependencies` or `i18n` (`name`/`description`), mirror those in the entry too.

### Metric extensions (`type: "metric"`)

Adds a counted metric. Extra fields:

| Field         | Required | Notes                                              |
| ------------- | -------- | -------------------------------------------------- |
| `statusLabel` | no       | Status-bar label prefix (defaults to `label`)      |
| `unit`        | no       | Small unit after the value (e.g. `"MIN."`)         |
| `count`       | yes      | How the number is derived (below)                  |

`count` always has:

| Field    | Required | Notes                                                                        |
| -------- | -------- | ---------------------------------------------------------------------------- |
| `mode`   | no       | How the number is derived (see below). Default `"matches"`.                   |
| `source` | no       | `"raw"` (default) = the original note text; `"preprocessed"` = after the built-in/advanced stripping that feeds word/char counts |
| `strip`  | no       | Array of `{ pattern, flags? }` regions deleted from the text **before** counting (any mode). Mirrors the citekey counter cleaning links first |

Each `mode` maps to an operation the plugin's own counters use:

| `mode`          | Counts…                                            | Extra fields                                   |
| --------------- | -------------------------------------------------- | ---------------------------------------------- |
| `matches`       | number of matches (default)                        | `pattern`, `flags?`, `exclude?`, `excludeFlags?` |
| `captureSum`    | sum of capture group 1 as a number                 | `pattern`, `flags?`, `exclude?`, `excludeFlags?` |
| `captureUnique` | number of **distinct** captured values (group 1, or the whole match) | `pattern`, `flags?`, `exclude?`, `excludeFlags?` |
| `matchedLength` | total character length of all matches              | `pattern`, `flags?`, `exclude?`, `excludeFlags?` |
| `split`         | number of non-empty segments after splitting       | `separator`, `separatorFlags?`                 |
| `intersect`     | keys (group 1) present in **both** patterns, plus any `extra` plain matches | `primary`, `secondary`, `extra?` (each `{ pattern, flags? }`) |
| `ratio`         | `numerator ÷ denominator`, derived from **other metrics** | `numerator`, `denominator`, `decimals?` |

- `pattern` is compiled with the global flag forced on.
- `flags` is the subset `g i m s u`.
- `exclude` drops any match whose matched text also matches that regex (e.g. `"^!"` to skip image links, `"^#\\d+$"` to skip numeric-only tags).

Example — `sentence-count.json` (a `split` on sentence terminators):

```json
{
  "id": "sentence-count",
  "name": "Sentence count",
  "type": "metric",
  "label": "Sentences",
  "count": { "mode": "split", "source": "preprocessed", "separator": "[.!?]+(?=\\s|$)" }
}
```

Example — `reference-links.json` (an `intersect` counting resolved reference-style links):

```json
{
  "id": "reference-links",
  "name": "Resolved reference links",
  "type": "metric",
  "label": "Reference links",
  "count": {
    "mode": "intersect",
    "primary":   { "pattern": "(?<!!)\\[[^\\]]*\\]\\[([^\\]]+)\\]", "flags": "g" },
    "secondary": { "pattern": "^[ \\t]*\\[(?!\\^)([^\\]]+)\\]:", "flags": "gm" }
  }
}
```

`intersect` collects capture group 1 of `primary` (the `[text][id]` usages) and of
`secondary` (the `[id]: url` definitions) into two sets and counts the keys in both,
so a reference link with no matching definition doesn't count. An optional `extra`
field adds plain matches on top (for self-contained constructs — e.g. inline
footnotes when modelling footnotes this way).

Example — `avg-word-length.json` (a `ratio` of two built-in metrics):

```json
{
  "id": "avg-word-length",
  "name": "Average word length",
  "type": "metric",
  "label": "Avg word length",
  "count": {
    "mode": "ratio",
    "numerator": "charsWithoutSpaces",
    "denominator": "wordsWithSpaces",
    "decimals": 1
  }
}
```

A `ratio` operand is either a **constant number** or the **id of another metric**:
a built-in id (`wordsWithSpaces`, `charsWithSpaces`, `charsWithoutSpaces`, `pages`,
`readingTime`, `lines`, `paragraphs`, `markdownLinks`, `wikiLinks`, `citekeys`,
`embeds`, `footnotes`) or another **non-ratio** extension metric id. An operand
whose metric isn't available resolves to `0`, and a zero denominator makes the
result `0`. `decimals` (0–6, default 1) controls rounding.

> Note: if an operand names an *extension* metric (e.g. `sentence-count`), that
> extension only needs to be **installed** — it does **not** have to be connected to
> the preset. The plugin computes the operand's value behind the scenes, so the
> ratio works without the dependency cluttering the preset's metric list. List it in
> [`dependencies`](#dependencies) so it's installed automatically. Built-in operands
> are always available. A `ratio` can't reference another `ratio`.

### Setting extensions (`type: "setting"`)

Adds an advanced word-count toggle that transforms the text before counting (just
like the built-in "Ignore code", "Ignore comments", … options). Extra field:

`transform`:

| Field         | Required | Notes                                                        |
| ------------- | -------- | ------------------------------------------------------------ |
| `pattern`     | yes      | Regex source                                                 |
| `flags`       | no       | Subset of `g i m s u` (add `g` to replace every occurrence)  |
| `replacement` | yes      | Replacement string (`$1`, `$2`, … supported)                 |
| `stage`       | no       | `"pre"` (default) runs before the built-in stripping; `"post"` runs after |

Setting transforms affect the word and character counts only (the structural
metrics — lines, links, tables, … — always read the original note text), matching
how the built-in advanced options behave.

Example — `ignore-highlights.json`:

```json
{
  "id": "ignore-highlights",
  "name": "Ignore highlights",
  "description": "Excludes ==highlighted== spans from counts.",
  "author": "pan4ratte",
  "updated": "2026-06-20",
  "type": "setting",
  "label": "Ignore highlights",
  "title": "Ignore highlights",
  "transform": { "pattern": "==[^=]+==", "flags": "g", "replacement": "" }
}
```

### Preset extensions (`type: "preset"`)

A preset extension bundles a whole preset — its toggle states, advanced settings,
warning/goal rules, the right-pane metric order, and the per-preset extension
enable-flags — together with the ids of the metric/setting extensions it uses.
Installing one **adds the preset** to
the user's preset list and **downloads every extension it depends on** (and their
transitive dependencies) automatically. Unlike metric/setting extensions, a preset
is not a live "registry" item and is not connected to other presets, so it doesn't
need `label`/`title`.

Extra field:

| Field    | Required | Notes                                                              |
| -------- | -------- | ------------------------------------------------------------------ |
| `preset` | yes      | The preset configuration object (toggles, advanced settings, `rules`, `metricOrder`, `extMetrics`/`extSettings`, `wordsPerPage`, …). Any `id` inside is ignored — a fresh one is generated on install; a missing `name` falls back to the extension's `name`. |

List the extensions the preset relies on in [`dependencies`](#dependencies) so they
download with it.

**The easy way: the Share button.** You don't have to write a preset file by hand.
Configure a preset in the plugin's settings, then click the **Share** (↗) button in
its header — the plugin exports a ready-to-edit `type: "preset"` file with
`dependencies` already filled in from the extensions you connected. Add your
`author` and `description`, then submit it (the file is intentionally left invalid
until those two fields are filled).

```json
{
  "id": "academic-paper",
  "name": "Academic paper",
  "description": "Citations, sentences and a 8-page goal for journal submissions.",
  "author": "you",
  "updated": "2026-06-21",
  "type": "preset",
  "dependencies": ["distinct-citekeys", "sentence-count"],
  "i18n": {
    "ru": {
      "//": "Translate name/description into this locale, or copy the original-language values if no separate translation is needed; remove this \"//\" line before submitting.",
      "name": "Academic paper",
      "description": ""
    }
  },
  "preset": {
    "name": "Academic paper",
    "showCitekeys": true,
    "wordsPerPage": 300,
    "extMetrics": { "distinct-citekeys": true, "sentence-count": true },
    "rules": [{ "metric": "pages", "threshold": 8, "kind": "goal" }]
  }
}
```

**Localizing the name/description.** Like metric and setting extensions, a preset's
catalogue name and description can be translated per locale (see
[Localization](#localization-i18n)). The export already scaffolds an `i18n` block —
one entry per shipped locale, with `name` pre-filled and a `"//"` note. For each
locale, either translate `name`/`description` or copy the original-language text,
then delete the `"//"` line. JSON has no comments, so that `"//"` key is just a
convention the plugin ignores at runtime; leaving it in is harmless, but tidy it up
before submitting. **Important:** the browse modal localizes from the `index.json`
**entry**, so mirror the finished `i18n` (just `name`/`description`) into the
catalogue entry too — the `i18n` inside the preset file alone won't change what the
store displays.

### Dependencies

If your extension needs another extension installed to work — most commonly a
`ratio` metric whose operand reads another extension's metric value — list those
ids in `dependencies`:

```json
{
  "id": "citations-per-1000-words",
  "type": "metric",
  "dependencies": ["distinct-citekeys"],
  "count": { "mode": "ratio", "numerator": "distinct-citekeys", "denominator": "wordsWithSpaces", "decimals": 2 }
}
```

When a user installs an extension, the plugin resolves the whole dependency tree
from the catalogue and installs every required extension first (dependencies before
dependents), skipping any already installed. Conversely, removing an extension that
others depend on prompts a confirmation listing those dependents.

Rules:

- Each id must be a valid `^[a-z0-9][a-z0-9-]*$` id; an extension can't depend on
  itself, and cycles are rejected.
- Only declare *extension* ids. Built-in metric ids (`wordsWithSpaces`, `pages`,
  `footnotes`, …) are always available — use them directly as ratio operands;
  listing one in `dependencies` is **rejected at validation** (there's nothing to
  install).
- Mirror the same `dependencies` array in the matching `index.json` entry so the
  installer can resolve the tree from the catalogue without downloading every
  file first.
- A dependency id that isn't present in `index.json` makes the install fail with a
  "missing required dependencies" error.

### Localization (`i18n`)

The display fields (`name`, `description`, `title`, `label`, `hint`, `statusLabel`,
`unit`) can be translated per locale. `i18n` maps a BCP-47 tag (e.g. `"ru"`,
`"zh-tw"`) to an object with any of those fields; the plugin picks the value for the
user's Obsidian language — trying the full tag, then its base language — and falls
back to the base (English) value when there's no translation. The logic fields
(`id`, `count`, `transform`, …) are never localized.

```json
{
  "id": "tables",
  "name": "Table count",
  "title": "Tables",
  "label": "Tables",
  "statusLabel": "Tables",
  "count": { "mode": "matches", "source": "raw", "pattern": "…", "flags": "gm" },
  "i18n": {
    "ru": { "name": "Подсчёт таблиц", "title": "Таблицы", "label": "Таблицы", "statusLabel": "Таблиц" }
  }
}
```

Add the same `i18n` (just `name`/`description`) to the matching `index.json` entry
so the browse modal localizes too.

### Regex safety

Both `pattern` fields are compiled with `new RegExp`. Allowed flags are limited to
`g i m s u`; anything else (or a pattern that doesn't parse) is rejected at
validation time. Avoid patterns that can match the empty string or that are prone to
catastrophic backtracking — they run against whole notes on every keystroke.

## Testing your extension

**Validate (required).** `npm test` runs the catalogue test suite, which is the same
validation gate the PR must pass. It checks that:

- every file in the type subfolders validates (well-formed JSON + a sound
  `count`/`transform` + safe regexes),
- each `index.json` entry has a matching file (at its `path`) with the same `id`
  and `type`,
- every file is listed in `index.json`, and
- every declared `dependency` resolves within the catalogue, with no cycles.

To iterate on just the catalogue checks:

```bash
npx vitest run tests/catalogue.test.ts
```

**Try it live (optional).** There's no settings UI for the catalogue source, but you
can point the plugin at your fork by editing the vault's
`.obsidian/plugins/obsidian-advanced-word-count/data.json` and setting:

```json
"extensionRepoUrl": "https://raw.githubusercontent.com/<you>/obsidian-advanced-word-count/<branch>/extensions/"
```

(The URL must end with `/`.) Reload the plugin, open **Browse extensions**, and your
extension will appear in the catalogue so you can install and test it against real
notes. Reset `extensionRepoUrl` (or remove the key) when you're done.

## Pull request checklist

- [ ] File named `<id>.json`, in the subfolder for its type (`metrics/`,
      `settings/` or `presets/`), with a unique kebab-case `id` (`^[a-z0-9][a-z0-9-]*$`).
- [ ] `name`, `description`, `author`, `type` are set (plus `label`/`title` for
      metric/setting extensions).
- [ ] `updated` is today's date (`YYYY-MM-DD`).
- [ ] A matching entry is added to `index.json` (same `id`, `type`; a `path` into
      the subfolder; `dependencies` and translated `i18n` mirrored if used).
- [ ] Any `dependencies` reference existing **extensions** (not built-ins, no
      self-reference, no cycles).
- [ ] Regex patterns use only `g i m s u` flags and don't backtrack catastrophically.
- [ ] `npm test` passes.
- [ ] If you're **updating** an existing extension, you bumped its `updated` date in
      both the file and the `index.json` entry so installs detect the update.

## Tips & guidelines

- **One job per extension.** Keep each extension focused on a single metric or
  setting; ship related ideas as separate extensions rather than one configurable
  blob.
- **Reuse existing modes.** Prefer the declarative `count`/`transform` modes above.
  If your idea genuinely can't be expressed with them, open an issue — new *modes*
  live in the plugin's engine, not in extensions.
- **Mind performance.** Patterns run on every edit against the whole note; favour
  anchored, linear-time regexes.
- **Localize if you can.** Adding an `i18n` block (at least `name`/`description`)
  helps non-English users discover your extension.
- **Licensing.** By submitting a pull request you agree to contribute your extension
  under the repository's license.
