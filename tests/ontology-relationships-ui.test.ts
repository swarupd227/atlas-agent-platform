/**
 * The readers of typed ontology relationships (Tier B, commit 2): the Ontology
 * page and its map component read predicates through the shared module, and an
 * output contract can take its allowed values from a concept's neighbours.
 *
 * The page is pinned by source (it is a React page); the contract route runs
 * against a mocked storage on a real express app, the way tests/classifiers.test.ts does.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import express from "express";
import type { AddressInfo } from "net";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const db = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock("../server/storage", () => ({
  storage: {
    getOntologyConcepts: vi.fn(async (industryId: string) => db.rows.filter((r) => r.industryId === industryId)),
    getOntologyConcept: vi.fn(async (id: string) => db.rows.find((r) => r.id === id)),
    createAuditEvent: vi.fn(async () => undefined),
  },
}));

describe("the Ontology page reads predicates", () => {
  const page = read("client", "src", "pages", "ontology.tsx");
  const map = read("client", "src", "components", "ontology-map.tsx");
  it("normalises links through the shared module and reads them as words", () => {
    expect(page).toContain('from "@shared/ontology-relationships"');
    expect(page).toContain("const r = normalizeRelationship(raw);");
    expect(page).toContain("readsAs(r.predicate)");
    expect(page).not.toContain('type: "parent" | "child" | "related" | "depends_on";');
  });
  it("colours a link by its predicate group, not by the four legacy names", () => {
    expect(page).toContain("const relationshipColor = (predicate: string) => relationshipTypeColors[groupOf(predicate)]");
    expect(page).toContain("relationshipColor(rel.type)");
    for (const g of ["structure", "parties", "coverage", "money", "process", "provenance", "general"]) expect(page).toContain(`  ${g}: "bg-`);
    expect(page).not.toContain('  depends_on: "bg-');
  });
  it("shows where a concept's instances live", () => {
    expect(page).toContain("systemsOfRecord: SystemOfRecord[];");
    expect(page).toContain('data-testid="concept-systems-of-record"');
    expect(page).toContain("Held in");
  });
  it("the map reads a missing link label from the vocabulary", () => {
    expect(map).toContain('import { readsAs } from "@shared/ontology-relationships";');
    expect(map).toContain("label: r.label || readsAs(r.type)");
  });
});

describe("an output contract from a concept's neighbours", () => {
  let server: ReturnType<express.Express["listen"]> | undefined;
  let base = "";
  beforeAll(async () => {
    process.env.SECURITY_MODE = "demo";
    const { setDefaultOrgId } = await import("../server/auth");
    setDefaultOrgId("org-default");
    const { default: router } = await import("../server/routes/output-contracts");
    const app = express(); app.use(express.json()); app.use(router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const row = (id: string, label: string, relationships: unknown[] = [], synonyms: string[] = []) => ({ id, industryId: "insurance", label, category: "Parties & Roles", relationships, synonyms, properties: [] });
    db.rows = [
      row("party-role", "Party Role", [{ predicate: "rolePlayedBy", targetId: "person" }]),
      row("person", "Person"),
      row("mortgagee", "Mortgagee", [{ predicate: "specializes", targetId: "party-role" }], ["Mortgage Holder"]),
      row("tpa", "Third-Party Administrator", [{ predicate: "specializes", targetId: "party-role" }], ["TPA"]),
      row("premium", "Premium", [{ type: "related", targetId: "party-role" }]),
    ];
  });
  afterAll(() => server?.close());
  const post = (body: unknown) => fetch(base + "/api/output-contracts/generate-from-ontology", { method: "POST", headers: { "content-type": "application/json", "x-role": "admin", "x-organization-id": "org-a" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json() }));

  it("takes the kinds under a concept from the far side's 'specializes' links, with their synonyms as aliases", async () => {
    const r = await post({ industryId: "insurance", fieldName: "role", relatedTo: { conceptId: "party-role", predicate: "specializedBy" } });
    expect(r.status).toBe(200);
    expect(r.json.schemaDefinition.properties.role.enum.sort()).toEqual(["Mortgagee", "Third-Party Administrator"]);
    expect(r.json.normalizers.some((n: any) => JSON.stringify(n).includes("tpa"))).toBe(true);
  });
  it("reads a link stored on the anchor itself, and ignores unrelated predicates", async () => {
    const r = await post({ industryId: "insurance", fieldName: "party", relatedTo: { conceptId: "party-role", predicate: "rolePlayedBy" } });
    expect(r.json.schemaDefinition.properties.party.enum).toEqual(["Person"]);
  });
  it("404s an unknown anchor and an empty neighbourhood", async () => {
    expect((await post({ industryId: "insurance", fieldName: "x", relatedTo: { conceptId: "nope", predicate: "contains" } })).status).toBe(404);
    expect((await post({ industryId: "insurance", fieldName: "x", relatedTo: { conceptId: "person", predicate: "contains" } })).status).toBe(404);
  });
  it("still answers the category and conceptIds selections as before", async () => {
    const r = await post({ industryId: "insurance", fieldName: "role", conceptIds: ["mortgagee", "premium"] });
    expect(r.json.schemaDefinition.properties.role.enum.sort()).toEqual(["Mortgagee", "Premium"]);
  });
});
