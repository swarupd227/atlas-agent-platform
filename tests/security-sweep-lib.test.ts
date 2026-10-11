/**
 * The pieces of the authorization sweep (scripts/security-sweep.ts) that need no server: reading routes out of the source, naming
 * path parameters, guessing which table an id comes from, building a seed row, and comparing findings with the accepted ones.
 * The sweep itself runs in its own CI job against a live server; these keep its logic from drifting unnoticed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  baseRoute, diffBaseline, fillRoute, findingKey, hasParams, isIdLike, nameTokens, paramSlots, rankTables, scanRoutes, singular,
  succeeded, tableAffinity, valueForColumn, NOT_SWEPT,
  type ColumnInfo, type FindingKind,
} from "../scripts/security-sweep-lib";

const root = path.join(__dirname, "..");
const col = (over: Partial<ColumnInfo>): ColumnInfo => ({ name: "title", columnType: "PgText", notNull: true, hasDefault: false, primary: false, ...over });
const ctx = (links: Record<string, string> = {}) => ({ organizationId: "org-a", idFor: (c: string) => links[c] });

describe("scanRoutes", () => {
  it("finds registrations of every verb on a router, an app or a named router, once each, with their line", () => {
    const src = [
      'router.get("/api/things", h);',
      "app.post('/api/things/:id/run', h);",
      "fooRouter.delete(`/api/things/:id`, h);",
      'router.patch("/api/things/:id", h);',
      'router.put("/api/things/:id", h);',
      'router.get("/api/things", again);',
      'router.get("/not-api", h);',
    ].join("\r\n");
    const found = scanRoutes([{ path: "server/x.ts", source: src }]);
    expect(found.map((r) => `${r.verb} ${r.route}`)).toEqual([
      "GET /api/things", "DELETE /api/things/:id", "PATCH /api/things/:id", "PUT /api/things/:id", "POST /api/things/:id/run",
    ]);
    expect(found.find((r) => r.verb === "POST")?.line).toBe(2);
  });

  it("leaves signing in and out and event streams alone", () => {
    for (const r of ["/api/auth/login", "/api/auth/logout", "/api/auth/register", "/api/runs/:id/stream", "/api/x/events", "/api/sse/y", "/api/a/subscribe"]) expect(NOT_SWEPT.test(r), r).toBe(true);
    for (const r of ["/api/auth/me", "/api/agents/:id", "/api/streams-of-data"]) expect(NOT_SWEPT.test(r), r).toBe(false);
  });
});

describe("path parameters", () => {
  it("names each parameter and the static segment before it", () => {
    expect(paramSlots("/api/dag-runs/:id")).toEqual([{ name: "id", before: "dag-runs" }]);
    expect(paramSlots("/api/agents/:agentId/knowledge-bases/:linkId")).toEqual([
      { name: "agentId", before: "agents" }, { name: "linkId", before: "knowledge-bases" },
    ]);
    expect(paramSlots("/api/agents")).toEqual([]);
    expect(hasParams("/api/x/:id")).toBe(true);
    expect(hasParams("/api/x")).toBe(false);
  });

  it("fills parameters in order, repeating the last value when there are fewer", () => {
    expect(fillRoute("/api/a/:aId/b/:bId", ["1", "2"])).toBe("/api/a/1/b/2");
    expect(fillRoute("/api/a/:aId/b/:bId", ["1"])).toBe("/api/a/1/b/1");
    expect(fillRoute("/api/a/:id?", ["z"])).toBe("/api/a/z");
  });

  it("finds the object a nested route hangs off", () => {
    expect(baseRoute("/api/skills/:id/eval/run")).toBe("/api/skills/:id");
    expect(baseRoute("/api/agents/:agentId/channels/:channelId")).toBe("/api/agents/:agentId");
    expect(baseRoute("/api/things/:id")).toBe("/api/things/:id");
    expect(baseRoute("/api/things")).toBe("/api/things");
  });

  it("tells ids from names", () => {
    for (const n of ["id", "agentId", "traceId", "linkId", "memberAgentId"]) expect(isIdLike({ name: n, before: "x" }), n).toBe(true);
    for (const n of ["slug", "key", "name", "app"]) expect(isIdLike({ name: n, before: "x" }), n).toBe(false);
  });
});

describe("which table an id comes from", () => {
  it("reads the same words out of a path segment, a column and a parameter", () => {
    expect(nameTokens("dag-runs")).toEqual(["dag", "run"]);
    expect(nameTokens("dag_runs")).toEqual(["dag", "run"]);
    expect(nameTokens("dagRuns")).toEqual(["dag", "run"]);
    expect(nameTokens("agentId")).toEqual(["agent"]);
    expect(nameTokens("memberAgentId")).toEqual(["member", "agent"]);
    expect(singular("policies")).toBe("policy");
    expect(singular("status")).toBe("status");
    expect(singular("address")).toBe("address");
    expect(singular("classes")).toBe("class");
  });

  it("prefers the table named for the segment before the id, then the one named for the parameter", () => {
    const tables = ["agents", "dag_execution_runs", "dag_runs", "agent_knowledge_bases", "knowledge_bases", "kpi_definitions"];
    expect(rankTables(tables, { name: "id", before: "dag-runs" })[0]).toBe("dag_runs");
    expect(rankTables(tables, { name: "agentId", before: "agents" })[0]).toBe("agents");
    expect(rankTables(tables, { name: "linkId", before: "knowledge-bases" })[0]).toBe("knowledge_bases");
    expect(rankTables(tables, { name: "id", before: "nothing-like-it" })).toEqual([]);
    expect(tableAffinity("kpi_definitions", { name: "id", before: "kpis" })).toBeGreaterThan(0);
  });
});

describe("a row for a table", () => {
  it("gives an organization column the organization, and a linked column the linked row's id", () => {
    expect(valueForColumn(col({ name: "organization_id", notNull: false }), ctx())).toBe("org-a");
    expect(valueForColumn(col({ name: "agent_id", columnType: "PgVarchar" }), ctx({ agent_id: "ag-1" }))).toBe("ag-1");
    expect(valueForColumn(col({ name: "agent_id", columnType: "PgVarchar", notNull: false }), ctx({ agent_id: "ag-1" }))).toBe("ag-1");
  });

  it("fills only what the table needs, and by type", () => {
    expect(valueForColumn(col({ name: "id", primary: true }), ctx())).toBeUndefined();
    expect(valueForColumn(col({ notNull: false }), ctx())).toBeUndefined();
    expect(valueForColumn(col({ hasDefault: true }), ctx())).toBeUndefined();
    expect(valueForColumn(col({ name: "label" }), ctx())).toBe("sweep-label");
    expect(valueForColumn(col({ name: "status", enumValues: ["open", "closed"] }), ctx())).toBe("open");
    expect(valueForColumn(col({ name: "webhook_url" }), ctx())).toBe("http://127.0.0.1:9/sweep");
    expect(valueForColumn(col({ columnType: "PgInteger" }), ctx())).toBe(1);
    expect(valueForColumn(col({ columnType: "PgReal" }), ctx())).toBe(0.5);
    expect(valueForColumn(col({ columnType: "PgBoolean" }), ctx())).toBe(false);
    expect(valueForColumn(col({ columnType: "PgJsonb" }), ctx())).toEqual({});
    expect(valueForColumn(col({ columnType: "PgArray" }), ctx())).toEqual([]);
    expect(valueForColumn(col({ columnType: "PgTimestamp" }), ctx())).toBeInstanceOf(Date);
    expect(valueForColumn(col({ columnType: "PgCustomColumn" }), ctx())).toBeUndefined();
  });
});

describe("comparing findings with the accepted ones", () => {
  const found = (over: Partial<Record<FindingKind, string[]>>): Record<FindingKind, string[]> => ({
    unauthenticated: [], listLeak: [], readLeak: [], writeAccepted: [], writeChanged: [], lowRoleWrite: [], ...over,
  });

  it("reports a finding that is not accepted, and an accepted one that no longer happens", () => {
    const d = diffBaseline(found({ readLeak: ["GET /api/a/:id", "GET /api/b/:id"] }), { readLeak: { "GET /api/a/:id": "shared" }, writeChanged: { "DELETE /api/c/:id": "open" } });
    expect(d.newFindings).toEqual([{ kind: "readLeak", key: "GET /api/b/:id" }]);
    expect(d.stale).toEqual([{ kind: "writeChanged", key: "DELETE /api/c/:id" }]);
  });

  it("is clean when everything found is accepted, and an empty baseline accepts nothing", () => {
    expect(diffBaseline(found({}), {}).newFindings).toEqual([]);
    expect(diffBaseline(found({ listLeak: ["GET /api/x"] }), {}).newFindings).toHaveLength(1);
  });

  it("keys a finding by verb and route pattern, never by id", () => {
    expect(findingKey("GET", "/api/a/:id")).toBe("GET /api/a/:id");
    expect(succeeded(204)).toBe(true);
    expect(succeeded(302)).toBe(false);
    expect(succeeded(403)).toBe(false);
  });
});

describe("the sweep stays wired in", () => {
  const read = (p: string) => readFileSync(path.join(root, p), "utf8");

  it("runs in CI against a database, apart from the unit tests", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("npx tsx scripts/security-sweep.ts");
    expect(ci).toMatch(/pgvector\/pgvector/);
  });

  it("has a reason written beside every finding it accepts", () => {
    const baseline = JSON.parse(read("scripts/security-sweep-baseline.json")) as Record<string, unknown>;
    for (const [kind, entries] of Object.entries(baseline)) {
      if (kind === "coverage") continue;
      for (const [key, reason] of Object.entries(entries as Record<string, string>)) {
        expect(reason.trim().length, `${kind}: ${key} has no reason`).toBeGreaterThan(10);
        expect(reason, `${kind}: ${key} still has the placeholder reason`).not.toBe("unclassified");
      }
    }
  });
});
