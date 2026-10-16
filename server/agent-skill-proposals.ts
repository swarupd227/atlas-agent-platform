/**
 * Agent skill proposals.
 *
 * An agent can notice that a procedure worked and write it down as a skill, or
 * improve one it already uses -- but it never changes a skill. It PROPOSES one
 * through the propose_skill tool, which files a "skill_proposal" approval; the
 * skill reaches a prompt only when a person approves it. A skill is text every
 * later run of every agent that uses it reads as instructions, so an unreviewed
 * write would be a standing instruction from whatever the agent was reading when
 * it wrote it. Memory (server/agent-memory.ts) is governed the same way.
 *
 * What an agent cannot do here, by construction: set allowed tools, MCP servers,
 * data classifications or code execution (a proposed skill is prompt-only), name
 * another organization (the org comes from the agent), or touch a skill it does
 * not itself use. A new skill is stored with status "proposed", which no runtime
 * reader loads; a revision is stored as an unpromoted skill version and is
 * refused at approval if the skill changed since the agent proposed it.
 *
 * The rules (limits, scanning, versioning) are pure and tested on their own. The
 * proposal and decision flows take small dependencies so they run without a
 * database.
 */

import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { agentSkillProposals, type AgentSkillProposal } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { getDefaultOrgId } from "./auth";
import { scanUntrustedText, shortId, type ScanResult } from "./agent-memory";

import { SKILL_PROPOSALS_SETTING, PROPOSE_SKILL_TOOL, BUILTIN_SKILL_PROPOSAL_SERVER_ID } from "./skill-proposal-constants";

export { SKILL_PROPOSALS_SETTING, PROPOSE_SKILL_TOOL, BUILTIN_SKILL_PROPOSAL_SERVER_ID };

export const SKILL_PROPOSAL_LIMITS = {
  minNameChars: 3,
  maxNameChars: 80,
  maxDescriptionChars: 300,
  minInstructionChars: 40,
  /** ~2,000 tokens: a procedure, not a manual. */
  maxInstructionChars: 8000,
  maxReasonChars: 300,
  /** Proposals waiting for a person. Stops an agent flooding the approvals queue. */
  maxPending: 10,
} as const;

// ── Pure rules ──────────────────────────────────────────────────────────────

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.&()\-]*$/;

export const normalizeName = (text: unknown): string => String(text ?? "").replace(/\s+/g, " ").trim();
const normalizeLine = normalizeName;

/** Instructions keep their line breaks (a skill is a procedure) but lose trailing noise. */
export const normalizeInstructions = (text: unknown): string =>
  String(text ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export const proposalHash = (name: string, description: string, instructions: string): string =>
  createHash("sha256").update(`${normalizeName(name).toLowerCase()}\n${normalizeLine(description)}\n${normalizeInstructions(instructions)}`).digest("hex");

/** Whether a proposed skill may be filed at all. A rejection says why, so the agent can fix it. */
export function scanSkillProposal(input: { name?: string; description?: string; instructions: string }, opts: { requireName: boolean }): ScanResult {
  const L = SKILL_PROPOSAL_LIMITS;
  if (opts.requireName) {
    const name = normalizeName(input.name);
    if (name.length < L.minNameChars || name.length > L.maxNameChars) return { ok: false, reason: `the name must be ${L.minNameChars}-${L.maxNameChars} characters` };
    if (!NAME_PATTERN.test(name)) return { ok: false, reason: "the name may only use letters, numbers, spaces and . _ & ( ) -" };
  }
  const description = normalizeLine(input.description);
  if (opts.requireName && !description) return { ok: false, reason: "a description is required: one sentence on when to use the skill" };
  if (description.length > L.maxDescriptionChars) return { ok: false, reason: `the description is ${description.length} characters; at most ${L.maxDescriptionChars}` };
  const instructions = normalizeInstructions(input.instructions);
  if (instructions.length < L.minInstructionChars) return { ok: false, reason: `the instructions are too short to be a procedure (at least ${L.minInstructionChars} characters)` };
  if (instructions.length > L.maxInstructionChars) return { ok: false, reason: `the instructions are ${instructions.length} characters; at most ${L.maxInstructionChars}. Keep the procedure and drop the detail` };
  // A skill may point to a document, so links are allowed; everything else that
  // reads as an attack on the agent's rules, or carries a secret or personal data, is not.
  for (const [what, text] of [["name", input.name ?? ""], ["description", description], ["instructions", instructions]] as const) {
    if (!text) continue;
    const scan = scanUntrustedText(text, { allowLinks: true });
    if (!scan.ok) return { ok: false, reason: what === "instructions" ? scan.reason : `the ${what}: ${scan.reason}` };
  }
  return { ok: true };
}

/** "1.0.3" -> "1.0.4"; anything else gets ".1" appended, so a version is never reused. */
export function nextPatchVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? "").trim());
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : `${String(version ?? "1.0.0").trim() || "1.0.0"}.1`;
}

// ── Dependencies ────────────────────────────────────────────────────────────

/** The part of a skill row the proposal flows read and write. */
export interface SkillRow {
  id: string;
  name: string;
  description: string;
  version: string;
  status: string;
  organizationId?: string | null;
  trustTier?: string | null;
  markdownBody?: string | null;
  yamlFrontmatter?: unknown;
}

export interface SkillVersionRow {
  id: string;
  skillId: string;
  version: string;
  markdownBody?: string | null;
  snapshotData?: unknown;
}

export interface SkillProposalStore {
  list(orgId: string, agentId: string, statuses: string[]): Promise<AgentSkillProposal[]>;
  get(orgId: string, id: string): Promise<AgentSkillProposal | undefined>;
  /** Proposals about one skill, whoever made them. */
  forSkill(orgId: string, skillId: string, statuses: string[]): Promise<AgentSkillProposal[]>;
  insert(row: Omit<AgentSkillProposal, "id" | "createdAt" | "updatedAt">): Promise<AgentSkillProposal>;
  update(orgId: string, id: string, patch: Partial<AgentSkillProposal>): Promise<void>;
  remove(orgId: string, id: string): Promise<void>;
  removeAllForAgent(orgId: string, agentId: string): Promise<AgentSkillProposal[]>;
}

export interface SkillOps {
  findByName(orgId: string, name: string): Promise<SkillRow | undefined>;
  get(orgId: string, id: string): Promise<SkillRow | undefined>;
  create(row: Record<string, unknown>): Promise<SkillRow>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  remove(orgId: string, id: string): Promise<void>;
  /** Ids of the skills this agent itself uses (assigned and active), the only ones it may propose to revise. */
  ownSkillIds(agentId: string, orgId: string): Promise<string[]>;
  createVersion(row: Record<string, unknown>): Promise<SkillVersionRow>;
  getVersion(id: string): Promise<SkillVersionRow | undefined>;
  updateVersion(id: string, patch: Record<string, unknown>): Promise<void>;
  versionsOf(skillId: string): Promise<SkillVersionRow[]>;
  /** Gives the agent the skill (appends to its assigned skills). */
  attach(agentId: string, orgId: string, skillId: string): Promise<void>;
}

export interface SkillProposalDeps {
  store: SkillProposalStore;
  skills: SkillOps;
  getAgent(agentId: string, orgId?: string | null): Promise<{ id: string; name: string; organizationId?: string | null; industryId?: string | null } | undefined>;
  createApproval(a: Record<string, unknown>): Promise<{ id: string }>;
  audit(e: { orgId: string; action: string; objectId: string; actorType: string; actorId: string; details: Record<string, unknown> }): Promise<void>;
}

const orgOf = (orgId?: string | null): string | null => orgId || getDefaultOrgId() || null;

export const dbSkillProposalStore: SkillProposalStore = {
  async list(orgId, agentId, statuses) {
    if (statuses.length === 0) return [];
    return db.select().from(agentSkillProposals)
      .where(and(eq(agentSkillProposals.organizationId, orgId), eq(agentSkillProposals.agentId, agentId), inArray(agentSkillProposals.status, statuses)))
      .orderBy(asc(agentSkillProposals.createdAt));
  },
  async get(orgId, id) {
    const [row] = await db.select().from(agentSkillProposals).where(and(eq(agentSkillProposals.id, id), eq(agentSkillProposals.organizationId, orgId))).limit(1);
    return row;
  },
  async forSkill(orgId, skillId, statuses) {
    if (statuses.length === 0) return [];
    return db.select().from(agentSkillProposals)
      .where(and(eq(agentSkillProposals.organizationId, orgId), eq(agentSkillProposals.skillId, skillId), inArray(agentSkillProposals.status, statuses)))
      .orderBy(asc(agentSkillProposals.createdAt));
  },
  async insert(row) {
    const [created] = await db.insert(agentSkillProposals).values(row as any).returning();
    return created;
  },
  async update(orgId, id, patch) {
    await db.update(agentSkillProposals).set({ ...patch, updatedAt: new Date() } as any)
      .where(and(eq(agentSkillProposals.id, id), eq(agentSkillProposals.organizationId, orgId)));
  },
  async remove(orgId, id) {
    await db.delete(agentSkillProposals).where(and(eq(agentSkillProposals.id, id), eq(agentSkillProposals.organizationId, orgId)));
  },
  async removeAllForAgent(orgId, agentId) {
    return db.delete(agentSkillProposals).where(and(eq(agentSkillProposals.organizationId, orgId), eq(agentSkillProposals.agentId, agentId))).returning();
  },
};

export const dbSkillOps: SkillOps = {
  async findByName(orgId, name) {
    const rows = await storage.getSkills(orgId);
    const want = normalizeName(name).toLowerCase();
    return rows.find((s) => s.organizationId === orgId && normalizeName(s.name).toLowerCase() === want) as SkillRow | undefined;
  },
  async get(orgId, id) {
    const s = await storage.getSkill(id, orgId);
    return s && s.organizationId === orgId ? (s as SkillRow) : undefined;
  },
  async create(row) {
    return (await storage.createSkill(row as any)) as SkillRow;
  },
  async update(id, patch) {
    await storage.updateSkill(id, patch as any);
  },
  async remove(orgId, id) {
    await storage.deleteSkill(id, orgId);
  },
  async ownSkillIds(agentId, orgId) {
    const agent = await storage.getAgent(agentId, orgId);
    const raw = (agent as any)?.preloadedSkills;
    const ids: string[] = Array.isArray(raw) ? raw.map((p: any) => p?.skillId).filter((x: unknown): x is string => typeof x === "string" && x.length > 0) : [];
    if (ids.length === 0) return [];
    return (await storage.getSkillsByIds(Array.from(new Set(ids)))).filter((s) => s.status === "active" && s.organizationId === orgId).map((s) => s.id);
  },
  async createVersion(row) {
    return (await storage.createSkillVersion(row as any)) as SkillVersionRow;
  },
  async getVersion(id) {
    return (await storage.getSkillVersion(id)) as SkillVersionRow | undefined;
  },
  async updateVersion(id, patch) {
    await storage.updateSkillVersion(id, patch as any);
  },
  async versionsOf(skillId) {
    return (await storage.getSkillVersions(skillId)) as SkillVersionRow[];
  },
  async attach(agentId, orgId, skillId) {
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) return;
    const current = Array.isArray((agent as any).preloadedSkills) ? ((agent as any).preloadedSkills as Array<{ skillId?: string }>) : [];
    if (current.some((p) => p.skillId === skillId)) return;
    await storage.updateAgent(agentId, { preloadedSkills: [...current, { skillId }] } as any);
  },
};

export const defaultSkillProposalDeps: SkillProposalDeps = {
  store: dbSkillProposalStore,
  skills: dbSkillOps,
  getAgent: (agentId, orgId) => storage.getAgent(agentId, orgId ?? undefined) as any,
  createApproval: (a) => storage.createApproval(a as any) as any,
  // Ids and hashes only: an audit chain is signed and permanent, and a skill's text may need to be erased.
  audit: async (e) => {
    await storage.createAuditEvent({
      organizationId: e.orgId,
      actorType: e.actorType,
      actorId: e.actorId,
      action: e.action,
      objectType: "agent_skill_proposal",
      objectId: e.objectId,
      details: JSON.stringify(e.details),
    } as any);
  },
};

// ── Switching it on ─────────────────────────────────────────────────────────

export type SkillProposalGateReason = "on" | "agent-not-opted-in" | "flag-off" | "flag-unreadable";

/** On when the platform flag is on AND this agent has opted in (runtimeConfig.agentSkillProposals.enabled). */
export async function skillProposalGate(runtimeConfig: Record<string, any> | null | undefined): Promise<{ enabled: boolean; reason: SkillProposalGateReason; flagValue?: string; error?: string }> {
  if (runtimeConfig?.agentSkillProposals?.enabled !== true) return { enabled: false, reason: "agent-not-opted-in" };
  try {
    const row = await (storage as { getPlatformSetting?: (k: string) => Promise<{ value?: string | null } | undefined> }).getPlatformSetting?.(SKILL_PROPOSALS_SETTING);
    const flagValue = String(row?.value ?? "").trim().toLowerCase();
    return flagValue === "on" ? { enabled: true, reason: "on", flagValue } : { enabled: false, reason: "flag-off", flagValue };
  } catch (err: any) {
    return { enabled: false, reason: "flag-unreadable", error: String(err?.message ?? err).slice(0, 200) };
  }
}

export async function isSkillProposalEnabled(runtimeConfig: Record<string, any> | null | undefined): Promise<boolean> {
  return (await skillProposalGate(runtimeConfig)).enabled;
}

// ── Proposing ───────────────────────────────────────────────────────────────

export interface ProposeSkillInput {
  orgId?: string | null;
  agentId: string;
  action: "create" | "revise";
  name?: string;
  skillId?: string;
  description?: string;
  instructions?: string;
  reason?: string;
  runId?: string | null;
  /** Who is proposing: the agent itself (default), or the after-run reviewer on its behalf (server/agent-run-review.ts). */
  source?: "agent" | "reviewer";
}

export type ProposeSkillResult =
  | { ok: true; status: "pending_approval"; proposalId: string; approvalId: string; message: string }
  | { ok: false; error: string; skills?: Array<{ id: string; name: string }> };

/** Resolves a full id or a unique prefix of 6+ characters among these skills. */
function findSkillRef(skills: SkillRow[], ref: string | undefined): SkillRow | undefined {
  const r = String(ref ?? "").trim().replace(/^\[|\]$/g, "");
  if (r.length < 6) return undefined;
  const hits = skills.filter((s) => s.id === r || s.id.startsWith(r));
  return hits.length === 1 ? hits[0] : undefined;
}

export async function proposeSkill(input: ProposeSkillInput, deps: SkillProposalDeps = defaultSkillProposalDeps): Promise<ProposeSkillResult> {
  const L = SKILL_PROPOSAL_LIMITS;
  if (input.action !== "create" && input.action !== "revise") return { ok: false, error: 'action must be "create" or "revise".' };
  if (!input.agentId) return { ok: false, error: "No agent context to propose a skill for." };

  // The organization comes from the agent, not from the caller: a skill can only
  // ever be proposed into the org that owns the agent.
  const agent = await deps.getAgent(input.agentId, input.orgId);
  const org = agent?.organizationId ?? orgOf(input.orgId);
  if (!agent || !org) return { ok: false, error: "This agent was not found." };

  const create = input.action === "create";
  const name = normalizeName(input.name);
  const description = normalizeLine(input.description);
  const instructions = normalizeInstructions(input.instructions);
  const reason = normalizeLine(input.reason).slice(0, L.maxReasonChars);

  let target: SkillRow | undefined;
  if (!create) {
    const ownIds = await deps.skills.ownSkillIds(agent.id, org);
    const own = (await Promise.all(ownIds.map((id) => deps.skills.get(org, id)))).filter((s): s is SkillRow => !!s);
    target = findSkillRef(own, input.skillId);
    if (!target) return { ok: false, error: "No skill you use matches that id. These are the skills you can propose a revision of.", skills: own.map((s) => ({ id: shortId(s.id), name: s.name })) };
  }

  const scan = scanSkillProposal({ name: create ? name : undefined, description, instructions }, { requireName: create });
  if (!scan.ok) return { ok: false, error: `This skill was not proposed: ${scan.reason}.` };

  const pending = await deps.store.list(org, agent.id, ["pending"]);
  if (pending.length >= L.maxPending) return { ok: false, error: `${pending.length} proposals are already waiting for a person to decide. Wait for them before proposing more.` };

  const finalName = create ? name : target!.name;
  const finalDescription = description || (target?.description ?? "");
  const hash = proposalHash(finalName, finalDescription, instructions);
  if (pending.some((p) => p.contentHash === hash)) return { ok: false, error: "That skill is already waiting for a person to decide." };

  let created: SkillRow | undefined;
  let version: SkillVersionRow | undefined;
  if (create) {
    if (pending.some((p) => p.kind === "new" && normalizeName(p.name).toLowerCase() === name.toLowerCase())) return { ok: false, error: "A skill with that name is already waiting for a person to decide." };
    if (await deps.skills.findByName(org, name)) return { ok: false, error: "A skill with that name already exists. Choose another name, or propose a revision of it if you use it." };
    // Prompt-only by construction: no tools, no servers, no code execution, and a status no runtime reader loads.
    created = await deps.skills.create({
      organizationId: org,
      name,
      description: finalDescription,
      industry: agent.industryId || "cross_industry",
      domain: "Agent-proposed",
      version: "1.0.0",
      author: `${agent.name} (agent)`,
      trustTier: "agent-proposed",
      status: "proposed",
      tags: ["agent-proposed"],
      markdownBody: instructions,
      yamlFrontmatter: { name, description: finalDescription },
      allowedTools: [],
      requiredMcpServers: [],
      requiredDataClassifications: [],
      skillKind: "prompt",
      anthropicSkillIds: [],
      codeExecutionApproved: false,
      contextMode: "inline",
      disableModelInvocation: false,
      userInvocable: true,
      dependencies: [],
    });
  } else {
    if (pending.some((p) => p.skillId === target!.id)) return { ok: false, error: "A change to that skill is already waiting for a person to decide." };
    if (hash === proposalHash(target!.name, target!.description, target!.markdownBody ?? "")) return { ok: false, error: "That is the skill as it already is." };
    version = await deps.skills.createVersion({
      skillId: target!.id,
      version: `proposal-${shortId(hash)}`,
      changeLog: reason || "Revision proposed by the agent",
      markdownBody: instructions,
      yamlFrontmatter: target!.yamlFrontmatter ?? null,
      snapshotData: { proposedBy: agent.id, description: finalDescription },
      promotedToProduction: false,
      author: `${agent.name} (agent)`,
    });
  }

  const skillId = created?.id ?? target!.id;
  const row = await deps.store.insert({
    organizationId: org,
    agentId: agent.id,
    kind: create ? "new" : "revision",
    skillId,
    versionId: version?.id ?? null,
    baseVersion: target?.version ?? null,
    name: finalName,
    contentHash: hash,
    status: "pending",
    source: input.source ?? "agent",
    reason: reason || null,
    runId: input.runId ?? null,
    approvalId: null,
    decidedBy: null,
    decidedAt: null,
  });

  let approval: { id: string };
  try {
    approval = await deps.createApproval({
      organizationId: org,
      type: "skill_proposal",
      objectType: "agent_skill_proposal",
      objectId: row.id,
      objectName: finalName.slice(0, 80),
      status: "pending",
      requestedBy: agent.id,
      requesterType: "agent",
      agentId: agent.id,
      riskScore: 0.4,
      description: input.source === "reviewer"
        ? `The run reviewer, after a run of ${agent.name}, suggests ${create ? "a new skill" : "a change to a skill"}: ${finalName}.`
        : `${agent.name} proposes ${create ? "a new skill" : "a change to a skill"}: ${finalName}.`,
      recommendedAction: "Approve only if the procedure is correct, worth reusing, and contains nothing that reads as an instruction to ignore rules or to move data somewhere.",
      evidenceJson: {
        kind: create ? "new" : "revision",
        agentName: agent.name,
        skillName: finalName,
        skillId,
        description: finalDescription,
        instructions,
        currentInstructions: create ? null : (target!.markdownBody ?? "").slice(0, L.maxInstructionChars),
        baseVersion: target?.version ?? null,
        reason: reason || null,
        runId: input.runId ?? null,
        proposedBy: input.source ?? "agent",
        chars: instructions.length,
        promptOnly: true,
        effect: create ? `On approval the skill becomes active and is attached to ${agent.name}.` : "On approval the revision replaces the skill's instructions for every agent that uses it.",
      },
    });
  } catch (err: any) {
    await deps.store.remove(org, row.id).catch(() => {});
    if (created) await deps.skills.remove(org, created.id).catch(() => {});
    return { ok: false, error: `The request could not be filed: ${err?.message ?? "approval failed"}.` };
  }
  await deps.store.update(org, row.id, { approvalId: approval.id });
  await deps.audit({ orgId: org, action: "agent_skill.proposed", objectId: row.id, actorType: "agent", actorId: agent.id, details: { kind: row.kind, agentId: agent.id, skillId, approvalId: approval.id, contentHash: hash, chars: instructions.length, runId: input.runId ?? null } }).catch(() => {});

  return { ok: true, status: "pending_approval", proposalId: shortId(row.id), approvalId: approval.id, message: "Proposed. A person must approve it before the skill exists for any run; do not rely on it in this run." };
}

// ── Retiring (the library curator) ──────────────────────────────────────────

/** Stands in for an agent on a retirement the curator files for a skill whose proposing agent is gone or unknown. */
export const CURATOR_ACTOR = "system:curator";

export interface RetireSkillInput {
  orgId: string;
  skillId: string;
  /** Why, in a sentence a reviewer can weigh. Built from facts, not from the skill's text. */
  reason: string;
  /** When the retirement is for a duplicate: the skill that stays. */
  keeps?: { id: string; name: string } | null;
  idleDays?: number | null;
  lastUsedAt?: string | null;
}

export type RetireSkillResult =
  | { ok: true; proposalId: string; approvalId: string }
  | { ok: false; error: string };

/**
 * Files a request to retire a skill an agent proposed and a person approved.
 * Retiring sets status "deprecated", which no runtime reader loads; nothing is
 * deleted, and setting the status back to active restores it. Only the library
 * curator calls this. It touches only agent-proposed skills, never one a person
 * wrote, and it is refused for a skill with a retirement already waiting.
 */
export async function proposeSkillRetirement(input: RetireSkillInput, deps: SkillProposalDeps = defaultSkillProposalDeps): Promise<RetireSkillResult> {
  const skill = await deps.skills.get(input.orgId, input.skillId);
  if (!skill) return { ok: false, error: "The skill no longer exists." };
  if (skill.status !== "active") return { ok: false, error: `The skill is ${skill.status}, not active.` };
  if (skill.trustTier !== "agent-proposed") return { ok: false, error: "Only a skill an agent proposed can be retired by the curator." };

  const history = await deps.store.forSkill(input.orgId, skill.id, ["pending", "approved"]);
  if (history.some((p) => p.status === "pending")) return { ok: false, error: "A change to that skill is already waiting for a person to decide." };
  // The agent that proposed the skill, when we know it: the suggestion then shows on that agent's page too.
  const origin = history.find((p) => p.kind === "new" && p.status === "approved");
  const agentId = origin?.agentId ?? CURATOR_ACTOR;

  const reason = normalizeLine(input.reason).slice(0, 300);
  const hash = proposalHash(`retire:${skill.id}`, reason, skill.version);
  const row = await deps.store.insert({
    organizationId: input.orgId, agentId, kind: "retire", skillId: skill.id, versionId: null, baseVersion: skill.version,
    name: skill.name, contentHash: hash, status: "pending", source: "curator", reason, runId: null, approvalId: null, decidedBy: null, decidedAt: null,
  });

  let approval: { id: string };
  try {
    approval = await deps.createApproval({
      organizationId: input.orgId,
      type: "skill_proposal",
      objectType: "agent_skill_proposal",
      objectId: row.id,
      objectName: `Retire: ${skill.name}`.slice(0, 80),
      status: "pending",
      requestedBy: CURATOR_ACTOR,
      requesterType: "system",
      ...(agentId !== CURATOR_ACTOR ? { agentId } : {}),
      riskScore: 0.1,
      description: `The library curator suggests retiring the skill "${skill.name}": ${reason}`,
      recommendedAction: "Approve if the skill is no longer needed. Retiring hides it from every run; it is kept, and setting it back to active restores it.",
      evidenceJson: {
        kind: "retire",
        skillName: skill.name,
        skillId: skill.id,
        reason,
        keeps: input.keeps ?? null,
        idleDays: input.idleDays ?? null,
        lastUsedAt: input.lastUsedAt ?? null,
        baseVersion: skill.version,
        proposedBy: "curator",
        effect: "On approval the skill is retired: it is hidden from every agent's runs. It is kept, and can be restored by setting it back to active.",
      },
    });
  } catch (err: any) {
    await deps.store.remove(input.orgId, row.id).catch(() => {});
    return { ok: false, error: `The request could not be filed: ${err?.message ?? "approval failed"}.` };
  }
  await deps.store.update(input.orgId, row.id, { approvalId: approval.id });
  await deps.audit({ orgId: input.orgId, action: "agent_skill.retirement_proposed", objectId: row.id, actorType: "system", actorId: CURATOR_ACTOR, details: { skillId: skill.id, approvalId: approval.id, contentHash: hash, idleDays: input.idleDays ?? null, keeps: input.keeps?.id ?? null } }).catch(() => {});
  return { ok: true, proposalId: shortId(row.id), approvalId: approval.id };
}

// ── Deciding ────────────────────────────────────────────────────────────────

export type SkillDecisionResult = { applied: boolean; reason?: string };

/**
 * What a person's decision on a skill_proposal approval does. Safe to call
 * twice: a proposal that is no longer pending is left alone.
 */
export async function applySkillDecision(
  input: { orgId?: string | null; proposalId: string; decision: "approved" | "rejected"; decidedBy: string },
  deps: SkillProposalDeps = defaultSkillProposalDeps,
): Promise<SkillDecisionResult> {
  const org = orgOf(input.orgId);
  if (!org) return { applied: false, reason: "no organization" };
  const row = await deps.store.get(org, input.proposalId);
  if (!row) return { applied: false, reason: "no such proposal" };
  if (row.status !== "pending") return { applied: false, reason: `already ${row.status}` };
  const decide = { decidedBy: input.decidedBy, decidedAt: new Date() };
  const audit = (action: string, extra: Record<string, unknown> = {}) =>
    deps.audit({ orgId: org, action, objectId: row.id, actorType: "user", actorId: input.decidedBy, details: { kind: row.kind, agentId: row.agentId, skillId: row.skillId, contentHash: row.contentHash, approvalId: row.approvalId, ...extra } }).catch(() => {});

  if (input.decision === "rejected") {
    // Nothing the agent proposed outlives a refusal: a proposed skill is deleted, a proposed version is marked refused.
    if (row.kind === "new") {
      const skill = await deps.skills.get(org, row.skillId);
      if (skill && skill.status === "proposed") await deps.skills.remove(org, skill.id).catch(() => {});
    } else if (row.versionId) {
      await deps.skills.updateVersion(row.versionId, { snapshotData: { refused: true, refusedBy: input.decidedBy } }).catch(() => {});
    }
    await deps.store.update(org, row.id, { status: "rejected", ...decide });
    await audit("agent_skill.rejected");
    return { applied: true };
  }

  const skill = await deps.skills.get(org, row.skillId);
  if (!skill) {
    await deps.store.update(org, row.id, { status: "stale", ...decide });
    await audit("agent_skill.rejected", { why: "the skill no longer exists" });
    return { applied: false, reason: "the skill no longer exists" };
  }

  if (row.kind === "retire") {
    // Refused if the skill is no longer what the curator looked at: a person has edited or re-activated it since.
    if (skill.status !== "active" || skill.version !== row.baseVersion) {
      await deps.store.update(org, row.id, { status: "stale", ...decide });
      await audit("agent_skill.rejected", { why: "the skill changed since this was suggested" });
      return { applied: false, reason: "the skill changed since this was suggested" };
    }
    await deps.skills.update(skill.id, { status: "deprecated" });
    await deps.store.update(org, row.id, { status: "approved", ...decide });
    await audit("agent_skill.approved", { retired: true });
    return { applied: true };
  }

  if (row.kind === "new") {
    await deps.skills.update(skill.id, { status: "active" });
    let attached = true;
    try { await deps.skills.attach(row.agentId, org, skill.id); } catch { attached = false; }
    await deps.store.update(org, row.id, { status: "approved", ...decide });
    await audit("agent_skill.approved", { attached });
    return { applied: true };
  }

  // A revision: refused if the skill has changed since the agent proposed it, because the
  // person approved a change to a specific version of the text.
  const version = row.versionId ? await deps.skills.getVersion(row.versionId) : undefined;
  if (!version || typeof version.markdownBody !== "string") {
    await deps.store.update(org, row.id, { status: "stale", ...decide });
    await audit("agent_skill.rejected", { why: "the proposed text is gone" });
    return { applied: false, reason: "the proposed text is gone" };
  }
  if (skill.version !== row.baseVersion || skill.status !== "active") {
    await deps.store.update(org, row.id, { status: "stale", ...decide });
    await audit("agent_skill.rejected", { why: "the skill changed since this was proposed" });
    return { applied: false, reason: "the skill changed since this was proposed" };
  }
  const next = nextPatchVersion(skill.version);
  const proposedDescription = (version.snapshotData as { description?: string } | null)?.description;
  await deps.skills.updateVersion(version.id, { version: next, promotedToProduction: true });
  for (const v of await deps.skills.versionsOf(skill.id)) {
    if (v.id !== version.id) await deps.skills.updateVersion(v.id, { promotedToProduction: false });
  }
  await deps.skills.update(skill.id, {
    version: next,
    markdownBody: version.markdownBody,
    ...(proposedDescription ? { description: proposedDescription } : {}),
  });
  await deps.store.update(org, row.id, { status: "approved", ...decide });
  await audit("agent_skill.approved", { fromVersion: row.baseVersion, toVersion: next });
  return { applied: true };
}

// ── Reading and erasing ─────────────────────────────────────────────────────

/** Erasure: an agent's proposals go with it, and so do the skills it proposed that no one approved. */
export async function deleteAgentSkillProposals(
  orgId: string | null | undefined,
  agentId: string,
  deps: Pick<SkillProposalDeps, "store" | "skills"> = defaultSkillProposalDeps,
): Promise<number> {
  const org = orgOf(orgId);
  if (!org) return 0;
  const gone = await deps.store.removeAllForAgent(org, agentId);
  for (const p of gone) {
    if (p.kind !== "new" || p.status !== "pending") continue;
    const skill = await deps.skills.get(org, p.skillId).catch(() => undefined);
    if (skill && skill.status === "proposed") await deps.skills.remove(org, skill.id).catch(() => {});
  }
  return gone.length;
}

/** For the agent page: proposals waiting, and the recently decided ones. */
export async function skillProposalOverview(orgId: string | null | undefined, agentId: string, store: SkillProposalStore = dbSkillProposalStore) {
  const org = orgOf(orgId);
  if (!org) return { pending: [], recent: [], limits: SKILL_PROPOSAL_LIMITS };
  const rows = await store.list(org, agentId, ["pending", "approved", "rejected", "stale"]);
  return {
    pending: rows.filter((p) => p.status === "pending"),
    recent: rows.filter((p) => p.status !== "pending").slice(-20).reverse(),
    limits: SKILL_PROPOSAL_LIMITS,
  };
}
