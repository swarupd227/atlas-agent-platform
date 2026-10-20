import { Router } from "express";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { checkPermission } from "../permissions";
import { buildAgentSystemPromptWithGovernance } from "./helpers";
import { callClaude, callClaudeWithUsage, createClaudeMessage, stripJsonFences } from "../claude";
import { decideMany, type DecisionQuestion } from "../decision-provider";
import type Anthropic from "@anthropic-ai/sdk";
import type { Skill, Agent, EvalSuite, EvalTestCase, GoldenDataset, GoldenTestCase } from "@shared/schema";
import { resolveReadableSkills, skillCatalogPrompt, skillToolsFor, executeBuiltinSkillTool, READ_SKILL_TOOL } from "../builtin-skill-tools";
import { documentToolsForSkills, resolveDocumentMode, isBuiltinDocumentTool, executeBuiltinDocumentTool } from "../builtin-document-tools";
import { calculationToolsForSkills, isBuiltinCalculationTool, executeBuiltinCalculationTool } from "../builtin-calculation-tools";
import type { AvailableTool } from "../tool-dispatcher";
import { priorDecisionsForPrompt } from "../intelligence-context";
import { resolveRepeats, summarizeRun, type CaseStability } from "@shared/eval-stability";
import { runAttempts, foldAttempts, meanLatencyMs, repeatedRowNotes, describeUnstableFields, EVAL_REPEAT_JOB } from "../eval-repeat";

const router = Router();

/**
 * Golden dataset execution.
 *
 * Golden datasets existed as content but nothing could run them: eval_suites
 * carries a goldenDatasetId column that exactly one place READ (the manifest
 * export in runtime.ts) and nothing anywhere ever WROTE, and no code path
 * executed a golden case against an agent. So a dataset's benchmark figures
 * could only ever be whatever someone seeded them as.
 *
 * SCOPE, stated plainly because it determines what a passing score means:
 * this is a PROMPT-LEVEL evaluation. Each case is run against the agent's real
 * assembled system prompt -- its ontology glossary and its bound policies with
 * their directives -- plus the same on-demand skills the runtime offers: the
 * skill catalog in the prompt, read_skill, and the built-in tools a skill grants
 * (document and calculation tools, run in-process exactly as the runtime runs
 * them), so a case shows whether the agent loads the procedure it needs and
 * calls the tool it names (skillsLoaded and toolsUsed are recorded per case).
 * The response is then judged against the case's expectedBehavior and
 * evaluationCriteria. It does NOT dispatch MCP tools or execute a team graph,
 * so it verifies conduct, reasoning, policy adherence and skill use, not tool
 * wiring or end-to-end orchestration. Every run records mode: "prompt_level"
 * so a score is never mistaken for a full integration result.
 */

interface JudgedCase {
  caseId: string;
  name: string;
  passed: boolean;
  score: number;
  criteriaMet: string[];
  criteriaMissed: string[];
  reasoning: string;
  actualOutput: string;
  /** Skills the agent loaded with read_skill while answering. */
  skillsLoaded: string[];
  /** Built-in tools the agent called while answering: the document and calculation tools its skills grant. */
  toolsUsed?: string[];
  /** The answer hit EVAL_ANSWER_MAX_TOKENS and was cut off. */
  truncated?: boolean;
  latencyMs: number;
  /** Set when the case ran more than once (repeats > 1). */
  stability?: CaseStability;
}

/** Tool turns allowed before the agent must answer. */
const MAX_SKILL_TURNS = 4;

/**
 * Room for the agent's whole answer. At 1,500 a step that returns a full
 * structured record -- a WC loss review listing every claim on four prior
 * policies before its findings -- was cut off before its JSON closed, and the
 * case was scored "no parseable JSON verdict": a harness limit reported as the
 * agent's omission. A cut-off answer is now also reported as truncated.
 */
export const EVAL_ANSWER_MAX_TOKENS = 4096;

/** The harness's own model, for an agent that does not run on a Claude model. */
export const EVAL_FALLBACK_MODEL = "claude-opus-4-5";

/**
 * The model a case is answered with: the agent's own. Every case used to be
 * answered by claude-opus-4-5 whatever the agent ran on, so a suite for an
 * agent on claude-sonnet-4-5 scored a model production never calls. This
 * harness calls Anthropic only, so an agent on another provider still falls
 * back; the run records which model answered (answeredBy).
 */
export function evalAnswerModel(agent: { modelName?: string | null } | null | undefined): string {
  const name = String(agent?.modelName ?? "").trim();
  return /^claude-[a-z0-9.-]+$/i.test(name) ? name : EVAL_FALLBACK_MODEL;
}

/** Said first when an answer hit EVAL_ANSWER_MAX_TOKENS, so a cut-off answer never reads as an omission. */
export function truncationNote(truncated: boolean | undefined): string {
  return truncated ? `The agent's answer was cut off at the ${EVAL_ANSWER_MAX_TOKENS}-token answer limit before it finished. ` : "";
}

/**
 * The agent answers under its own system prompt with read_skill and the
 * built-in tools its skills grant, exactly as the runtime offers them. Before
 * builtinTools existed a skill that said "call loss_forecast" was judged on an
 * answer the agent had to compute in prose, because the only tool here was
 * read_skill; the suite then scored the model's arithmetic, not the agent's
 * conduct. The final turn forbids tool use so a model that keeps loading
 * skills or calling tools still has to produce an answer to judge.
 */
export async function answerCase(p: {
  systemPrompt: string;
  scenario: string;
  agentId: string;
  orgId?: string | null;
  readableSkills: Skill[];
  /** Built-in tools to offer and run in-process (builtinToolsForEval); none when absent. */
  builtinTools?: AvailableTool[];
  /** The model that answers -- evalAnswerModel(agent). */
  model?: string;
}): Promise<{ text: string; skillsLoaded: string[]; toolsUsed: string[]; truncated: boolean }> {
  const offered = skillToolsFor(p.readableSkills)[0];
  const builtin = p.builtinTools ?? [];
  const toolDefs: Anthropic.Tool[] = [
    ...(offered ? [{ name: READ_SKILL_TOOL, description: offered.toolDescription, input_schema: offered.toolInputSchema }] : []),
    ...builtin.map(t => ({ name: t.toolName, description: t.toolDescription, input_schema: t.toolInputSchema as Anthropic.Tool["input_schema"] })),
  ];
  const tools: Anthropic.Tool[] | undefined = toolDefs.length > 0 ? toolDefs : undefined;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: p.scenario }];
  const skillsLoaded: string[] = [];
  const toolsUsed: string[] = [];

  for (let turn = 0; turn <= MAX_SKILL_TURNS; turn++) {
    const lastTurn = turn === MAX_SKILL_TURNS;
    const response = await createClaudeMessage({
      model: p.model ?? EVAL_FALLBACK_MODEL,
      system: p.systemPrompt,
      messages,
      max_tokens: EVAL_ANSWER_MAX_TOKENS,
      // Tools stay defined on the last turn (earlier turns hold tool_use
      // blocks) but tool_choice "none" makes the model answer.
      ...(tools ? { tools, ...(lastTurn ? { tool_choice: { type: "none" } as any } : {}) } : {}),
    });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map(b => b.text)
        .join("\n")
        .trim();
      return { text, skillsLoaded, toolsUsed, truncated: response.stop_reason === "max_tokens" };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const input = (use.input ?? {}) as Record<string, any>;
      const granted = builtin.find(t => t.toolName === use.name);
      const out = use.name === READ_SKILL_TOOL
        ? await executeBuiltinSkillTool(use.name, input, { orgId: p.orgId, agentId: p.agentId, countActivation: false })
        : granted
          ? await runBuiltinTool(granted, input, { orgId: p.orgId, agentId: p.agentId })
          : { ok: false, error: `Tool "${use.name}" is not available in this evaluation.` };
      if (granted && !toolsUsed.includes(use.name)) toolsUsed.push(use.name);
      if (out?.ok && typeof out.skill === "string" && !skillsLoaded.includes(out.skill)) skillsLoaded.push(out.skill);
      results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "", skillsLoaded, toolsUsed, truncated: false };
}

/**
 * Runs a built-in tool the way tool-dispatcher.ts does, in-process. A failure
 * comes back as a result the model can read and correct, not as a thrown
 * error that would fail the case for a reason the judge never sees.
 */
async function runBuiltinTool(tool: AvailableTool, input: Record<string, any>, ctx: { orgId?: string | null; agentId: string }): Promise<any> {
  try {
    if (isBuiltinCalculationTool(tool)) return await executeBuiltinCalculationTool(tool.toolName, input, ctx);
    if (isBuiltinDocumentTool(tool)) return await executeBuiltinDocumentTool(tool.toolName, input, ctx);
    return { ok: false, error: `Tool "${tool.toolName}" is not available in this evaluation.` };
  } catch (err: any) {
    return { ok: false, error: `Tool "${tool.toolName}" failed: ${err?.message ?? String(err)}` };
  }
}

/**
 * The agent's OWN active skills: the set the runtime grants tools on
 * (agent-runtime.ts reads the agent's preloadedSkills, not its team members').
 * Readable skills include a team's, which read_skill may load but which grant
 * nothing, so a grant is decided on this narrower set.
 */
export function grantedSkillsForEval(agent: { preloadedSkills?: unknown }, readableSkills: Skill[]): Skill[] {
  const raw = agent.preloadedSkills;
  const own = new Set<string>(Array.isArray(raw) ? raw.map((p: any) => p?.skillId).filter(Boolean) : []);
  return readableSkills.filter(s => own.has(s.id) && s.status === "active");
}

/**
 * The built-in tools a case may call: what the runtime would offer this agent
 * and nothing more. A document tool called here produces a real file,
 * attributed to the agent like one from a run; a calculation tool is pure.
 */
export function builtinToolsForEval(agent: { preloadedSkills?: unknown; documentGenerationMode?: string | null }, readableSkills: Skill[]): AvailableTool[] {
  const own = grantedSkillsForEval(agent, readableSkills);
  return [...documentToolsForSkills(own, resolveDocumentMode(agent.documentGenerationMode)), ...calculationToolsForSkills(own)];
}

/**
 * Two criterion strings naming the same requirement. The examiner is asked to
 * return criterion text exactly; models paraphrase, so exact equality alone
 * made a met criterion read as missed.
 */
export function sameCriterion(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const x = norm(a), y = norm(b);
  if (x === y) return true;
  // Containment only once there is enough text for it to mean something --
  // on short strings it would match unrelated criteria.
  return x.length >= 20 && y.length >= 20 && (x.includes(y) || y.includes(x));
}

/**
 * Which instrument can score a case.
 *
 * Measured on the 17 MGA suites: 146 active cases, of which 107 carry an
 * OBJECT expectedOutput, not prose. Passing a stringified object to the
 * compliance examiner as criterion text scored every one of them 0 whatever
 * the agent said, because no model echoes raw JSON back verbatim.
 *
 *  - "structured": the case asserts specific FIELD VALUES
 *    ({kpiName, threshold, slaBreached, expectedAction|withinTarget|
 *    marginOfSafety}). That is a comparison, not a judgement -- scoring it
 *    deterministically is both correct and one model call cheaper per case.
 *  - "prose": a sentence a judge can read, either expectedOutput itself or the
 *    expectedBehavior field of the {compliant, regulationRef, expectedBehavior}
 *    regulation shape.
 *  - "none": nothing to score against; the caller counts it unjudgeable rather
 *    than letting it depress the pass rate as if the agent had failed.
 *
 * kpiName is excluded from the asserted keys deliberately: it restates the
 * input, so comparing it would fail an otherwise-correct verdict on wording.
 */
export type CaseInstrument =
  | { kind: "structured"; expected: Record<string, any>; keys: string[] }
  | { kind: "prose"; criterion: string }
  | { kind: "none" };

/**
 * Keys that restate the input rather than asserting a judgement.
 *
 * kpiName was excluded from the start because it echoes the KPI's own name.
 * `threshold` and `target` are the same thing and were missed: measured across
 * the nine live KPI suites, `threshold` is asserted in 99 of 99 boundary cases
 * and is present in inputData with the identical value in all 99. Comparing it
 * marks a third of every case correct before the agent has judged anything,
 * which is how those suites read 107/107. The generator still writes them into
 * expectedOutput as context for whoever reads the row; they are simply not
 * scored.
 */
const DESCRIPTIVE_KEYS = new Set(["kpiName", "kpiId", "unit", "regulationRef", "conceptId", "conceptLabel", "threshold", "target"]);

export function classifyEvalCase(tc: { expectedOutput?: any }): CaseInstrument {
  const eo = tc.expectedOutput;
  if (typeof eo === "string") {
    const s = eo.trim();
    return s ? { kind: "prose", criterion: s } : { kind: "none" };
  }
  if (eo && typeof eo === "object" && !Array.isArray(eo)) {
    const behaviour = typeof eo.expectedBehavior === "string" ? eo.expectedBehavior.trim() : "";
    if (behaviour) return { kind: "prose", criterion: behaviour };
    const keys = Object.keys(eo).filter(k => !DESCRIPTIVE_KEYS.has(k) && eo[k] !== null && eo[k] !== undefined);
    if (keys.length > 0) return { kind: "structured", expected: eo as Record<string, any>, keys };
  }
  return { kind: "none" };
}

/**
 * The agent's JSON verdict in a model answer, fences and prose tolerated.
 *
 * A fenced ```json block is tried FIRST, last block first, because that is
 * where an agent asked to end with a verdict puts it. The brace span below is
 * the fallback, and on its own it was scoring right answers as missing: it
 * slices from the first `{` in the whole answer to the last `}`, so anything
 * brace-shaped elsewhere makes the slice span prose and fail to parse.
 *
 * Measured on two J4 eval answers (2026-10-11), both of which ended in a clean
 * ```json block carrying the correct value: one had a `}` in the prose after
 * the block, the other emitted its own ```risk_assessment block first, so the
 * span covered two objects and the text between them. Both scored 0 with "the
 * agent returned no parseable JSON verdict" -- reported as a missing answer
 * when the answer was present and right. The same cause sat behind J1's suite
 * failing 2 of 3 structured cases.
 *
 * Last block first, because a prompt that shows the required shape as an
 * example puts that example BEFORE the real answer.
 */
export function extractJsonObject(text: string): Record<string, any> | null {
  if (!text) return null;
  const asObject = (raw: string): Record<string, any> | null => {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  };

  // 1. Fenced blocks, last first. ```json is preferred over a bare fence.
  const fenced = [...text.matchAll(/```[ \t]*(\w+)?[ \t]*\r?\n([\s\S]*?)```/g)]
    .map((m) => ({ lang: (m[1] ?? "").toLowerCase(), body: m[2] }));
  for (const list of [fenced.filter((f) => f.lang === "json"), fenced]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const found = asObject(list[i].body.trim());
      if (found) return found;
    }
  }

  // 2. The brace span, as before, for an answer that fenced nothing.
  const stripped = stripJsonFences(text).trim();
  for (const candidate of [stripped, text]) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    const found = asObject(candidate.slice(start, end + 1));
    if (found) return found;
  }

  // 3. A span that over-reached: walk the last `{` back through each earlier
  //    one until something parses, so a second object in the answer no longer
  //    hides the verdict.
  // `start === 0 ? -1` is load-bearing: String.lastIndexOf clamps a negative
  // fromIndex to 0, so lastIndexOf("{", -1) returns 0 again for any text
  // beginning with "{". Without it this loop never ends -- it blocked the
  // event loop for every request on the instance whenever a model answer
  // started with "{" and parsed nowhere, and hung this module's own test file.
  // Found in production by two peer sessions, not by me.
  for (let start = text.lastIndexOf("{"); start >= 0; start = start === 0 ? -1 : text.lastIndexOf("{", start - 1)) {
    const end = text.indexOf("}", start) < 0 ? -1 : text.lastIndexOf("}");
    if (end <= start) continue;
    const found = asObject(text.slice(start, end + 1));
    if (found) return found;
  }
  return null;
}

/**
 * Does the agent's value satisfy the asserted one? Booleans and numbers
 * compare by value; a string compares on a slug so "alert and escalate"
 * satisfies "alert_and_escalate" -- the assertion is about the decision, not
 * the formatting.
 */
export function valueSatisfies(expected: any, actual: any): boolean {
  if (actual === undefined || actual === null) return false;
  if (typeof expected === "boolean") {
    if (typeof actual === "boolean") return actual === expected;
    const s = String(actual).trim().toLowerCase();
    return (expected && (s === "true" || s === "yes")) || (!expected && (s === "false" || s === "no"));
  }
  if (typeof expected === "number") {
    const n = typeof actual === "number" ? actual : Number(String(actual).replace(/[,%\s]/g, ""));
    return Number.isFinite(n) && Math.abs(n - expected) < 1e-9;
  }
  if (typeof expected === "string") {
    const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const e = slug(expected), a = slug(String(actual));
    return e === a || (e.length >= 4 && a.includes(e));
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
}

/**
 * Scores a structured case against the agent's own JSON verdict. Returns the
 * per-field outcome so a wrong value is never confused with no answer at all:
 * `noVerdict` says the agent produced nothing parseable, which is a different
 * defect from producing the wrong figure and is reported as such.
 */
export function scoreStructuredCase(
  expected: Record<string, any>,
  keys: string[],
  answerText: string,
): { passed: boolean; score: number; met: string[]; missed: string[]; noVerdict: boolean; reasoning: string } {
  const verdict = extractJsonObject(answerText);
  const describe = (k: string) => `${k} = ${JSON.stringify(expected[k])}`;
  if (!verdict) {
    return {
      passed: false, score: 0, met: [], missed: keys.map(describe), noVerdict: true,
      reasoning: `The agent returned no parseable JSON verdict, so the asserted fields (${keys.join(", ")}) could not be compared. This is a missing answer, not a wrong one.`,
    };
  }
  const met: string[] = [], missed: string[] = [];
  for (const k of keys) {
    (valueSatisfies(expected[k], verdict[k]) ? met : missed).push(describe(k));
  }
  const score = keys.length > 0 ? met.length / keys.length : 0;
  return {
    passed: missed.length === 0,
    score,
    met,
    missed,
    noVerdict: false,
    reasoning: missed.length === 0
      ? `All ${keys.length} asserted field(s) matched the agent's verdict.`
      : `Mismatched: ${missed.map(m => `${m} (agent gave ${JSON.stringify(verdict[m.split(" = ")[0]])})`).join("; ")}.`,
  };
}

export async function judgeCase(params: {
  systemPrompt: string;
  scenario: string;
  expectedBehavior: string;
  criteria: string[];
  passingScore: number;
  agentId: string;
  orgId?: string | null;
  readableSkills: Skill[];
  builtinTools?: AvailableTool[];
  model?: string;
}): Promise<Omit<JudgedCase, "caseId" | "name" | "latencyMs">> {
  // Step 1: the agent answers, under its own real system prompt, able to load
  // its skills on demand.
  const { text: actualOutput, skillsLoaded, toolsUsed, truncated } = await answerCase({
    systemPrompt: params.systemPrompt,
    scenario: params.scenario,
    agentId: params.agentId,
    orgId: params.orgId,
    readableSkills: params.readableSkills,
    builtinTools: params.builtinTools,
    model: params.model,
  });

  // Step 2: each criterion is judged through the decision seam on the site
  // "golden_judge", one "is it met?" question per criterion. The examiner
  // prompt below is the incumbent, unchanged as text and deliberately told to
  // fail on omission -- a fluent answer that silently skips a required
  // disclosure is the exact failure mode these datasets exist to catch. On the
  // jev route it is called only when the decision model is unsure about a
  // criterion, which is where the saving is: this is the most expensive judge
  // on the platform. Its reasoning is kept whenever it was called.
  let examiner: { met: string[]; missed: string[]; reasoning: string } | null = null;
  const examine = async (keys: string[]) => {
    const r = await callClaudeWithUsage({
      system: `You are a strict insurance compliance examiner scoring an AI agent's response against required behaviour.

Score ONLY against the listed criteria. A response that is fluent, confident or plausible but OMITS a required element FAILS that criterion -- omission is the failure mode that matters here, so do not give credit for what the response merely implies.

Return JSON: {"criteriaMet": ["exact criterion text"], "criteriaMissed": ["exact criterion text"], "reasoning": "one or two sentences citing what was present or absent"}`,
      user: `EXPECTED BEHAVIOUR:
${params.expectedBehavior}

REQUIRED CRITERIA:
${params.criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

AGENT RESPONSE:
${actualOutput}`,
      maxTokens: 1200,
      jsonMode: true,
    });
    const parsed = JSON.parse(stripJsonFences(r.text));
    examiner = {
      met: Array.isArray(parsed.criteriaMet) ? parsed.criteriaMet.map(String) : [],
      missed: Array.isArray(parsed.criteriaMissed) ? parsed.criteriaMissed.map(String) : [],
      reasoning: String(parsed.reasoning || ""),
    };
    const answers: Record<string, boolean> = {};
    const seen = examiner as { met: string[]; missed: string[] };
    for (const k of keys) {
      const c = params.criteria[Number(k.slice(1))];
      const inMet = seen.met.some((m) => sameCriterion(m, c));
      const inMissed = seen.missed.some((m) => sameCriterion(m, c));
      // A judge that paraphrases a criterion instead of echoing it verbatim
      // used to land in NEITHER list, which then read as missed -- the case
      // failed on the judge's wording rather than on the agent's answer. With
      // one criterion there is no ambiguity about which it meant, so its own
      // met/missed verdict is used; with several, an unmatched criterion stays
      // missed, because crediting it would guess which one the judge meant.
      answers[k] = inMet ? !inMissed
        : inMissed ? false
        : params.criteria.length === 1 && seen.met.length > 0 && seen.missed.length === 0;
    }
    return { answers, model: r.model, latencyMs: r.latencyMs, inputTokens: r.inputTokens, costUsd: r.costUsd };
  };

  const questions: Record<string, DecisionQuestion> = {};
  params.criteria.forEach((c, i) => {
    questions[`c${i}`] = {
      kind: "noul",
      instructions: `Does the agent's response meet this required criterion: ${c}? A response that omits the element fails it; do not credit what it merely implies.`,
      criteria: { true: "The response contains the required element", false: "The response omits or contradicts it" },
      subject: c.slice(0, 500),
    };
  });

  let decided: Awaited<ReturnType<typeof decideMany>>;
  try {
    decided = await decideMany({
      site: "golden_judge",
      state: { expected_behaviour: params.expectedBehavior, agent_response: actualOutput },
      orgId: params.orgId,
      questions,
      incumbent: examine,
    });
  } catch (err: any) {
    // An unparseable judge response must not silently become a pass. Fail the
    // case and say why, rather than scoring 0 criteria met as a 0% that reads
    // like a genuine behavioural failure.
    return {
      passed: false,
      score: 0,
      criteriaMet: [],
      criteriaMissed: params.criteria,
      reasoning: `${truncationNote(truncated)}Judge response could not be parsed (${err?.message}); scored as failed rather than assumed passing.`,
      actualOutput,
      skillsLoaded,
      toolsUsed,
      truncated,
    };
  }

  const met: string[] = [];
  const missed: string[] = [];
  const byModel: string[] = [];
  params.criteria.forEach((c, i) => {
    const d = decided[`c${i}`];
    (d?.answer === true ? met : missed).push(c);
    if (d?.engine === "jev") byModel.push(`${c} (${d.answer === true ? "met" : "missed"}, ${Math.round(((d.probabilities?.true ?? 0) as number) * 100)}%)`);
  });
  const reasoning = truncationNote(truncated) + ((examiner as { reasoning: string } | null)?.reasoning
    || `Decided by the decision model without the examiner: ${byModel.join("; ")}.`);

  const score = params.criteria.length > 0 ? met.length / params.criteria.length : 0;
  return {
    passed: score >= params.passingScore,
    score,
    criteriaMet: met,
    criteriaMissed: missed,
    reasoning,
    actualOutput,
    skillsLoaded,
    toolsUsed,
    truncated,
  };
}

/** What a run needs once it is validated and has a run row. */
interface RunInput {
  orgId: ReturnType<typeof getOrgId>;
  run: { id: string };
  suite: EvalSuite;
  agent: Agent;
  repeats: number;
  evalSystemPrompt: string;
  readableSkills: Skill[];
  /** The built-in tools the agent's own skills grant, offered and run in-process (builtinToolsForEval). */
  builtinTools?: AvailableTool[];
  /** Called as each case starts, with how many are done so far. */
  onProgress?: (done: number, total: number) => Promise<void> | void;
}

/** The agent's prompt as the runtime assembles it, and the skills it may read on demand. */
/**
 * The system prompt a prompt-level case is judged against.
 *
 * The agent's OWN brief comes first, because that is where the runtime puts it:
 * agent-runtime.ts hands workerAgent.systemPrompt to assembleAgentSystemMessage
 * as the first thing the model reads, ahead of skills, retrieved context and the
 * task framing.
 *
 * It was previously left out altogether, and that made a whole class of suite
 * meaningless rather than merely approximate. Measured on a triage agent whose
 * instructions ran to 3,227 characters: its output contract and both of its
 * "do not invent a value" rules lived in that field, so the suite scored a prompt
 * production never runs, and three corrections to those rules moved the pass rate
 * not at all. A score about nothing is worse than no score, because the
 * deployment gate, the readiness check and the canary all read this number.
 *
 * Pure and exported so the ordering can be asserted without standing up an
 * agent, a suite and a model call to find out.
 */
export function composeEvalSystemPrompt(parts: { agentBrief?: string | null; governancePrompt: string; skillCatalog?: string | null }): string {
  const brief = String(parts.agentBrief ?? "").trim();
  const catalog = String(parts.skillCatalog ?? "").trim();
  const sections = [brief, parts.governancePrompt, catalog].filter((s) => s && s.length > 0);
  return sections.join("\n\n");
}

async function prepareEvalPrompt(agent: Agent, orgId: ReturnType<typeof getOrgId>) {
  // Judge against the policy text the runtime actually shows the agent, not
  // policy names alone -- see buildAgentSystemPromptWithGovernance.
  const systemPrompt = await buildAgentSystemPromptWithGovernance(agent, orgId ?? undefined);
  // Offer the same on-demand skills the runtime does: the catalog in the
  // prompt and read_skill as the only tool (server/builtin-skill-tools.ts).
  const readableSkills = await resolveReadableSkills(agent.id, orgId).catch(() => [] as Skill[]);
  const builtinTools = builtinToolsForEval(agent as { preloadedSkills?: unknown; documentGenerationMode?: string | null }, readableSkills);
  const skillCatalog = skillCatalogPrompt(readableSkills);
  const evalSystemPrompt = composeEvalSystemPrompt({
    agentBrief: (agent as { systemPrompt?: string | null }).systemPrompt,
    governancePrompt: systemPrompt,
    skillCatalog,
  });
  return { evalSystemPrompt, readableSkills, builtinTools };
}

/** What a queued repeated run carries: enough to rebuild the run without the request. */
export interface RepeatRunPayload {
  mode: "golden" | "execute";
  suiteId: string;
  runId: string;
  agentId: string;
  /** The cases the run was created for, in order, so the job runs those and no others. */
  caseIds: string[];
  repeats: number;
  orgId: ReturnType<typeof getOrgId>;
  heartbeatAt?: string;
}

/**
 * Rolls a finished run's pass rate up onto its suite, which is what the deployment gate, the
 * readiness check, the canary and the deprecation signal read as "the suite's pass rate", and
 * stamps lastRunAt, which the gate reads to tell "never evaluated" from "evaluated and failed".
 *
 * Only an ordinary run does. A repeated run is a consistency check scored strictly (a case
 * passes only if every attempt does), so its rate is lower and not on the same scale; written
 * here it would replace the suite's real rate and could block, or wave through, a promotion on a
 * number nobody chose, and it would make a suite that was never evaluated look evaluated. The
 * repeated run's own row keeps its rate and its stability figures, for people to read.
 */
export async function recordSuiteRate(suiteId: string, repeats: number, passRate: number): Promise<boolean> {
  if (repeats > 1) return false;
  await storage.updateEvalSuite(suiteId, { passRate, lastRunAt: new Date() });
  return true;
}

/**
 * What a repeated run's row says about itself from the moment it exists: resultsJson.repeats, the
 * marker that readers use to tell it from an ordinary run. Without it, a repeated run that is
 * still running, or that fails before it completes, would carry no marker and read as an
 * ordinary run with a pass rate of 0. An ordinary run adds nothing.
 */
export function repeatedRunMarker(repeats: number): { resultsJson?: any } {
  return repeats > 1 ? { resultsJson: { repeats } } : {};
}

/**
 * Hands a repeated run to the job worker and says where to read it. If the job
 * cannot be queued the run row is marked failed rather than left "running".
 */
async function queueRepeatRun(payload: RepeatRunPayload, totalCases: number) {
  try {
    const job = await storage.createJob({ type: EVAL_REPEAT_JOB, status: "queued", agentId: payload.agentId, payload: payload as any });
    return { runId: payload.runId, jobId: job.id, status: "running" as const, repeats: payload.repeats, totalCases, attempts: totalCases * payload.repeats };
  } catch (err) {
    await storage.updateEvalRun(payload.runId, { status: "failed", completedAt: new Date(), resultsJson: { repeats: payload.repeats, error: "The run could not be queued" } as any }).catch(() => {});
    throw err;
  }
}

/** Runs a golden dataset's cases for an existing run row and returns the response body. */
export async function executeGoldenRun(c: RunInput & { dataset: GoldenDataset; cases: GoldenTestCase[] }) {
  const { orgId, run, suite, agent, dataset, cases, repeats, evalSystemPrompt, readableSkills, builtinTools = [], onProgress } = c;
  const judged: JudgedCase[] = [];
  for (const tc of cases) {
    await onProgress?.(judged.length, cases.length);
    const criteria = Array.isArray(tc.evaluationCriteria) ? (tc.evaluationCriteria as string[]) : [];
    const rubric = (tc.rubricScoring as any) || {};
    const passingScore = typeof rubric.passingScore === "number" ? rubric.passingScore : 0.8;

    // One attempt per repeat, a few at a time. A thrown attempt is a failed
    // attempt, so one bad call does not discard the others.
    const attempts = await runAttempts(repeats, async () => {
      const attemptStarted = Date.now();
      try {
        const r = await judgeCase({
          systemPrompt: evalSystemPrompt,
          agentId: agent.id,
          orgId,
          readableSkills,
          builtinTools,
          model: evalAnswerModel(agent),
          scenario: tc.inputScenario,
          expectedBehavior: tc.expectedBehavior,
          criteria,
          passingScore,
        });
        return { ...r, latencyMs: Date.now() - attemptStarted };
      } catch (err: any) {
        return {
          passed: false, score: 0, criteriaMet: [], criteriaMissed: criteria,
          reasoning: `Execution failed: ${err?.message}`, actualOutput: "", skillsLoaded: [] as string[],
          latencyMs: Date.now() - attemptStarted,
        };
      }
    });
    // The case passes only if every attempt did. With one attempt this is
    // the attempt's own result, as before.
    const { representative: result, representativeIndex, score, stability } = foldAttempts(attempts);
    const latencyMs = meanLatencyMs(attempts);
    judged.push({ caseId: tc.id, name: tc.name, ...result, latencyMs, passed: stability.passed, score, ...(repeats > 1 ? { stability } : {}) });

    const missedText = result.criteriaMissed.join("; ") || result.reasoning;
    await storage.createEvalCaseResult({
      runId: run.id,
      caseId: tc.id,
      passed: stability.passed,
      actualOutput: { response: result.actualOutput, skillsLoaded: result.skillsLoaded, toolsUsed: result.toolsUsed ?? [], scenarioCategory: tc.scenarioCategory, difficultyTier: tc.difficultyTier } as any,
      scorerOutputs: {
        score,
        passingScore,
        criteriaMet: result.criteriaMet,
        criteriaMissed: result.criteriaMissed,
        judgeReasoning: result.reasoning,
        truncated: result.truncated ?? false,
        ...repeatedRowNotes(repeats, representativeIndex),
        ...(repeats > 1 ? {
          stability,
          attempts: attempts.map(a => ({
            passed: a.passed, score: a.score, criteriaMissed: a.criteriaMissed, reasoning: a.reasoning,
            response: a.actualOutput, skillsLoaded: a.skillsLoaded, latencyMs: a.latencyMs,
          })),
        } : {}),
      } as any,
      failingReason: stability.passed ? null : (stability.failingReason ? `${stability.failingReason}; ${missedText}` : missedText),
      latencyMs,
    });
  }

  const passed = judged.filter(c => c.passed).length;
  // 0-1 fraction, matching insertEvalRunSchema's documented contract. The
  // skill-eval runner in agents.ts writes passedCount/total*100 through
  // updateEvalRun, which bypasses that validation -- do not copy it.
  const passRate = cases.length > 0 ? passed / cases.length : 0;
  const avgLatencyMs = cases.length > 0 ? Math.round(judged.reduce((a, c) => a + c.latencyMs, 0) / cases.length) : 0;
  const stabilitySummary = repeats > 1 ? { repeats, stability: summarizeRun(judged.map(c => ({ caseId: c.caseId, stability: c.stability! }))) } : {};

  await storage.updateEvalRun(run.id, {
    status: "completed",
    passedCases: passed,
    failedCases: cases.length - passed,
    passRate,
    avgLatencyMs,
    completedAt: new Date(),
    resultsJson: {
      mode: "prompt_level",
      note: "Scored against the agent's assembled system prompt (ontology, bound policies with directives) plus its on-demand skills: the skill catalog, read_skill, and the built-in document and calculation tools its skills grant, run in-process. MCP tools were not dispatched and no team graph was executed.",
      skills: {
        offered: readableSkills.map(s => s.name),
        casesThatLoadedASkill: judged.filter(c => c.skillsLoaded.length > 0).length,
      },
      builtinTools: {
        offered: builtinTools.map(t => t.toolName),
        casesThatCalledATool: judged.filter(c => (c.toolsUsed ?? []).length > 0).length,
      },
      answeredBy: evalAnswerModel(agent),
      casesTruncated: judged.filter(c => c.truncated).length,
      goldenDatasetId: dataset.id,
      goldenDatasetName: dataset.name,
      ...stabilitySummary,
      byCategory: judged.reduce((acc: Record<string, { passed: number; total: number }>, c) => {
        const tc = cases.find(x => x.id === c.caseId);
        const cat = tc?.scenarioCategory || "unknown";
        acc[cat] = acc[cat] || { passed: 0, total: 0 };
        acc[cat].total++;
        if (c.passed) acc[cat].passed++;
        return acc;
      }, {}),
    } as any,
  });

  await recordSuiteRate(suite.id, repeats, passRate);

  return {
    runId: run.id,
    mode: "prompt_level",
    agent: { id: agent.id, name: agent.name },
    goldenDataset: { id: dataset.id, name: dataset.name },
    totalCases: cases.length,
    passed,
    failed: cases.length - passed,
    passRate,
    ...stabilitySummary,
    results: judged.map(c => ({
      name: c.name, passed: c.passed, score: c.score,
      criteriaMissed: c.criteriaMissed, reasoning: c.reasoning, skillsLoaded: c.skillsLoaded, toolsUsed: c.toolsUsed ?? [],
      ...(c.stability ? {
        attempts: c.stability.attempts, passedAttempts: c.stability.passedAttempts,
        outcome: c.stability.outcome, consistency: c.stability.consistency,
      } : {}),
    })),
  };
}

/** Runs a suite's own test cases for an existing run row and returns the response body. */
export async function executeSuiteRun(c: RunInput & { cases: EvalTestCase[] }) {
  const { orgId, run, suite, agent, cases, repeats, evalSystemPrompt, readableSkills, builtinTools = [], onProgress } = c;
  const judged: JudgedCase[] = [];
  let unjudgeable = 0;
  // Reported per run, so a reader can see which cases were compared and
  // which were a model's judgement rather than assuming one instrument.
  const byInstrument = { structured_comparison: 0, prose_judge: 0, no_instrument: 0 };
  // Reported on the run: a pass rate that moved because prior decisions were
  // injected must be distinguishable from one that moved because the agent
  // changed.
  let casesWithPriorContext = 0;
  for (const tc of cases) {
    await onProgress?.(judged.length, cases.length);
    const instrument = classifyEvalCase(tc);
    const input: any = tc.inputData ?? {};
    const baseScenario = [input.prompt, input.context ? `Context: ${input.context}` : ""].filter(Boolean).join("\n\n")
      || JSON.stringify(input);

    // The eval must score the prompt production actually uses. Until this, it
    // did not: a team run goes through the DAG engine, which offers a step the
    // prior decisions on the business objects in its state, while an eval built
    // its prompt from buildAgentSystemPromptWithGovernance alone. A suite that
    // scores a different prompt than the runtime assembles is measuring
    // something adjacent to production.
    //
    // Subjects come from the case's own inputData, which is the eval's
    // equivalent of run state. Off unless the platform flag is on, so an
    // existing suite's numbers do not move until someone turns it on.
    const priorForCase = await priorDecisionsForPrompt({
      teamAgentId: agent.id,
      state: input,
      orgId,
      purpose: "draft",
    });
    if (priorForCase.text) casesWithPriorContext++;
    const scenario = priorForCase.text ? `${baseScenario}\n\n${priorForCase.text}` : baseScenario;

    // A case with nothing to judge against is counted as failed rather than
    // skipped. Skipping it would quietly raise the suite's pass rate on the
    // cases that happen to be well-formed; the failing reason names the case
    // as the problem, not the agent.
    if (instrument.kind === "none") {
      unjudgeable++;
      byInstrument.no_instrument++;
      judged.push({
        caseId: tc.id, name: tc.name, latencyMs: 0, passed: false, score: 0,
        criteriaMet: [], criteriaMissed: [], actualOutput: "", skillsLoaded: [],
        reasoning: "Test case has no expectedOutput, so nothing could be judged against it.",
      });
      await storage.createEvalCaseResult({
        runId: run.id, caseId: tc.id, passed: false,
        actualOutput: {} as any,
        scorerOutputs: { score: 0, passingScore: 1, unjudgeable: true } as any,
        failingReason: "Test case has no expectedOutput — fix the case, not the agent",
        latencyMs: 0,
      });
      continue;
    }

    // A case asserting field values is a comparison, so it is scored by
    // comparison: the agent answers under its real prompt, and its own JSON
    // verdict is checked field by field. No examiner call -- an LLM asked to
    // echo raw JSON as criterion text failed all 107 of these regardless of
    // what the agent said.
    if (instrument.kind === "structured") {
      byInstrument.structured_comparison++;
      // One attempt per repeat. A thrown attempt is a failed attempt with no
      // verdict, so one bad call does not discard the others.
      const attempts = await runAttempts(repeats, async () => {
        const attemptStarted = Date.now();
        let answerText = "";
        let skillsLoaded: string[] = [];
        let toolsUsed: string[] = [];
        let truncated = false;
        let scored: ReturnType<typeof scoreStructuredCase>;
        try {
          const answer = await answerCase({
            systemPrompt: evalSystemPrompt,
            agentId: agent.id,
            orgId,
            readableSkills,
            builtinTools,
            model: evalAnswerModel(agent),
            scenario: `${scenario}\n\nReturn ONLY a JSON object with exactly these keys: ${instrument.keys.join(", ")}. Do not wrap it in prose.`,
          });
          answerText = answer.text;
          skillsLoaded = answer.skillsLoaded;
          toolsUsed = answer.toolsUsed;
          truncated = answer.truncated;
          scored = scoreStructuredCase(instrument.expected, instrument.keys, answerText);
          if (truncated) scored = { ...scored, reasoning: truncationNote(true) + scored.reasoning };
        } catch (err: any) {
          scored = {
            passed: false, score: 0, met: [], missed: instrument.keys,
            noVerdict: true, reasoning: `Execution failed: ${err?.message}`,
          };
        }
        return {
          scored, answerText, skillsLoaded, toolsUsed, truncated,
          passed: scored.passed, score: scored.score,
          verdict: extractJsonObject(answerText),
          latencyMs: Date.now() - attemptStarted,
        };
      });
      // The case passes only if every attempt did, and the asserted fields
      // are checked for a value that changed between attempts. With one
      // attempt this is the attempt's own result, as before.
      const { representative, representativeIndex, score, stability } = foldAttempts(attempts, { keys: instrument.keys, verdict: a => a.verdict });
      const { scored, answerText, skillsLoaded, toolsUsed, truncated } = representative;
      const latencyMs = meanLatencyMs(attempts);
      judged.push({
        caseId: tc.id, name: tc.name, latencyMs,
        passed: stability.passed, score,
        criteriaMet: scored.met, criteriaMissed: scored.missed,
        reasoning: scored.reasoning, actualOutput: answerText, skillsLoaded, toolsUsed, truncated,
        ...(repeats > 1 ? { stability } : {}),
      });
      const changed = describeUnstableFields(stability.unstableFields);
      await storage.createEvalCaseResult({
        runId: run.id,
        caseId: tc.id,
        passed: stability.passed,
        actualOutput: { response: answerText, skillsLoaded, toolsUsed } as any,
        scorerOutputs: {
          score,
          passingScore: 1,
          criteriaMet: scored.met,
          criteriaMissed: scored.missed,
          judgeReasoning: scored.reasoning,
          // Deterministic, so a reader can tell this score was not a model's
          // opinion -- and noVerdict separates "said nothing parseable" from
          // "said the wrong thing".
          instrument: "structured_comparison",
          noVerdict: scored.noVerdict,
          truncated,
          ...repeatedRowNotes(repeats, representativeIndex),
          ...(repeats > 1 ? {
            stability,
            attempts: attempts.map(a => ({
              passed: a.passed, score: a.score, criteriaMissed: a.scored.missed, reasoning: a.scored.reasoning,
              noVerdict: a.scored.noVerdict, verdict: a.verdict, response: a.answerText,
              skillsLoaded: a.skillsLoaded, latencyMs: a.latencyMs,
            })),
          } : {}),
        } as any,
        failingReason: stability.passed ? null : [stability.failingReason, scored.reasoning, changed].filter(Boolean).join("; "),
        latencyMs,
      });
      continue;
    }

    byInstrument.prose_judge++;
    const attempts = await runAttempts(repeats, async () => {
      const attemptStarted = Date.now();
      try {
        const r = await judgeCase({
          systemPrompt: evalSystemPrompt,
          agentId: agent.id,
          orgId,
          readableSkills,
          builtinTools,
          model: evalAnswerModel(agent),
          scenario,
          expectedBehavior: instrument.criterion,
          criteria: [instrument.criterion],
          passingScore: 1,
        });
        return { ...r, latencyMs: Date.now() - attemptStarted };
      } catch (err: any) {
        return {
          passed: false, score: 0, criteriaMet: [], criteriaMissed: [instrument.criterion],
          reasoning: `Execution failed: ${err?.message}`, actualOutput: "", skillsLoaded: [] as string[],
          latencyMs: Date.now() - attemptStarted,
        };
      }
    });
    const { representative: result, representativeIndex, score, stability } = foldAttempts(attempts);
    const latencyMs = meanLatencyMs(attempts);
    judged.push({ caseId: tc.id, name: tc.name, ...result, latencyMs, passed: stability.passed, score, ...(repeats > 1 ? { stability } : {}) });

    const missedText = result.criteriaMissed.join("; ") || result.reasoning;
    await storage.createEvalCaseResult({
      runId: run.id,
      caseId: tc.id,
      passed: stability.passed,
      actualOutput: { response: result.actualOutput, skillsLoaded: result.skillsLoaded, toolsUsed: result.toolsUsed ?? [] } as any,
      scorerOutputs: {
        score,
        passingScore: 1,
        criteriaMet: result.criteriaMet,
        criteriaMissed: result.criteriaMissed,
        judgeReasoning: result.reasoning,
        truncated: result.truncated ?? false,
        ...repeatedRowNotes(repeats, representativeIndex),
        ...(repeats > 1 ? {
          stability,
          attempts: attempts.map(a => ({
            passed: a.passed, score: a.score, criteriaMissed: a.criteriaMissed, reasoning: a.reasoning,
            response: a.actualOutput, skillsLoaded: a.skillsLoaded, latencyMs: a.latencyMs,
          })),
        } : {}),
      } as any,
      failingReason: stability.passed ? null : (stability.failingReason ? `${stability.failingReason}; ${missedText}` : missedText),
      latencyMs,
    });
  }

  const passed = judged.filter(c => c.passed).length;
  // 0-1 fraction, matching insertEvalRunSchema's contract -- the skill-eval
  // runner in agents.ts writes 0-100 through updateEvalRun and bypasses that
  // validation; do not copy it.
  const passRate = cases.length > 0 ? passed / cases.length : 0;
  const avgLatencyMs = cases.length > 0 ? Math.round(judged.reduce((a, c) => a + c.latencyMs, 0) / cases.length) : 0;
  // Cases with nothing to judge never ran, so they are left out of the figures.
  const stabilitySummary = repeats > 1
    ? { repeats, stability: summarizeRun(judged.filter(c => c.stability).map(c => ({ caseId: c.caseId, stability: c.stability! }))) }
    : {};

  await storage.updateEvalRun(run.id, {
    status: "completed",
    passedCases: passed,
    failedCases: cases.length - passed,
    passRate,
    avgLatencyMs,
    completedAt: new Date(),
    resultsJson: {
      mode: "prompt_level",
      note: "Scored against the agent's assembled system prompt (ontology, bound policies with directives) plus its on-demand skills and the built-in document and calculation tools its skills grant, run in-process. MCP tools were not dispatched and no team graph was executed.",
      source: "eval_test_cases",
      criteriaSource: "expectedOutput (these cases carry no explicit evaluationCriteria), routed per case to a deterministic field comparison or the prose examiner",
      instruments: byInstrument,
      answeredBy: evalAnswerModel(agent),
      casesTruncated: judged.filter(c => c.truncated).length,
      priorContext: { casesWithPriorContext, of: cases.length },
      unjudgeableCases: unjudgeable,
      ...stabilitySummary,
      skills: {
        offered: readableSkills.map(s => s.name),
        casesThatLoadedASkill: judged.filter(c => c.skillsLoaded.length > 0).length,
      },
      builtinTools: {
        offered: builtinTools.map(t => t.toolName),
        casesThatCalledATool: judged.filter(c => (c.toolsUsed ?? []).length > 0).length,
      },
    } as any,
  });

  await recordSuiteRate(suite.id, repeats, passRate);

  return {
    runId: run.id,
    mode: "prompt_level",
    agent: { id: agent.id, name: agent.name },
    suite: { id: suite.id, name: suite.name },
    totalCases: cases.length,
    passedCases: passed,
    failedCases: cases.length - passed,
    unjudgeableCases: unjudgeable,
    instruments: byInstrument,
    casesWithPriorContext,
    passRate,
    avgLatencyMs,
    ...stabilitySummary,
    cases: judged.map(c => ({
      caseId: c.caseId, name: c.name, passed: c.passed, score: c.score,
      reasoning: c.reasoning, skillsLoaded: c.skillsLoaded, toolsUsed: c.toolsUsed ?? [], latencyMs: c.latencyMs,
      ...(c.stability ? {
        attempts: c.stability.attempts, passedAttempts: c.stability.passedAttempts,
        outcome: c.stability.outcome, consistency: c.stability.consistency,
        unstableFields: c.stability.unstableFields,
      } : {}),
    })),
  };
}

/**
 * Runs a queued repeated run. Called by the job worker (server/eval-repeat-job.ts).
 * Rebuilds the run from the ids the route stored, so a deleted case is skipped
 * rather than shifting the others.
 */
export async function runEvalRepeatJob(p: RepeatRunPayload, onProgress?: RunInput["onProgress"]) {
  const suite = await storage.getEvalSuite(p.suiteId);
  if (!suite) throw new Error("Eval suite no longer exists");
  if (!suite.agentId) throw new Error("Eval suite has no linked agent");
  const agent = await storage.getAgent(suite.agentId, p.orgId ?? undefined);
  if (!agent) throw new Error("Agent for this suite no longer exists");
  const prompt = await prepareEvalPrompt(agent, p.orgId);
  const inOrder = <T extends { id: string }>(all: T[]) => p.caseIds.map(id => all.find(c => c.id === id)).filter((c): c is T => !!c);
  const base = { orgId: p.orgId, run: { id: p.runId }, suite, agent, repeats: p.repeats, onProgress, ...prompt };

  if (p.mode === "golden") {
    if (!suite.goldenDatasetId) throw new Error("Eval suite is no longer linked to a golden dataset");
    const dataset = await storage.getGoldenDataset(suite.goldenDatasetId);
    if (!dataset) throw new Error("Linked golden dataset no longer exists");
    const cases = inOrder(await storage.getGoldenTestCases(suite.goldenDatasetId));
    if (cases.length === 0) throw new Error("None of the run's cases exist any more");
    return executeGoldenRun({ ...base, dataset, cases });
  }
  const cases = inOrder(await storage.getEvalTestCases(suite.id));
  if (cases.length === 0) throw new Error("None of the run's cases exist any more");
  return executeSuiteRun({ ...base, cases });
}

/**
 * POST /api/evals/:suiteId/run-golden
 * Executes the suite's linked golden dataset against the suite's agent.
 */
router.post("/api/evals/:suiteId/run-golden", checkPermission("create_modify_blueprints"), async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const suite = await storage.getEvalSuite(req.params.suiteId as string);
    if (!suite) return res.status(404).json({ error: "Eval suite not found" });
    if (!suite.goldenDatasetId) {
      return res.status(400).json({ error: "This eval suite has no linked golden dataset. Set goldenDatasetId on the suite first." });
    }
    if (!suite.agentId) return res.status(400).json({ error: "This eval suite has no linked agent" });

    const agent = await storage.getAgent(suite.agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const dataset = await storage.getGoldenDataset(suite.goldenDatasetId);
    if (!dataset) return res.status(404).json({ error: "Linked golden dataset not found" });

    const allCases = (await storage.getGoldenTestCases(suite.goldenDatasetId)).filter(c => c.status === "active");
    if (allCases.length === 0) {
      return res.status(400).json({ error: "Linked golden dataset has no active test cases" });
    }
    const limit = Math.min(Number(req.body?.limit) || allCases.length, 25);
    const cases = allCases.slice(0, limit);

    // Refused before the run row exists, so a bad request leaves nothing "running".
    const resolved = resolveRepeats(req.body?.repeats, cases.length);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });
    const repeats = resolved.repeats;

    const prompt = await prepareEvalPrompt(agent, orgId);

    const run = await storage.createEvalRun({
      suiteId: suite.id,
      agentId: agent.id,
      status: "running",
      totalCases: cases.length,
      triggeredBy: (req.body?.triggeredBy as string) || "manual",
      environment: (agent as any).environment || "staging",
      ...repeatedRunMarker(repeats),
    });

    // A repeated run takes many times longer than a request can wait (Azure cuts one
    // that is silent for about 230 seconds), so it runs as a background job and the
    // caller reads the run. One attempt per case is still answered in the request.
    if (repeats > 1) {
      const queued = await queueRepeatRun({ mode: "golden", suiteId: suite.id, runId: run.id, agentId: agent.id, caseIds: cases.map(c => c.id), repeats, orgId }, cases.length);
      return res.status(202).json(queued);
    }
    res.json(await executeGoldenRun({ orgId, run, suite, agent, dataset, cases, repeats, ...prompt }));
  } catch (e: any) {
    console.error("[run-golden] failed:", e);
    res.status(500).json({ error: e.message || "Failed to run golden dataset" });
  }
});

/**
 * POST /api/evals/:id/execute
 *
 * Runs a suite whose cases live in eval_test_cases, which until now nothing
 * could execute. run-golden above covers suites linked to a golden dataset;
 * POST /api/evals/:id/runs only INSERTS a run row and returns it, leaving the
 * row at status "running" forever unless an external harness posts case results
 * back. Measured on this platform: of the 17 suites covering the two MGA
 * journeys, 0 had a golden dataset and none had ever been executed, so the
 * promotion gate blocked production on pass rates nobody had ever produced.
 *
 * Same scope as run-golden, deliberately: PROMPT-LEVEL. Each case runs against
 * the agent's real assembled system prompt and the same on-demand skills the
 * runtime offers, then is judged. No MCP dispatch and no team graph, so the run
 * records mode "prompt_level" and a score is never read as an integration result.
 *
 * These cases carry no evaluationCriteria, only expectedOutput, and that field
 * is not one shape: measured across the 17 MGA suites, 39 of 146 active cases
 * hold prose and 107 hold an object asserting field values. Each case is routed
 * to the instrument that can actually score it (see classifyEvalCase) --
 * prose to the examiner, asserted fields to a deterministic comparison. The
 * first version of this route stringified every object into criterion text,
 * which scored all 107 zero no matter how the agent answered.
 */
router.post("/api/evals/:id/execute", checkPermission("create_modify_blueprints"), async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const suite = await storage.getEvalSuite(req.params.id as string);
    if (!suite) return res.status(404).json({ error: "Eval suite not found" });
    if (suite.goldenDatasetId) {
      return res.status(400).json({ error: "This suite is linked to a golden dataset; use /api/evals/:id/run-golden so one suite is not scored two different ways." });
    }
    if (!suite.agentId) return res.status(400).json({ error: "Suite is not bound to an agent, so there is nothing to run it against" });
    const agent = await storage.getAgent(suite.agentId, orgId ?? undefined);
    if (!agent) return res.status(404).json({ error: "Agent for this suite not found" });

    const allCases = (await storage.getEvalTestCases(suite.id)).filter(c => (c.status ?? "active") === "active");
    // A suite with no cases must not produce a run at all. Scoring zero cases
    // yields a 100% pass rate on an empty denominator, which the promotion gate
    // would then read as a measured success -- the exact confusion between
    // "nothing failed" and "nothing ran" that the gate was just taught to avoid.
    if (allCases.length === 0) {
      return res.status(400).json({ error: "Suite has no active test cases, so there is nothing to measure", totalCases: 0 });
    }
    const limit = Math.min(Number(req.body?.limit) || allCases.length, 25);
    const cases = allCases.slice(0, limit);

    // Refused before the run row exists, so a bad request leaves nothing "running".
    const resolved = resolveRepeats(req.body?.repeats, cases.length);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });
    const repeats = resolved.repeats;

    const prompt = await prepareEvalPrompt(agent, orgId);

    const run = await storage.createEvalRun({
      suiteId: suite.id,
      agentId: agent.id,
      status: "running",
      totalCases: cases.length,
      triggeredBy: (req.body?.triggeredBy as string) || "manual",
      environment: (agent as any).environment || "staging",
      ...repeatedRunMarker(repeats),
    });

    // See run-golden: a repeated run is queued, not answered in the request.
    if (repeats > 1) {
      const queued = await queueRepeatRun({ mode: "execute", suiteId: suite.id, runId: run.id, agentId: agent.id, caseIds: cases.map(c => c.id), repeats, orgId }, cases.length);
      return res.status(202).json(queued);
    }
    res.json(await executeSuiteRun({ orgId, run, suite, agent, cases, repeats, ...prompt }));
  } catch (e: any) {
    console.error("[eval-execute] failed:", e);
    res.status(500).json({ error: e.message || "Failed to execute eval suite" });
  }
});

/**
 * POST /api/golden-datasets/link-suites
 * Links eval suites to a golden dataset for agents in a given industry (and
 * optionally sub-vertical), so an existing suite gains a regression baseline
 * without hand-editing each one.
 */
router.post("/api/golden-datasets/link-suites", checkPermission("create_modify_blueprints"), async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { goldenDatasetId, agentIds } = req.body || {};
    if (!goldenDatasetId) return res.status(400).json({ error: "goldenDatasetId is required" });
    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({ error: "agentIds (array) is required" });
    }
    const dataset = await storage.getGoldenDataset(goldenDatasetId);
    if (!dataset) return res.status(404).json({ error: "Golden dataset not found" });

    const allSuites = await storage.getEvalSuites();
    const linked: Array<{ agentId: string; suiteId: string }> = [];
    const skipped: Array<{ agentId: string; reason: string }> = [];

    for (const agentId of agentIds) {
      const agent = await storage.getAgent(agentId, orgId);
      if (!agent) { skipped.push({ agentId, reason: "agent not found" }); continue; }
      const suites = allSuites.filter(s => s.agentId === agentId);
      if (suites.length === 0) { skipped.push({ agentId, reason: "no eval suite" }); continue; }
      for (const s of suites) {
        await storage.updateEvalSuite(s.id, { goldenDatasetId });
        linked.push({ agentId, suiteId: s.id });
      }
    }

    res.json({ goldenDataset: { id: dataset.id, name: dataset.name }, linkedCount: linked.length, linked, skipped });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to link suites" });
  }
});

export default router;
