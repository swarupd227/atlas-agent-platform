/**
 * The lockfile keeps the dependency versions that fixed the advisories found by `npm audit` on 2026-10-11 (the reachable ones: request
 * parsing and routing, uploads, the MCP client, XML and YAML parsing, the HTML sanitizer, the websocket and HTTP client libraries).
 *
 * A lockfile regenerated from an older one, or a dependency pinned back to get past a build problem, would otherwise bring the
 * vulnerable version back without anything failing. When a package's fix moves on, raise its floor here.
 *
 * (Not covered, and why: drizzle-orm's identifier-escaping advisory needs sql.identifier/sql.raw, which the code does not use; nodemailer,
 * pptxgenjs and mammoth's fixes are major upgrades still to be made.)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const lock = JSON.parse(readFileSync(path.join(__dirname, "..", "package-lock.json"), "utf8")) as { packages: Record<string, { version?: string }> };

/** package -> for each major version line present in the tree, the lowest version that carries the fix. */
const FLOORS: Record<string, Record<number, string>> = {
  "proxy-addr": { 2: "2.0.8" },
  "qs": { 6: "6.16.0" },
  "body-parser": { 2: "2.3.0" },
  "path-to-regexp": { 8: "8.4.2" },
  "multer": { 2: "2.4.0" },
  "@modelcontextprotocol/sdk": { 1: "1.32.1" },
  "@hono/node-server": { 1: "1.19.12", 2: "2.1.4" },
  "hono": { 4: "4.13.13" },
  "ws": { 8: "8.22.0" },
  "undici": { 7: "7.30.0" },
  "@xmldom/xmldom": { 0: "0.8.15" },
  "fast-uri": { 3: "3.1.8" },
  "ip-address": { 10: "10.7.3" },
  "js-yaml": { 4: "4.3.2", 5: "5.4.3" },
  "yaml": { 2: "2.9.1" },
  "lodash": { 4: "4.18.1" },
  "dompurify": { 3: "3.4.15" },
  "minimatch": { 3: "3.1.5", 9: "9.0.9", 10: "10.2.6" },
  "brace-expansion": { 1: "1.1.21", 2: "2.1.7", 5: "5.0.12" },
  "picomatch": { 2: "2.3.2", 4: "4.0.7" },
  "nanoid": { 3: "3.3.20" },
  "postcss": { 8: "8.5.29" },
  "rollup": { 4: "4.64.5" },
  "tedious": { 20: "20.3.3" },
};

const parts = (v: string) => v.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
const atLeast = (have: string, floor: string) => {
  const a = parts(have), b = parts(floor);
  for (let i = 0; i < 3; i++) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0); }
  return true;
};

const installed = (name: string) =>
  Object.entries(lock.packages)
    .filter(([key, v]) => (key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`)) && v.version)
    .map(([key, v]) => ({ key, version: v.version! }));

describe("dependency versions that fixed advisories", () => {
  for (const [name, byMajor] of Object.entries(FLOORS)) {
    it(`${name} is at or above its fixed version in every place it is installed`, () => {
      const found = installed(name);
      expect(found.length, `${name} is no longer in the lockfile: drop its floor`).toBeGreaterThan(0);
      for (const { key, version } of found) {
        const major = parseInt(version.split(".")[0], 10);
        const floor = byMajor[major];
        expect(floor, `${key} is at ${version}, a major version this list does not know: add its floor`).toBeTruthy();
        expect(atLeast(version, floor), `${key} is ${version}, below ${floor}`).toBe(true);
      }
    });
  }

  it("the comparison itself orders versions numerically, not as text", () => {
    expect(atLeast("2.0.10", "2.0.8")).toBe(true);
    expect(atLeast("2.0.7", "2.0.8")).toBe(false);
    expect(atLeast("10.7.3", "10.7.3")).toBe(true);
    expect(atLeast("4.9.0", "4.13.13")).toBe(false);
    expect(atLeast("1.1.21", "1.1.21")).toBe(true);
  });
});
