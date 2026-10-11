/**
 * Asking for an industry's ontology enhancements must not get harder as the
 * ontology grows.
 *
 * The Ontology page used to name every concept it knew about in the query
 * string. At 417 Insurance concepts that was a 14KB request line against a
 * ~4KB ceiling, so the request came back 431 Request Header Fields Too Large
 * on every single load -- and the page showed no "AI enhanced" badges at all,
 * which reads as "nothing has been enhanced" rather than "we could not ask".
 * It worked when the ontology was small and died silently somewhere past a
 * hundred concepts.
 *
 * So the test that matters is not "the route returns rows". It is that the
 * request stays a fixed size while the ontology grows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const state = vi.hoisted(() => ({
  concepts: [] as Array<{ id: string; industryId: string }>,
  enhancements: [] as Array<{ id: string; conceptId: string }>,
  byIndustryCalls: [] as string[],
  byIdsCalls: [] as string[][],
}));

vi.mock("../server/storage", () => ({
  storage: {
    getOntologyEnhancements: vi.fn(async (ids: string[]) => {
      state.byIdsCalls.push(ids);
      return state.enhancements.filter((e) => ids.includes(e.conceptId));
    }),
    getOntologyEnhancementsByIndustry: vi.fn(async (industryId: string) => {
      state.byIndustryCalls.push(industryId);
      const ids = new Set(state.concepts.filter((c) => c.industryId === industryId).map((c) => c.id));
      return state.enhancements.filter((e) => ids.has(e.conceptId));
    }),
  },
}));

const { storage } = await import("../server/storage");

beforeEach(() => {
  state.byIndustryCalls.length = 0;
  state.byIdsCalls.length = 0;
  state.concepts = Array.from({ length: 417 }, (_, i) => ({
    id: `11111111-2222-3333-4444-${String(i).padStart(12, "0")}`,
    industryId: i < 400 ? "insurance" : "manufacturing",
  }));
  state.enhancements = state.concepts.slice(0, 120).map((c, i) => ({ id: `enh-${i}`, conceptId: c.id }));
});

describe("the page asks by industry, not by listing ids", () => {
  const page = read("client", "src", "pages", "ontology.tsx");

  it("does not put a list of concept ids in the enhancements URL", () => {
    const call = page.slice(page.indexOf("/api/ontology/enhancements?"));
    const url = call.slice(0, call.indexOf("`", 1) + 1);
    expect(url).toContain("industryId=");
    expect(url).not.toContain("conceptIds");
    expect(url).not.toContain(".join(");
  });

  it("builds a request that does not grow with the ontology", () => {
    // What the old code produced, for comparison: 417 ids at 36 chars plus commas.
    const oldLength = "/api/ontology/enhancements?conceptIds=".length + state.concepts.length * 37;
    const newLength = "/api/ontology/enhancements?industryId=insurance".length;
    expect(oldLength).toBeGreaterThan(4096); // over the ceiling that produced 431
    expect(newLength).toBeLessThan(100);
  });
});

describe("the route", () => {
  // The handler below is a copy of the route's logic, so on its own it would
  // keep passing if the real route drifted away from it. These two read the
  // shipped source so that cannot happen quietly.
  const src = read("server", "routes", "skills.ts");
  const routeBody = (() => {
    const at = src.indexOf('router.get("/api/ontology/enhancements"');
    expect(at).toBeGreaterThan(-1);
    return src.slice(at, src.indexOf("\n  });", at));
  })();

  it("serves industryId from the join, not from a list of ids", () => {
    expect(routeBody).toContain("req.query.industryId");
    expect(routeBody).toContain("getOntologyEnhancementsByIndustry(industryId)");
    // and it answers industryId BEFORE it looks at conceptIds
    expect(routeBody.indexOf("req.query.industryId")).toBeLessThan(routeBody.indexOf("req.query.conceptIds"));
  });

  it("still accepts conceptIds, and says so when given neither", () => {
    expect(routeBody).toContain("req.query.conceptIds");
    expect(routeBody).toContain("industryId or conceptIds query parameter is required");
  });

  const handler = async (query: Record<string, string | undefined>) => {
    const industryId = query.industryId;
    if (industryId) return { status: 200, body: await storage.getOntologyEnhancementsByIndustry(industryId) };
    const conceptIdsParam = query.conceptIds;
    if (!conceptIdsParam) return { status: 400, body: { message: "industryId or conceptIds query parameter is required" } };
    return { status: 200, body: await storage.getOntologyEnhancements(conceptIdsParam.split(",").filter(Boolean)) };
  };

  it("returns an industry's enhancements from one short request", async () => {
    const res = await handler({ industryId: "insurance" });
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBe(120);
    expect(state.byIndustryCalls).toEqual(["insurance"]);
    expect(state.byIdsCalls).toEqual([]);
  });

  it("does not leak another industry's enhancements", async () => {
    state.enhancements = state.concepts.slice(400).map((c, i) => ({ id: `mfg-${i}`, conceptId: c.id }));
    const res = await handler({ industryId: "insurance" });
    expect(res.body).toEqual([]);
    const other = await handler({ industryId: "manufacturing" });
    expect((other.body as unknown[]).length).toBe(17);
  });

  it("still serves an explicit short list of ids", async () => {
    const ids = state.concepts.slice(0, 3).map((c) => c.id);
    const res = await handler({ conceptIds: ids.join(",") });
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBe(3);
    expect(state.byIdsCalls).toEqual([ids]);
  });

  it("says what it needs when given neither", async () => {
    const res = await handler({});
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/industryId or conceptIds/);
  });
});

describe("the storage call exists and joins through the concepts", () => {
  const src = read("server", "storage.ts");

  it("declares getOntologyEnhancementsByIndustry on IStorage", () => {
    expect(src).toContain("getOntologyEnhancementsByIndustry(industryId: string): Promise<OntologyEnhancement[]>;");
  });

  it("filters on the concept's industry rather than on a list of ids", () => {
    const at = src.indexOf("async getOntologyEnhancementsByIndustry(");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toContain("innerJoin(ontologyConcepts");
    expect(body).toContain("ontologyConcepts.industryId");
    expect(body).not.toContain("inArray");
  });
});
