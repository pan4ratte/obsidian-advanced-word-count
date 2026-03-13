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
