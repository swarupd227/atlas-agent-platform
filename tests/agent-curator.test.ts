/**
 * server/agent-curator.ts: once a week, per organization, the library curator looks
 * ONLY at what agents wrote (agent-proposed skills, agents' active notes) for skills
 * nobody uses and near-copies of each other. These tests pin what makes it safe to
 * leave running: it counts idleness only from when it started watching, it never
 * files anything in report mode, in propose mode every finding becomes an approval a
 * person decides, a refused retirement is not made again for 60 days, a skill a
 * person wrote is never a candidate, and no pass can run more often than weekly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../server/db", () => ({ db: {} }));
vi.mock("../server/storage", () => ({ storage: { getPlatformSetting: vi.fn() } }));
vi.mock("../server/auth", () => ({ getDefaultOrgId: () => "org-default" }));

import { storage } from "../server/storage";
import {
  CURATOR_LIMITS, wordSet, similarity, findIdleSkills, findDuplicateSkills, findDuplicateNotes, findWeakSkills, firstWords,
  runCuratorForOrg, runCuratorScan, defaultCuratorDeps,
  type CuratorDeps, type CuratorStore, type CuratorSkill, type CuratorNote,
} from "../server/agent-curator";

const DAY = 24 * 3_600_000;
const NOW = new Date("2026-11-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const PROC_A = "1. Open the claim and read the loss date carefully.\n2. Check the policy was in force on that date.\n3. Check for any endorsement that changes cover.\n4. Hand back a one line coverage verdict with the policy number.";
// PROC_A with one word changed: a near-copy.
const PROC_A2 = PROC_A.replace("carefully", "closely");
const PROC_B = "Gather the three most recent invoices, reconcile each against the purchase order, flag any variance over two percent, and escalate unmatched lines to the buyer before month end.";

const skill = (over: Partial<CuratorSkill> = {}): CuratorSkill => ({ id: "s1", name: "Coverage Check", version: "1.0.0", markdownBody: PROC_A, lastUsedAt: daysAgo(2), createdAt: daysAgo(90), lastEvalPassRate: null, ...over });
const note = (over: Partial<CuratorNote> = {}): CuratorNote => ({ id: "n1", agentId: "agent-1", content: "Weekly claims summaries are posted to the claims ops channel on Fridays before 15:00.", createdAt: daysAgo(30), ...over });

beforeEach(() => { vi.mocked(storage.getPlatformSetting as any).mockReset(); });

// ── The rules ───────────────────────────────────────────────────────────────

describe("similarity", () => {
  it("is word overlap: identical text is 1, unrelated text is near 0, and case and punctuation do not matter", () => {
    expect(similarity(PROC_A, PROC_A)).toBe(1);
    expect(similarity(PROC_A, PROC_B)).toBeLessThan(0.15);
    expect(similarity("Check the policy, then REPORT.", "check the policy then report")).toBe(1);
    expect(similarity("", "")).toBe(0);
    expect(wordSet("A b cd, ef! 12")).toEqual(new Set(["cd", "ef", "12"]));
  });

  it("calls a one-word edit of a procedure a near-copy", () => {
    expect(similarity(PROC_A, PROC_A2)).toBeGreaterThanOrEqual(CURATOR_LIMITS.similarity);
  });
});

describe("findIdleSkills", () => {
  const enabled = daysAgo(60);

  it("flags a skill no run has loaded for 30 days, and says when it was last used", () => {
    const f = findIdleSkills([skill({ lastUsedAt: daysAgo(41) })], NOW, enabled);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ type: "idle_skill", targetId: "s1", name: "Coverage Check", idleDays: 41 });
    expect(f[0].detail).toMatch(/41 days.*last used 2026-10-10/);
  });

  it("leaves a skill used recently, and one exactly at the edge counts as idle", () => {
    expect(findIdleSkills([skill({ lastUsedAt: daysAgo(29) })], NOW, enabled)).toHaveLength(0);
    expect(findIdleSkills([skill({ lastUsedAt: daysAgo(30) })], NOW, enabled)).toHaveLength(1);
  });

  it("counts from when the curator started watching: a never-used skill is not idle for a silence it could not see", () => {
    const old = skill({ lastUsedAt: null, createdAt: daysAgo(200) });
    expect(findIdleSkills([old], NOW, daysAgo(5))).toHaveLength(0);
    const watched = findIdleSkills([old], NOW, daysAgo(45));
    expect(watched).toHaveLength(1);
    expect(watched[0].idleDays).toBe(45);
    expect(watched[0].detail).toMatch(/in the 45 days the curator has watched/);
  });

  it("uses the later of the last use and the start of watching", () => {
    expect(findIdleSkills([skill({ lastUsedAt: daysAgo(100) })], NOW, daysAgo(10))).toHaveLength(0);
    expect(findIdleSkills([skill({ lastUsedAt: daysAgo(31) })], NOW, daysAgo(90))).toHaveLength(1);
  });

  it("a skill created after the curator started is measured from its creation", () => {
    expect(findIdleSkills([skill({ lastUsedAt: null, createdAt: daysAgo(10) })], NOW, daysAgo(90))).toHaveLength(0);
    expect(findIdleSkills([skill({ lastUsedAt: null, createdAt: daysAgo(35) })], NOW, daysAgo(90))).toHaveLength(1);
  });
});

describe("findDuplicateSkills", () => {
  it("flags the NEWER of two near-copies and says which stays", () => {
    const older = skill({ id: "s-old", name: "Coverage Check", createdAt: daysAgo(80) });
    const newer = skill({ id: "s-new", name: "Coverage Verdict", markdownBody: PROC_A2, createdAt: daysAgo(20) });
    const f = findDuplicateSkills([newer, older]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ type: "duplicate_skill", targetId: "s-new", keeps: { id: "s-old", name: "Coverage Check" } });
    expect(f[0].detail).toMatch(/9\d% the same as the older skill "Coverage Check"/);
  });

  it("three copies flag two, each pointing at the oldest; no chain of survivors", () => {
    const a = skill({ id: "a", createdAt: daysAgo(90) });
    const b = skill({ id: "b", name: "B", markdownBody: PROC_A2, createdAt: daysAgo(60) });
    const c = skill({ id: "c", name: "C", markdownBody: PROC_A2 + " ", createdAt: daysAgo(30) });
    const f = findDuplicateSkills([c, b, a]);
    expect(f.map((x) => x.targetId).sort()).toEqual(["b", "c"]);
    expect(f.every((x) => x.keeps?.id === "a")).toBe(true);
  });

  it("does not flag different procedures, or bodies too short to compare", () => {
    expect(findDuplicateSkills([skill({ id: "a" }), skill({ id: "b", name: "B", markdownBody: PROC_B })])).toHaveLength(0);
    expect(findDuplicateSkills([skill({ id: "a", markdownBody: "Do it." }), skill({ id: "b", markdownBody: "Do it." })])).toHaveLength(0);
  });

  it("honours the threshold it is given", () => {
    const a = skill({ id: "a", createdAt: daysAgo(90) });
    const b = skill({ id: "b", name: "B", markdownBody: PROC_A.replace("carefully", "closely and quickly"), createdAt: daysAgo(30) });
    expect(findDuplicateSkills([a, b], 0.99)).toHaveLength(0);
    expect(findDuplicateSkills([a, b], 0.7)).toHaveLength(1);
  });
});

describe("findDuplicateNotes", () => {
  it("flags the newer of two near-identical notes of the SAME agent", () => {
    const older = note({ id: "n-old", createdAt: daysAgo(60) });
    const newer = note({ id: "n-new", content: "Weekly claims summaries are posted to the claims ops channel on Fridays before 15:00 .", createdAt: daysAgo(5) });
    const f = findDuplicateNotes([newer, older]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ type: "duplicate_note", targetId: "n-new", agentId: "agent-1" });
  });

  it("never compares notes across agents, and ignores notes too short to compare", () => {
    expect(findDuplicateNotes([note({ id: "a" }), note({ id: "b", agentId: "agent-2" })])).toHaveLength(0);
    expect(findDuplicateNotes([note({ id: "a", content: "Use SI." }), note({ id: "b", content: "Use SI." })])).toHaveLength(0);
  });

  it("names a note by its first words, never its whole text", () => {
    const f = findDuplicateNotes([note({ id: "a", createdAt: daysAgo(9) }), note({ id: "b", createdAt: daysAgo(1) })]);
    expect(f[0].name).toBe(firstWords(note().content));
    expect(f[0].name.endsWith("…")).toBe(true);
    expect(f[0].name.length).toBeLessThan(note().content.length);
  });
});

describe("findWeakSkills", () => {
  it("reports a skill whose last eval passed under 50% of cases, and not one with no eval or a good one", () => {
    const f = findWeakSkills([skill({ id: "a", lastEvalPassRate: 33.3 }), skill({ id: "b", lastEvalPassRate: 50 }), skill({ id: "c", lastEvalPassRate: null }), skill({ id: "d", lastEvalPassRate: 0 })]);
    expect(f.map((x) => x.targetId).sort()).toEqual(["a", "d"]);
    expect(f[0].detail).toMatch(/passed 33% of cases/);
  });
});

// ── An in-memory world ──────────────────────────────────────────────────────

function makeEnv(opts: { first?: Date | null; last?: Date | null; skills?: CuratorSkill[]; notes?: CuratorNote[]; refused?: string[]; mode?: "report" | "propose"; flag?: boolean; orgs?: string[] } = {}) {
  const runs: any[] = [];
  const calls = { retire: [] as any[], removeNote: [] as any[] };
  const store: CuratorStore = {
    async orgsWithCuratable() { return opts.orgs ?? ["org-a"]; },
    async firstRunAt() { return opts.first === undefined ? daysAgo(60) : opts.first; },
    async lastRunAt() { return opts.last === undefined ? daysAgo(8) : opts.last; },
    async loadSkills() { return opts.skills ?? []; },
    async loadNotes() { return opts.notes ?? []; },
    async refusedRetirements() { return new Set(opts.refused ?? []); },
    async recordRun(row) { runs.push(row); },
  };
  const deps: CuratorDeps = {
    store,
    now: () => NOW,
    flagOn: async () => opts.flag ?? true,
    mode: async () => opts.mode ?? "report",
    retire: (async (input: any) => { calls.retire.push(input); return { ok: true, proposalId: "p1", approvalId: "a1" }; }) as any,
    removeNote: (async (input: any) => { calls.removeNote.push(input); return { ok: true, status: "pending_approval", noteId: "n", approvalId: "a2", message: "" }; }) as any,
  };
  return { deps, runs, calls };
}

// Each idle skill has words no other has, so none of them is a near-copy of another.
const idleSkill = (id: string, lastUsed = 45) => skill({ id, name: `Skill ${id}`, markdownBody: Array.from({ length: 30 }, (_, k) => `${id}word${k}`).join(" "), lastUsedAt: daysAgo(lastUsed), createdAt: daysAgo(120) });

// ── One organization ────────────────────────────────────────────────────────

describe("runCuratorForOrg", () => {
  it("the first pass only records when the curator was switched on: it judges and files nothing", async () => {
    const env = makeEnv({ first: null, mode: "propose", skills: [idleSkill("s1")] });
    const r = await runCuratorForOrg("org-a", env.deps);
    expect(r.status).toBe("seeded");
    expect(env.runs).toEqual([expect.objectContaining({ organizationId: "org-a", mode: "seed", status: "done", findings: [] })]);
    expect(env.calls.retire).toHaveLength(0);
  });

  it("in report mode it records what it found and files nothing", async () => {
    const env = makeEnv({ mode: "report", skills: [idleSkill("s1")], notes: [note({ id: "a", createdAt: daysAgo(9) }), note({ id: "b", createdAt: daysAgo(1) })] });
    const r = await runCuratorForOrg("org-a", env.deps);
    expect(r.status).toBe("done");
    expect(env.calls.retire).toHaveLength(0);
    expect(env.calls.removeNote).toHaveLength(0);
    expect(env.runs[0]).toMatchObject({ mode: "report", status: "done", summary: { skills: 1, notes: 2, idle: 1, duplicateNotes: 1, filed: 0 } });
    expect(env.runs[0].findings.map((f: any) => f.type).sort()).toEqual(["duplicate_note", "idle_skill"]);
  });

  it("in propose mode every retirement and note removal becomes a suggestion, from the curator", async () => {
    const env = makeEnv({ mode: "propose", skills: [idleSkill("s1")], notes: [note({ id: "a", createdAt: daysAgo(9) }), note({ id: "b", createdAt: daysAgo(1) })] });
    await runCuratorForOrg("org-a", env.deps);
    expect(env.calls.retire).toEqual([expect.objectContaining({ orgId: "org-a", skillId: "s1", idleDays: 45 })]);
    expect(env.calls.retire[0].reason).toMatch(/^Idle: no run has loaded it for 45 days/);
    expect(env.calls.removeNote).toEqual([expect.objectContaining({ orgId: "org-a", agentId: "agent-1", action: "remove", noteId: "b", source: "curator" })]);
    expect(env.runs[0]).toMatchObject({ mode: "propose", summary: { filed: 2, refused: 0 } });
    expect(env.runs[0].findings.every((f: any) => f.filed === true)).toBe(true);
  });

  it("a skill that is both idle and a duplicate is retired once, for the duplicate", async () => {
    const older = skill({ id: "old", name: "Old", lastUsedAt: daysAgo(2), createdAt: daysAgo(100) });
    const copy = skill({ id: "copy", name: "Copy", markdownBody: PROC_A2, lastUsedAt: daysAgo(50), createdAt: daysAgo(70) });
    const env = makeEnv({ mode: "propose", skills: [older, copy] });
    await runCuratorForOrg("org-a", env.deps);
    expect(env.calls.retire).toHaveLength(1);
    expect(env.calls.retire[0]).toMatchObject({ skillId: "copy", keeps: { id: "old", name: "Old" } });
    expect(env.calls.retire[0].reason).toMatch(/^A near-copy of an older skill/);
  });

  it("does not file a weak skill: it is reported, and that is all", async () => {
    const env = makeEnv({ mode: "propose", skills: [skill({ id: "w", lastEvalPassRate: 20, lastUsedAt: daysAgo(1) })] });
    await runCuratorForOrg("org-a", env.deps);
    expect(env.calls.retire).toHaveLength(0);
    expect(env.runs[0]).toMatchObject({ summary: { weak: 1, filed: 0 } });
    expect(env.runs[0].findings[0]).toMatchObject({ type: "weak_skill" });
    expect(env.runs[0].findings[0].filed).toBeUndefined();
  });

  it("does not suggest again a retirement a person refused within 60 days, and says so in the report", async () => {
    const env = makeEnv({ mode: "propose", skills: [idleSkill("s1"), idleSkill("s2")], refused: ["s1"] });
    await runCuratorForOrg("org-a", env.deps);
    expect(env.calls.retire.map((c) => c.skillId)).toEqual(["s2"]);
    const refused = env.runs[0].findings.find((f: any) => f.targetId === "s1");
    expect(refused.skippedBecause).toMatch(/refused to retire it in the last 60 days/);
    expect(env.runs[0].summary).toMatchObject({ filed: 1, skipped: 1 });
  });

  it("files at most ten suggestions in a pass, and records the rest as not filed", async () => {
    const many = Array.from({ length: 14 }, (_, i) => idleSkill(`s${String(i).padStart(2, "0")}`));
    const env = makeEnv({ mode: "propose", skills: many });
    await runCuratorForOrg("org-a", env.deps);
    expect(env.calls.retire).toHaveLength(CURATOR_LIMITS.maxSuggestionsPerRun);
    expect(env.runs[0].summary).toMatchObject({ idle: 14, filed: 10, skipped: 4 });
    expect(env.runs[0].findings.filter((f: any) => f.skippedBecause).length).toBe(4);
  });

  it("records a refused suggestion with the reason and counts it", async () => {
    const env = makeEnv({ mode: "propose", skills: [idleSkill("s1")] });
    env.deps.retire = (async () => ({ ok: false, error: "A change to that skill is already waiting for a person to decide." })) as any;
    await runCuratorForOrg("org-a", env.deps);
    expect(env.runs[0].summary).toMatchObject({ filed: 0, refused: 1 });
    expect(env.runs[0].findings[0]).toMatchObject({ filed: false, error: expect.stringMatching(/already waiting/) });
  });

  it("with nothing to suggest it says so", async () => {
    const env = makeEnv({ skills: [skill({ lastUsedAt: daysAgo(1) })] });
    await runCuratorForOrg("org-a", env.deps);
    expect(env.runs[0]).toMatchObject({ status: "done", reason: "nothing to suggest", findings: [] });
  });

  it("never throws: a failure is a failed pass on record", async () => {
    const env = makeEnv();
    env.deps.store.loadSkills = async () => { throw new Error("db down"); };
    const r = await runCuratorForOrg("org-a", env.deps);
    expect(r.status).toBe("failed");
    expect(env.runs[0]).toMatchObject({ status: "failed", reason: expect.stringMatching(/db down/) });
  });

  it("only ever looks at the skills and notes the store hands it, which are agent-written by construction", () => {
    const src = readFileSync(resolve(__dirname, "../server/agent-curator.ts"), "utf8");
    const q = src.slice(src.indexOf("async loadSkills("), src.indexOf("async loadNotes("));
    expect(q).toContain("trust_tier = 'agent-proposed'");
    expect(q).toContain("status = 'active'");
    const orgs = src.slice(src.indexOf("async orgsWithCuratable("), src.indexOf("async firstRunAt("));
    expect(orgs).toContain("trust_tier = 'agent-proposed'");
  });
});

// ── The scan ────────────────────────────────────────────────────────────────

describe("runCuratorScan", () => {
  it("does nothing, and reads nothing, when the flag is off", async () => {
    const env = makeEnv({ flag: false });
    const orgs = vi.spyOn(env.deps.store, "orgsWithCuratable");
    expect(await runCuratorScan(env.deps)).toMatchObject({ flag: "off", ran: 0 });
    expect(orgs).not.toHaveBeenCalled();
  });

  it("passes over an organization at most weekly, however often the job ticks", async () => {
    const recent = makeEnv({ last: daysAgo(3) });
    expect(await runCuratorScan(recent.deps)).toMatchObject({ orgs: 1, notDue: 1, ran: 0 });
    expect(recent.runs).toHaveLength(0);
    const due = makeEnv({ last: daysAgo(7) });
    expect(await runCuratorScan(due.deps)).toMatchObject({ ran: 1, notDue: 0 });
    const edge = makeEnv({ last: new Date(NOW.getTime() - 7 * DAY + 1000) });
    expect((await runCuratorScan(edge.deps)).notDue).toBe(1);
  });

  it("seeds an organization it has never seen, and passes over each due organization on its own", async () => {
    const env = makeEnv({ orgs: ["org-a", "org-b"], first: null, last: null });
    const r = await runCuratorScan(env.deps);
    expect(r).toMatchObject({ flag: "on", orgs: 2, seeded: 2, ran: 0 });
    expect(env.runs.map((x) => x.organizationId).sort()).toEqual(["org-a", "org-b"]);
  });

  it("one organization failing does not stop the others", async () => {
    const env = makeEnv({ orgs: ["org-a", "org-b"] });
    let calls = 0;
    env.deps.store.loadSkills = async () => { if (calls++ === 0) throw new Error("boom"); return []; };
    expect(await runCuratorScan(env.deps)).toMatchObject({ orgs: 2, failed: 1, ran: 1 });
  });
});

describe("the mode setting", () => {
  it("is report-only unless it is exactly 'propose': filing approvals is the thing that must be asked for", async () => {
    const get = vi.mocked(storage.getPlatformSetting as any);
    get.mockResolvedValue({ value: "propose" });
    expect(await defaultCuratorDeps.mode()).toBe("propose");
    get.mockResolvedValue({ value: " PROPOSE " });
    expect(await defaultCuratorDeps.mode()).toBe("propose");
    for (const v of ["report", "", "yes", "on", "propose-all"]) { get.mockResolvedValue({ value: v }); expect(await defaultCuratorDeps.mode(), v).toBe("report"); }
    get.mockResolvedValue(undefined);
    expect(await defaultCuratorDeps.mode()).toBe("report");
    get.mockRejectedValue(new Error("db down"));
    expect(await defaultCuratorDeps.mode()).toBe("report");
  });

  it("the flag is off unless it is on, and a failed read is off", async () => {
    const get = vi.mocked(storage.getPlatformSetting as any);
    get.mockResolvedValue({ value: "on" });
    expect(await defaultCuratorDeps.flagOn()).toBe(true);
    get.mockResolvedValue({ value: "off" });
    expect(await defaultCuratorDeps.flagOn()).toBe(false);
    get.mockRejectedValue(new Error("db down"));
    expect(await defaultCuratorDeps.flagOn()).toBe(false);
  });
});

// ── Where the pieces are wired ──────────────────────────────────────────────
// Read by position, not by window: hunks of earlier features landed in the wrong place with every line count right.

describe("wiring", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

  it("the worker dispatches the job, re-enqueues it in a finally, and ticks every six hours", () => {
    const w = read("server/worker.ts");
    const fn = w.indexOf("async function processAgentCuratorScan(");
    const fin = w.indexOf("finally {", fn);
    const again = w.indexOf('type: "agent_curator_scan"', fin);
    const enq = w.indexOf("export async function enqueueAgentCuratorScan", fn);
    expect(fn).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(fn);
    expect(again).toBeGreaterThan(fin);
    expect(again).toBeLessThan(enq);
    expect(w).toMatch(/job\.type === "agent_curator_scan"\) \{\s*result = await processAgentCuratorScan\(job\);/);
    expect(w).toContain("AGENT_CURATOR_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000");
    const routes = read("server/routes.ts");
    expect(routes).toContain("await enqueueAgentCuratorScan();");
    expect(routes).toMatch(/import \{[^}]*enqueueAgentCuratorScan[^}]*\} from "\.\/worker";/);
  });

  it("both settings are seeded: the curator off, the mode report, inside the default settings list", () => {
    const s = read("server/seed.ts");
    const list = s.indexOf("const missingSettings");
    expect(s).toMatch(/key: "AGENT_CURATOR",\s*value: "off"/);
    expect(s).toMatch(/key: "AGENT_CURATOR_MODE",\s*value: "report"/);
    for (const k of ["AGENT_CURATOR", "AGENT_CURATOR_MODE"]) { const at = s.indexOf(`key: "${k}"`); expect(at, k).toBeGreaterThan(0); expect(at, k).toBeLessThan(list); }
  });

  it("the migration adds the usage column and the runs table", () => {
    const db = read("server/db.ts");
    expect(db).toContain("ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP");
    expect(db).toContain("CREATE TABLE IF NOT EXISTS agent_curator_runs");
    const sch = read("shared/schema.ts");
    expect(sch).toContain('lastUsedAt: timestamp("last_used_at")');
    expect(sch).toContain('pgTable("agent_curator_runs"');
  });

  it("a skill's use is stamped where it is loaded: on demand after the activation bump, inlined right after the procedures are built", () => {
    const tools = read("server/builtin-skill-tools.ts");
    const bump = tools.indexOf("activationCount: (skill.activationCount ?? 0) + 1");
    const touch = tools.indexOf("void touchSkillUse(found.map(");
    expect(bump).toBeGreaterThan(0);
    expect(touch).toBeGreaterThan(bump);
    expect(touch - bump).toBeLessThan(400);
    const rt = read("server/agent-runtime.ts");
    const built = rt.indexOf("skillProcedures = skillProceduresPrompt(inline);");
    const stamp = rt.indexOf("void touchSkillUse(inline.map(");
    expect(built).toBeGreaterThan(0);
    expect(stamp).toBeGreaterThan(built);
    expect(stamp - built).toBeLessThan(400);
  });

  it("the retirement is decided in the one approval path, before the new-skill branch", () => {
    const src = read("server/agent-skill-proposals.ts");
    const r = src.indexOf('if (row.kind === "retire") {');
    const n = src.indexOf('if (row.kind === "new") {', r);
    expect(r).toBeGreaterThan(0);
    expect(n).toBeGreaterThan(r);
    expect(src.slice(r, n)).toContain('status: "deprecated"');
    expect(read("server/approval-decision.ts")).toContain('kind === "retire"');
  });

  it("serves the Skills page from a route in the shared router, and the page shows it", () => {
    expect(read("server/routes/agent-memory.ts")).toContain('router.get("/api/curator/overview"');
    const page = read("client/src/pages/skills.tsx");
    expect(page.indexOf("<LibraryHealth />")).toBeGreaterThan(0);
    expect(page.indexOf("<LibraryHealth />")).toBeGreaterThan(page.indexOf("function LibraryHealth()"));
    expect(page).toContain('queryKey: ["/api/curator/overview"]');
  });
});
