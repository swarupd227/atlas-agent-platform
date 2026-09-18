/**
 * server/builtin-skill-tools.ts: an agent's own procedures are inlined while
 * they fit the budget, the rest stay behind a read_skill that loads several
 * skills in one call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(),
    getAgentTeamMembers: vi.fn().mockResolvedValue([]),
    getSkillsByIds: vi.fn().mockResolvedValue([]),
    updateSkill: vi.fn().mockResolvedValue({}),
  },
}));

import { storage } from "../server/storage";
import {
  planSkillContext,
  skillProceduresPrompt,
  skillToolsFor,
  skillCatalogPrompt,
  resolveReadableSkillSets,
  executeBuiltinSkillTool,
  DEFAULT_SKILL_INLINE_BUDGET_TOKENS,
} from "../server/builtin-skill-tools";
import { assembleAgentSystemMessage } from "../server/agent-prompt-assembly";

const skill = (id: string, name: string, chars: number, extra: Record<string, unknown> = {}) => ({
  id, name, domain: "Risk Clearance", version: "1.0.0", status: "active", description: `${name} description.`,
  markdownBody: `## ${name}\n` + "x".repeat(Math.max(0, chars - name.length - 4)),
  activationCount: 0,
  ...extra,
}) as any;

describe("planSkillContext", () => {
  it("inlines own skills in order while they fit the budget; the rest and team skills stay on demand", () => {
    const a = skill("a", "Alpha", 12_000);   // ~3000 tokens
    const b = skill("b", "Beta", 12_000);    // ~3000 tokens
    const c = skill("c", "Gamma", 12_000);   // ~3000 tokens -- over an 8000 budget
    const t = skill("t", "Team Skill", 400);
    const plan = planSkillContext([a, b, c], [t], DEFAULT_SKILL_INLINE_BUDGET_TOKENS);
    expect(plan.inline.map((s) => s.name)).toEqual(["Alpha", "Beta"]);
    expect(plan.onDemand.map((s) => s.name)).toEqual(["Gamma", "Team Skill"]);
  });

  it("a zero budget inlines nothing, and contextMode 'full' always inlines", () => {
    const a = skill("a", "Alpha", 4000);
    const full = skill("f", "Forced", 40_000, { contextMode: "full" });
    const plan = planSkillContext([a, full], [], 0);
    expect(plan.inline.map((s) => s.name)).toEqual(["Forced"]);
    expect(plan.onDemand.map((s) => s.name)).toEqual(["Alpha"]);
  });
});

describe("skillProceduresPrompt and the system message", () => {
  it("renders each procedure under its name, and sits above the reference material", () => {
    const block = skillProceduresPrompt([skill("a", "Alpha", 200)]);
    expect(block).toContain("## SKILL PROCEDURES");
    expect(block).toContain("### Alpha (Risk Clearance)");
    expect(block).toContain("without narrating them");
    expect(skillProceduresPrompt([])).toBe("");

    const msg = assembleAgentSystemMessage({
      agentSystemPrompt: "You are the screening agent.",
      instructionHeader: "## MCP TOOL EXECUTION INSTRUCTIONS",
      baseInstructions: "Call tools, then answer.",
      kbContext: "\n\n## KNOWLEDGE BASE CONTEXT (retrieved via RAG)\n<chunk>",
      skillProcedures: block,
    });
    expect(msg.indexOf("You are the screening agent.")).toBe(0);
    expect(msg.indexOf("## SKILL PROCEDURES")).toBeLessThan(msg.indexOf("KNOWLEDGE BASE CONTEXT"));
    expect(msg.trimEnd().endsWith("Call tools, then answer.")).toBe(true);
  });
});

describe("read_skill for the skills left on demand", () => {
  it("accepts several skills in one call and says so in the catalog", () => {
    const [tool] = skillToolsFor([skill("a", "Alpha", 100), skill("b", "Beta", 100)]);
    const props = tool.toolInputSchema.properties as Record<string, any>;
    expect(props.skills.type).toBe("array");
    expect(props.skills.items.enum).toEqual(["Alpha", "Beta"]);
    expect(props.skill.enum).toEqual(["Alpha", "Beta"]);
    expect(tool.toolDescription).toContain("in one call");
    const catalog = skillCatalogPrompt([skill("b", "Beta", 100)]);
    expect(catalog).toContain("naming every skill you need in one call");
    expect(catalog).toContain("another step's role");
    expect(skillToolsFor([])).toEqual([]);
  });

  it("splits own skills from team members' skills", async () => {
    vi.mocked(storage.getAgent)
      .mockResolvedValueOnce({ id: "agent-1", preloadedSkills: [{ skillId: "a" }] } as any)
      .mockResolvedValueOnce({ id: "member-1", preloadedSkills: [{ skillId: "a" }, { skillId: "t" }] } as any);
    vi.mocked(storage.getAgentTeamMembers).mockResolvedValueOnce([{ memberAgentId: "member-1" }] as any);
    vi.mocked(storage.getSkillsByIds).mockResolvedValueOnce([skill("a", "Alpha", 100), skill("t", "Team Skill", 100)]);
    const sets = await resolveReadableSkillSets("agent-1", null);
    expect(sets.own.map((s) => s.name)).toEqual(["Alpha"]);
    expect(sets.team.map((s) => s.name)).toEqual(["Team Skill"]);
  });

  describe("executeBuiltinSkillTool", () => {
    beforeEach(() => {
      vi.mocked(storage.getAgent).mockResolvedValue({ id: "agent-1", preloadedSkills: [{ skillId: "a" }, { skillId: "b" }] } as any);
      vi.mocked(storage.getAgentTeamMembers).mockResolvedValue([]);
      vi.mocked(storage.getSkillsByIds).mockResolvedValue([skill("a", "Alpha", 100), skill("b", "Beta", 100)]);
    });

    it("loads several skills in one call and names the ones that matched nothing", async () => {
      const res = await executeBuiltinSkillTool("read_skill", { skills: ["Alpha", "beta", "Nope"] }, { agentId: "agent-1" });
      expect(res.ok).toBe(true);
      expect(res.skills.map((s: any) => s.skill)).toEqual(["Alpha", "Beta"]);
      expect(res.skills[0].procedure).toContain("## Alpha");
      expect(res.notFound).toEqual(["Nope"]);
      expect(res.availableSkills).toEqual(["Alpha", "Beta"]);
      expect(storage.updateSkill).toHaveBeenCalledTimes(2);
    });

    it("keeps the single-skill shape for a single name", async () => {
      const res = await executeBuiltinSkillTool("read_skill", { skill: "Alpha" }, { agentId: "agent-1" });
      expect(res.ok).toBe(true);
      expect(res.skill).toBe("Alpha");
      expect(res.procedure).toContain("## Alpha");
      const missing = await executeBuiltinSkillTool("read_skill", { skill: "Nope" }, { agentId: "agent-1" });
      expect(missing.ok).toBe(false);
      expect(missing.availableSkills).toEqual(["Alpha", "Beta"]);
    });
  });
});
