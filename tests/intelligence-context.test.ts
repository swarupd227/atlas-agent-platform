/**
 * Intelligence Context Layer, phase 0.
 *
 * The cases that matter are the refusals, not the retrievals. A context layer
 * that returns something plausible for every request is the most dangerous
 * version of this feature: it would let a gate be satisfied by a decision from
 * another journey, and it would persist framework bookkeeping as business
 * judgement. The state key fixture below is taken from a real E&S run
 * (d966bcac, 56 keys) rather than invented, because the mixing of three kinds
 * of state in one object is the thing being guarded against.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyStateKey, extractSubjects, decisionStateOf, precedentAllowedFor,
  roleOfStateKey, buildStepIndex, traceStateOf, isDurableRole, teamStateKeyFor,
} from "../shared/intelligence-context";

const runs: any[] = [];
// The resolver reads each run's team blueprint to classify its state keys. If
// these are absent the resolver's try/catch falls back to the name rules and
// every assertion below would pass while covering the WRONG path -- so they
// are mocked, and a test asserts the index was actually consulted.
const blueprintNodes: any[] = [];
const getTeamBlueprintNodes = vi.fn(async () => blueprintNodes);
// Phase 1: decisions indexed by subject. Without this in the mock the
// resolver silently falls back to the recency scan and every assertion
// below would cover the WRONG path.
let decisionRecords: any[] = [];
const getDecisionRecordsBySubjects = vi.fn(async (subjects: string[]) => decisionRecords.filter((r) => subjects.includes(r.subject)));
const upsertDecisionRecord = vi.fn(async (rec: any) => { decisionRecords.push(rec); return rec; });
// The flag now lives in platform_settings, as GUARDRAIL_REVIEW and
// DECISION_STEP_KIND do, so it is togglable from the UI.
let settingValue: string | null = null;
const getPlatformSetting = vi.fn(async () => (settingValue === null ? undefined : { value: settingValue }));
vi.mock("../server/storage", () => ({
  storage: {
    listDagExecutionRunsByOrg: vi.fn(async () => runs),
    getAgent: vi.fn(async (id: string) => ({ id, name: "E&S Property Binding Orchestrator", blueprintId: "bp1" })),
    getTeamBlueprintNodes,
    getPlatformSetting,
    getDecisionRecordsBySubjects,
    upsertDecisionRecord,
  },
}));
const { resolveContext, renderContextForPrompt, priorDecisionsForPrompt, intelligenceContextEnabled, recordRunDecisions } = await import("../server/intelligence-context");

// Verbatim shape from the live run.
const LIVE_STATE = {
  status: "bound and active",
  request: "Underwrite submission SUB-2026-8891 from Bridge Specialty.",
  nextSteps: ["Submission Reader agent begins execution on SUB-2026-8891"],
  __revision: { rounds: { "7734bf12": 1 } },
  reconciled: true,
  carrierCode: "CARRIER-A",
  clausesUsed: "ME-2026-8891-COASTAL, CP 12 18",
  answerSource: "final_turn",
  policyNumber: "POL-2026-8891-CP",
  submissionId: "SUB-2026-8891",
  iterationsUsed: 3,
  workflowStatus: "complete",
  treatyReference: "CP-2026-17",
  downstreamAgentCount: 4,
  somethingNobodyNamed: "???",
};

const run = (over: any = {}) => ({
  id: over.id ?? "run00001",
  teamAgentId: over.teamAgentId ?? "teamA",
  status: over.status ?? "completed",
  completedAt: over.completedAt ?? new Date("2026-10-03T15:46:50Z"),
  startedAt: new Date("2026-10-03T15:40:00Z"),
  finalState: over.finalState ?? LIVE_STATE,
  currentState: null,
  ...over,
});

describe("classifyStateKey", () => {
  it("separates the three kinds in the live state", () => {
    expect(classifyStateKey("__revision")).toBe("plumbing");
    expect(classifyStateKey("iterationsUsed")).toBe("plumbing");
    expect(classifyStateKey("answerSource")).toBe("plumbing");
    expect(classifyStateKey("downstreamAgentCount")).toBe("plumbing");

    expect(classifyStateKey("nextSteps")).toBe("session");
    expect(classifyStateKey("workflowStatus")).toBe("session");
    expect(classifyStateKey("request")).toBe("session");

    // A concern raised and resolved is the clearest decision-trace content in
    // a run: the system of record keeps the final premium and keeps no trace
    // that it was challenged once and corrected. This was classified session
    // until the live content was read.
    expect(classifyStateKey("revision_request")).toBe("decision");
    // The round COUNT is still plumbing -- it does not say what the concern was.
    expect(classifyStateKey("__revision")).toBe("plumbing");

    expect(classifyStateKey("policyNumber")).toBe("decision");
    expect(classifyStateKey("submissionId")).toBe("decision");
    expect(classifyStateKey("treatyReference")).toBe("decision");
    expect(classifyStateKey("clausesUsed")).toBe("decision");
    expect(classifyStateKey("status")).toBe("decision");
  });

  it("recognises a journey's own naming by shape, not only by list", () => {
    // A fixed list would miss every new journey.
    expect(classifyStateKey("bordereauEntryId")).toBe("decision");
    expect(classifyStateKey("fetch_treaty_terms")).toBe("decision");
    expect(classifyStateKey("endorsementApproved")).toBe("decision");
    expect(classifyStateKey("insuredName")).toBe("decision");
  });

  it("defaults to unclassified, never to decision", () => {
    // Fail closed: a layer that persists whatever it cannot name is how
    // framework noise becomes enterprise record.
    expect(classifyStateKey("somethingNobodyNamed")).toBe("unclassified");
    expect(classifyStateKey("zzz")).toBe("unclassified");
  });

  it("keeps a session key session even when it looks like a decision", () => {
    // workflowId ends in "Id" and would otherwise match the shape rule.
    expect(classifyStateKey("workflowId")).toBe("session");
  });
});

describe("roleOfStateKey, read against the authored steps", () => {
  // Verbatim from live blueprints: these are the node types that exist.
  const NODES = [
    { stateKey: "fnol_claim_triage_orchestrator", nodeType: "internal_agent", refAgentId: "a1" },
    { stateKey: "classify_claim_type", nodeType: "decision" },
    { stateKey: "confidence_mandatory_fields_check", nodeType: "expression" },
    { stateKey: "fetch_treaty_terms", nodeType: "tool_call" },
    { stateKey: "carrier_underwriter_approval", nodeType: "edge_gate" },
    { stateKey: "summarise_the_loss", nodeType: "internal_agent" },
    { stateKey: "score_risk", nodeType: "internal_agent", outputContractId: "c1" },
  ];
  const steps = buildStepIndex(NODES, { teamStateKey: "e_s_property_binding_orchestrator" });

  it("classifies a step slug by what its step IS, not what it is called", () => {
    // These names carry no business meaning at all; the word-list classifier
    // left 77% of real keys unclassified for exactly this reason.
    expect(roleOfStateKey("fetch_treaty_terms", steps)).toBe("evidence");
    expect(roleOfStateKey("classify_claim_type", steps)).toBe("decision");
    expect(roleOfStateKey("confidence_mandatory_fields_check", steps)).toBe("decision");
    expect(roleOfStateKey("carrier_underwriter_approval", steps)).toBe("approval");
  });

  it("separates an agent that declares its output from one that writes prose", () => {
    expect(roleOfStateKey("score_risk", steps)).toBe("decision");
    expect(roleOfStateKey("summarise_the_loss", steps)).toBe("context");
  });

  it("recognises the engine's own suffixes against a declared step", () => {
    expect(roleOfStateKey("fetch_treaty_terms_verified", steps)).toBe("evidence");
    expect(roleOfStateKey("summarise_the_loss_sources", steps)).toBe("evidence");
    expect(roleOfStateKey("summarise_the_loss_files", steps)).toBe("artefact");
  });

  it("does not treat a business field as an engine suffix", () => {
    // "fully_verified" ends in _verified but "fully" is no step.
    expect(roleOfStateKey("fully_verified", steps)).toBe("unclassified");
  });

  it("classifies the team's own answer key, which blueprints leave undeclared", () => {
    // The largest group in the live backlog: 50 of 230 occurrences.
    expect(roleOfStateKey("e_s_property_binding_orchestrator", steps)).toBe("decision");
    expect(teamStateKeyFor("E&S Property Binding Orchestrator")).toBe("e_s_property_binding_orchestrator");
  });

  it("leaves a step the blueprint no longer declares unclassified", () => {
    // Blueprint drift: a historical run names a step that has since been
    // removed. Guessing its role would be inventing provenance.
    expect(roleOfStateKey("notify_downstream_teams_with_steward_approval", steps)).toBe("unclassified");
  });

  it("still catches engine keys that no step declares", () => {
    expect(roleOfStateKey("__revision", steps)).toBe("plumbing");
    expect(roleOfStateKey("iterationsUsed", steps)).toBe("plumbing");
    expect(roleOfStateKey("nextSteps", steps)).toBe("session");
  });
});

describe("traceStateOf", () => {
  const steps = buildStepIndex([
    { stateKey: "fetch_treaty_terms", nodeType: "tool_call" },
    { stateKey: "classify_claim_type", nodeType: "decision" },
    { stateKey: "carrier_underwriter_approval", nodeType: "edge_gate" },
  ]);

  it("groups state into the parts of a trace and keeps only the durable ones", () => {
    const state = {
      fetch_treaty_terms: { limit: 50_000_000 },
      classify_claim_type: "coastal property",
      carrier_underwriter_approval: "approved by J. Mehta",
      nextSteps: ["x"],
      __revision: 1,
      somethingNobodyNamed: "???",
    };
    const t = traceStateOf(state, steps);
    expect(Object.keys(t.byRole.evidence)).toEqual(["fetch_treaty_terms"]);
    expect(Object.keys(t.byRole.decision)).toEqual(["classify_claim_type"]);
    expect(Object.keys(t.byRole.approval)).toEqual(["carrier_underwriter_approval"]);
    expect(Object.keys(t.durable).sort()).toEqual(["carrier_underwriter_approval", "classify_claim_type", "fetch_treaty_terms"]);
    // Neither included nor hidden.
    expect(t.unclassified).toEqual(["somethingNobodyNamed"]);
    expect(t.durable).not.toHaveProperty("nextSteps");
    expect(t.durable).not.toHaveProperty("__revision");
  });

  it("marks evidence and decision as durable, session and plumbing as not", () => {
    for (const r of ["evidence", "decision", "approval", "artefact", "context"] as const) expect(isDurableRole(r)).toBe(true);
    for (const r of ["session", "plumbing", "unclassified"] as const) expect(isDurableRole(r)).toBe(false);
  });
});

describe("decisionStateOf", () => {
  it("keeps only decision state and reports what it could not place", () => {
    const { decision, fromKeys, unclassified } = decisionStateOf(LIVE_STATE);
    expect(Object.keys(decision)).toContain("policyNumber");
    expect(Object.keys(decision)).toContain("status");
    // The three that must never be persisted as judgement.
    expect(decision).not.toHaveProperty("iterationsUsed");
    expect(decision).not.toHaveProperty("answerSource");
    expect(decision).not.toHaveProperty("__revision");
    expect(decision).not.toHaveProperty("nextSteps");
    expect(unclassified).toContain("somethingNobodyNamed");
    expect(fromKeys.length).toBe(Object.keys(decision).length);
  });
});

describe("extractSubjects", () => {
  it("finds the business objects and says which key named each", () => {
    const subs = extractSubjects(LIVE_STATE);
    const map = Object.fromEntries(subs.map((s) => [s.subject, s.fromKey]));
    expect(Object.keys(map)).toContain("submission:SUB-2026-8891");
    expect(Object.keys(map)).toContain("policy:POL-2026-8891-CP");
    expect(Object.keys(map)).toContain("binder:CP-2026-17");
    // Evidence, not just the answer: a subject whose source cannot be shown
    // is a subject nobody can check.
    expect(map["policy:POL-2026-8891-CP"]).toBe("policyNumber");
  });

  it("does not turn a timestamp into an accounting period", () => {
    // "2026-11" appears in dates everywhere; anchoring on those would attach
    // decisions to the month they happened to run in.
    expect(extractSubjects({ completedOn: "2026-11-02T10:00:00Z" }).map(s => s.subject)).toEqual([]);
    expect(extractSubjects({ closePeriod: "2026-11" }).map(s => s.subject)).toEqual(["period:2026-11"]);
  });

  it("ignores plumbing when looking for subjects", () => {
    expect(extractSubjects({ __revision: "SUB-2026-8891" }).map(s => s.subject)).toEqual([]);
  });
});

describe("resolveContext authority", () => {
  beforeEach(() => { runs.length = 0; });

  it("is authoritative only for the same subject in the same journey", async () => {
    runs.push(run({ teamAgentId: "teamA" }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].tier).toBe("authoritative");
    expect(r.items[0].citation.runId).toBe("run00001");
  });

  it("is precedent for the same subject in a DIFFERENT journey", async () => {
    runs.push(run({ teamAgentId: "teamB" }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items[0].tier).toBe("precedent");
  });

  it("withholds precedent from decide, bind and judge", async () => {
    runs.push(run({ teamAgentId: "teamB" }));
    for (const purpose of ["decide", "bind", "judge"] as const) {
      const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose, surface: "team_run", teamAgentId: "teamA" });
      expect(r.items, purpose).toHaveLength(0);
      // Withheld, and SAID so -- an empty result must not read as "no history".
      expect(r.omissions.some((o) => o.reason === "withheld_precedent_for_purpose"), purpose).toBe(true);
    }
    expect(precedentAllowedFor("draft")).toBe(true);
    expect(precedentAllowedFor("bind")).toBe(false);
  });

  it("still gives authoritative context to a bind", async () => {
    runs.push(run({ teamAgentId: "teamA" }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "bind", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].tier).toBe("authoritative");
  });

  it("names the axis that made a precedent relevant", async () => {
    runs.push(run({ id: "other1", teamAgentId: "teamA", finalState: { ...LIVE_STATE, submissionId: "SUB-2026-9999", policyNumber: "POL-2026-9999-CP" } }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-1111"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items[0].tier).toBe("precedent");
    expect(r.items[0].matchAxis).toBe("same_class_of_business");
  });

  it("ranks same_customer above same_class_of_business", async () => {
    runs.push(run({ id: "classOnly", teamAgentId: "teamA", finalState: { submissionId: "SUB-2026-7777", status: "bound" } }));
    runs.push(run({ id: "sameBroker", teamAgentId: "teamZ", finalState: { submissionId: "SUB-2026-8888", brokerCode: "BRK-14", status: "bound" } }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-1111", "broker:BRK-14"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items[0].matchAxis).toBe("same_customer");
  });
});

describe("indexed decision records (phase 1)", () => {
  beforeEach(() => { runs.length = 0; decisionRecords = []; blueprintNodes.length = 0; settingValue = "on"; });

  const record = (over: any = {}) => ({
    subject: "submission:SUB-2026-8891",
    subjectType: "submission",
    teamAgentId: "teamA",
    runId: "oldrun1",
    decidedAt: new Date("2026-10-03T15:46:50Z"),
    decision: { status: "bound and active", policyNumber: "POL-2026-8891-CP" },
    evidence: { fetch_treaty_terms: { limit: 50_000_000 } },
    fromKeys: ["status", "policyNumber"],
    ...over,
  });

  it("finds a decision the recency scan would have missed entirely", async () => {
    // The live failure: five finished runs had decided on this submission,
    // four outside the 60-run window and the fifth the asking run, so the scan
    // reported no record. The index does not care how much traffic followed.
    decisionRecords.push(record());
    runs.length = 0; // nothing in the scan window at all
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].tier).toBe("authoritative");
    expect(r.items[0].decision.policyNumber).toBe("POL-2026-8891-CP");
    expect(r.items[0].citation.runId).toBe("oldrun1");
    expect(r.missedSubjects).toEqual([]);
  });

  it("keeps evidence separate in an indexed record too", async () => {
    decisionRecords.push(record());
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(Object.keys(r.items[0].evidence)).toContain("fetch_treaty_terms");
    expect(Object.keys(r.items[0].decision)).not.toContain("fetch_treaty_terms");
  });

  it("is precedent, and withheld from bind, when the record is another journey's", async () => {
    decisionRecords.push(record({ teamAgentId: "teamB" }));
    const draft = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(draft.items[0].tier).toBe("precedent");
    const bind = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "bind", surface: "team_run", teamAgentId: "teamA" });
    expect(bind.items).toHaveLength(0);
    expect(bind.omissions.some((o) => o.reason === "withheld_precedent_for_purpose")).toBe(true);
  });

  it("never hands a run its own decision back", async () => {
    decisionRecords.push(record({ runId: "thisrun" }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA", excludeRunId: "thisrun" });
    expect(r.items).toHaveLength(0);
  });

  it("does not list the same run twice from index and scan", async () => {
    decisionRecords.push(record({ runId: "shared1" }));
    runs.push(run({ id: "shared1", teamAgentId: "teamA" }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items.filter((i) => i.citation.runId === "shared1")).toHaveLength(1);
  });

  it("shows one decision once, however many objects it was filed under", async () => {
    // Measured live: a run indexed against a submission, its policy and its
    // binder was rendered three times, about two thirds of every injected
    // block. An agent reading three identical records may take repetition for
    // corroboration, and one source counted three times is not three sources.
    decisionRecords.push(record({ subject: "submission:SUB-2026-8891", subjectType: "submission" }));
    decisionRecords.push(record({ subject: "policy:POL-2026-8891-CP", subjectType: "policy" }));
    decisionRecords.push(record({ subject: "binder:CP-2026-17", subjectType: "binder" }));
    const subjects = ["submission:SUB-2026-8891", "policy:POL-2026-8891-CP", "binder:CP-2026-17"];
    const r = await resolveContext({ subjects, purpose: "draft", surface: "team_run", teamAgentId: "teamA" });

    expect(r.items).toHaveLength(1);
    expect(r.items[0].subjects.sort()).toEqual([...subjects].sort());
    // Breadth is kept, not discarded: all three are served, none reported missing.
    expect(r.usedSubjects.sort()).toEqual([...subjects].sort());
    expect(r.missedSubjects).toEqual([]);

    const text = renderContextForPrompt(r);
    expect(text.match(/This was decided on/g)).toHaveLength(1);
    expect(text).toContain("binder:CP-2026-17");
    expect(text).toContain("policy:POL-2026-8891-CP");
    // The decision body appears once, not three times.
    expect(text.match(/POL-2026-8891-CP/g)!.length).toBeLessThan(4);
  });

  it("still lists genuinely different runs separately", async () => {
    // Collapsing must not hide corroboration that is real.
    decisionRecords.push(record({ runId: "runOne" }));
    decisionRecords.push(record({ runId: "runTwo", decidedAt: new Date("2026-10-02T10:00:00Z") }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.citation.runId).sort()).toEqual(["runOne", "runTwo"]);
  });

  it("says the search was bounded when it fell back to the scan", async () => {
    // No index hit: the omission must not claim the object has no history,
    // only that the bounded search found none.
    const r = await resolveContext({ subjects: ["submission:SUB-0000-0000"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    const miss = r.omissions.find((o) => o.reason === "no_record");
    expect(miss!.detail).toMatch(/most recent run\(s\) searched/);
    expect(miss!.detail).toMatch(/not a statement that none exists/);
  });
});

describe("recordRunDecisions (phase 1 write path)", () => {
  beforeEach(() => { decisionRecords = []; upsertDecisionRecord.mockClear(); });

  const nodeConfig = {
    n1: { stateKey: "bind_policy", nodeType: "decision" },
    n2: { stateKey: "fetch_treaty_terms", nodeType: "tool_call" },
  };

  it("writes one record per business object the run decided about", async () => {
    const res = await recordRunDecisions({
      runId: "r1", teamAgentId: "teamA", teamName: "E&S Property Binding Orchestrator", orgId: "org1",
      state: { submissionId: "SUB-2026-8891", policyNumber: "POL-2026-8891-CP", bind_policy: "bound", fetch_treaty_terms: { limit: 50 }, nextSteps: ["x"] },
      nodeConfig, decidedAt: new Date("2026-10-04T12:00:00Z"),
    });
    expect(res.written).toBe(2);
    expect(res.subjects.sort()).toEqual(["policy:POL-2026-8891-CP", "submission:SUB-2026-8891"]);
    const written = upsertDecisionRecord.mock.calls.map((c: any[]) => c[0]);
    // Classification still applies: session state is not written as a decision.
    expect(Object.keys(written[0].decision)).toContain("bind_policy");
    expect(Object.keys(written[0].decision)).not.toContain("nextSteps");
    expect(Object.keys(written[0].evidence)).toContain("fetch_treaty_terms");
    expect(written[0].subjectType).toBe("submission");
  });

  it("writes nothing when the run established a subject but decided nothing", async () => {
    // An empty row where a reader expects a judgement is worse than no row.
    const res = await recordRunDecisions({
      runId: "r2", teamAgentId: "teamA", teamName: "T", orgId: null,
      state: { submissionId: "SUB-2026-8891", nextSteps: ["x"], iterationsUsed: 3 },
      nodeConfig: {}, decidedAt: new Date(),
    });
    expect(res.written).toBe(0);
    expect(upsertDecisionRecord).not.toHaveBeenCalled();
  });

  it("writes nothing when no business object was named", async () => {
    const res = await recordRunDecisions({
      runId: "r3", teamAgentId: "teamA", teamName: "T", orgId: null,
      state: { bind_policy: "bound" }, nodeConfig, decidedAt: new Date(),
    });
    expect(res).toEqual({ written: 0, subjects: [] });
  });

  it("never throws when a write fails", async () => {
    upsertDecisionRecord.mockRejectedValueOnce(new Error("db down"));
    // The run has already finished; recording it must not fail it after the fact.
    const res = await recordRunDecisions({
      runId: "r4", teamAgentId: "teamA", teamName: "T", orgId: null,
      state: { submissionId: "SUB-2026-8891", bind_policy: "bound" }, nodeConfig, decidedAt: new Date(),
    });
    expect(res.written).toBe(0);
  });
});

describe("the flag, and what the engine gets", () => {
  beforeEach(() => {
    runs.length = 0;
    settingValue = "on";
    blueprintNodes.length = 0;
  });

  it("is off when the setting is absent, off, or unreadable", async () => {
    runs.push(run({ teamAgentId: "teamA" }));
    // A row that was never seeded, an explicit off, and a read that throws
    // must all mean off. A default-on read path is a default-on behaviour
    // change, and a failed read must never be mistaken for permission.
    for (const v of [null, "off", "", "OFF "]) {
      settingValue = v;
      expect(await intelligenceContextEnabled(), String(v)).toBe(false);
      expect((await priorDecisionsForPrompt({ teamAgentId: "teamA", state: LIVE_STATE, purpose: "draft" })).text, String(v)).toBe("");
    }
    getPlatformSetting.mockRejectedValueOnce(new Error("db down"));
    expect(await intelligenceContextEnabled()).toBe(false);
  });

  it("is on when the platform setting says on, whatever the casing", async () => {
    for (const v of ["on", "ON", " on "]) {
      settingValue = v;
      expect(await intelligenceContextEnabled(), v).toBe(true);
    }
  });

  it("reads the flag from platform_settings, not from the environment", async () => {
    // The env-var version needed a Cloud Shell round trip and an app restart
    // to flip, and was invisible in the platform.
    settingValue = "on";
    getPlatformSetting.mockClear();
    runs.push(run({ teamAgentId: "teamA" }));
    await priorDecisionsForPrompt({ teamAgentId: "teamA", state: LIVE_STATE, purpose: "draft" });
    expect(getPlatformSetting).toHaveBeenCalledWith("INTELLIGENCE_CONTEXT");
  });

  it("returns nothing when the step names no business object", async () => {
    runs.push(run({ teamAgentId: "teamA" }));
    // No subject means nothing to anchor on, and a prompt must not be given
    // context retrieved against nothing.
    const prior = await priorDecisionsForPrompt({ teamAgentId: "teamA", state: { nextSteps: ["x"], iterationsUsed: 2 }, purpose: "draft" });
    expect(prior.text).toBe("");
    // No subjects found, so the record says so rather than being empty-but-silent.
    expect(prior.subjects).toEqual([]);
  });

  it("gives the engine rendered text when enabled and anchored", async () => {
    runs.push(run({ teamAgentId: "teamA" }));
    const prior = await priorDecisionsForPrompt({ teamAgentId: "teamA", state: LIVE_STATE, purpose: "draft" });
    expect(prior.text).toMatch(/## Prior decisions/);
    expect(prior.text).toMatch(/submission:SUB-2026-8891/);
    // The record a run can keep: what was retrieved and from where.
    expect(prior.subjects).toContain("submission:SUB-2026-8891");
    expect(prior.items.length).toBeGreaterThan(0);
    expect(prior.items[0]).toHaveProperty("runId");
  });

  it("says history was unreadable rather than claiming there is no prior decision", async () => {
    const { storage } = await import("../server/storage");
    (storage.listDagExecutionRunsByOrg as any).mockRejectedValueOnce(new Error("db down"));
    // The failure used to render as "No finished run recorded a decision on
    // submission:SUB-2026-8891", which invites the agent to treat the
    // submission as new. The step still proceeds -- it just is not lied to.
    const prior = await priorDecisionsForPrompt({ teamAgentId: "teamA", state: LIVE_STATE, purpose: "draft" });
    expect(prior.text).toMatch(/could not be read/i);
    expect(prior.text).toMatch(/UNKNOWN — not absent/);
    expect(prior.text).not.toMatch(/No finished run recorded/);
    expect(prior.omissions.map((o) => o.reason)).toContain("history_unavailable");
  });

  it("does not claim no_record for any subject when the history read failed", async () => {
    const { storage } = await import("../server/storage");
    (storage.listDagExecutionRunsByOrg as any).mockRejectedValueOnce(new Error("db down"));
    const r = await resolveContext({ subjects: ["submission:SUB-1", "binder:CP-1"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.omissions.map((o) => o.reason)).toContain("history_unavailable");
    expect(r.omissions.map((o) => o.reason)).not.toContain("no_record");
  });
});

describe("resolveContext omissions and honesty", () => {
  beforeEach(() => { runs.length = 0; });

  it("returns nothing for a subject no run shares, from another journey", async () => {
    // similar_risk used to fire whenever a run had ANY subject, so asking
    // about a submission that never existed returned three precedent items.
    // Relevance now needs an actual shared business object.
    runs.push(run({ teamAgentId: "teamB", finalState: { submissionId: "SUB-2026-7777", status: "bound" } }));
    const r = await resolveContext({ subjects: ["submission:SUB-9999-0000"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(0);
    expect(r.omissions.some((o) => o.reason === "no_record")).toBe(true);
  });

  it("allows similar_risk only on a shared business object", async () => {
    // Shares the binder the request asks about -> a real overlap.
    runs.push(run({ id: "shared", teamAgentId: "teamB", finalState: { treatyReference: "CP-2026-17", status: "closed" } }));
    const r = await resolveContext({ subjects: ["binder:CP-2026-17"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items.map((i) => i.matchAxis)).toContain("similar_risk");
  });

  it("surfaces conflicting authoritative records instead of picking one", async () => {
    // The live case: the same journey ran twice on SUB-2026-8891 and recorded
    // different status and clausesUsed.
    runs.push(run({ id: "runA", teamAgentId: "teamA", completedAt: new Date("2026-10-03T10:00:00Z"), finalState: { submissionId: "SUB-2026-8891", status: "bound and active", clausesUsed: "CP 12 18" } }));
    runs.push(run({ id: "runB", teamAgentId: "teamA", completedAt: new Date("2026-10-03T15:00:00Z"), finalState: { submissionId: "SUB-2026-8891", status: "bound_active", clausesUsed: "CP-1218" } }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items.filter((i) => i.tier === "authoritative").length).toBe(2);
    const fields = r.conflicts.map((c) => c.field).sort();
    expect(fields).toEqual(["clausesUsed", "status"]);
    expect(r.conflicts[0].values).toHaveLength(2);
    // Rendered as a warning, not a footnote, and not silently resolved.
    const text = renderContextForPrompt(r);
    expect(text).toMatch(/conflicting records/i);
    expect(text).toMatch(/say so rather than choosing/i);
  });

  it("does not call two precedents disagreeing a conflict", async () => {
    // Only authoritative records are compared: two precedents differing is
    // normal and says nothing about the platform's own consistency.
    runs.push(run({ id: "p1", teamAgentId: "teamB", finalState: { treatyReference: "CP-2026-17", status: "x" } }));
    runs.push(run({ id: "p2", teamAgentId: "teamC", finalState: { treatyReference: "CP-2026-17", status: "y" } }));
    const r = await resolveContext({ subjects: ["binder:CP-2026-17"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items.every((i) => i.tier === "precedent")).toBe(true);
    expect(r.conflicts).toHaveLength(0);
  });

  it("references evidence rather than pasting connector payloads", async () => {
    blueprintNodes.length = 0;
    blueprintNodes.push({ stateKey: "read_general_ledger", nodeType: "tool_call" }, { stateKey: "bind_policy", nodeType: "decision" });
    runs.push(run({
      id: "ev", teamAgentId: "teamA",
      finalState: {
        submissionId: "SUB-2026-8891",
        bind_policy: "bound",
        read_general_ledger: { accounts: Array.from({ length: 12 }, (_, i) => ({ account: `acct-${i}`, debit: i * 1000 })) },
      },
    }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    const item = r.items[0];
    expect(Object.keys(item.evidence)).toContain("read_general_ledger");
    expect(Object.keys(item.decision)).not.toContain("read_general_ledger");
    const text = renderContextForPrompt(r);
    expect(text).toMatch(/evidence \(not inlined/);
    // The payload itself must not reach the prompt.
    expect(text).not.toContain("acct-7");
    expect(text).toMatch(/read_general_ledger/);
  });

  it("does not cache a failed blueprint lookup, and says classification degraded", async () => {
    // The live defect: `catch { index = null }` then caching that null meant
    // one transient failure silently classified every later run of that team
    // by key name -- which read three tool_call outputs as decisions.
    const { storage } = await import("../server/storage");
    (storage.getTeamBlueprintNodes as any).mockRejectedValueOnce(new Error("transient"));
    runs.push(run({ id: "d1", teamAgentId: "teamA", finalState: { submissionId: "SUB-2026-8891", fetch_treaty_terms: { a: 1 } } }));
    runs.push(run({ id: "d2", teamAgentId: "teamA", finalState: { submissionId: "SUB-2026-8891", fetch_treaty_terms: { a: 2 } } }));
    blueprintNodes.length = 0;
    blueprintNodes.push({ stateKey: "fetch_treaty_terms", nodeType: "tool_call" });

    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    // The second run retried and succeeded, so at least one item classified
    // the tool_call as evidence rather than as a decision.
    expect(r.items.some((i) => "fetch_treaty_terms" in i.evidence)).toBe(true);
    // And the degradation is reported rather than left to look confident.
    expect(r.omissions.some((o) => o.reason === "blueprint_unavailable")).toBe(true);
    expect(renderContextForPrompt(r)).toMatch(/classified by key name/);
  });

  it("states what it truncated, in every place it truncates", async () => {
    // Silent truncation is the defect this layer exists to avoid: an agent
    // shown 10 of 30 fields with no note cannot tell a short record from a
    // cut one, and answers as though it saw everything.
    blueprintNodes.length = 0;
    // Inserted first so it lands inside the rendered window: keys render in
    // insertion order, and a long value past the cut would never be clipped.
    const state: any = { submissionId: "SUB-2026-8891", long_finding: "x".repeat(900) };
    blueprintNodes.push({ stateKey: "long_finding", nodeType: "decision" });
    for (let n = 0; n < 24; n++) {
      blueprintNodes.push({ stateKey: `decide_${n}`, nodeType: "decision" });
      state[`decide_${n}`] = `verdict ${n}`;
    }
    for (let n = 0; n < 11; n++) {
      blueprintNodes.push({ stateKey: `fetch_${n}`, nodeType: "tool_call" });
      state[`fetch_${n}`] = { rows: [1, 2, 3] };
    }
    runs.push(run({ id: "big", teamAgentId: "teamA", finalState: state }));

    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    const text = renderContextForPrompt(r);
    expect(text).toMatch(/further field\(s\) recorded on this run, not shown/);
    expect(text).toMatch(/and \d+ more/);            // evidence list
    expect(text).toMatch(/more chars\]/);            // a clipped value says so
  });

  it("says how many conflicts it did not list", async () => {
    blueprintNodes.length = 0;
    const mk = (suffix: string) => {
      const s: any = { submissionId: "SUB-2026-8891" };
      for (let n = 0; n < 9; n++) s[`decide_${n}`] = `verdict ${n}${suffix}`;
      return s;
    };
    for (let n = 0; n < 9; n++) blueprintNodes.push({ stateKey: `decide_${n}`, nodeType: "decision" });
    runs.push(run({ id: "c1", teamAgentId: "teamA", finalState: mk("a") }));
    runs.push(run({ id: "c2", teamAgentId: "teamA", finalState: mk("b") }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.conflicts.length).toBeGreaterThan(6);
    expect(renderContextForPrompt(r)).toMatch(/further conflicting field\(s\) not listed/);
  });

  it("says no_record for a subject nothing decided on", async () => {
    const r = await resolveContext({ subjects: ["submission:SUB-2026-0000"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(0);
    expect(r.missedSubjects).toEqual(["submission:SUB-2026-0000"]);
    expect(r.omissions[0].reason).toBe("no_record");
  });

  it("reports unclassified keys rather than including or hiding them", async () => {
    runs.push(run({ teamAgentId: "teamA" }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.unclassifiedKeys).toContain("somethingNobodyNamed");
    expect(r.omissions.some((o) => o.reason === "unclassified_keys")).toBe(true);
    expect(JSON.stringify(r.items[0].decision)).not.toContain("somethingNobodyNamed");
  });

  it("reads the team's blueprint to classify state, and only once per team", async () => {
    // Without this, the resolver's try/catch would silently fall back to the
    // name rules and nothing here would notice.
    blueprintNodes.length = 0;
    blueprintNodes.push(
      { stateKey: "fetch_treaty_terms", nodeType: "tool_call" },
      { stateKey: "classify_claim_type", nodeType: "decision" },
    );
    getTeamBlueprintNodes.mockClear();
    runs.push(run({ id: "r1", teamAgentId: "teamA", finalState: { submissionId: "SUB-2026-8891", fetch_treaty_terms: { limit: 50 }, classify_claim_type: "coastal" } }));
    runs.push(run({ id: "r2", teamAgentId: "teamA", finalState: { submissionId: "SUB-2026-8891", fetch_treaty_terms: { limit: 60 } } }));

    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(getTeamBlueprintNodes).toHaveBeenCalledTimes(1); // cached across runs
    expect(r.items.length).toBeGreaterThan(0);
    // A tool_call's output is evidence and a decision node's is a decision --
    // both durable, both named by the step rather than by the key, and now
    // held apart so the renderer can reference evidence instead of pasting it.
    expect(Object.keys(r.items[0].evidence)).toContain("fetch_treaty_terms");
    expect(Object.keys(r.items[0].decision)).toContain("classify_claim_type");
  });

  it("ignores runs that have not finished", async () => {
    runs.push(run({ status: "running" }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(0);
  });

  it("honours asOf, so a judge sees what was known then", async () => {
    runs.push(run({ completedAt: new Date("2026-10-03T15:00:00Z") }));
    const before = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "eval", teamAgentId: "teamA", asOf: new Date("2026-10-01T00:00:00Z") });
    expect(before.items).toHaveLength(0);
    const after = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "eval", teamAgentId: "teamA", asOf: new Date("2026-10-04T00:00:00Z") });
    expect(after.items).toHaveLength(1);
  });

  it("renders the tier differently, and explains an empty result", async () => {
    runs.push(run({ teamAgentId: "teamB" }));
    const withheld = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "bind", surface: "team_run", teamAgentId: "teamA" });
    const text = renderContextForPrompt(withheld);
    expect(text).toMatch(/None available/);
    expect(text).toMatch(/withheld/i);

    const shown = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamB" });
    const t2 = renderContextForPrompt(shown);
    expect(t2).toMatch(/This was decided on submission:SUB-2026-8891/);
    expect(t2).not.toMatch(/do not copy/);

    const prec = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(renderContextForPrompt(prec)).toMatch(/do not copy/);
  });
});
