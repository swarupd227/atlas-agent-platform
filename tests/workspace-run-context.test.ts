/**
 * "What it knew": a Workspace run records what it put in front of the model
 * (server/workspace-run.ts measureContextUsage), the trace carries it in the
 * shape the Context Profile tab reads, and run_agent's proof reports it as
 * measured instead of "not measured".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { measureContextUsage } from "../server/workspace-run";
import { contextProof, runArtifact } from "../server/astra/tools/run-agent";

const base = { instructions: "", knowledge: "", skillCatalog: "", request: "", attachments: "", brandAssets: "", knowledgeSearched: 0, retrievals: [] };

describe("measureContextUsage", () => {
  it("estimates tokens per layer and leaves out empty layers", () => {
    const usage = measureContextUsage({ ...base, instructions: "x".repeat(400), request: "abcde", knowledge: "k".repeat(81) });
    expect(usage.layers).toEqual([
      { layer: "system_prompt", tokens: 100 },
      { layer: "kb_retrieval", tokens: 21 },
      { layer: "task_prompt", tokens: 2 },
    ]);
    expect(usage.totalTokens).toBe(123);
  });

  it("keeps what each knowledge base contributed", () => {
    const retrievals = [{ knowledgeBaseId: "kb-1", name: "Warranty terms", passages: 3, tokens: 40, topSimilarity: 0.82 }];
    expect(measureContextUsage({ ...base, knowledgeSearched: 2, retrievals })).toMatchObject({ knowledgeSearched: 2, knowledge: retrievals });
  });
});

describe("contextProof", () => {
  const layers = [{ layer: "system_prompt", tokens: 1200 }];
  it("says which knowledge the run used", () => {
    expect(contextProof({ layers, totalTokens: 1540, knowledgeSearched: 2, knowledge: [
      { knowledgeBaseId: "kb-1", name: "Warranty terms", passages: 3, tokens: 200, topSimilarity: 0.8 },
      { knowledgeBaseId: "kb-2", name: null, passages: 2, tokens: 140, topSimilarity: null },
    ] })).toEqual({ status: "measured", summary: "1,540 tokens of context · 5 passages from 2 knowledge bases" });
  });

  it("is honest when nothing was linked, nothing matched, or nothing was recorded", () => {
    expect(contextProof({ layers, totalTokens: 1200, knowledgeSearched: 0, knowledge: [] })).toMatchObject({ summary: expect.stringContaining("no knowledge base linked") });
    expect(contextProof({ layers, totalTokens: 1200, knowledgeSearched: 1, knowledge: [] })).toMatchObject({ summary: expect.stringContaining("1 knowledge base searched, nothing relevant found") });
    expect(contextProof(null)).toMatchObject({ status: "not_measured" });
    expect(contextProof(undefined)).toMatchObject({ status: "not_measured" });
  });

  it("puts the measurement on the run card", () => {
    const context = { layers, totalTokens: 1200, knowledgeSearched: 0, knowledge: [] };
    const run = { id: "r1", agentId: "a1", status: "completed", requestText: "hi", outputSummary: "ok", costUsd: 0, traceId: null, pending: null, steps: [], context };
    expect(runArtifact(run, "Agent").props.context).toEqual(context);
  });
});

describe("workspace run wiring", () => {
  const src = readFileSync(join(__dirname, "..", "server", "workspace-run.ts"), "utf8").replace(/\r\n/g, "\n");
  it("measures the context at start and stores it on the checkpoint", () => {
    expect(src).toContain("contextUsage: measureContextUsage({");
    expect(src).toContain("const systemMessageWithKb = baseSystemMessage + kbContext.section;");
  });
  it("records contextLayerUsage on the trace in the runtime's shape", () => {
    expect(src).toContain("contextLayerUsage: cp.contextUsage.layers.map(l => ({ layer: l.layer, tokensUsed: l.tokens, budgetAllocated: null }))");
    expect(src).toContain("context: cp?.contextUsage ?? null,");
  });
});
