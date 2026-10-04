/**
 * Ontology relationships with meaning (shared/ontology-relationships.ts) and
 * the graph router that reads them (server/routes/ontology-graph.ts).
 *
 * The vocabulary is checked for symmetry (every inverse names a predicate whose
 * inverse is the original), the normaliser for both shapes, the validator for
 * the one refusal it makes (a target that is not a concept) and the one warning
 * (a predicate outside the vocabulary), and the routes against a mocked storage
 * with a real express app on port 0, the way tests/classifiers.test.ts does.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import express from "express";
import type { AddressInfo } from "net";
import {
  PREDICATES, normalizeRelationship, validateRelationships, inverseOf, readsAs, groupOf, isKnownPredicate,
  systemsOfRecordFromTags, normalizeSystemsOfRecord,
} from "../shared/ontology-relationships";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const db = vi.hoisted(() => ({ rows: new Map<string, any>(), updates: [] as any[] }));
vi.mock("../server/storage", () => ({
  storage: {
    getOntologyConcepts: vi.fn(async (industryId: string) => Array.from(db.rows.values()).filter((r) => r.industryId === industryId)),
    getOntologyConcept: vi.fn(async (id: string) => db.rows.get(id)),
    updateOntologyConcept: vi.fn(async (id: string, data: any) => { const r = db.rows.get(id); if (!r) return undefined; const u = { ...r, ...data }; db.rows.set(id, u); db.updates.push({ id, data }); return u; }),
    createAuditEvent: vi.fn(async () => undefined),
  },
}));

describe("the vocabulary", () => {
  it("is symmetric: every inverse is a predicate whose inverse is the original", () => {
    for (const d of PREDICATES.values()) {
      const inv = PREDICATES.get(d.inverse);
      expect(inv, `${d.predicate} -> ${d.inverse}`).toBeDefined();
      expect(inv!.inverse).toBe(d.predicate);
    }
  });
  it("reads a known predicate as words and an unknown one as its own name split", () => {
    expect(readsAs("partOf")).toBe("is part of");
    expect(readsAs("cededUnderTreaty")).toBe("ceded under treaty");
    expect(groupOf("hasReserve")).toBe("money");
    expect(groupOf("cededUnderTreaty")).toBe("general");
    expect(isKnownPredicate("playsRole")).toBe(true);
  });
});

describe("normalizeRelationship", () => {
  it("reads the old shape and maps the four legacy types", () => {
    expect(normalizeRelationship({ type: "parent", targetId: "a", label: "x" })).toEqual({ predicate: "partOf", type: "partOf", targetId: "a", label: "x", inverse: "contains" });
    expect(normalizeRelationship({ type: "child", targetId: "a" })).toMatchObject({ predicate: "contains", type: "contains" });
    expect(normalizeRelationship({ type: "depends_on", targetId: "a" })).toMatchObject({ predicate: "dependsOn", inverse: "dependedOnBy" });
    expect(normalizeRelationship({ type: "related", targetId: "a" })).toMatchObject({ predicate: "related", inverse: "related" });
  });
  it("reads the new shape, keeps type equal to predicate, and keeps an unknown predicate", () => {
    expect(normalizeRelationship({ predicate: "playsRole", targetId: "r", cardinality: "many" })).toEqual({ predicate: "playsRole", type: "playsRole", targetId: "r", cardinality: "many", inverse: "rolePlayedBy" });
    expect(normalizeRelationship({ predicate: "cededUnderTreaty", targetId: "t" })).toEqual({ predicate: "cededUnderTreaty", type: "cededUnderTreaty", targetId: "t" });
  });
  it("returns null for a relationship with no target", () => {
    expect(normalizeRelationship({ type: "related" })).toBeNull();
    expect(normalizeRelationship(null)).toBeNull();
    expect(normalizeRelationship("x")).toBeNull();
  });
});

describe("validateRelationships", () => {
  const known = { ids: ["a", "b"], labels: new Map([["policy", "a"]]) };
  it("refuses a target that is not a concept, resolves a unique label, warns on an unknown predicate", () => {
    const v = validateRelationships([
      { predicate: "contains", targetId: "b" },
      { predicate: "coveredBy", targetId: "Policy" },
      { predicate: "cededUnderTreaty", targetId: "a" },
      { predicate: "related", targetId: "nope" },
      { predicate: "related" },
    ], known);
    expect(v.normalized.map((r) => `${r.predicate}>${r.targetId}`)).toEqual(["contains>b", "coveredBy>a", "cededUnderTreaty>a"]);
    expect(v.errors).toHaveLength(2);
    expect(v.errors[0]).toMatch(/"nope", which is not a concept/);
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0]).toMatch(/cededUnderTreaty/);
  });
  it("treats a non-array as no relationships", () => {
    expect(validateRelationships(undefined, known)).toEqual({ normalized: [], errors: [], warnings: [] });
  });
});

describe("systems of record", () => {
  it("reads sor:* tags and leaves the others", () => {
    expect(systemsOfRecordFromTags(["policy", "sor:policy-administration", "MGA"])).toEqual({ systems: [{ name: "policy administration", role: "master" }], remainingTags: ["policy", "MGA"] });
  });
  it("normalises a submitted list and drops rows without a name", () => {
    expect(normalizeSystemsOfRecord([{ name: "Guidewire ClaimCenter", role: "master", connectorId: "c1" }, { role: "copy" }, { name: "Majesco", role: "nonsense" }]))
      .toEqual([{ name: "Guidewire ClaimCenter", role: "master", connectorId: "c1" }, { name: "Majesco", role: "master" }]);
  });
});

describe("the graph router", () => {
  let server: ReturnType<express.Express["listen"]> | undefined;
  let base = "";
  beforeAll(async () => {
    process.env.SECURITY_MODE = "demo";
    const { setDefaultOrgId } = await import("../server/auth");
    setDefaultOrgId("org-default");
    const { default: router } = await import("../server/routes/ontology-graph");
    const app = express(); app.use(express.json()); app.use(router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server?.close());
  const call = (method: string, path: string, body?: unknown) =>
    fetch(base + path, { method, headers: { "content-type": "application/json", "x-role": "admin", "x-organization-id": "org-a" }, body: body ? JSON.stringify(body) : undefined })
      .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
  const seed = () => {
    db.rows.clear(); db.updates.length = 0;
    const put = (id: string, label: string, relationships: unknown[], tags: string[] = []) => db.rows.set(id, { id, industryId: "insurance", label, category: "c", relationships, tags });
    put("policy", "Insurance Policy", [{ type: "parent", targetId: "coverage" }], ["policy", "sor:policy-administration"]);
    put("coverage", "Coverage", [{ predicate: "covers", targetId: "building" }]);
    put("building", "Risk Object", []);
    put("mortgagee", "Mortgagee", [{ predicate: "securedOn", targetId: "Risk Object" }, { type: "related", targetId: "nowhere" }]);
    db.rows.set("other", { id: "other", industryId: "retail", label: "Store", category: "c", relationships: [{ type: "related", targetId: "policy" }], tags: [] });
  };
  beforeEach(seed);

  it("walks out to the requested depth and reports inverse edges as inferred", async () => {
    const one = await call("GET", "/api/ontology/concepts/policy/graph");
    expect(one.status).toBe(200);
    expect(one.json.nodes.map((n: any) => n.id).sort()).toEqual(["coverage", "policy"]);
    expect(one.json.edges).toEqual([{ from: "policy", to: "coverage", predicate: "partOf", group: "structure", reads: "is part of", inferred: false }]);
    const two = await call("GET", "/api/ontology/concepts/policy/graph?depth=2");
    expect(two.json.nodes.map((n: any) => n.id).sort()).toEqual(["building", "coverage", "policy"]);
    // Nothing links FROM building, yet building's row shows what links TO it.
    const fromBuilding = await call("GET", "/api/ontology/concepts/building/graph");
    expect(fromBuilding.json.edges).toEqual([{ from: "building", to: "coverage", predicate: "coveredBy", group: "coverage", reads: "is covered by", inferred: true }]);
    // The retail concept that points at policy is not in insurance's graph.
    expect(two.json.nodes.some((n: any) => n.id === "other")).toBe(false);
  });
  it("404s an unknown concept and clamps depth", async () => {
    expect((await call("GET", "/api/ontology/concepts/nope/graph")).status).toBe(404);
    expect((await call("GET", "/api/ontology/concepts/policy/graph?depth=9")).json.depth).toBe(3);
  });
  it("migrates: dry run changes nothing, apply normalises types, resolves one label, moves sor tags, and names what it cannot resolve", async () => {
    const dry = await call("POST", "/api/ontology/migrate-relationships", { industryId: "insurance" });
    expect(dry.status).toBe(200);
    expect(dry.json).toMatchObject({ concepts: 4, changed: 3, relationshipsNormalized: 3, targetsResolved: 1, systemsOfRecordSet: 1, applied: false });
    expect(dry.json.unresolved).toEqual(['Mortgagee: related -> "nowhere"']);
    expect(db.updates).toHaveLength(0);
    const applied = await call("POST", "/api/ontology/migrate-relationships", { industryId: "insurance", apply: true });
    expect(applied.json.applied).toBe(true);
    expect(db.rows.get("policy").relationships).toEqual([{ predicate: "partOf", type: "partOf", targetId: "coverage", inverse: "contains" }]);
    expect(db.rows.get("policy").systemsOfRecord).toEqual([{ name: "policy administration", role: "master" }]);
    expect(db.rows.get("policy").tags).toEqual(["policy"]);
    expect(db.rows.get("mortgagee").relationships).toEqual([{ predicate: "securedOn", type: "securedOn", targetId: "building" }]);
    // A second dry run finds nothing to do, even when the column hands the keys back in a different order (jsonb does).
    for (const [id, row] of db.rows) db.rows.set(id, { ...row, relationships: (row.relationships || []).map((r: any) => Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.length - b.length || a.localeCompare(b)))) });
    const again = await call("POST", "/api/ontology/migrate-relationships", { industryId: "insurance" });
    expect(again.json).toMatchObject({ changed: 0, relationshipsNormalized: 0, systemsOfRecordSet: 0 });
  });
  it("serves the vocabulary", async () => {
    const v = await call("GET", "/api/ontology/relationship-vocabulary");
    expect(v.json.groups).toContain("parties");
    expect(v.json.predicates.find((p: any) => p.predicate === "playsRole")).toMatchObject({ inverse: "rolePlayedBy", group: "parties" });
  });
});

describe("the write routes read the same module", () => {
  const skills = read("server", "routes", "skills.ts");
  it("validate relationships on create, bulk and update, and accept systemsOfRecord", () => {
    expect(skills).toContain('from "@shared/ontology-relationships"');
    expect((skills.match(/validateRelationships\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((skills.match(/normalizeSystemsOfRecord\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(skills).toContain("systemsOfRecord: z.array(z.any()).optional()");
  });
  it("the schema and the boot-time ALTER carry the column, and the router is mounted", () => {
    expect(read("shared", "schema.ts")).toContain('systemsOfRecord: jsonb("systems_of_record")');
    expect(read("server", "db.ts")).toContain("ALTER TABLE ontology_concepts ADD COLUMN IF NOT EXISTS systems_of_record JSONB");
    expect(read("server", "routes.ts")).toContain("app.use(ontologyGraphRouter)");
  });
});
