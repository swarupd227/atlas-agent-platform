/**
 * Named classifiers (Phase 3, item 3): one question an organization asks the
 * decision seam in more than one flow, defined once, org-scoped, and bound to
 * decision steps. Binding lays the classifier's question, options or levels
 * and threshold over the step's own; build and sync refresh it; the engine's
 * audit subject names the classifier.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import express from "express";
import type { AddressInfo } from "net";
import { withClassifier, classifyStep } from "../shared/flow-execution-kind";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const db = vi.hoisted(() => ({ rows: new Map<string, any>(), audit: [] as any[], seq: 0 }));
vi.mock("../server/storage", () => ({
  storage: {
    getDecisionClassifiers: vi.fn(async (orgId?: string) => Array.from(db.rows.values()).filter((r) => !orgId || r.organizationId === orgId)),
    getDecisionClassifier: vi.fn(async (id: string, orgId?: string) => { const r = db.rows.get(id); return r && (!orgId || r.organizationId === orgId) ? r : undefined; }),
    createDecisionClassifier: vi.fn(async (row: any) => { const created = { id: `c-${++db.seq}`, version: 1, status: "active", ...row, organizationId: row.organizationId ?? "org-default" }; db.rows.set(created.id, created); return created; }),
    updateDecisionClassifier: vi.fn(async (id: string, data: any, orgId?: string) => { const r = db.rows.get(id); if (!r || (orgId && r.organizationId !== orgId)) return undefined; const u = { ...r, ...data }; db.rows.set(id, u); return u; }),
    deleteDecisionClassifier: vi.fn(async (id: string, orgId?: string) => { const r = db.rows.get(id); if (!r || (orgId && r.organizationId !== orgId)) return false; db.rows.delete(id); return true; }),
    createAuditEvent: vi.fn(async (e: any) => { db.audit.push(e); return e; }),
  },
}));

let server: ReturnType<express.Express["listen"]> | undefined;
let base = "";
beforeAll(async () => {
  process.env.SECURITY_MODE = "demo"; // role from X-Role, organization from X-Organization-Id
  const { setDefaultOrgId } = await import("../server/auth");
  setDefaultOrgId("org-default");
  const { default: router } = await import("../server/routes/classifiers");
  const app = express(); app.use(express.json()); app.use(router);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());
beforeEach(() => { db.rows.clear(); db.audit.length = 0; db.seq = 0; });

const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  fetch(base + path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const admin = { "x-role": "admin", "x-organization-id": "org-a" };
const riskTier = { name: "Risk tier", kind: "choice", question: "How risky is this submission?", options: ["low: nothing unusual", { label: "high", description: "coastal or prior losses" }], threshold: 0.8 };

describe("the routes", () => {
  it("creates, lists, reads, updates and deletes within the caller's organization, and audits each write", async () => {
    const created = await call("POST", "/api/classifiers", admin, riskTier);
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ organizationId: "org-a", name: "Risk tier", kind: "choice", version: 1 });
    expect((await call("GET", "/api/classifiers", admin)).json).toHaveLength(1);
    expect((await call("GET", "/api/classifiers", { ...admin, "x-organization-id": "org-b" })).json).toHaveLength(0);
    expect((await call("GET", `/api/classifiers/${created.json.id}`, { ...admin, "x-organization-id": "org-b" })).status).toBe(404);

    const renamed = await call("PATCH", `/api/classifiers/${created.json.id}`, admin, { name: "Submission risk tier" });
    expect(renamed.json).toMatchObject({ name: "Submission risk tier", version: 1 });
    const reasked = await call("PATCH", `/api/classifiers/${created.json.id}`, admin, { options: ["low", "medium", "high"] });
    expect(reasked.json).toMatchObject({ version: 2 });

    expect((await call("DELETE", `/api/classifiers/${created.json.id}`, { ...admin, "x-organization-id": "org-b" })).status).toBe(404);
    expect((await call("DELETE", `/api/classifiers/${created.json.id}`, admin)).json).toEqual({ success: true });
    expect(db.audit.map((a) => a.action)).toEqual(["classifier_created", "classifier_updated", "classifier_updated", "classifier_deleted"]);
    expect(db.audit[2].details).toContain("version 2");
  });

  it("refuses a classifier that could not be asked", async () => {
    expect((await call("POST", "/api/classifiers", admin, { name: "One", kind: "choice", question: "q", options: ["only"] })).status).toBe(400);
    expect((await call("POST", "/api/classifiers", admin, { name: "Ladder", kind: "score", question: "q", levels: ["one"] })).status).toBe(400);
    expect((await call("POST", "/api/classifiers", admin, { name: "Yes", kind: "noul", question: "q" })).status).toBe(400);
    expect((await call("POST", "/api/classifiers", admin, { name: "Ladder", kind: "score", question: "q", levels: ["low", "high"] })).status).toBe(201);
  });

  it("needs the blueprint permission to write, and none to read", async () => {
    // finance is denied create_modify_blueprints in the permission matrix.
    const viewer = { "x-role": "finance", "x-organization-id": "org-a" };
    expect((await call("POST", "/api/classifiers", viewer, riskTier)).status).toBe(403);
    expect((await call("GET", "/api/classifiers", viewer)).status).toBe(200);
  });
});

describe("binding a classifier to a step", () => {
  const row = { id: "c-1", name: "Risk tier", kind: "choice", question: "How risky is this submission?", options: ["low", { label: "high", description: "coastal" }], threshold: 0.8 };
  it("lays the classifier's question, answers and threshold over the step's own, and makes it a value decision", () => {
    const step = withClassifier({ question: "old", options: [{ label: "x" }], confidenceThreshold: 0.5, decisionKind: true }, row);
    expect(step).toMatchObject({ classifierId: "c-1", classifierName: "Risk tier", answerType: "classify", question: "How risky is this submission?", options: [{ label: "low" }, { label: "high", description: "coastal" }], confidenceThreshold: 0.8 });
    expect(classifyStep({ type: "make_decision", config: step } as any)).toBe("decision");
    const ladder = withClassifier({}, { id: "c-2", name: "Severity", kind: "score", question: "How serious?", levels: ["clean", "minor", "serious"] });
    expect(ladder).toMatchObject({ answerType: "score", levels: ["clean", "minor", "serious"] });
    expect(ladder).not.toHaveProperty("confidenceThreshold");
  });
  it("leaves the step alone for a yes/no classifier or a missing row", () => {
    const own = { question: "own", answerType: "classify", options: ["a", "b"] };
    expect(withClassifier(own, { id: "c-3", name: "Is PII", kind: "noul", question: "q" })).toEqual(own);
    expect(withClassifier(own, undefined)).toEqual(own);
  });
});

describe("the seams that carry it", () => {
  it("build and sync refresh a bound step from the classifier and record its name; the engine's audit subject uses the name", () => {
    const build = read("server", "team-build.ts");
    expect(build).toContain("for (const c of await storage.getDecisionClassifiers(orgId)) classifiers.set(c.id, c as ClassifierBinding);");
    expect(build).toContain("const config = withClassifier(raw, bound) as Record<string, any>;");
    expect(build).toContain("is bound to a classifier that no longer exists; built from the copy the step carries.");
    const sync = read("server", "process-flow-sync.ts");
    expect(sync).toContain("try { bound = await storage.getDecisionClassifier(rawCfg.classifierId, orgId); } catch { bound = undefined; }");
    expect(sync).toContain("const cfg = withClassifier(rawCfg, bound) as Record<string, any>;");
    const engine = read("server", "dag-execution-engine.ts");
    expect(engine).toContain("const subject = d.classifierName ? `${nc.label} [${d.classifierName}]` : d.classifierId ? `${nc.label} [${d.classifierId}]` : nc.label;");
  });

  it("is registered as a route module, a table, a page under Governance and a Cowork tool", () => {
    expect(read("server", "routes.ts")).toContain("app.use(classifiersRouter);");
    expect(read("server", "db.ts")).toContain("CREATE TABLE IF NOT EXISTS decision_classifiers (");
    expect(read("shared", "schema.ts")).toContain('export const decisionClassifiers = pgTable("decision_classifiers", {');
    expect(read("client", "src", "App.tsx")).toContain('<Route path="/governance/classifiers" component={Classifiers} />');
    expect(read("client", "src", "pages", "governance-overview.tsx")).toContain('data-testid="link-classifiers"');
    const gov = read("server", "astra", "tools", "governance.ts");
    expect(gov).toContain('name: "list_classifiers"');
    expect(gov).toContain('name: "create_classifier"');
    expect(gov).toContain("listClassifiersTool, createClassifierTool];");
  });

  it("both canvases offer the picker and bind by copying, through the shared helper", () => {
    const studio = read("client", "src", "components", "flow-graph-canvas.tsx");
    expect(studio).toContain('data-testid="select-node-classifier"');
    expect(studio).toContain("patchNode(selNode.id, { config: row ? withClassifier(rest, row) : rest });");
    const editor = read("client", "src", "pages", "team-graph-editor.tsx");
    expect(editor).toContain('data-testid="select-decision-classifier"');
    expect(editor).toContain("const fromRow = withClassifier({ ...rest, options } as Record<string, unknown>, row) as Record<string, any>;");
    expect(read("client", "src", "pages", "process-flows.tsx")).toContain('queryKey: ["/api/classifiers"]');
  });

  it("the write routes carry the permission inline, as the authz scan reads them", () => {
    const src = read("server", "routes", "classifiers.ts");
    expect(src).toContain('router.post("/api/classifiers", checkPermission("create_modify_blueprints")');
    expect(src).toContain('router.patch("/api/classifiers/:id", checkPermission("create_modify_blueprints")');
    expect(src).toContain('router.delete("/api/classifiers/:id", checkPermission("create_modify_blueprints")');
  });
});
