/**
 * parseProposalContent (server/team-proposal-parse.ts): recovering a team plan
 * from the model's reply. Also checks the proposal module loads without an
 * OpenAI key, since its client is created on first use.
 */
import { describe, it, expect, vi } from "vitest";
import { parseProposalContent } from "../server/team-proposal-parse";

const plan = { orchestrator: { name: "AR Team", role: "coordinator" }, agents: [{ name: "Gather AR", role: "data" }], pipeline: { pattern: "sequential" } };

describe("parseProposalContent", () => {
  it("parses plain JSON and JSON inside a code fence", () => {
    expect(parseProposalContent(JSON.stringify(plan))).toEqual({ ok: true, value: plan });
    expect(parseProposalContent("Here you go:\n```json\n" + JSON.stringify(plan) + "\n```\nThanks")).toEqual({ ok: true, value: plan });
  });

  it("handles a fence that was never closed and a trailing comma", () => {
    expect(parseProposalContent("```json\n" + JSON.stringify(plan) + ",")).toEqual({ ok: true, value: plan });
  });

  it("closes braces and brackets cut off at the end", () => {
    const cut = '{"orchestrator": {"name": "AR Team", "role": "coordinator"}, "agents": [{"name": "Gather AR", "role": "data"}';
    expect(parseProposalContent(cut)).toEqual({ ok: true, value: { orchestrator: plan.orchestrator, agents: plan.agents } });
  });

  it("keeps the orchestrator and agents when the pipeline section was cut off mid-string", () => {
    const cut = '{"orchestrator": {"name": "AR Team", "role": "coordinator"}, "agents": [{"name": "Gather AR", "role": "data"}], "pipeline": {"pattern": "seq';
    const r = parseProposalContent(cut);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ orchestrator: plan.orchestrator, agents: plan.agents, pipeline: null });
  });

  it("gives up on something that isn't a plan at all", () => {
    expect(parseProposalContent("I couldn't draft a team for that.")).toEqual({ ok: false, value: null });
  });
});

describe("team-proposal module", () => {
  it("loads without an OpenAI API key", async () => {
    vi.doMock("../server/storage", () => ({ storage: {} }));
    vi.doMock("../server/auth", () => ({ getDefaultOrgId: () => "default-org" }));
    const saved = { a: process.env.OPENAI_API_KEY, b: process.env.AI_INTEGRATIONS_OPENAI_API_KEY };
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    try {
      const mod = await import("../server/team-proposal");
      expect(typeof mod.proposeTeam).toBe("function");
    } finally {
      if (saved.a !== undefined) process.env.OPENAI_API_KEY = saved.a;
      if (saved.b !== undefined) process.env.AI_INTEGRATIONS_OPENAI_API_KEY = saved.b;
    }
  });
});

describe("agentPlanShape", () => {
  /**
   * A model with nothing to say for an absent field writes null, because JSON
   * cannot write undefined. Rejecting that threw away a plan that had taken
   * ~260s to draft (live 2026-09-23, a 22-step process flow).
   */
  it("accepts the null a model can actually emit, as well as an absent field", async () => {
    const { agentPlanShape } = await import("../server/team-proposal");
    const base = { orchestrator: plan.orchestrator, agents: plan.agents };

    expect(agentPlanShape.safeParse({ ...base, pipeline: null }).success).toBe(true);
    expect(agentPlanShape.safeParse(base).success).toBe(true);
    expect(agentPlanShape.safeParse({ ...base, pipeline: plan.pipeline }).success).toBe(true);
    expect(agentPlanShape.safeParse({ ...base, pipeline: { pattern: "sequential", systemsExtracted: null } }).success).toBe(true);
  });

  it("still rejects a plan that is actually unusable", async () => {
    const { agentPlanShape } = await import("../server/team-proposal");
    expect(agentPlanShape.safeParse({ orchestrator: plan.orchestrator, agents: [] }).success).toBe(false);
    expect(agentPlanShape.safeParse({ agents: plan.agents }).success).toBe(false);
    expect(agentPlanShape.safeParse({ ...plan, pipeline: { systemsExtracted: [] } }).success).toBe(false);
  });
});
