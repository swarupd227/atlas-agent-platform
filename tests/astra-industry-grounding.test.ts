/**
 * Astra grounds on the organization's industry (E-UX6): the prompt says whose
 * industry it is, and get_industry_context reports where it came from.
 */
import { describe, it, expect } from "vitest";
import { industryGroundingLine } from "../server/astra/prompt";
import { getIndustryContextTool } from "../server/astra/tools/get-industry-context";
import type { AstraContext, AstraToolContext } from "../server/astra/types";

const base: AstraContext = { orgId: "org-a", userId: "u1", role: "admin" };

describe("industryGroundingLine", () => {
  it("states the organization's industry as a fact about the organization", () => {
    const line = industryGroundingLine(
      { ...base, industryId: "equipment_dealer", subVertical: "Construction", industrySource: "tenant", organizationIndustryId: "equipment_dealer" },
      { organizationName: "Summit Equipment", industryLabel: "Equipment Dealers & Distribution", industryHighlights: ["ASC 606"] },
    );
    expect(line).toBe("Summit Equipment works in Equipment Dealers & Distribution (Construction). Relevant context: ASC 606.");
  });

  it("calls a different industry a personal view and names the organization's", () => {
    const line = industryGroundingLine(
      { ...base, industryId: "healthcare", industrySource: "request", organizationIndustryId: "insurance" },
      { organizationName: "Summit", industryLabel: "Healthcare", organizationIndustryLabel: "Insurance" },
    );
    expect(line).toContain("The user is viewing Healthcare for themselves.");
    expect(line).toContain("Summit's own industry is Insurance");
  });

  it("says a viewed industry isn't the organization's when the organization has none", () => {
    const line = industryGroundingLine({ ...base, industryId: "retail", industrySource: "request" }, { organizationName: "Summit", industryLabel: "Retail" });
    expect(line).toContain("No industry has been set for Summit.");
  });

  it("says the organization has no industry rather than implying a personal setting", () => {
    const line = industryGroundingLine({ ...base, industrySource: "none" }, { organizationName: "Summit" });
    expect(line).toMatch(/^No industry has been set for Summit/);
    expect(line).not.toMatch(/selected for this user/);
  });
});

describe("get_industry_context reports the source", () => {
  const pack = { selected: true, industryId: "insurance", pack: true, label: "Insurance", description: "d", ontology: "ACORD", regulatoryFrameworks: ["NAIC"], subVerticals: [], policyPacks: [] };
  const ctx = (over: Partial<AstraContext>, context: any): AstraToolContext =>
    ({ ...base, threadId: "t1", services: { getIndustryContext: async () => context } as any, ...over }) as AstraToolContext;

  it("the organization's industry", async () => {
    const out = await getIndustryContextTool.run(ctx({ industryId: "insurance", industrySource: "tenant", organizationIndustryId: "insurance" }, pack), {});
    expect(out.payload).toMatchObject({ source: "organization", organizationIndustryId: "insurance", label: "Insurance" });
    expect((out.proof!.industry as any).summary).not.toContain("personal view");
  });

  it("a personal view", async () => {
    const out = await getIndustryContextTool.run(ctx({ industryId: "insurance", industrySource: "request", organizationIndustryId: "healthcare" }, pack), {});
    expect(out.payload).toMatchObject({ source: "personal_view", organizationIndustryId: "healthcare" });
    expect((out.proof!.industry as any).summary).toContain("personal view");
  });

  it("a built-in industry: its profile, measured, and honest that it has no policy packs", async () => {
    const builtIn = { selected: true, industryId: "manufacturing", pack: false, builtIn: true, label: "Manufacturing & Supply Chain", description: "d", ontology: "ISA-95", regulatoryFrameworks: ["ISO 9001", "REACH"], subVerticals: ["Automotive"], policyPacks: [] };
    const out = await getIndustryContextTool.run(ctx({ industryId: "manufacturing", industrySource: "tenant", organizationIndustryId: "manufacturing" }, builtIn), {});
    expect(out.payload).toMatchObject({ label: "Manufacturing & Supply Chain", source: "organization", regulatoryFrameworks: ["ISO 9001", "REACH"] });
    expect(out.proof!.industry).toMatchObject({ status: "measured", summary: expect.stringContaining("built-in profile, no policy packs") });
  });

  it("nothing set", async () => {
    const out = await getIndustryContextTool.run(ctx({ industrySource: "none" }, { selected: false }), {});
    expect(out.payload).toMatchObject({ selected: false, source: "none", message: expect.stringContaining("No industry has been set for this organization") });
    expect(out.proof!.industry).toMatchObject({ status: "not_measured" });
  });
});
