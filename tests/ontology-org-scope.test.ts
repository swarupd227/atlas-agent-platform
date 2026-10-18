/**
 * ontology_concepts gained an organization_id: null is a platform-wide concept (every
 * existing row), set is one organization's own. The storage reads are DEFAULT-DENY: a
 * caller that does not name an organization is shown platform-wide concepts only, so the
 * ~50 existing call sites cannot hand anyone another organization's concept, and only a
 * site that passes the caller's organization widens the read to that organization's own.
 * A write reaches a private concept only with its own organization's id.
 *
 * The WHERE clause the storage builds is compiled and read here, because the property
 * is in the SQL, not in the return value of a mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";

const seen = vi.hoisted(() => ({ where: undefined as unknown, op: "" as string }));
vi.mock("../server/db", () => {
  const rows = Promise.resolve([] as unknown[]);
  const chain = (op: string) => {
    const c: any = {
      from: () => c, set: () => c, innerJoin: () => c, orderBy: () => c, limit: () => c,
      where: (w: unknown) => { seen.where = w; seen.op = op; return Object.assign(rows.then((r) => r), { returning: async () => [], limit: async () => [] }); },
    };
    return c;
  };
  return { db: { select: () => chain("select"), update: () => chain("update"), delete: () => chain("delete"), insert: () => ({ values: () => ({ returning: async () => [] }) }), execute: async () => ({ rows: [] }) } };
});

import { storage } from "../server/storage";

const sqlOf = () => new PgDialect().sqlToQuery(seen.where as any);
beforeEach(() => { seen.where = undefined; seen.op = ""; });

describe("reading ontology concepts", () => {
  it("without an organization: platform-wide concepts only", async () => {
    await storage.getOntologyConcepts("insurance");
    const q = sqlOf();
    expect(q.sql).toMatch(/"organization_id" is null/i);
    expect(q.sql).not.toMatch(/"organization_id" = \$/);
    expect(q.params).toContain("insurance");
  });

  it("with an organization: platform-wide plus that organization's own, never another's", async () => {
    await storage.getOntologyConcepts("insurance", undefined, "org-a");
    const q = sqlOf();
    expect(q.sql).toMatch(/"organization_id" is null or "ontology_concepts"\."organization_id" = \$\d/i);
    expect(q.params).toContain("org-a");
  });

  it("keeps the sub-vertical filter and still scopes by organization", async () => {
    await storage.getOntologyConcepts("insurance", "Workers Compensation", "org-a");
    const q = sqlOf();
    expect(q.sql).toMatch(/cardinality/i);
    expect(q.sql).toMatch(/"organization_id" is null or/i);
    expect(q.params).toEqual(expect.arrayContaining(["insurance", "Workers Compensation", "org-a"]));
  });

  it("reading every concept, or one by id, is scoped the same way", async () => {
    await storage.getAllOntologyConcepts();
    expect(sqlOf().sql).toMatch(/"organization_id" is null/i);
    expect(sqlOf().sql).not.toMatch(/"organization_id" = \$/);
    await storage.getAllOntologyConcepts("org-a");
    expect(sqlOf().sql).toMatch(/is null or .* = \$/i);
    await storage.getOntologyConcept("c1");
    expect(sqlOf().sql).toMatch(/"id" = \$\d and .*"organization_id" is null/i);
    await storage.getOntologyConcept("c1", "org-a");
    expect(sqlOf().params).toEqual(expect.arrayContaining(["c1", "org-a"]));
  });

  it("an empty organization id is no organization: it must not widen the read", async () => {
    await storage.getOntologyConcepts("insurance", undefined, "");
    expect(sqlOf().sql).not.toMatch(/"organization_id" = \$/);
    await storage.getOntologyConcepts("insurance", undefined, null);
    expect(sqlOf().sql).not.toMatch(/"organization_id" = \$/);
  });
});

describe("writing ontology concepts", () => {
  it("an update or delete without an organization reaches platform-wide rows only, so no caller can edit another organization's concept by guessing its id", async () => {
    await storage.updateOntologyConcept("c1", { description: "x" } as any);
    expect(seen.op).toBe("update");
    expect(sqlOf().sql).toMatch(/"organization_id" is null/i);
    await storage.deleteOntologyConcept("c1");
    expect(seen.op).toBe("delete");
    expect(sqlOf().sql).toMatch(/"organization_id" is null/i);
  });

  it("with an organization it reaches that organization's own rows as well", async () => {
    await storage.updateOntologyConcept("c1", { description: "x" } as any, "org-a");
    expect(sqlOf().params).toEqual(expect.arrayContaining(["c1", "org-a"]));
    await storage.deleteOntologyConcept("c1", "org-a");
    expect(sqlOf().params).toEqual(expect.arrayContaining(["c1", "org-a"]));
  });
});

describe("enhancements of concepts", () => {
  it("an industry's enhancements are those of its platform-wide concepts, not of any organization's private ones", async () => {
    await storage.getOntologyEnhancementsByIndustry("insurance");
    expect(sqlOf().sql).toMatch(/"industry_id" = \$\d and .*"organization_id" is null/i);
  });
});

describe("no other reader bypasses the scope", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
  const files = ["server/agent-runtime.ts", "server/mandate-lint.ts", "server/team-proposal.ts", "server/routes/agents.ts", "server/routes/evaluations.ts", "server/routes/governance.ts", "server/routes/helpers.ts", "server/routes/journeys.ts", "server/routes/runtime.ts", "server/routes/skills.ts", "server/kb-routes.ts", "server/permissions.ts", "server/astra/ontology-services.ts"];

  it("only the storage layer selects from the concepts table", () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/\.from\(\s*ontologyConcepts\s*\)/);
      expect(src, f).not.toMatch(/from\(\s*\(await import\("@shared\/schema"\)\)\.ontologyConcepts/);
    }
  });

  it("the sites that should show an organization its own concepts pass the organization", () => {
    const rt = read("server/agent-runtime.ts");
    expect((rt.match(/getOntologyConcept\(tag\.conceptId, agent\.orgId\)/g) ?? []).length).toBe(2);
    expect(read("server/routes/skills.ts")).toContain("getOntologyConcepts(industry, undefined, getOrgId(req))");
    expect(read("server/routes/skills.ts")).toContain("getOntologyConcepts(industryId, subVertical, getOrgId(req))");
    expect(read("server/routes/skills.ts")).toContain("getOntologyConcept(req.params.id as string, getOrgId(req))");
    expect(read("server/routes/governance.ts")).toContain("getAllOntologyConcepts(getOrgId(req))");
    expect(read("server/routes/ontology-graph.ts")).toContain("getOntologyConcept(req.params.id as string, orgId)");
    expect(read("server/routes/runtime.ts")).toContain("storage.getAllOntologyConcepts(getOrgId(req))");
  });

  it("the sites that resolve an agent's own concept tags pass the agent's organization", () => {
    const count = (src: string, needle: string) => src.split(needle).length - 1;
    const helpers = read("server/routes/helpers.ts");
    expect(count(helpers, "getOntologyConcept(tag.conceptId, orgId)")).toBe(1);
    expect(count(helpers, "getOntologyConcept(cid, agent.organizationId)")).toBe(1);
    expect(count(helpers, "getOntologyConcept(id, orgId)")).toBe(1);
    const ev = read("server/routes/evaluations.ts");
    expect(count(ev, "getOntologyConcept(cid, getOrgId(req))")).toBe(1);
    expect(count(ev, "getOntologyConcept(tag.conceptId, getOrgId(req))")).toBe(1);
    expect(read("server/routes/agents.ts")).toContain("getOntologyConcept(tag.conceptId, agent.organizationId)");
    const rt = read("server/routes/runtime.ts");
    expect(rt).toContain("getOntologyConcept(tag.conceptId, agent.organizationId)");
    expect(rt).toContain("checkOntologyCompliance(text, ontologyTags, agent.organizationId)");
    expect(rt).toContain("checkOntologyCompliance(text, tags, getOrgId(req))");
    expect(read("server/worker.ts")).toContain("checkOntologyCompliance(outputText, ontologyTags, agent.organizationId)");
    const ar = read("server/agent-runtime.ts");
    expect(ar).toContain("getOntologyConcept(tag.conceptId, orgId)");
    expect(count(ar, "getOntologyConcept(tag.conceptId, orgId)")).toBe(2);
    expect(ar).toContain("checkOntologyCompliance(allOutputText, ontologyTags, agentRecord?.organizationId)");
    expect(read("server/ontology-coverage.ts")).toContain("getOntologyConcepts(industryId, subVertical, orgId)");
  });

  it("the Ontology page's routes pass the caller's organization, and the edit route never takes the organization from the body", () => {
    const sk = read("server/routes/skills.ts");
    const at = sk.indexOf('router.put("/api/ontology/concepts/:id"');
    const end = sk.indexOf("router.get", at);
    const put = sk.slice(at, end);
    expect(put).toContain("getOntologyConcept(req.params.id as string, getOrgId(req))");
    expect(put).toContain("delete body.organizationId;");
    expect(put.indexOf("delete body.organizationId;")).toBeLessThan(put.indexOf("const updateData"));
    expect(put).toContain("updateOntologyConcept(req.params.id as string, updateData, getOrgId(req))");
    expect(put).toContain("getOntologyConcepts(existing.industryId, undefined, existing.organizationId)");
    expect((sk.match(/getOntologyConcept\(req\.params\.id as string, getOrgId\(req\)\)/g) ?? []).length).toBe(5);
    expect(sk).toContain("deleteOntologyConcept(req.params.id as string, getOrgId(req))");
  });
});
