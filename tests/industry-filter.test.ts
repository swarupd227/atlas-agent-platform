/**
 * shared/industry-filter.ts: which industry applies, and what an industry filter keeps.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BUILT_IN_INDUSTRY_IDS,
  filterByIndustry,
  industryMatches,
  isKnownIndustry,
  pickAgentIndustry,
  resolveIndustrySelection,
} from "../shared/industry-filter";

describe("resolveIndustrySelection", () => {
  it("uses the organization's industry when nothing is requested", () => {
    expect(resolveIndustrySelection({ tenantIndustryId: "insurance", tenantSubVertical: "life" })).toEqual({ industryId: "insurance", subVertical: "life", source: "tenant" });
  });

  it("lets an explicit request win, and drops the organization's sub-vertical when the industry differs", () => {
    expect(resolveIndustrySelection({ requested: "healthcare", tenantIndustryId: "insurance", tenantSubVertical: "life" })).toEqual({ industryId: "healthcare", subVertical: null, source: "request" });
    expect(resolveIndustrySelection({ requested: "healthcare", requestedSubVertical: "hospital" })).toEqual({ industryId: "healthcare", subVertical: "hospital", source: "request" });
  });

  it("treats a request for the organization's own industry as the organization's", () => {
    expect(resolveIndustrySelection({ requested: "Insurance", tenantIndustryId: "insurance", tenantSubVertical: "life" })).toEqual({ industryId: "insurance", subVertical: "life", source: "tenant" });
    expect(resolveIndustrySelection({ requested: "insurance", requestedSubVertical: "p&c", tenantIndustryId: "insurance", tenantSubVertical: "life" })).toMatchObject({ subVertical: "p&c", source: "tenant" });
  });

  it("says none when neither is set", () => {
    expect(resolveIndustrySelection({ requested: "  " })).toEqual({ industryId: null, subVertical: null, source: "none" });
  });
});

describe("industry filtering", () => {
  const rows = [
    { name: "Claims triage", industry: "insurance" },
    { name: "Generic summarizer", industry: "cross_industry" },
    { name: "Old default", industry: "general" },
    { name: "Untagged", industry: null },
    { name: "Patient intake", industry: "healthcare" },
  ];

  it("keeps the industry's own rows and every general-purpose row, case-insensitively", () => {
    expect(filterByIndustry(rows, "INSURANCE", (r) => r.industry).map((r) => r.name)).toEqual(["Claims triage", "Generic summarizer", "Old default", "Untagged"]);
  });

  it("doesn't filter when nothing, custom or cross-industry is requested", () => {
    for (const wanted of [null, "", "custom", "cross_industry"]) {
      expect(filterByIndustry(rows, wanted, (r) => r.industry)).toHaveLength(rows.length);
    }
  });

  it("an unknown industry keeps only general-purpose rows", () => {
    expect(industryMatches("insurance", "aerospace")).toBe(false);
    expect(industryMatches("general", "aerospace")).toBe(true);
  });
});

describe("pickAgentIndustry", () => {
  it("prefers the agent's own industry, then the organization's", () => {
    expect(pickAgentIndustry({ agentIndustryId: "retail", tenantIndustryId: "insurance", deploymentIndustry: "healthcare" })).toBe("retail");
    expect(pickAgentIndustry({ tenantIndustryId: "insurance", deploymentIndustry: "healthcare" })).toBe("insurance");
  });

  it("ignores a deployment industry that isn't a real one (like the old 'technology' default)", () => {
    expect(pickAgentIndustry({ deploymentIndustry: "technology" })).toBeNull();
    expect(pickAgentIndustry({ deploymentIndustry: "healthcare" })).toBe("healthcare");
  });
});

describe("known industries", () => {
  it("include the built-ins and the industry packs", () => {
    expect(isKnownIndustry("insurance")).toBe(true);
    expect(isKnownIndustry("equipment_dealer")).toBe(true);
    expect(isKnownIndustry("technology")).toBe(false);
  });

  it("match the client's built-in list exactly", () => {
    const src = readFileSync(join(__dirname, "..", "client", "src", "components", "industry-provider.tsx"), "utf8");
    const block = /export const BUILT_IN_INDUSTRY_IDS = \[([\s\S]*?)\] as const;/.exec(src)![1];
    const clientIds = Array.from(block.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
    expect(clientIds).toEqual([...BUILT_IN_INDUSTRY_IDS]);
  });
});

describe("adopting the organization's industry in a browser", () => {
  it("adopts it in a fresh browser and in one left on another industry", async () => {
    const { industryToAdopt } = await import("../shared/industry-filter");
    expect(industryToAdopt({ tenantIndustryId: "insurance", localIndustryId: null })).toBe("insurance");
    expect(industryToAdopt({ tenantIndustryId: "insurance", localIndustryId: "healthcare" })).toBe("insurance");
  });

  it("leaves a deliberate personal view, an already-matching browser, and a person choosing a new one alone", async () => {
    const { industryToAdopt } = await import("../shared/industry-filter");
    expect(industryToAdopt({ tenantIndustryId: "insurance", localIndustryId: "healthcare", personalIndustryId: "healthcare" })).toBeNull();
    expect(industryToAdopt({ tenantIndustryId: "insurance", localIndustryId: "insurance" })).toBeNull();
    expect(industryToAdopt({ tenantIndustryId: "insurance", localIndustryId: null, choosing: true })).toBeNull();
    expect(industryToAdopt({ tenantIndustryId: null, localIndustryId: "retail" })).toBeNull();
  });

  it("names where the industry comes from", async () => {
    const { industrySourceOf } = await import("../shared/industry-filter");
    expect(industrySourceOf("insurance", "insurance")).toBe("tenant");
    expect(industrySourceOf("healthcare", "insurance")).toBe("local");
    expect(industrySourceOf("healthcare", null)).toBe("local");
    expect(industrySourceOf(null, "insurance")).toBe("none");
  });
});

describe("catalogue filtering by ?industryId=", () => {
  it("keeps integrations tagged to the industry and every untagged one; no parameter changes nothing", async () => {
    const { filterByIndustries, industryQuery } = await import("../shared/industry-filter");
    const defs = [{ id: "sap" }, { id: "epic", industries: ["healthcare"] }, { id: "dealer-dms", industries: ["equipment_dealer", "manufacturing"] }];
    expect(filterByIndustries(defs, "manufacturing", (d) => d.industries).map((d) => d.id)).toEqual(["sap", "dealer-dms"]);
    expect(filterByIndustries(defs, industryQuery(undefined), (d) => d.industries)).toBe(defs);
    expect(industryQuery(["a"])).toBeNull();
    expect(industryQuery(" insurance ")).toBe("insurance");
  });
});
