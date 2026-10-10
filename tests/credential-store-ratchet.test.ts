/**
 * Every connector credential is read and written through server/credential-store.ts, which decides whether it
 * lives in the database or in the external secret store. A new call to encryptCredentialMap / decryptCredentialMap
 * anywhere else would put a credential in the database whatever the store is set to, or fail on a reference: so
 * the places that call them are listed here and may not grow.
 *
 * Adding a legitimate one (for something that is not a connector credential) means adding it below, with the reason.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** file (relative, forward slashes) -> the most calls it may contain, and why. */
const ALLOWED: Record<string, { calls: number; why: string }> = {
  "server/credential-vault.ts": { calls: 2, why: "defines them (the database encryption itself)" },
  "server/credential-store.ts": { calls: 3, why: "the one place that chooses between the database and the store" },
  "server/credential-migration.ts": { calls: 2, why: "moves a credential between the two forms, so it handles both" },
  "server/mcp-auth-uniqueness.ts": { calls: 1, why: "reads MCP auth rows at boot to find identical duplicates; a reference is not touched" },
  "server/storage.ts": { calls: 1, why: "the MCP server auth read's fallback for the plaintext column's legacy vault blobs; references never reach it" },
};

describe("connector credentials go through the credential store", () => {
  const found: Record<string, number> = {};
  for (const dir of ["server", "shared", "scripts", "client"]) {
    let files: string[] = [];
    try { files = walk(path.join(ROOT, dir)); } catch { continue; }
    for (const f of files) {
      const n = [...readFileSync(f, "utf8").matchAll(/\b(?:en|de)cryptCredentialMap\s*\(/g)].length;
      if (n > 0) found[path.relative(ROOT, f).replace(/\\/g, "/")] = n;
    }
  }

  it("no file outside the list calls the database encryption directly", () => {
    const stray = Object.keys(found).filter((f) => !(f in ALLOWED));
    expect(stray, `these call encryptCredentialMap/decryptCredentialMap directly; use sealCredentialMap/openCredentialMap from server/credential-store.ts: ${stray.join(", ")}`).toEqual([]);
  });

  it("no listed file calls them more often than it does today", () => {
    for (const [file, { calls }] of Object.entries(ALLOWED)) expect(found[file] ?? 0, file).toBeLessThanOrEqual(calls);
  });

  it("the list has no entry for a file that no longer needs one", () => {
    for (const file of Object.keys(ALLOWED)) expect(found[file], `${file} is listed but no longer calls them: remove it`).toBeGreaterThan(0);
  });

  it("the routes and connectors that handle connector credentials use the store-aware functions", () => {
    const uses = (file: string, name: string) => readFileSync(path.join(ROOT, file), "utf8").includes(name);
    for (const file of ["server/real-mcp-base.ts", "server/routes/enterprise-integrations.ts", "server/integrations/oauth-app.ts", "server/connector-health-scan.ts", "server/routes/public-api.ts"]) {
      expect(uses(file, "openCredentialMap"), file).toBe(true);
    }
    // Writing goes through server/connection-credentials.ts, which seals under a lock; no route or connector seals on its own.
    expect(uses("server/connection-credentials.ts", "sealCredentialMap")).toBe(true);
    for (const file of ["server/routes/enterprise-integrations.ts", "server/real-mcp-base.ts", "server/integrations/salesforce/mcp-server.ts"]) {
      expect(uses(file, "sealCredentialMap"), `${file} seals a credential itself instead of through server/connection-credentials.ts`).toBe(false);
    }
    for (const name of ["saveConnectionCredentials", "patchConnectionCredentials", "saveOAuthApp", "saveRefreshedConnectionCredentials"]) expect(uses("server/routes/enterprise-integrations.ts", name), name).toBe(true);
    for (const file of ["server/real-mcp-base.ts", "server/integrations/salesforce/mcp-server.ts"]) expect(uses(file, "saveRefreshedConnectionCredentials"), file).toBe(true);
  });
});
