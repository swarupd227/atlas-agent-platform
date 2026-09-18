/**
 * Skill procedures: inlined when they fit, loaded on demand when they do not.
 *
 * A skill's procedure (markdownBody) used to reach a model only when the skill
 * was set to contextMode "full", and even then inside a 500-token capabilities
 * budget -- against procedures that average several thousand tokens. No skill
 * on the platform used "full", so in practice agents saw a one-line description
 * and never the procedure itself; most execution surfaces showed no skills at
 * all. Golden evals made the cost visible: agents made the right decision but
 * skipped the disclosures the procedure requires (the fetch date, the premium
 * effect stated separately, the endorsement's effective date).
 *
 * The first fix was a short catalog plus a built-in read_skill tool. Measured
 * on the account journeys, a read is not a cheap fetch: it is a full model
 * round trip -- ~6s against a 10K-token prompt -- and the body then rides in
 * every later call of the run anyway. An agent read its own procedures on
 * every run, one at a time; a team orchestrator read five (~30s of pure
 * latency) before doing anything.
 *
 * So an agent's OWN procedures are now inlined in its system prompt while they
 * fit a token budget (agents.runtimeConfig.skillInlineBudgetTokens, default
 * DEFAULT_SKILL_INLINE_BUDGET_TOKENS; contextMode "full" always inlines), and
 * only what does not fit -- plus its team members' skills, which are theirs to
 * apply -- stays behind read_skill, which now loads several skills in one call.
 *
 * Like the built-in document tools read_skill is a real tool on the ordinary
 * surface, dispatched in-process by executeTool. Unlike them it is exempt from
 * the gates that restrict what an agent may DO (see dispatchToolCall): reading
 * your own assigned instructions has no external effect, and inheriting a
 * pre-existing tool allowlist would silently disable every skill on that agent.
 */

import type { Skill } from "@shared/schema";
import type { AvailableTool } from "./tool-dispatcher";
import { storage } from "./storage";

/** Synthetic server identity; `serverId` is what executeTool routes on. */
export const BUILTIN_SKILL_SERVER_ID = "builtin:skills";
const BUILTIN_SKILL_SERVER_NAME = "Skills";

/** read_* so the dispatcher's idempotency logic classifies it as read-only. */
export const READ_SKILL_TOOL = "read_skill";

/** Upper bound on a returned procedure (~6K tokens) -- large enough for any
 *  real skill, small enough that a runaway body cannot flood the context. */
const MAX_PROCEDURE_CHARS = 24_000;
/** Catalog limits keep the always-present prompt cost small and predictable. */
const MAX_CATALOG_SKILLS = 20;
const MAX_CATALOG_DESCRIPTION_CHARS = 280;

/**
 * Procedures inlined per run, in tokens. Two typical procedures (~3.5K each)
 * fit; a call re-sends them, but that costs a fraction of a second of prefill
 * against the ~6s round trip each read cost.
 */
export const DEFAULT_SKILL_INLINE_BUDGET_TOKENS = 8000;

/** contextMode values the platform implements. Anything else stored on a row
 *  (seed scripts wrote "summary", "rag", "fork") is treated as "inline". */
export const SKILL_CONTEXT_MODES = ["inline", "full"] as const;
export type SkillContextMode = (typeof SKILL_CONTEXT_MODES)[number];
export function normalizeContextMode(raw: unknown): SkillContextMode {
  return raw === "full" ? "full" : "inline";
}

function preloadedSkillIds(agent: any): string[] {
  const raw = agent?.preloadedSkills;
  return Array.isArray(raw) ? raw.map((p: any) => p?.skillId).filter((id: unknown): id is string => typeof id === "string" && id.length > 0) : [];
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

function procedureText(skill: Skill): { text: string; truncated: boolean } {
  const body = String(skill.markdownBody);
  const truncated = body.length > MAX_PROCEDURE_CHARS;
  return { text: truncated ? `${body.slice(0, MAX_PROCEDURE_CHARS)}\n...[truncated]` : body, truncated };
}

export interface ReadableSkillSets {
  /** The agent's own active assigned skills, in assignment order. */
  own: Skill[];
  /** Its direct team members' skills (an orchestrator consulting its team's playbooks), minus any it also owns. */
  team: Skill[];
}

/**
 * The skills an agent may read: its own active assigned skills, then those of
 * its direct team members. Never org-wide, never a member's members.
 */
export async function resolveReadableSkillSets(agentId: string, orgId?: string | null): Promise<ReadableSkillSets> {
  const agent = await storage.getAgent(agentId, orgId ?? undefined);
  if (!agent) return { own: [], team: [] };

  const ownIds = Array.from(new Set(preloadedSkillIds(agent)));
  const teamIds: string[] = [];
  try {
    const members = await storage.getAgentTeamMembers(agentId);
    for (const m of members) {
      const member = await storage.getAgent((m as any).memberAgentId, orgId ?? undefined);
      if (member) teamIds.push(...preloadedSkillIds(member));
    }
  } catch {
    // Team membership is additive; failing to read it leaves the agent's own skills.
  }

  const unique = Array.from(new Set([...ownIds, ...teamIds]));
  if (unique.length === 0) return { own: [], team: [] };
  const rows = await storage.getSkillsByIds(unique);
  const byId = new Map(rows.map((s) => [s.id, s]));
  const usable = (id: string): Skill | undefined => {
    const s = byId.get(id);
    return s && s.status === "active" && typeof s.markdownBody === "string" && s.markdownBody.trim().length > 0 ? s : undefined;
  };
  const own = ownIds.map(usable).filter((s): s is Skill => !!s);
  const ownSet = new Set(own.map((s) => s.id));
  const team = Array.from(new Set(teamIds)).filter((id) => !ownSet.has(id)).map(usable).filter((s): s is Skill => !!s);
  return { own, team };
}

/** Own skills first, then team members' -- the set read_skill authorises against. */
export async function resolveReadableSkills(agentId: string, orgId?: string | null): Promise<Skill[]> {
  const { own, team } = await resolveReadableSkillSets(agentId, orgId);
  return [...own, ...team];
}

export interface SkillContextPlan {
  /** Procedures placed in the system prompt. */
  inline: Skill[];
  /** Skills listed in the catalog and loaded through read_skill. */
  onDemand: Skill[];
}

/**
 * Which procedures go into the prompt and which stay behind read_skill. Own
 * skills are inlined in assignment order while the running total fits the
 * budget (contextMode "full" always inlines); the rest, and every team
 * member's skill, stays on demand.
 */
export function planSkillContext(own: Skill[], team: Skill[], budgetTokens: number = DEFAULT_SKILL_INLINE_BUDGET_TOKENS): SkillContextPlan {
  const inline: Skill[] = [];
  const onDemand: Skill[] = [];
  let used = 0;
  for (const skill of own) {
    const tokens = estimateTokens(procedureText(skill).text);
    if (normalizeContextMode((skill as any).contextMode) === "full" || used + tokens <= budgetTokens) {
      inline.push(skill);
      used += tokens;
    } else {
      onDemand.push(skill);
    }
  }
  return { inline, onDemand: [...onDemand, ...team] };
}

/** The inlined procedures as a system-prompt block ("" when none). */
export function skillProceduresPrompt(inline: Skill[]): string {
  if (inline.length === 0) return "";
  const sections = inline.map((s) => `### ${s.name}${s.domain ? ` (${s.domain})` : ""}\n${procedureText(s).text}`);
  return [
    "",
    "",
    "## SKILL PROCEDURES",
    "These procedures are yours: follow the one a task calls for, including its required checks and the disclosures its output must contain. Follow procedures without narrating them: do not tell the user which procedure, steps or checks you applied. Give them the outcome and the disclosures the procedure requires.",
    "",
    ...sections,
  ].join("\n");
}

/** The read_skill tool for these skills; empty when there is nothing to read. */
export function skillToolsFor(skills: Skill[]): AvailableTool[] {
  if (skills.length === 0) return [];
  const names = skills.slice(0, MAX_CATALOG_SKILLS).map((s) => s.name);
  return [
    {
      serverId: BUILTIN_SKILL_SERVER_ID,
      serverName: BUILTIN_SKILL_SERVER_NAME,
      serverUrl: "",
      toolName: READ_SKILL_TOOL,
      toolDescription:
        "Load the full procedure for one or more of your skills. Call this before acting on a task a skill covers, naming every skill you need in one call, " +
        "then follow the procedures it returns -- including their required checks and the disclosures your output must contain. " +
        "Load only the skills the task needs, and do not mention to the user that you loaded or followed one.",
      toolInputSchema: {
        type: "object",
        properties: {
          skills: { type: "array", items: { type: "string", enum: names }, description: "Exact names of the skills to load, all in one call." },
          skill: { type: "string", enum: names, description: "A single skill to load (use skills for several)." },
        },
      },
    },
  ];
}

/**
 * One line per skill for the system prompt: the skills that stay on demand.
 */
export function skillCatalogPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const shown = skills.slice(0, MAX_CATALOG_SKILLS);
  const lines = shown.map((s) => {
    const desc = String(s.description || "").replace(/\s+/g, " ").trim();
    const clipped = desc.length > MAX_CATALOG_DESCRIPTION_CHARS ? `${desc.slice(0, MAX_CATALOG_DESCRIPTION_CHARS - 1)}…` : desc;
    return `- ${s.name}${s.domain ? ` (${s.domain})` : ""}: ${clipped}`;
  });
  return [
    "## SKILLS",
    "Each skill below is a detailed procedure you can load. Before acting on a task a skill covers, call read_skill naming every skill you need in one call, and follow the procedures it returns, including their required checks and the disclosures your output must contain. A skill that belongs to another step's role is theirs to apply: load it only if you must do that work yourself.",
    // Evals showed agents announcing "I've loaded the relevant procedures ... per
    // the Agent of Record Conflict Detection procedure" -- noise for any user, and
    // for a confidential check the announcement itself reveals what was checked.
    "Follow procedures without narrating them: do not tell the user that you loaded a skill, or which procedure, steps or checks you applied. Give them the outcome and the disclosures the procedure requires.",
    ...lines,
  ].join("\n");
}

export function isBuiltinSkillTool(tool: AvailableTool): boolean {
  return tool.serverId === BUILTIN_SKILL_SERVER_ID;
}

function loadedSkill(skill: Skill) {
  const { text, truncated } = procedureText(skill);
  return { ok: true as const, skill: skill.name, domain: skill.domain, version: skill.version, procedure: text, truncated };
}

/**
 * Returns one skill's procedure (args.skill) or several (args.skills).
 * Authorisation is re-derived from the agent's own assignments at call time --
 * the enum on the tool schema is a convenience for the model, not a permission
 * check.
 */
export async function executeBuiltinSkillTool(
  toolName: string,
  args: Record<string, any>,
  ctx: { orgId?: string | null; agentId?: string; /** false for evaluation runs, which are not real usage. Defaults to true. */ countActivation?: boolean },
): Promise<any> {
  if (toolName !== READ_SKILL_TOOL) throw new Error(`Unknown skill tool "${toolName}"`);
  if (!ctx.agentId) return { ok: false, error: "No agent context to read a skill for." };

  const single = typeof args?.skill === "string" ? args.skill.trim() : "";
  const many = Array.isArray(args?.skills) ? args.skills.map((s: unknown) => String(s ?? "").trim()).filter(Boolean) : [];
  const requested = Array.from(new Set([...(single ? [single] : []), ...many]));
  const readable = await resolveReadableSkills(ctx.agentId, ctx.orgId);
  const availableSkills = readable.map((s) => s.name);
  if (requested.length === 0) {
    return { ok: false, error: "Name the skill to load.", availableSkills };
  }

  const found: Skill[] = [];
  const notFound: string[] = [];
  for (const name of requested) {
    const wanted = name.toLowerCase();
    const skill = readable.find((s) => s.name.toLowerCase() === wanted || s.id === name);
    if (skill) found.push(skill);
    else notFound.push(name);
  }

  // activationCount means "an agent actually used this skill": bumped on a real
  // load, not once per run for every assigned skill. Fire-and-forget; counter
  // races are acceptable for telemetry.
  if (ctx.countActivation !== false) {
    for (const skill of found) {
      storage.updateSkill(skill.id, { activationCount: (skill.activationCount ?? 0) + 1 } as any).catch(() => {});
    }
  }

  // A single-name call keeps the single shape; a call naming several skills
  // gets them as a list, with the names that matched nothing so the model can
  // pick a valid one and retry.
  if (many.length === 0) {
    if (found.length === 0) {
      // Returned rather than thrown: the model can pick a valid name and retry.
      return { ok: false, error: `No skill named "${single}" is available to this agent.`, availableSkills };
    }
    return loadedSkill(found[0]);
  }
  return {
    ok: found.length > 0,
    skills: found.map(loadedSkill),
    ...(notFound.length > 0 ? { notFound, availableSkills } : {}),
    ...(found.length === 0 ? { error: `None of the named skills is available to this agent.` } : {}),
  };
}
