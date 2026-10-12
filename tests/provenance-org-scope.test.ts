/**
 * A run's provenance record (the prompt, the tools it called, the documents it retrieved, the policies in force) belongs to the
 * organization that ran it. The routes that read or export one used to look the trace up by id alone, so the admin of another
 * organization who held a trace id could read the whole record, and could export or verify a batch of them by listing ids.
 *
 * Found by the authorization sweep on 2026-10-11. Every lookup of a trace by id in a route must say whose it is.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROUTES = path.join(__dirname, "..", "server", "routes");
const sources = readdirSync(ROUTES)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: f, src: readFileSync(path.join(ROUTES, f), "utf8").replace(/\r\n/g, "\n") }));

const lookups = sources.flatMap(({ file, src }) =>
  [...src.matchAll(/storage\.getTrace\(([^;\n]*)\)/g)].map((m) => ({ file, args: m[1].trim(), at: src.slice(0, m.index).split("\n").length })),
);

describe("a trace is looked up inside the caller's organization", () => {
  it("finds the lookups it is meant to check", () => {
    expect(lookups.filter((l) => l.file === "agents.ts").length).toBeGreaterThanOrEqual(7);
  });

  for (const l of lookups) {
    it(`${l.file}:${l.at} getTrace(${l.args}) passes the organization`, () => {
      expect(l.args).toMatch(/,\s*getOrgId\(req\)$/);
    });
  }

  it("the single-record provenance reads and the two id-list routes are among them", () => {
    const agents = sources.find((s) => s.file === "agents.ts")!.src;
    for (const route of ["/api/provenance/:traceId\"", "/api/provenance/:traceId/reconstruct\"", "/api/provenance/:traceId/diff\"", "/api/provenance/:traceId/export\"", "/api/provenance/verify-integrity\"", "/api/provenance/batch-export\""]) {
      const at = agents.indexOf(route);
      expect(at, route).toBeGreaterThan(0);
      const handler = agents.slice(at, at + 400);
      expect(handler, route).toMatch(/storage\.getTrace\([^)]*getOrgId\(req\)\)/);
    }
  });
});
