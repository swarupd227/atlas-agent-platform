import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveRunModel, DEFAULT_RUN_MODEL } from "../server/run-model";

/**
 * executePromptWithMcp used to take its model only from its caller's options,
 * and ten request routes pass none, so an agent configured for Claude (or a
 * mini model) ran on openai/gpt-4.1 in the playground, the gateway, A2A, the
 * webhooks, the widget, replay and canary runs. It now falls back to the
 * agent's own model before the platform default.
 */

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("resolveRunModel", () => {
  const claudeAgent = { modelProvider: "anthropic", modelName: "claude-sonnet-4-5" };

  it("takes the caller's model over the agent's (a team worker passes its own agent's)", () => {
    expect(resolveRunModel({ modelProvider: "openai", modelName: "gpt-4.1-mini" }, claudeAgent))
      .toEqual({ provider: "openai", model: "gpt-4.1-mini", source: "caller" });
  });

  it("uses the agent's own provider and model when the caller names none", () => {
    expect(resolveRunModel({}, claudeAgent)).toEqual({ provider: "anthropic", model: "claude-sonnet-4-5", source: "agent" });
    expect(resolveRunModel(undefined, claudeAgent)).toEqual({ provider: "anthropic", model: "claude-sonnet-4-5", source: "agent" });
  });

  it("falls back to the platform default only when neither names one", () => {
    expect(resolveRunModel(undefined, null)).toEqual({ ...DEFAULT_RUN_MODEL, source: "default" });
    expect(resolveRunModel({}, { modelProvider: null, modelName: null })).toEqual({ ...DEFAULT_RUN_MODEL, source: "default" });
  });

  it("never pairs a caller's provider with the agent's model", () => {
    // The provider layer then swaps in that provider's own default model.
    expect(resolveRunModel({ modelProvider: "openai" }, claudeAgent))
      .toEqual({ provider: "openai", model: DEFAULT_RUN_MODEL.model, source: "caller" });
  });

  it("treats blank values as unset", () => {
    expect(resolveRunModel({ modelProvider: "  ", modelName: "" }, claudeAgent).source).toBe("agent");
    expect(resolveRunModel(undefined, { modelProvider: " ", modelName: " " }).source).toBe("default");
    expect(resolveRunModel(undefined, { modelProvider: " anthropic ", modelName: " claude-haiku-4-5 " }))
      .toEqual({ provider: "anthropic", model: "claude-haiku-4-5", source: "agent" });
  });
});

describe("executePromptWithMcp asks for the agent's own model", () => {
  const src = read("server", "agent-runtime.ts");
  const start = src.indexOf("export async function executePromptWithMcp(");
  const end = src.indexOf("\nexport ", start + 1);
  const body = src.slice(start, end);

  it("is found", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
  });

  it("no longer defaults a caller with no model straight to gpt-4.1", () => {
    expect(body).not.toContain('options?.modelName || "gpt-4.1"');
    expect(body).not.toContain('options?.modelProvider || "openai"');
  });

  it("resolves the model from the caller's options and the agent row it loaded", () => {
    const loaded = body.indexOf("agentModel = agentRec");
    const resolved = body.indexOf("resolveRunModel(options, agentModel)");
    expect(loaded, "the agent row's model is kept").toBeGreaterThanOrEqual(0);
    expect(resolved, "the model is resolved through resolveRunModel").toBeGreaterThanOrEqual(0);
    expect(loaded).toBeLessThan(resolved);
  });
});
