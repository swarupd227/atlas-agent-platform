/**
 * The golden runner offers the built-in tools an agent's own skills grant and
 * runs them in-process, so a skill that says "call loss_forecast" is judged on
 * the tool's arithmetic rather than on the model's.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

const modelCalls: Array<{ tools?: Anthropic.Tool[]; tool_choice?: unknown; messages: Anthropic.MessageParam[] }> = [];
const modelReplies: Array<{ content: unknown[]; stop_reason: string }> = [];
const documentCalls: Array<[string, Record<string, unknown>]> = [];

vi.mock("../server/claude", () => ({
  callClaude: vi.fn(),
  callClaudeWithUsage: vi.fn(),
  createClaudeMessage: vi.fn(async (opts: any) => {
    modelCalls.push({ tools: opts.tools, tool_choice: opts.tool_choice, messages: opts.messages });
    const next = modelReplies.shift();
    if (!next) throw new Error("no model reply queued");
    return { ...next, usage: { input_tokens: 10, output_tokens: 10 } };
  }),
  stripJsonFences: (s: string) => s,
}));
vi.mock("../server/builtin-skill-tools", () => ({
  resolveReadableSkills: vi.fn(async () => []), skillCatalogPrompt: () => "", skillToolsFor: () => [], executeBuiltinSkillTool: vi.fn(), READ_SKILL_TOOL: "read_skill",
}));
vi.mock("../server/builtin-document-tools", () => ({
  documentToolsForSkills: (skills: Array<{ markdownBody?: string }>) => skills.some((s) => /generate_pdf/.test(String(s.markdownBody)))
    ? [{ serverId: "builtin:document", serverName: "Documents", serverUrl: "", toolName: "generate_pdf", toolDescription: "Render a PDF", toolInputSchema: { type: "object" } }]
    : [],
  resolveDocumentMode: () => "auto",
  isBuiltinDocumentTool: (t: { serverId: string }) => t.serverId === "builtin:document",
  executeBuiltinDocumentTool: vi.fn(async (name: string, args: Record<string, unknown>) => { documentCalls.push([name, args]); return { ok: true, fileId: "file-1" }; }),
}));
vi.mock("../server/decision-settings", () => ({ resolveDecisionRoute: vi.fn(async () => ({ mode: "llm", threshold: 0.85, reason: "platform" })) }));
vi.mock("../server/decision-shadow", () => ({ callJev: vi.fn(), recordDecisionAudit: vi.fn() }));
vi.mock("../server/storage", () => ({ storage: {} }));
vi.mock("../server/auth", () => ({ getOrgId: () => "org-1" }));
vi.mock("../server/permissions", () => ({ checkPermission: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../server/routes/helpers", () => ({ buildAgentSystemPromptWithGovernance: vi.fn() }));

import { answerCase, builtinToolsForEval, grantedSkillsForEval } from "../server/routes/golden-eval";
import { calculationToolsForSkills } from "../server/builtin-calculation-tools";

const skill = (id: string, markdownBody: string, status = "active") => ({ id, name: `Skill ${id}`, status, markdownBody } as any);
const forecasting = skill("s-forecast", "Step 2: call loss_forecast with method=probability.");
const prose = skill("s-prose", "Explain the exposure in prose.");
const deck = skill("s-deck", "Produce the deck with generate_pdf.");
const base = { systemPrompt: "You are the advisor.", scenario: "100 of 500 vehicles were damaged. What is the chance of loss?", agentId: "agent-1", orgId: "org-1", readableSkills: [] as any[] };
const toolUse = (name: string, input: Record<string, unknown>, id = "tu-1") => ({ content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use" });
const text = (t: string) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });

beforeEach(() => { modelCalls.length = 0; modelReplies.length = 0; documentCalls.length = 0; });

describe("which built-in tools a case is offered", () => {
  it("grants on the agent's OWN active skills, not on a team member's readable skill", () => {
    const agent = { preloadedSkills: [{ skillId: "s-forecast" }, { skillId: "s-prose" }] };
    const readable = [forecasting, prose, skill("s-team", "A team skill: call loss_forecast too.")];
    expect(grantedSkillsForEval(agent, readable).map((s) => s.id)).toEqual(["s-forecast", "s-prose"]);
    expect(builtinToolsForEval(agent, readable).map((t) => t.toolName)).toEqual(["loss_forecast"]);
    expect(builtinToolsForEval({ preloadedSkills: [{ skillId: "s-team" }] }, readable).map((t) => t.toolName)).toEqual(["loss_forecast"]);
    expect(builtinToolsForEval({ preloadedSkills: [{ skillId: "s-prose" }] }, readable)).toEqual([]);
    expect(builtinToolsForEval({ preloadedSkills: null }, readable)).toEqual([]);
    expect(builtinToolsForEval({ preloadedSkills: [{ skillId: "s-deck" }, { skillId: "s-forecast" }] }, [deck, forecasting]).map((t) => t.toolName)).toEqual(["generate_pdf", "loss_forecast"]);
  });
});

describe("answering with a granted tool", () => {
  it("offers loss_forecast, runs it in-process, hands the arithmetic back, and records the call", async () => {
    modelReplies.push(toolUse("loss_forecast", { method: "probability", events: 100, exposureUnits: 500 }), text("P = 100/500 = 0.2, 20 percent per vehicle-year."));
    const r = await answerCase({ ...base, builtinTools: calculationToolsForSkills([forecasting]) });
    expect(modelCalls[0].tools?.map((t) => t.name)).toEqual(["loss_forecast"]);
    expect(modelCalls[0].tool_choice).toBeUndefined();
    const result = (modelCalls[1].messages[2].content as Anthropic.ToolResultBlockParam[])[0];
    expect(result.tool_use_id).toBe("tu-1");
    const payload = JSON.parse(String(result.content));
    expect(payload.ok).toBe(true);
    expect(payload.probability).toBe(0.2);
    expect(payload.arithmetic[0]).toContain("100 / 500 = 0.2");
    expect(r).toEqual({ text: "P = 100/500 = 0.2, 20 percent per vehicle-year.", skillsLoaded: [], toolsUsed: ["loss_forecast"], truncated: false });
  });

  it("returns a bad input as a result the model can correct, and still counts the tool as used", async () => {
    modelReplies.push(toolUse("loss_forecast", { method: "montecarlo" }), text("I could not compute that."));
    const r = await answerCase({ ...base, builtinTools: calculationToolsForSkills([forecasting]) });
    const payload = JSON.parse(String((modelCalls[1].messages[2].content as Anthropic.ToolResultBlockParam[])[0].content));
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/method must be/);
    expect(r.toolsUsed).toEqual(["loss_forecast"]);
  });

  it("routes a document tool to the document executor with the agent context", async () => {
    modelReplies.push(toolUse("generate_pdf", { title: "Notice" }), text("The notice is attached."));
    const r = await answerCase({ ...base, builtinTools: builtinToolsForEval({ preloadedSkills: [{ skillId: "s-deck" }] }, [deck]) });
    expect(documentCalls).toEqual([["generate_pdf", { title: "Notice" }]]);
    expect(r.toolsUsed).toEqual(["generate_pdf"]);
  });

  it("refuses a tool no skill granted and offers no tools at all when none are granted", async () => {
    modelReplies.push(toolUse("loss_forecast", { method: "probability", events: 1, exposureUnits: 2 }), text("Then 0.5."));
    const r = await answerCase(base);
    expect(modelCalls[0].tools).toBeUndefined();
    const payload = JSON.parse(String((modelCalls[1].messages[2].content as Anthropic.ToolResultBlockParam[])[0].content));
    expect(payload).toEqual({ ok: false, error: 'Tool "loss_forecast" is not available in this evaluation.' });
    expect(r.toolsUsed).toEqual([]);
  });

  it("forbids tool use on the last turn so the case still gets an answer", async () => {
    for (let i = 0; i < 4; i++) modelReplies.push(toolUse("loss_forecast", { method: "probability", events: 1, exposureUnits: 2 }, `tu-${i}`));
    modelReplies.push(text("0.5"));
    const r = await answerCase({ ...base, builtinTools: calculationToolsForSkills([forecasting]) });
    expect(modelCalls).toHaveLength(5);
    expect(modelCalls[4].tool_choice).toEqual({ type: "none" });
    expect(r.text).toBe("0.5");
  });
});
