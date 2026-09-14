/**
 * On-demand skill loading.
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
 * Instead, the prompt carries a short catalog -- one line per skill -- and the
 * agent gets a built-in read_skill tool that returns a skill's full procedure
 * when the task actually calls for it. Nothing is truncated to fit a budget, and
 * an agent that never needs a skill pays nothing for it.
 *
 * Like the built-in document tools this is a real tool on the ordinary surface,
 * dispatched in-process by executeTool. Unlike them it is exempt from the gates
 * that restrict what an agent may DO (see dispatchToolCall): reading your own
 * assigned instructions has no external effect, and inheriting a pre-existing
 * tool allowlist would silently disable every skill on that agent.
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

/**
 * The skills an agent may read: its own active assigned skills, then those of
 * its direct team members (an orchestrator consulting its team's playbooks).
 * Never org-wide, never a member's members. Own skills come first so they win
 * the catalog's slots when the combined set is large.
 */
export async function resolveReadableSkills(agentId: string, orgId?: string | null): Promise<Skill[]> {
  const agent = await storage.getAgent(agentId, orgId ?? undefined);
  if (!agent) return [];

  const ids: string[] = [...preloadedSkillIds(agent)];
  try {
    const members = await storage.getAgentTeamMembers(agentId);
    for (const m of members) {
      const member = await storage.getAgent((m as any).memberAgentId, orgId ?? undefined);
      if (member) ids.push(...preloadedSkillIds(member));
    }
  } catch {
    // Team membership is additive; failing to read it leaves the agent's own skills.
  }

  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return [];
  const rows = await storage.getSkillsByIds(unique);
  const byId = new Map(rows.map((s) => [s.id, s]));
  return unique
    .map((id) => byId.get(id))
    .filter((s): s is Skill => !!s && s.status === "active" && typeof s.markdownBody === "string" && s.markdownBody.trim().length > 0);
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
        "Load the full procedure for one of your skills. Call this before acting on a task a skill covers, " +
        "then follow the procedure it returns -- including its required checks and the disclosures its output must contain. " +
        "Load only the skills the task needs.",
      toolInputSchema: {
        type: "object",
        properties: {
          skill: { type: "string", enum: names, description: "Exact name of the skill to load." },
        },
        required: ["skill"],
      },
    },
  ];
}

/**
 * One line per skill for the system prompt. Skills already injected in full
 * (contextMode "full") are still listed, so the catalog is the complete set.
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
    "Each skill below is a detailed procedure you can follow. Before acting on a task a skill covers, call read_skill with its name and follow the procedure it returns, including its required checks and the disclosures its output must contain.",
    ...lines,
  ].join("\n");
}

export function isBuiltinSkillTool(tool: AvailableTool): boolean {
  return tool.serverId === BUILTIN_SKILL_SERVER_ID;
}

/**
 * Returns a skill's procedure. Authorisation is re-derived from the agent's own
 * assignments at call time -- the enum on the tool schema is a convenience for
 * the model, not a permission check.
 */
export async function executeBuiltinSkillTool(
  toolName: string,
  args: Record<string, any>,
  ctx: { orgId?: string | null; agentId?: string; /** false for evaluation runs, which are not real usage. Defaults to true. */ countActivation?: boolean },
): Promise<any> {
  if (toolName !== READ_SKILL_TOOL) throw new Error(`Unknown skill tool "${toolName}"`);
  if (!ctx.agentId) return { ok: false, error: "No agent context to read a skill for." };

  const requested = typeof args?.skill === "string" ? args.skill.trim() : "";
  const readable = await resolveReadableSkills(ctx.agentId, ctx.orgId);
  if (!requested) {
    return { ok: false, error: "Name the skill to load.", availableSkills: readable.map((s) => s.name) };
  }

  const wanted = requested.toLowerCase();
  const skill = readable.find((s) => s.name.toLowerCase() === wanted || s.id === requested);
  if (!skill) {
    // Returned rather than thrown: the model can pick a valid name and retry.
    return { ok: false, error: `No skill named "${requested}" is available to this agent.`, availableSkills: readable.map((s) => s.name) };
  }

  const body = String(skill.markdownBody);
  const truncated = body.length > MAX_PROCEDURE_CHARS;

  // activationCount means "an agent actually used this skill": bumped on a real
  // load, not once per run for every assigned skill. Fire-and-forget; counter
  // races are acceptable for telemetry.
  if (ctx.countActivation !== false) {
    storage.updateSkill(skill.id, { activationCount: (skill.activationCount ?? 0) + 1 } as any).catch(() => {});
  }

  return {
    ok: true,
    skill: skill.name,
    domain: skill.domain,
    version: skill.version,
    procedure: truncated ? `${body.slice(0, MAX_PROCEDURE_CHARS)}\n...[truncated]` : body,
    truncated,
  };
}
