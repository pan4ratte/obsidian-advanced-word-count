import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The README catalogue tables are generated from extensions/index.json by
// scripts/gen-catalogue.js. This guard fails if either README has drifted from the
// catalogue, so the docs can't go stale — run `npm run docs:catalogue` to fix.
describe("README catalogue", () => {
  it("is in sync with extensions/index.json", () => {
    const root = join(fileURLToPath(import.meta.url), "..", "..");
    const check = () => execFileSync("node", ["scripts/gen-catalogue.js", "--check"], { cwd: root });
    expect(check).not.toThrow();
  });
});
