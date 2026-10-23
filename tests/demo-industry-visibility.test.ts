import { describe, expect, it } from "vitest";
import { demoIndustryAssignmentSchema, visibleDemoIndustries, demoIndustrySelection, demoIndustryFormValue } from "../shared/demo-industry-visibility";

const industries = [{ id: "manufacturing" }, { id: "financial_services" }, { id: "custom" }];
const visibility = { enabled: true, canManage: false, configured: true, allowedIndustryIds: ["manufacturing", "custom"], defaultIndustryId: "manufacturing" };

describe("demo industry visibility", () => {
  it("reconciles a form's hidden industry to the visible default, including legacy aliases", () => {
    expect(demoIndustryFormValue("financial_services", ["manufacturing"], "manufacturing")).toBe("manufacturing");
    expect(demoIndustryFormValue("general", ["manufacturing"], "manufacturing")).toBe("manufacturing");
    expect(demoIndustryFormValue("cross_industry", ["manufacturing", "custom"], "manufacturing")).toBe("cross_industry");
    expect(demoIndustryFormValue("all", ["manufacturing"], "manufacturing", { includeAll: true })).toBe("all");
    expect(demoIndustryFormValue("custom", ["custom"], "custom")).toBe("cross_industry");
    expect(demoIndustryFormValue("custom", ["manufacturing", "custom"], "custom", { excludeCrossIndustry: true })).toBe("manufacturing");
    expect(demoIndustryFormValue("all", ["manufacturing"], "manufacturing")).toBe("manufacturing");
    expect(demoIndustryFormValue("financial_services", [], null)).toBeNull();
  });
  it("gives each demo user only their assigned options", () => {
    expect(visibleDemoIndustries(industries, visibility).map(i => i.id)).toEqual(["manufacturing", "custom"]);
    expect(visibleDemoIndustries(industries, { ...visibility, allowedIndustryIds: ["financial_services", "custom"], defaultIndustryId: "financial_services" }).map(i => i.id)).toEqual(["financial_services", "custom"]);
  });
  it("keeps all options for administrators and when the demo is disabled", () => {
    expect(visibleDemoIndustries(industries, { ...visibility, canManage: true })).toEqual(industries);
    expect(visibleDemoIndustries(industries, { ...visibility, enabled: false })).toEqual(industries);
  });
  it("does not flash the full catalog while loading or when unconfigured", () => {
    expect(visibleDemoIndustries(industries, undefined)).toEqual([]);
    expect(visibleDemoIndustries(industries, { ...visibility, configured: false })).toEqual([]);
  });
  it("replaces another user's stale selection with the assigned default", () => {
    expect(demoIndustrySelection("financial_services", visibility, industries)).toBe("manufacturing");
    expect(demoIndustrySelection("custom", visibility, industries)).toBe("custom");
    expect(demoIndustrySelection("manufacturing", { ...visibility, configured: false }, industries)).toBeNull();
  });
  it("validates known industries, nonempty choices, and an included default", () => {
    expect(demoIndustryAssignmentSchema.safeParse({ clientLabel: "Hilti", allowedIndustryIds: [], defaultIndustryId: "manufacturing" }).success).toBe(false);
    expect(demoIndustryAssignmentSchema.safeParse({ clientLabel: "Hilti", allowedIndustryIds: ["invented"], defaultIndustryId: "invented" }).success).toBe(false);
    expect(demoIndustryAssignmentSchema.safeParse({ clientLabel: "Hilti", allowedIndustryIds: ["manufacturing"], defaultIndustryId: "custom" }).success).toBe(false);
    expect(demoIndustryAssignmentSchema.parse({ clientLabel: " Hilti ", allowedIndustryIds: ["manufacturing", "cross_industry", "custom"], defaultIndustryId: "cross_industry" })).toEqual({ clientLabel: "Hilti", allowedIndustryIds: ["manufacturing", "custom"], defaultIndustryId: "custom" });
  });
});
