import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    // Lint the TypeScript source only. Build/config (*.mjs) and data (*.json)
    // files aren't plugin code, and the preset's type-aware rules can't run on
    // them (no TS parser services).
    ignores: ["node_modules/**", "main.js", "**/*.mjs", "**/*.json"],
  },
  // Full Obsidian plugin guideline preset (includes the type-checked
  // @typescript-eslint ruleset and the obsidianmd/* rules).
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // Project-specific overrides.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "warn",
    },
  },
]);
