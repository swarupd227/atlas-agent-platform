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
    expect(resolveIndustrySelection({ requested: "Insurance", tenantIndustryId: "insurance", tenantSubVertical: "life" })).toEqual({ industryId: "Insurance", subVertical: "life", source: "request" });
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
