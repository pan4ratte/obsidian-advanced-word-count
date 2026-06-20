# Advanced Word Count — community extensions

This folder is the catalogue of **community extensions** for the Advanced Word
Count plugin. An extension adds either a new **metric** or a new **advanced
(word-count) setting** to the plugin's presets.

Extensions are **pure declarative JSON** — they contain *no executable code*. A
metric is a regular expression plus a count mode; a setting is a regular
expression find/replace applied while the note is preprocessed. This keeps them
safe to download, review and store (no remote-code execution), in line with
Obsidian's plugin guidelines.

The plugin downloads `index.json` from this folder, then fetches and validates the
individual extension files on demand.

## Catalogue: `index.json`

```json
{
  "extensions": [
    {
      "id": "sentence-count",
      "name": "Sentence count",
      "description": "Counts sentences …",
      "author": "you",
      "type": "metric",
      "path": "sentence-count.json"
    }
  ]
}
```

`path` is optional and defaults to `<id>.json`.

## Common fields (every extension)

| Field            | Required | Notes                                               |
| ---------------- | -------- | --------------------------------------------------- |
| `id`             | yes      | Unique, `^[a-z0-9][a-z0-9-]*$` (kebab-case)          |
| `name`           | yes      | Display name shown in the browse modal              |
| `description`    | yes      | One-line summary                                    |
| `author`         | yes      |                                                     |
| `type`           | yes      | `"metric"` or `"setting"`                           |
| `label`          | yes      | Name shown in the right-pane metric block and the connect dropdown |
| `title`          | yes      | Short title shown in the preset's connect toggle    |
| `updated`        | no       | ISO date (`YYYY-MM-DD`); a date newer than the installed copy surfaces an "Update" |
| `hint`           | no       | Tooltip (use `\n` for a second line)                |
| `defaultEnabled` | no       | Whether new presets enable it by default (`false`)  |
| `i18n`           | no       | Per-locale translations of the display fields (see below) |
| `minPluginVersion` | no     | Reserved for future compatibility gating            |

### Localization (`i18n`)

The display fields (`name`, `description`, `title`, `label`, `hint`, `statusLabel`,
`unit`) can be translated per locale. `i18n` maps a BCP-47 tag (e.g. `"ru"`,
`"zh-tw"`) to an object with any of those fields; the plugin picks the value for
the user's Obsidian language — trying the full tag, then its base language — and
falls back to the base (English) value when there's no translation. The logic
fields (`id`, `count`, `transform`, …) are never localized.

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
validation time. Avoid patterns that can match the empty string or that are prone
to catastrophic backtracking — they run against whole notes on every edit.

## Metric extensions (`type: "metric"`)

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

Example — `footnote-count.json` (an `intersect` recreating the built-in footnote logic):

```json
{
  "id": "footnote-count",
  "name": "Footnote count",
  "type": "metric",
  "label": "Footnotes",
  "count": {
    "mode": "intersect",
    "primary":   { "pattern": "\\[\\^([^\\]\\s]+)\\](?!:)", "flags": "g" },
    "secondary": { "pattern": "^[ \\t]*\\[\\^([^\\]\\s]+)\\]:", "flags": "gm" },
    "extra":     { "pattern": "\\^\\[[^\\]]+\\]", "flags": "g" }
  }
}
```

`intersect` collects capture group 1 of `primary` and of `secondary` into two sets
and counts the keys in both (so an orphan reference or definition doesn't count);
`extra` plain matches are added on (here, self-contained inline footnotes).

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
`embeds`, `tables`, `tags`, `footnotes`) or another **non-ratio** extension metric
id. A metric that is missing or disabled resolves to `0`, and a zero denominator
makes the result `0`. `decimals` (0–6, default 1) controls rounding.

> Note: if an operand names an *extension* metric (e.g. `sentence-count`), that
> extension must also be installed and enabled, or the operand reads as 0. Built-in
> operands are always available even if the metric isn't shown. A `ratio` can't
> reference another `ratio`.

## Setting extensions (`type: "setting"`)

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

## Contributing

1. Add `<your-id>.json` to this folder (include a `title` and an `updated` date).
2. Add an entry to `index.json` (same `id`, `name`, `author`, `type`, `updated`).
3. When you change an extension, bump its `updated` date (in both the file and the
   index entry) so installs detect the update.
