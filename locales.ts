import { moment } from "obsidian";
import en from "./locales/en";
import ru from "./locales/ru";
import type { Locale } from "./locales/en";

// ── Locale registry ───────────────────────────────────────────────────────────
//
// To add a new language:
//   1. Create locales/xx.ts (copy en.ts, translate the values, keep the keys)
//   2. Import it below and add it to the LOCALES map using its BCP-47 language tag
//
// Example:
//   import de from "./locales/de";
//   "de": de,

const LOCALES: Record<string, Locale> = {
  en,
  ru,
  // de,
  // fr,
  // zh,
  // ja,
};

// BCP-47 tags of every shipped locale (e.g. ["en", "ru"]). Used to scaffold the
// i18n block when exporting a preset for the catalogue.
export const SUPPORTED_LOCALES: string[] = Object.keys(LOCALES);

// ── Resolution ────────────────────────────────────────────────────────────────
//
// Obsidian exposes the user's chosen language via moment.locale().
// We try the full tag first (e.g. "zh-tw"), then the base language ("zh"),
// and fall back to English if neither is registered.

function resolveLocale(): Locale {
  const tag = moment.locale(); // e.g. "en", "de", "zh-tw"
  return LOCALES[tag] ?? LOCALES[tag.split("-")[0]] ?? en;
}

export let t: Locale = resolveLocale();

// Re-resolve if Obsidian changes the locale at runtime (rare but possible)
export function refreshLocale(): void {
  t = resolveLocale();
}

/**
 * Locale tags to try when resolving a translation, most specific first — e.g.
 * ["zh-tw", "zh"] or ["ru"]. Used to localize community extensions, which carry
 * their own per-locale `i18n` overrides (see extensions.ts).
 */
export function localeTags(): string[] {
  const tag = moment.locale();
  const base = tag.split("-")[0];
  return tag === base ? [tag] : [tag, base];
}
