/**
 * Decision routing settings (server/decision-settings.ts): platform settings
 * rows decide the mode, a site override narrows it, and an organization's
 * residency flag wins over both. The environment only seeds a deployment that
 * has no settings row yet.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const settings = new Map<string, string>();
const orgs = new Map<string, { workspaceConfig?: Record<string, unknown> }>();

vi.mock("../server/storage", () => ({
  storage: {
    getPlatformSetting: vi.fn(async (key: string) => (settings.has(key) ? { key, value: settings.get(key) } : undefined)),
    getOrganization: vi.fn(async (id: string) => orgs.get(id)),
  },
}));

import { getDecisionSettings, resolveDecisionRoute, invalidateDecisionSettingsCache, validateDecisionSetting, DEFAULT_THRESHOLDS } from "../server/decision-settings";

beforeEach(() => {
  settings.clear();
  orgs.clear();
  delete process.env.DECISION_PROVIDER;
  invalidateDecisionSettingsCache();
});

describe("getDecisionSettings", () => {
  it("defaults to llm with the measured thresholds and the step kind off", async () => {
    const s = await getDecisionSettings();
    expect(s.mode).toBe("llm");
    expect(s.thresholds).toEqual(DEFAULT_THRESHOLDS);
    expect(s.stepKind).toBe(false);
    expect(s.siteOverrides).toEqual({});
  });

  it("takes the environment as the bootstrap default when no settings row exists", async () => {
    process.env.DECISION_PROVIDER = "shadow";
    expect((await getDecisionSettings()).mode).toBe("shadow");
  });

  it("prefers the platform setting over the environment", async () => {
    process.env.DECISION_PROVIDER = "shadow";
    settings.set("DECISION_PROVIDER", "jev");
    expect((await getDecisionSettings()).mode).toBe("jev");
  });

  it("ignores an unknown mode and malformed JSON rather than failing", async () => {
    settings.set("DECISION_PROVIDER", "gpt");
    settings.set("DECISION_THRESHOLDS", "{not json");
    settings.set("DECISION_SITE_OVERRIDES", "[1,2]");
    const s = await getDecisionSettings();
    expect(s.mode).toBe("llm");
    expect(s.thresholds).toEqual(DEFAULT_THRESHOLDS);
    expect(s.siteOverrides).toEqual({});
  });

  it("parses thresholds and keeps act at or above review", async () => {
    settings.set("DECISION_THRESHOLDS", JSON.stringify({ review: 0.7, act: 0.5 }));
    expect((await getDecisionSettings()).thresholds).toEqual({ review: 0.7, act: 0.7 });
  });

  it("parses site overrides in both the short and the long form", async () => {
    settings.set("DECISION_SITE_OVERRIDES", JSON.stringify({ evaluateCondition: "jev", handoff: { mode: "jev", threshold: 0.9 }, junk: "nope" }));
    const s = await getDecisionSettings();
    expect(s.siteOverrides).toEqual({ evaluateCondition: { mode: "jev" }, handoff: { mode: "jev", threshold: 0.9 } });
  });

  it("caches for the window and re-reads after invalidation", async () => {
    settings.set("DECISION_PROVIDER", "jev");
    expect((await getDecisionSettings()).mode).toBe("jev");
    settings.set("DECISION_PROVIDER", "llm");
    expect((await getDecisionSettings()).mode).toBe("jev");
    invalidateDecisionSettingsCache();
    expect((await getDecisionSettings()).mode).toBe("llm");
  });
});

describe("resolveDecisionRoute", () => {
  it("uses the platform mode and act threshold by default", async () => {
    settings.set("DECISION_PROVIDER", "jev");
    expect(await resolveDecisionRoute("evaluateCondition")).toEqual({ mode: "jev", threshold: 0.85, reason: "platform" });
  });

  it("lets a site override change the mode and the threshold", async () => {
    settings.set("DECISION_PROVIDER", "shadow");
    settings.set("DECISION_SITE_OVERRIDES", JSON.stringify({ handoff: { mode: "jev", threshold: 0.9 } }));
    expect(await resolveDecisionRoute("handoff")).toEqual({ mode: "jev", threshold: 0.9, reason: "site_override" });
    expect((await resolveDecisionRoute("evaluateCondition")).mode).toBe("shadow");
  });

  it("makes the platform's llm a kill switch that no site override outranks", async () => {
    // The rollout drill (2026-09-29) set the platform to llm with the condition
    // site overridden to jev, and the override won: the kill switch was not one.
    settings.set("DECISION_PROVIDER", "llm");
    settings.set("DECISION_SITE_OVERRIDES", JSON.stringify({ evaluateCondition: "jev", handoff: { mode: "jev", threshold: 0.9 } }));
    expect(await resolveDecisionRoute("evaluateCondition")).toEqual({ mode: "llm", threshold: 0.85, reason: "platform" });
    expect(await resolveDecisionRoute("handoff")).toEqual({ mode: "llm", threshold: 0.85, reason: "platform" });
  });

  it("forces llm for an organization that forbids US processing, over any override", async () => {
    settings.set("DECISION_PROVIDER", "jev");
    settings.set("DECISION_SITE_OVERRIDES", JSON.stringify({ evaluateCondition: "jev" }));
    orgs.set("org-eu", { workspaceConfig: { decisionResidency: "no_us" } });
    orgs.set("org-us", { workspaceConfig: {} });
    expect(await resolveDecisionRoute("evaluateCondition", "org-eu")).toEqual({ mode: "llm", threshold: 0.85, reason: "residency" });
    expect((await resolveDecisionRoute("evaluateCondition", "org-us")).mode).toBe("jev");
    expect((await resolveDecisionRoute("evaluateCondition", null)).mode).toBe("jev");
  });

  it("treats an organization with nothing set as allowed", async () => {
    settings.set("DECISION_PROVIDER", "jev");
    orgs.set("org-blank", {});
    expect((await resolveDecisionRoute("handoff", "org-blank")).mode).toBe("jev");
  });

  it("keeps a second-opinion site in shadow under a jev platform, and llm under the kill switch", async () => {
    settings.set("DECISION_PROVIDER", "jev");
    expect(await resolveDecisionRoute("redteam_judge")).toEqual({ mode: "shadow", threshold: 0.85, reason: "second_opinion" });
    expect(await resolveDecisionRoute("approval_risk")).toEqual({ mode: "shadow", threshold: 0.85, reason: "second_opinion" });
    expect((await resolveDecisionRoute("evaluateCondition")).mode).toBe("jev");
    settings.set("DECISION_PROVIDER", "llm");
    invalidateDecisionSettingsCache();
    expect((await resolveDecisionRoute("redteam_judge")).mode).toBe("llm");
  });

  it("ignores an override that names a second-opinion site, however it got written", async () => {
    settings.set("DECISION_PROVIDER", "shadow");
    settings.set("DECISION_SITE_OVERRIDES", JSON.stringify({ redteam_judge: "jev", approval_risk: { mode: "jev", threshold: 0.5 }, handoff: "jev" }));
    const s = await getDecisionSettings();
    expect(s.siteOverrides).toEqual({ handoff: { mode: "jev" } });
    expect(await resolveDecisionRoute("redteam_judge")).toEqual({ mode: "shadow", threshold: 0.85, reason: "platform" });
  });
});

describe("validateDecisionSetting", () => {
  it("refuses an override naming a second-opinion site and says which", () => {
    expect(validateDecisionSetting("DECISION_SITE_OVERRIDES", JSON.stringify({ redteam_judge: "jev" }))).toBe("redteam_judge is second-opinion only and cannot be routed; remove it from DECISION_SITE_OVERRIDES");
    expect(validateDecisionSetting("DECISION_SITE_OVERRIDES", JSON.stringify({ redteam_judge: "jev", approval_risk: "shadow", handoff: "jev" }))).toBe("redteam_judge, approval_risk are second-opinion only and cannot be routed; remove them from DECISION_SITE_OVERRIDES");
  });

  it("accepts every other value, including ones the parser will ignore", () => {
    expect(validateDecisionSetting("DECISION_SITE_OVERRIDES", JSON.stringify({ evaluateCondition: "jev" }))).toBeNull();
    expect(validateDecisionSetting("DECISION_SITE_OVERRIDES", "not json")).toBeNull();
    expect(validateDecisionSetting("DECISION_PROVIDER", "jev")).toBeNull();
  });
});
