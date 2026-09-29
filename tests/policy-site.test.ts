/**
 * The soft-policy judge through the decision seam (Phase 2, item 3).
 *
 * checkSoftPolicyCompliance asks one "violates?" question per policy and a
 * severity only for a policy found violated, with no level 0. The incumbent's
 * batched prompt is unchanged: it answers everything on the llm and shadow
 * routes and only the unsure policies on the jev route, in one call, and its
 * evidence is what the result carries wherever it answered. The result shape
 * and every reader are as before; a malformed incumbent reply still means null.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const route = { mode: "llm" as "llm" | "shadow" | "jev", threshold: 0.85, reason: "platform" as const };
const jevAnswers: Array<Record<string, unknown>> = [];
const audits: Record<string, unknown>[] = [];
const llmReplies: string[] = [];
const llmCalls: string[] = [];

vi.mock("../server/decision-settings", () => ({ resolveDecisionRoute: vi.fn(async () => ({ ...route })) }));
vi.mock("../server/decision-shadow", () => ({
  callJev: vi.fn(async () => {
    const next = jevAnswers.shift();
    if (!next) throw new Error("no jev answer queued");
    return { response: { model: "jev-1.13.0", answers: next, usage: { input_tokens: 700, output_tokens: 0 } }, latencyMs: 210 };
  }),
  recordDecisionAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
  shadowSoftPolicyCompliance: vi.fn(),
  shadowEvaluateCondition: vi.fn(),
}));
vi.mock("../server/llm-provider", () => ({
  completeWithFallback: vi.fn(async (messages: Array<{ content: string }>) => {
    llmCalls.push(messages[0].content);
    return { content: llmReplies.shift() ?? "{}", tokensUsed: { prompt: 1200, completion: 80, total: 1280 }, costUsd: 0.004, actualModel: "gpt-4.1", toolCalls: [] };
  }),
}));
// agent-runtime pulls in the whole runtime; these keep the import cheap and offline.
vi.mock("../server/embeddings", () => ({ searchKnowledgeBaseChunks: vi.fn(), generateEmbeddings: vi.fn(), isPgvectorAvailable: vi.fn(async () => false) }));
vi.mock("../server/db", () => ({ db: { execute: vi.fn() }, pool: {} }));

import { checkSoftPolicyCompliance } from "../server/agent-runtime";
import { callJev, recordDecisionAudit } from "../server/decision-shadow";
import { completeWithFallback } from "../server/llm-provider";

const policies = [
  { id: "pol-fee", name: "Broker fee disclosure", enforcement: "soft", domain: "insurance", policyJson: { description: "Every quote states the broker fee.", requirements: ["State the broker fee", "State who pays it"] } },
  { id: "pol-pii", name: "No personal data in summaries", enforcement: "soft", domain: "privacy", policyJson: { description: "Summaries carry no personal identifiers." } },
];
const output = "Quote for Meridian Logistics: premium $366,031.52, surplus lines tax $18,834.95, stamping fee $303.81. Treaty clause cited. The broker fee is not mentioned anywhere in this summary of the binding decision.";
const incumbentReply = (over: Partial<Record<"fee" | "pii", Record<string, unknown>>> = {}) => JSON.stringify({ policyResults: [
  { policyId: "pol-fee", policyName: "Broker fee disclosure", compliant: false, violatedRequirements: ["State the broker fee"], evidence: "The fee is not mentioned.", severity: "medium", ...(over.fee ?? {}) },
  { policyId: "pol-pii", policyName: "No personal data in summaries", compliant: true, violatedRequirements: [], evidence: "No identifiers present.", severity: "low", ...(over.pii ?? {}) },
] });

beforeEach(() => {
  route.mode = "llm"; jevAnswers.length = 0; audits.length = 0; llmReplies.length = 0; llmCalls.length = 0;
  process.env.TYPESAFE_API_KEY = "test-key";
  vi.mocked(callJev).mockClear(); vi.mocked(completeWithFallback).mockClear(); vi.mocked(recordDecisionAudit).mockClear();
});

describe("on the llm route the incumbent decides, as before", () => {
  it("asks its batched prompt once for every policy and returns its verdicts, evidence included", async () => {
    llmReplies.push(incumbentReply());
    const r = await checkSoftPolicyCompliance(output, policies, { orgId: "org-1" });
    expect(completeWithFallback).toHaveBeenCalledTimes(1);
    expect(callJev).not.toHaveBeenCalled();
    expect(llmCalls[0]).toContain("You are a compliance auditor.");
    expect(llmCalls[0]).toContain('"id": "pol-fee"');
    expect(llmCalls[0]).toContain('"id": "pol-pii"');
    expect(r).toEqual([
      { policyId: "pol-fee", policyName: "Broker fee disclosure", enforcement: "soft", domain: "insurance", compliant: false, violatedRequirements: ["State the broker fee"], evidence: "The fee is not mentioned.", severity: "medium" },
      { policyId: "pol-pii", policyName: "No personal data in summaries", enforcement: "soft", domain: "privacy", compliant: true, violatedRequirements: [], evidence: "No identifiers present.", severity: "low" },
    ]);
    // One audit row per question on the site, priced from the incumbent once.
    const rows = audits.filter((a) => a.site === "checkSoftPolicyCompliance");
    expect(rows.map((a) => a.questionKind)).toEqual(["noul", "noul", "score"]);
    expect(rows.every((a) => a.engine === "llm" && a.mode === "llm")).toBe(true);
    expect(rows.reduce((s, a) => s + Number(a.llmCostUsd ?? 0), 0)).toBeCloseTo(0.004, 6);
  });

  it("returns null on a malformed reply, so the caller drops the step as it always did", async () => {
    llmReplies.push("not json at all");
    expect(await checkSoftPolicyCompliance(output, policies)).toBeNull();
  });

  it("returns an empty list for a short output or no policies without asking anyone", async () => {
    expect(await checkSoftPolicyCompliance("too short", policies)).toEqual([]);
    expect(await checkSoftPolicyCompliance(output, [])).toEqual([]);
    expect(completeWithFallback).not.toHaveBeenCalled();
  });
});

describe("on the jev route the decision model decides where it is sure", () => {
  it("asks violates for every policy, then severity only for the violated one, and never calls the incumbent", async () => {
    route.mode = "jev";
    jevAnswers.push({ p0_violates: { type: "noul", noul: 0.96 }, p1_violates: { type: "noul", noul: 0.03 } });
    jevAnswers.push({ p0_severity: { type: "score", score: 1.2, legend: {}, probabilities: { "0": 0.1, "1": 0.7, "2": 0.2 }, confidence: 0.9 } });
    const r = await checkSoftPolicyCompliance(output, policies, { orgId: "org-1" });
    expect(completeWithFallback).not.toHaveBeenCalled();
    expect(callJev).toHaveBeenCalledTimes(2);
    const severityCall = vi.mocked(callJev).mock.calls[1][1] as Record<string, { type: string; criteria: string[] }>;
    expect(Object.keys(severityCall)).toEqual(["p0_severity"]);
    expect(severityCall.p0_severity.criteria).toHaveLength(3);
    expect(severityCall.p0_severity.criteria[0]).toMatch(/^Low/);
    expect(r).toEqual([
      expect.objectContaining({ policyId: "pol-fee", compliant: false, severity: "medium", violatedRequirements: [], evidence: "The decision model judged this policy violated (probability 96%)." }),
      expect.objectContaining({ policyId: "pol-pii", compliant: true, severity: "low", evidence: "No violation detected by the decision model." }),
    ]);
    expect(audits.filter((a) => a.site === "checkSoftPolicyCompliance").every((a) => a.engine === "jev")).toBe(true);
  });

  it("hands only the unsure policy to the incumbent, in one call, and keeps its evidence for that policy", async () => {
    route.mode = "jev";
    jevAnswers.push({ p0_violates: { type: "noul", noul: 0.55 }, p1_violates: { type: "noul", noul: 0.02 } });
    llmReplies.push(JSON.stringify({ policyResults: [{ policyId: "pol-fee", policyName: "Broker fee disclosure", compliant: false, violatedRequirements: ["State the broker fee"], evidence: "The fee is not mentioned.", severity: "high" }] }));
    const r = await checkSoftPolicyCompliance(output, policies);
    expect(completeWithFallback).toHaveBeenCalledTimes(1);
    expect(llmCalls[0]).toContain('"id": "pol-fee"');
    expect(llmCalls[0]).not.toContain('"id": "pol-pii"');
    // Severity for the violated policy: the incumbent already gave one, so the
    // model is asked and the incumbent's answer stands where it was the judge.
    expect(r?.[0]).toMatchObject({ policyId: "pol-fee", compliant: false, severity: "high", evidence: "The fee is not mentioned.", violatedRequirements: ["State the broker fee"] });
    expect(r?.[1]).toMatchObject({ policyId: "pol-pii", compliant: true });
    const fee = audits.find((a) => a.subject === "Broker fee disclosure" && a.questionKind === "noul");
    expect(fee).toMatchObject({ engine: "llm", mode: "jev", fallbackReason: "below_threshold" });
  });
});

describe("on the shadow route the incumbent decides and the model is asked afterwards", () => {
  it("returns exactly the incumbent's verdicts and records the comparison", async () => {
    route.mode = "shadow";
    llmReplies.push(incumbentReply());
    jevAnswers.push({ p0_violates: { type: "noul", noul: 0.93 }, p1_violates: { type: "noul", noul: 0.04 } });
    jevAnswers.push({ p0_severity: { type: "score", score: 1.0, legend: {}, probabilities: { "0": 0.2, "1": 0.6, "2": 0.2 }, confidence: 0.8 } });
    const r = await checkSoftPolicyCompliance(output, policies);
    expect(r?.map((x) => [x.policyId, x.compliant, x.severity, x.evidence])).toEqual([
      ["pol-fee", false, "medium", "The fee is not mentioned."],
      ["pol-pii", true, "low", "No identifiers present."],
    ]);
    expect(completeWithFallback).toHaveBeenCalledTimes(1);
    await new Promise((res) => setTimeout(res, 30));
    expect(callJev).toHaveBeenCalledTimes(2);
    const compared = audits.filter((a) => a.site === "checkSoftPolicyCompliance" && a.agree !== null && a.agree !== undefined);
    expect(compared.length).toBeGreaterThanOrEqual(3);
    expect(compared.every((a) => a.agree === true)).toBe(true);
  });
});

describe("the readers count a clean check as clean", () => {
  it("fail a trace only on a policy that is not compliant, not on any verdict at all", () => {
    expect(read("server", "routes", "governance.ts")).toContain(".some((r) => r && r.compliant === false)");
    for (const p of [["server", "worker.ts"], ["server", "routes", "shadow-canary.ts"]]) {
      const src = read(...p);
      expect(src).toContain("softViolations.some((r) => !!r && (r as Record<string, unknown>).compliant === false)");
      expect(src).not.toContain("softViolations.length > 0");
    }
  });

  it("the runtime no longer fires the old shadow hook, since the seam records the comparison", () => {
    const runtime = read("server", "agent-runtime.ts");
    expect(runtime).not.toContain("shadowSoftPolicyCompliance(");
    expect(runtime).toContain('site: "checkSoftPolicyCompliance"');
    expect(runtime).toContain("checkSoftPolicyCompliance(finalAgentOutput, resolvedPolicies, { orgId })");
  });
});
