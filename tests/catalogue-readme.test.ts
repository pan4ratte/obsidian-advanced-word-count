import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// extensions/index.json is generated from the extension files, and the README
// catalogue tables from the index, by scripts/gen-catalogue.js. This guard fails if
// the index or either README has drifted from the extension files, so the catalogue
// and the docs can't go stale — run `npm run docs:catalogue` to fix.
describe("generated catalogue", () => {
  it("index.json and the README tables are in sync with the extension files", () => {
    const root = join(fileURLToPath(import.meta.url), "..", "..");
    const check = () => execFileSync("node", ["scripts/gen-catalogue.js", "--check"], { cwd: root });
    expect(check).not.toThrow();
  });
});
