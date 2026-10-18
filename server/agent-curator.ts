/**
 * The library curator.
 *
 * Agents can now propose skills and notes (server/agent-skill-proposals.ts,
 * server/agent-memory.ts, server/agent-run-review.ts), and a library that only
 * grows fills with skills nobody uses and near-copies of each other. Hermes
 * Agent's curator exists for the same reason; this is its deterministic half
 * (stale, archive, de-duplicate), without the model-driven merge, and with this
 * platform's rule that a person decides.
 *
 * Once a week, per organization, it looks at ONLY what agents wrote:
 *   - skills with trust tier "agent-proposed" that no run has loaded for 30 days;
 *   - agent-proposed skills that are near-copies of an older one;
 *   - an agent's active notes that are near-copies of an older note;
 *   - agent-proposed skills whose last eval pass rate is under 50% (reported only).
 * It never touches a skill a person wrote or the platform shipped.
 *
 * It changes nothing itself. In "report" mode (the default) it records what it
 * found; in "propose" mode it also files each retirement or note removal as an
 * approval, and nothing happens until a person decides. A retirement sets status
 * "deprecated" (no run loads it; nothing is deleted; setting it back to active
 * restores it). A retirement a person refused is not suggested again for 60 days.
 *
 * The first pass for an organization only records when the curator was switched on.
 * Idleness is counted from then (or from last use, if later), so a skill is never
 * judged idle for a silence the curator could not have seen: lastUsedAt did not
 * exist before it, and a skill used only by being inlined into every run would
 * otherwise look untouched.
 *
 * Rules are pure and tested alone; the passes take their collaborators so they run
 * without a database.
 */

import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { proposeSkillRetirement } from "./agent-skill-proposals";
import { proposeMemoryChange, normalizeNote } from "./agent-memory";
import { toIso } from "./agent-run-review";
import { wordSet, similarity } from "./text-similarity";

/** Platform flag. Off unless "on"; a failed read is off. */
export const CURATOR_SETTING = "AGENT_CURATOR";
/** "report" (default): record findings only. "propose": also file them as approvals. */
export const CURATOR_MODE_SETTING = "AGENT_CURATOR_MODE";

const DAY_MS = 24 * 3_600_000;

export const CURATOR_LIMITS = {
  /** An agent-proposed skill no run has loaded for this long is idle. */
  idleDays: 30,
  /** Word-set overlap at or above which two texts are near-copies. */
  similarity: 0.85,
  /** A skill body shorter than this is too short for overlap to mean anything. */
  minComparableChars: 60,
  /** A note shorter than this is compared only when identical in words. */
  minNoteWords: 4,
  /** The curator looks at an organization at most this often. */
  intervalDays: 7,
  /** A retirement a person refused is not suggested again for this long. */
  refusedCooldownDays: 60,
  /** Suggestions filed in one pass, so a large library does not flood Approvals. */
  maxSuggestionsPerRun: 10,
  /** Last eval pass rate (a percentage) below which a skill is reported as weak. */
  weakPassRate: 50,
} as const;

// ── Pure rules ──────────────────────────────────────────────────────────────

export interface CuratorSkill {
  id: string;
  name: string;
  version: string;
  markdownBody: string;
  lastUsedAt: Date | null;
  createdAt: Date | null;
  lastEvalPassRate: number | null;
}

export interface CuratorNote {
  id: string;
  agentId: string;
  content: string;
  createdAt: Date | null;
}

export type FindingType = "idle_skill" | "duplicate_skill" | "duplicate_note" | "weak_skill";

export interface Finding {
  type: FindingType;
  /** The skill, or the note. */
  targetId: string;
  agentId?: string;
  /** A skill's name, or the first words of a note: enough to recognise it, never the whole text. */
  name: string;
  detail: string;
  keeps?: { id: string; name: string };
  idleDays?: number;
  lastUsedAt?: string | null;
  /** Set when a suggestion was filed (propose mode), or why one was not. */
  filed?: boolean;
  skippedBecause?: string;
  error?: string;
}

// The overlap measure lives in server/text-similarity.ts; the curator's tests and callers read it from here.
export { wordSet, similarity };

const time = (d: Date | null): number => (d ? d.getTime() : Number.POSITIVE_INFINITY);

/**
 * Skills nobody has loaded for idleDays. The clock starts at the LATER of the last
 * use (or creation, if never used) and when the curator was switched on.
 */
export function findIdleSkills(skills: CuratorSkill[], now: Date, enabledSince: Date, idleDays: number = CURATOR_LIMITS.idleDays): Finding[] {
  const out: Finding[] = [];
  for (const s of skills) {
    const last = s.lastUsedAt ?? s.createdAt ?? enabledSince;
    const anchor = last.getTime() > enabledSince.getTime() ? last : enabledSince;
    const idle = Math.floor((now.getTime() - anchor.getTime()) / DAY_MS);
    if (idle >= idleDays) {
      out.push({
        type: "idle_skill", targetId: s.id, name: s.name, idleDays: idle, lastUsedAt: s.lastUsedAt ? s.lastUsedAt.toISOString() : null,
        detail: s.lastUsedAt
          ? `no run has loaded it for ${idle} days (last used ${s.lastUsedAt.toISOString().slice(0, 10)})`
          : `no run has loaded it in the ${idle} days the curator has watched`,
      });
    }
  }
  return out;
}

/** Near-copies among skills: the newer one is the duplicate, the older one stays. */
export function findDuplicateSkills(skills: CuratorSkill[], threshold: number = CURATOR_LIMITS.similarity): Finding[] {
  const sorted = [...skills].filter((s) => s.markdownBody.length >= CURATOR_LIMITS.minComparableChars).sort((a, b) => time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id));
  const gone = new Set<string>();
  const out: Finding[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (gone.has(sorted[i].id)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      if (gone.has(sorted[j].id)) continue;
      const sim = similarity(sorted[i].markdownBody, sorted[j].markdownBody);
      if (sim >= threshold) {
        gone.add(sorted[j].id);
        out.push({ type: "duplicate_skill", targetId: sorted[j].id, name: sorted[j].name, keeps: { id: sorted[i].id, name: sorted[i].name }, detail: `its text is ${Math.round(sim * 100)}% the same as the older skill "${sorted[i].name}"` });
      }
    }
  }
  return out;
}

/** Near-copies among one agent's notes: the newer one is the duplicate. */
export function findDuplicateNotes(notes: CuratorNote[], threshold: number = CURATOR_LIMITS.similarity): Finding[] {
  const byAgent = new Map<string, CuratorNote[]>();
  for (const n of notes) if (wordSet(n.content).size >= CURATOR_LIMITS.minNoteWords) byAgent.set(n.agentId, [...(byAgent.get(n.agentId) ?? []), n]);
  const out: Finding[] = [];
  for (const [agentId, list] of byAgent) {
    const sorted = [...list].sort((a, b) => time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id));
    const gone = new Set<string>();
    for (let i = 0; i < sorted.length; i++) {
      if (gone.has(sorted[i].id)) continue;
      for (let j = i + 1; j < sorted.length; j++) {
        if (gone.has(sorted[j].id)) continue;
        const sim = similarity(sorted[i].content, sorted[j].content);
        if (sim >= threshold) {
          gone.add(sorted[j].id);
          out.push({ type: "duplicate_note", targetId: sorted[j].id, agentId, name: firstWords(sorted[j].content), detail: `it says ${Math.round(sim * 100)}% the same as an older note ("${firstWords(sorted[i].content)}")` });
        }
      }
    }
  }
  return out;
}

/** Skills whose last formal eval fell under the floor. Reported, never acted on. */
export function findWeakSkills(skills: CuratorSkill[], floor: number = CURATOR_LIMITS.weakPassRate): Finding[] {
  return skills
    .filter((s) => typeof s.lastEvalPassRate === "number" && s.lastEvalPassRate < floor)
    .map((s) => ({ type: "weak_skill" as const, targetId: s.id, name: s.name, detail: `its last eval passed ${Number(s.lastEvalPassRate).toFixed(0)}% of cases` }));
}

export function firstWords(text: string, n = 8): string {
  const words = normalizeNote(text).split(" ");
  return words.length > n ? `${words.slice(0, n).join(" ")}…` : words.join(" ");
}

// ── The pass over one organization ──────────────────────────────────────────

export type CuratorMode = "report" | "propose";

export interface CuratorSummary { skills: number; notes: number; idle: number; duplicateSkills: number; duplicateNotes: number; weak: number; filed: number; refused: number; skipped: number }

export interface CuratorStore {
  orgsWithCuratable(): Promise<string[]>;
  /** When the curator first ran for the organization (its seed pass): idleness is counted from here. */
  firstRunAt(orgId: string): Promise<Date | null>;
  lastRunAt(orgId: string): Promise<Date | null>;
  loadSkills(orgId: string): Promise<CuratorSkill[]>;
  loadNotes(orgId: string): Promise<CuratorNote[]>;
  /** Skills a person refused to retire since the given time. */
  refusedRetirements(orgId: string, since: Date): Promise<Set<string>>;
  recordRun(row: { organizationId: string; mode: "seed" | CuratorMode; status: "done" | "failed"; reason?: string | null; summary: CuratorSummary | Record<string, never>; findings: Finding[] }): Promise<void>;
}

export interface CuratorDeps {
  store: CuratorStore;
  now(): Date;
  flagOn(): Promise<boolean>;
  mode(): Promise<CuratorMode>;
  retire: typeof proposeSkillRetirement;
  removeNote: typeof proposeMemoryChange;
}

const EMPTY: CuratorSummary = { skills: 0, notes: 0, idle: 0, duplicateSkills: 0, duplicateNotes: 0, weak: 0, filed: 0, refused: 0, skipped: 0 };

/** One pass over one organization. Never throws: the run row says what happened. */
export async function runCuratorForOrg(orgId: string, deps: CuratorDeps): Promise<{ status: "seeded" | "done" | "failed"; summary: CuratorSummary; findings: Finding[] }> {
  const L = CURATOR_LIMITS;
  const now = deps.now();
  try {
    const first = await deps.store.firstRunAt(orgId);
    if (!first) {
      await deps.store.recordRun({ organizationId: orgId, mode: "seed", status: "done", reason: "first pass: recorded when the curator was switched on; idleness is counted from now", summary: {}, findings: [] });
      return { status: "seeded", summary: { ...EMPTY }, findings: [] };
    }
    const mode = await deps.mode();
    const [skills, notes, refused] = await Promise.all([
      deps.store.loadSkills(orgId),
      deps.store.loadNotes(orgId),
      deps.store.refusedRetirements(orgId, new Date(now.getTime() - L.refusedCooldownDays * DAY_MS)),
    ]);

    const idle = findIdleSkills(skills, now, first);
    const dupSkills = findDuplicateSkills(skills);
    const dupNotes = findDuplicateNotes(notes);
    const weak = findWeakSkills(skills);
    // A skill that is both idle and a duplicate is retired once, for the sharper reason (the duplicate).
    const dupIds = new Set(dupSkills.map((f) => f.targetId));
    const retire = [...dupSkills, ...idle.filter((f) => !dupIds.has(f.targetId))];
    const findings: Finding[] = [...retire, ...dupNotes, ...weak];
    const summary: CuratorSummary = { skills: skills.length, notes: notes.length, idle: idle.length, duplicateSkills: dupSkills.length, duplicateNotes: dupNotes.length, weak: weak.length, filed: 0, refused: 0, skipped: 0 };

    if (mode === "propose") {
      let room = L.maxSuggestionsPerRun;
      for (const f of findings) {
        if (f.type === "weak_skill") continue;
        if (f.type !== "duplicate_note" && refused.has(f.targetId)) { f.skippedBecause = `a person refused to retire it in the last ${L.refusedCooldownDays} days`; summary.skipped++; continue; }
        if (room <= 0) { f.skippedBecause = "this pass already filed its limit of suggestions"; summary.skipped++; continue; }
        const r = f.type === "duplicate_note"
          ? await deps.removeNote({ orgId, agentId: f.agentId!, action: "remove", noteId: f.targetId, reason: `Duplicates an older note: ${f.detail}`.slice(0, 300), source: "curator" })
          : await deps.retire({ orgId, skillId: f.targetId, reason: f.type === "duplicate_skill" ? `A near-copy of an older skill: ${f.detail}` : `Idle: ${f.detail}`, keeps: f.keeps ?? null, idleDays: f.idleDays ?? null, lastUsedAt: f.lastUsedAt ?? null });
        if (r.ok) { f.filed = true; summary.filed++; room--; }
        else { f.filed = false; f.error = String((r as { error?: string }).error ?? "refused").slice(0, 200); summary.refused++; }
      }
    }
    await deps.store.recordRun({ organizationId: orgId, mode, status: "done", reason: findings.length === 0 ? "nothing to suggest" : null, summary, findings });
    return { status: "done", summary, findings };
  } catch (err: any) {
    const reason = `the pass failed: ${String(err?.message ?? err).slice(0, 200)}`;
    await deps.store.recordRun({ organizationId: orgId, mode: "report", status: "failed", reason, summary: {}, findings: [] }).catch(() => {});
    return { status: "failed", summary: { ...EMPTY }, findings: [] };
  }
}

export interface CuratorScanResult { flag: "on" | "off"; orgs: number; seeded: number; ran: number; failed: number; notDue: number }

/** One tick of the job: every organization that is due gets a pass. A tick is cheap when nothing is due. */
export async function runCuratorScan(deps: CuratorDeps): Promise<CuratorScanResult> {
  const result: CuratorScanResult = { flag: "off", orgs: 0, seeded: 0, ran: 0, failed: 0, notDue: 0 };
  if (!(await deps.flagOn())) return result;
  result.flag = "on";
  const now = deps.now();
  const orgs = await deps.store.orgsWithCuratable();
  result.orgs = orgs.length;
  for (const org of orgs) {
    const last = await deps.store.lastRunAt(org);
    if (last && now.getTime() - last.getTime() < CURATOR_LIMITS.intervalDays * DAY_MS) { result.notDue++; continue; }
    const r = await runCuratorForOrg(org, deps);
    if (r.status === "seeded") result.seeded++;
    else if (r.status === "failed") result.failed++;
    else result.ran++;
  }
  return result;
}

// ── Default collaborators ───────────────────────────────────────────────────

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.rows ?? []);
const dateOf = (v: unknown): Date | null => { const iso = toIso(v); return iso ? new Date(iso) : null; };

export const dbCuratorStore: CuratorStore = {
  async orgsWithCuratable() {
    const r = await db.execute(sql`
      SELECT organization_id FROM skills WHERE trust_tier = 'agent-proposed' AND status = 'active' AND organization_id IS NOT NULL
      UNION SELECT organization_id FROM agent_memory_notes WHERE status = 'active' AND organization_id IS NOT NULL`);
    return rowsOf(r).map((x) => String(x.organization_id));
  },
  async firstRunAt(orgId) {
    const r = await db.execute(sql`SELECT MIN(created_at) AS at FROM agent_curator_runs WHERE organization_id = ${orgId}`);
    return dateOf(rowsOf(r)[0]?.at);
  },
  async lastRunAt(orgId) {
    const r = await db.execute(sql`SELECT MAX(created_at) AS at FROM agent_curator_runs WHERE organization_id = ${orgId}`);
    return dateOf(rowsOf(r)[0]?.at);
  },
  async loadSkills(orgId) {
    const r = await db.execute(sql`
      SELECT id, name, version, markdown_body, last_used_at, created_at, last_eval_pass_rate
      FROM skills WHERE organization_id = ${orgId} AND trust_tier = 'agent-proposed' AND status = 'active'`);
    return rowsOf(r).map((x) => ({ id: x.id, name: x.name, version: x.version, markdownBody: String(x.markdown_body ?? ""), lastUsedAt: dateOf(x.last_used_at), createdAt: dateOf(x.created_at), lastEvalPassRate: x.last_eval_pass_rate == null ? null : Number(x.last_eval_pass_rate) }));
  },
  async loadNotes(orgId) {
    const r = await db.execute(sql`
      SELECT id, agent_id, content, created_at FROM agent_memory_notes
      WHERE organization_id = ${orgId} AND status = 'active' AND proposed_action <> 'remove' AND (expires_at IS NULL OR expires_at > NOW())`);
    return rowsOf(r).map((x) => ({ id: x.id, agentId: x.agent_id, content: String(x.content ?? ""), createdAt: dateOf(x.created_at) }));
  },
  async refusedRetirements(orgId, since) {
    const r = await db.execute(sql`
      SELECT DISTINCT skill_id FROM agent_skill_proposals
      WHERE organization_id = ${orgId} AND kind = 'retire' AND status = 'rejected' AND decided_at > ${since}`);
    return new Set(rowsOf(r).map((x) => String(x.skill_id)));
  },
  async recordRun(row) {
    await db.execute(sql`
      INSERT INTO agent_curator_runs (organization_id, mode, status, reason, summary, findings, finished_at)
      VALUES (${row.organizationId}, ${row.mode}, ${row.status}, ${row.reason ?? null}, ${JSON.stringify(row.summary)}::jsonb, ${JSON.stringify(row.findings)}::jsonb, NOW())`);
  },
};

async function readSetting(key: string): Promise<string | undefined> {
  try {
    const row = await (storage as { getPlatformSetting?: (k: string) => Promise<{ value?: string | null } | undefined> }).getPlatformSetting?.(key);
    return row?.value ?? undefined;
  } catch {
    return undefined;
  }
}

export const defaultCuratorDeps: CuratorDeps = {
  store: dbCuratorStore,
  now: () => new Date(),
  flagOn: async () => String((await readSetting(CURATOR_SETTING)) ?? "").trim().toLowerCase() === "on",
  // Anything but an explicit "propose" is report-only: filing approvals is the thing that must be asked for.
  mode: async () => (String((await readSetting(CURATOR_MODE_SETTING)) ?? "").trim().toLowerCase() === "propose" ? "propose" : "report"),
  retire: proposeSkillRetirement,
  removeNote: proposeMemoryChange,
};

/** What the job runs. */
export const runDefaultCuratorScan = (): Promise<CuratorScanResult> => runCuratorScan(defaultCuratorDeps);

/** For the Skills page: the switch, the recent passes, and the retirements waiting for a person. */
export async function curatorOverview(orgId: string | null | undefined) {
  const flag = String((await readSetting(CURATOR_SETTING)) ?? "").trim().toLowerCase() === "on";
  const mode = await defaultCuratorDeps.mode();
  if (!orgId) return { enabled: flag, mode, runs: [], waiting: [] };
  const runs = await db.execute(sql`
    SELECT id, mode, status, reason, summary, findings, created_at FROM agent_curator_runs
    WHERE organization_id = ${orgId} ORDER BY created_at DESC LIMIT 6`);
  const waiting = await db.execute(sql`
    SELECT id, name, approval_id, reason, created_at FROM agent_skill_proposals
    WHERE organization_id = ${orgId} AND kind = 'retire' AND status = 'pending' ORDER BY created_at DESC LIMIT 20`);
  return {
    enabled: flag,
    mode,
    runs: rowsOf(runs).map((x) => ({ id: x.id, mode: x.mode, status: x.status, reason: x.reason, summary: x.summary ?? {}, findings: x.findings ?? [], createdAt: toIso(x.created_at) })),
    waiting: rowsOf(waiting).map((x) => ({ id: x.id, name: x.name, approvalId: x.approval_id, reason: x.reason, createdAt: toIso(x.created_at) })),
  };
}
