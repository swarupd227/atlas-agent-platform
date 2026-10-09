/**
 * The agents list is 5.17MB, and most callers do not need it.
 *
 * Measured against the live platform on 2026-10-09: GET /api/agents returns
 * 1,160 agents with 55 fields each -- 5.17MB in 4,302ms -- while
 * ?summary=1 returns the same agents with 15 fields in 0.80MB and 494ms.
 * Three fields carry 78% of the weight (runtimeConfig 43.7%, systemPrompt
 * 25.4%, blueprintJson 9.2%) and no list view shows any of them.
 *
 * The summary route already existed. The defect was adoption: five call
 * sites used it and roughly forty did not, including the sidebar -- which
 * mounts on every page and refetches every 30 seconds, so a single open tab
 * pulled about 10MB a minute to compute one integer.
 *
 * These are source assertions because the cost is in which URL a component
 * asks for, which no behavioural test of the component would notice.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

/**
 * The body of one method, from its declaration to the next one.
 *
 * NOT a fixed character count. The first version read `slice(at, at + 1200)`
 * from `async getAgentSummaries`, which is 134 characters longer than the
 * method: the "omits the heavy fields" assertion below was partly judging
 * whichever method came next. It also makes the verdict depend on line
 * endings -- this tree stores LF, a checkout on Windows materialises CRLF,
 * and the same slice in tests/tenant-scope.test.ts passed here and failed on
 * a clean checkout of the same commit for exactly that reason.
 */
function methodBody(s: string, declaration: string): string {
  const at = s.indexOf(declaration);
  if (at < 0) return "";
  const next = s.indexOf("\n  async ", at + declaration.length);
  return next < 0 ? s.slice(at) : s.slice(at, next);
}

describe("components that only need a name and a status ask for the summary", () => {
  it("the sidebar does not pull the full list every 30 seconds", () => {
    const s = src("client/src/components/app-sidebar.tsx");
    expect(s).toContain('queryKey: ["/api/agents?summary=1"]');
    // The exact form that cost ~10MB/minute per tab.
    expect(s).not.toMatch(/queryKey: \["\/api\/agents"\],\s*\n\s*refetchInterval/);
  });

  it("global search and the KPI strip use it too", () => {
    expect(src("client/src/components/global-search.tsx")).toContain('"/api/agents?summary=1"');
    expect(src("client/src/components/outcome-kpi-strip.tsx")).toContain('"/api/agents?summary=1"');
  });

  it("the summary still carries what those three read", () => {
    // status + outcomeId (sidebar), name + id (search), id + outcomeId (strip).
    // getAgentSummaries is the contract they depend on; if it stops selecting
    // one of these the components break silently with undefined.
    const s = src("server/storage.ts");
    expect(s.indexOf("async getAgentSummaries"), "getAgentSummaries not found").toBeGreaterThan(-1);
    const body = methodBody(s, "async getAgentSummaries");
    for (const field of ["id", "name", "status", "outcomeId"]) {
      expect(body, `summary must select ${field}`).toContain(field);
    }
  });

  it("the summary omits the three fields that are 78% of the payload", () => {
    const s = src("server/storage.ts");
    const body = methodBody(s, "async getAgentSummaries");
    expect(body.length, "empty body would pass every assertion below").toBeGreaterThan(200);
    for (const heavy of ["runtimeConfig", "systemPrompt", "blueprintJson"]) {
      expect(body, `summary must NOT select ${heavy}`).not.toContain(heavy);
    }
  });
});
