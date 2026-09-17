/**
 * shared/wizard-presets.ts: the dynamic-presets tables, moved out of
 * server/routes/runtime.ts and merged with the industry packs.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  BUILT_IN_CONTEXT_PRIORITY,
  BUILT_IN_WIZARD_CONTEXT,
  BUILT_IN_WIZARD_PRESETS,
  DEFAULT_CONTEXT_PRIORITY,
  DEFAULT_WIZARD_PRESET,
  contextPriorityFor,
  wizardContextFor,
  wizardPresetFor,
} from "../shared/wizard-presets";
import { packWizardContexts, packWizardPresets } from "../shared/industry-packs";

describe("wizard presets", () => {
  it("keeps the five built-in verticals exactly as they were in runtime.ts", () => {
    const json = JSON.stringify({ STATIC_PRESETS: BUILT_IN_WIZARD_PRESETS, STATIC_CONTEXT: BUILT_IN_WIZARD_CONTEXT, STATIC_PRIORITY: BUILT_IN_CONTEXT_PRIORITY });
    // sha256 of the three tables as committed before the move (d7f1e56).
    expect(createHash("sha256").update(json).digest("hex")).toBe("2774f4c062ca60f5d846f8dce077cde5a6a8e588106ed56a60d1ff211f0d7353");
    expect(wizardPresetFor("healthcare")).toBe(BUILT_IN_WIZARD_PRESETS.healthcare);
  });

  it("returns an industry pack's presets for a pack industry", () => {
    const id = Object.keys(packWizardPresets)[0];
    expect(id).toBeTruthy();
    const preset = wizardPresetFor(id);
    expect(preset.stopConditions).toEqual(packWizardPresets[id].stopConditions);
    expect(preset).not.toHaveProperty("label");
    expect(wizardContextFor(id).recommendedModel.model).toBe(packWizardContexts[id].recommendedModel.model);
  });

  it("gives a pack industry the default context priority rather than an invented one, and unknown industries the defaults", () => {
    expect(contextPriorityFor(Object.keys(packWizardPresets)[0])).toEqual(DEFAULT_CONTEXT_PRIORITY);
    expect(wizardPresetFor("aerospace")).toBe(DEFAULT_WIZARD_PRESET);
  });

  it("runtime.ts no longer calls the storage method that doesn't exist", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync(`${__dirname}/../server/routes/runtime.ts`, "utf8");
    expect(src).not.toContain("getOutcomeContract(");
    expect(src).toContain("storage.getOutcome(outcomeId, getOrgId(req))");
  });
});
