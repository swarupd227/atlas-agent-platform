/**
 * evaluateCondition (server/agent-runtime.ts) after the decision seam: an
 * arithmetic condition is answered by the rule evaluator when the output
 * carries the field, and no model of any kind is consulted; everything else
 * goes to decide() with the site, the organization and the exact prompt the
 * incumbent model has always seen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const decideMock = vi.fn(async () => ({ kind: "noul", answer: true, confidence: 0.9, engine: "jev", mode: "jev", model: "jev", latencyMs: 1, inputTokens: 1, costUsd: 0 }));
vi.mock("../server/decision-provider", () => ({ decide: (req: unknown) => decideMock(req as any) }));
// agent-runtime pulls in the whole runtime; these keep the import cheap and offline.
vi.mock("../server/embeddings", () => ({ searchKnowledgeBaseChunks: vi.fn(), generateEmbeddings: vi.fn(), isPgvectorAvailable: vi.fn(async () => false) }));
vi.mock("../server/db", () => ({ db: { execute: vi.fn() }, pool: {} }));

import { evaluateCondition } from "../server/agent-runtime";

beforeEach(() => decideMock.mockClear());

describe("evaluateCondition", () => {
  it("answers a comparison from the output's own field without any model call", async () => {
    expect(await evaluateCondition("riskScore > 70", JSON.stringify({ riskScore: 82 }))).toBe(true);
    expect(await evaluateCondition("riskScore > 70", JSON.stringify({ riskScore: 12 }))).toBe(false);
    expect(decideMock).not.toHaveBeenCalled();
  });

  it("goes to the seam when the output does not carry the field", async () => {
    expect(await evaluateCondition("riskScore > 70", JSON.stringify({ score: 82 }))).toBe(true);
    expect(decideMock).toHaveBeenCalledTimes(1);
  });

  it("sends a judgment condition to the seam with site, org and the byte-identical incumbent prompt", async () => {
    await evaluateCondition("the carrier approved the breach exception", "Carrier: approved with conditions.", { orgId: "org-1" });
    const req = decideMock.mock.calls[0][0] as any;
    expect(req.kind).toBe("noul");
    expect(req.site).toBe("evaluateCondition");
    expect(req.orgId).toBe("org-1");
    expect(req.llmPrompt).toBe(`You are evaluating a pipeline routing condition.\n\nCondition: "the carrier approved the breach exception"\n\nWorker output:\nCarrier: approved with conditions.\n\nRespond with ONLY "true" or "false".`);
    expect(req.state).toEqual({ condition: "the carrier approved the breach exception", worker_output: "Carrier: approved with conditions." });
  });

  it("labels a replayed pair with the caller's site", async () => {
    await evaluateCondition("approved", "yes", { shadowSite: "evaluateCondition:replay" });
    expect((decideMock.mock.calls[0][0] as any).site).toBe("evaluateCondition:replay");
  });

  it("defaults open when the seam throws, as before", async () => {
    decideMock.mockRejectedValueOnce(new Error("down"));
    expect(await evaluateCondition("approved", "no idea")).toBe(true);
  });

  it("treats an empty condition as satisfied without asking anyone", async () => {
    expect(await evaluateCondition("  ", "anything")).toBe(true);
    expect(decideMock).not.toHaveBeenCalled();
  });
});
