import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * server/mandate-derivation.ts reads a mandate's text and proposes task
 * classes / policy bindings for a human to review (PRD S1.1.2) -- never
 * applies anything itself. The properties that matter most:
 *  - a no-op (no LLM call at all) for an incomplete mandate or an unchanged
 *    one, so this never adds cost/noise to a save that has nothing new to
 *    derive from;
 *  - never trusts the LLM's tool/policy names as ground truth -- anything
 *    not in the agent's REAL tool catalog or the org's REAL policies is
 *    dropped before anything is ever persisted;
 *  - never throws, so a failure here can never break a mandate save/approve.
 */

const createDerivationCalls: any[] = [];
let mockPriorRuns: any[] = [];
let mockTools: Array<{ toolName: string; toolDescription: string }> = [];
let mockExistingTaskClasses: any[] = [];
let mockPolicies: Array<{ id: string; name: string; domain: string; description?: string }> = [];
let mockClaudeResponse = "";
let claudeShouldThrow = false;

vi.mock("../server/storage", () => ({
  storage: {
    listMandateDerivationsForAgent: vi.fn(async () => mockPriorRuns),
    getAgentMcpServers: vi.fn(async () => [{ serverId: "srv-1" }]),
    listAgentTaskClasses: vi.fn(async () => mockExistingTaskClasses),
    getPolicies: vi.fn(async () => mockPolicies),
    createMandateDerivation: vi.fn(async (data: any, items: any[]) => {
      createDerivationCalls.push({ data, items });
      return { id: "deriv-1", ...data };
    }),
  },
}));
vi.mock("../server/tool-dispatcher", () => ({
  gatherAvailableTools: vi.fn(async () => mockTools),
}));
vi.mock("../server/claude", () => ({
  callClaude: vi.fn(async () => {
    if (claudeShouldThrow) throw new Error("provider unavailable");
    return mockClaudeResponse;
  }),
  stripJsonFences: (raw: string) => raw.trim(),
}));

const { deriveFromMandate } = await import("../server/mandate-derivation");

const baseAgent = { id: "agent-1", name: "Wire Bot", organizationId: "org-1" } as any;
const baseMandate = {
  id: "m-1", agentId: "agent-1", version: 3, status: "draft",
  whatItDoes: "Releases wires under $10k.",
  mustNever: "Release wires over $10k alone.",
  whenToAskAHuman: null, whenToStop: null, fallbackBehavior: null, howWeKnowItsWorking: null,
} as any;

beforeEach(() => {
  createDerivationCalls.length = 0;
  mockPriorRuns = [];
  mockTools = [{ toolName: "release_wire_transfer", toolDescription: "Releases a wire" }];
  mockExistingTaskClasses = [];
  mockPolicies = [{ id: "pol-1", name: "Wire Transfer Policy", domain: "financial_controls" }];
  claudeShouldThrow = false;
  mockClaudeResponse = JSON.stringify({
    summary: "Derived 1 task class.",
    taskClasses: [{
      name: "Release wire transfer",
      description: "Releasing a wire above the small-dollar threshold.",
      suggestedRequiredReviewerRole: "ops_sre",
      suggestedCoveredTools: ["release_wire_transfer"],
      suggestedGrants: "requires_approval",
      suggestedWarrantBasis: "High-value transfer.",
      suggestedEvidenceNote: "Audit log of every release decision.",
      citations: [{ mandateField: "mustNever", text: "Release wires over $10k alone." }],
    }],
    policyBindings: [{ policyId: "pol-1", policyName: "Wire Transfer Policy", reason: "Directly governs this.", citations: [] }],
  });
});

describe("deriveFromMandate: no-op paths", () => {
  it("does not call the LLM when whatItDoes is empty", async () => {
    const { callClaude } = await import("../server/claude");
    await deriveFromMandate(baseAgent, { ...baseMandate, whatItDoes: "" }, "save");
    expect(callClaude).not.toHaveBeenCalled();
    expect(createDerivationCalls.length).toBe(0);
  });

  it("does not call the LLM when mustNever is empty", async () => {
    const { callClaude } = await import("../server/claude");
    vi.mocked(callClaude).mockClear();
    await deriveFromMandate(baseAgent, { ...baseMandate, mustNever: "   " }, "save");
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("does not call the LLM when the content hash matches the latest prior run", async () => {
    const { callClaude } = await import("../server/claude");
    vi.mocked(callClaude).mockClear();
    // Run once to learn the real hash the module computes...
    await deriveFromMandate(baseAgent, baseMandate, "save");
    const hash = createDerivationCalls[0].data.contentHash;
    createDerivationCalls.length = 0;
    vi.mocked(callClaude).mockClear();
    // ...then simulate that hash already being the latest run's hash.
    mockPriorRuns = [{ contentHash: hash, mandateVersion: baseMandate.version }];
    await deriveFromMandate(baseAgent, baseMandate, "save");
    expect(callClaude).not.toHaveBeenCalled();
    expect(createDerivationCalls.length).toBe(0);
  });

  it("never throws when the LLM call fails", async () => {
    claudeShouldThrow = true;
    await expect(deriveFromMandate(baseAgent, baseMandate, "save")).resolves.toBeUndefined();
    expect(createDerivationCalls.length).toBe(0);
  });

  it("never throws on unparseable LLM output", async () => {
    mockClaudeResponse = "not json";
    await expect(deriveFromMandate(baseAgent, baseMandate, "save")).resolves.toBeUndefined();
    expect(createDerivationCalls.length).toBe(0);
  });
});

describe("deriveFromMandate: grounding and validation", () => {
  it("persists a derivation with the proposed task class and policy binding", async () => {
    await deriveFromMandate(baseAgent, baseMandate, "approve");
    expect(createDerivationCalls.length).toBe(1);
    const { data, items } = createDerivationCalls[0];
    expect(data.agentId).toBe("agent-1");
    expect(data.mandateVersion).toBe(3);
    expect(data.triggeredBy).toBe("approve");
    const tc = items.find((i: any) => i.kind === "task_class");
    expect(tc.proposedContent.name).toBe("Release wire transfer");
    expect(tc.proposedContent.suggestedCoveredTools).toEqual(["release_wire_transfer"]);
    expect(tc.citations).toEqual([{ mandateField: "mustNever", text: "Release wires over $10k alone." }]);
    const pb = items.find((i: any) => i.kind === "policy_binding");
    expect(pb.proposedContent.policyId).toBe("pol-1");
  });

  it("drops a proposed tool name that isn't in the agent's real tool catalog", async () => {
    mockClaudeResponse = JSON.stringify({
      summary: "x",
      taskClasses: [{
        name: "Release wire transfer",
        suggestedCoveredTools: ["release_wire_transfer", "totally_made_up_tool"],
        citations: [],
      }],
      policyBindings: [],
    });
    await deriveFromMandate(baseAgent, baseMandate, "save");
    const tc = createDerivationCalls[0].items.find((i: any) => i.kind === "task_class");
    expect(tc.proposedContent.suggestedCoveredTools).toEqual(["release_wire_transfer"]);
  });

  it("drops a proposed policyId that isn't a real policy for this org, keeping the reason as a gap note", async () => {
    mockClaudeResponse = JSON.stringify({
      summary: "x",
      taskClasses: [],
      policyBindings: [{ policyId: "pol-does-not-exist", reason: "Should cover this.", citations: [] }],
    });
    await deriveFromMandate(baseAgent, baseMandate, "save");
    const pb = createDerivationCalls[0].items.find((i: any) => i.kind === "policy_binding");
    expect(pb.proposedContent.policyId).toBeNull();
    expect(pb.proposedContent.gapNote).toBe("Should cover this.");
  });

  it("falls back to requires_approval for an invalid suggestedGrants value", async () => {
    mockClaudeResponse = JSON.stringify({
      summary: "x",
      taskClasses: [{ name: "X", suggestedGrants: "yolo_full_access", citations: [] }],
      policyBindings: [],
    });
    await deriveFromMandate(baseAgent, baseMandate, "save");
    const tc = createDerivationCalls[0].items.find((i: any) => i.kind === "task_class");
    expect(tc.proposedContent.suggestedGrants).toBe("requires_approval");
  });

  it("does not persist a derivation at all when the model proposes nothing", async () => {
    mockClaudeResponse = JSON.stringify({ summary: "Nothing new.", taskClasses: [], policyBindings: [] });
    await deriveFromMandate(baseAgent, baseMandate, "save");
    expect(createDerivationCalls.length).toBe(0);
  });
});
