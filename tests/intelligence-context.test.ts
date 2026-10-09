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
import { readFileSync } from "fs";
import path from "path";
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
// Phase 4 fixtures: the run whose waveResults carry priorContext, and the
// policy bundle. "throw" makes resolvePolicyBundle fail, which is how the
// fail-soft path is exercised rather than assumed.
let dagRun: any = null;
let policyBundle: any = null;
let approvals: any[] = [];
// P4.4 fixtures: the agent -> outcome -> kpis -> readings chain.
let toolInvocations: any = [];
let agentsById: Record<string, any> = {};
let kpisByOutcome: Record<string, any[]> = {};
let readingsByOutcome: Record<string, any[]> = {};
const getDecisionRecordsBySubjects = vi.fn(async (subjects: string[]) => decisionRecords.filter((r) => subjects.includes(r.subject)));
const upsertDecisionRecord = vi.fn(async (rec: any) => { decisionRecords.push(rec); return rec; });
// The flag now lives in platform_settings, as GUARDRAIL_REVIEW and
// DECISION_STEP_KIND do, so it is togglable from the UI.
// Keyed, because there are two settings now -- the layer itself and the recall
// gate's review requirement. A mock that answered every key with one value
// would make a test of either flag silently test both.
let settingValue: string | null = null;
let settings: Record<string, string> = {};
const getPlatformSetting = vi.fn(async (key: string) => {
  if (key in settings) return { value: settings[key] };
  if (key === "INTELLIGENCE_CONTEXT") return settingValue === null ? undefined : { value: settingValue };
  return undefined;
});
// The collector imports this lazily, so the module is mocked rather than the
// bundle being injected.
vi.mock("../server/routes/helpers", () => ({
  resolvePolicyBundle: vi.fn(async () => {
    if (policyBundle === "throw") throw new Error("policies unavailable");
    return policyBundle;
  }),
}));
vi.mock("../server/storage", () => ({
  storage: {
    listDagExecutionRunsByOrg: vi.fn(async () => runs),
    getDagExecutionRun: vi.fn(async () => dagRun),
    getApprovals: vi.fn(async () => approvals),
    getApprovalsByObjectId: vi.fn(async (id: string) => approvals.filter((a: any) => a.objectId === id)),
    getToolInvocationsByRun: vi.fn(async () => {
      if (toolInvocations === "throw") throw new Error("tool invocation lookup failed");
      return toolInvocations;
    }),
    getKpisByOutcome: vi.fn(async (o: string) => kpisByOutcome[o] ?? []),
    getKpiReadingsByOutcome: vi.fn(async (o: string) => readingsByOutcome[o] ?? []),
    getAgent: vi.fn(async (id: string) => {
      if (agentsById[id] === "throw") throw new Error("agent lookup failed");
      if (agentsById[id]) return agentsById[id];
      return { id, name: "E&S Property Binding Orchestrator", blueprintId: "bp1" };
    }),
    getTeamBlueprintNodes,
    getPlatformSetting,
    getDecisionRecordsBySubjects,
    upsertDecisionRecord,
  },
}));
const { resolveContext, renderContextForPrompt, priorDecisionsForPrompt, intelligenceContextEnabled, recordRunDecisions, recallVerdict, resolveOutcomeFor } = await import("../server/intelligence-context");

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

  // Every other pattern names an E&S object, so an account run extracted no
  // subject at all and the whole layer was a silent no-op for the five Account
  // journeys -- 17 distinct ACCT- ids across one journey's last 50 runs, none
  // of them visible to recall.
  it("finds an account, which the five Account journeys are anchored on", () => {
    const subs = extractSubjects({
      account_search: "Matched existing account ACCT-101004 (Acme Components Inc).",
      accountId: "ACCT-372419",
    });
    const map = Object.fromEntries(subs.map((s) => [s.subject, s.fromKey]));
    expect(Object.keys(map)).toContain("account:ACCT-101004");
    expect(Object.keys(map)).toContain("account:ACCT-372419");
    expect(map["account:ACCT-372419"]).toBe("accountId");
  });

  it("reads an account id that is not purely numeric", () => {
    // Live data carries both ACCT-101004 and ACCT-REQ-VOSTOK-001; a digits-only
    // pattern would silently cover some accounts and not others.
    expect(extractSubjects({ accountId: "ACCT-REQ-VOSTOK-001" }).map(s => s.subject))
      .toEqual(["account:ACCT-REQ-VOSTOK-001"]);
  });

  it("does not mistake other identifiers for an account", () => {
    expect(extractSubjects({ note: "ACCOUNTING-2026 and ACCT- alone" }).map(s => s.subject)).toEqual([]);
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
  beforeEach(() => { runs.length = 0; decisionRecords = []; });

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
  // The review requirement is on for this block, because the tests below are
  // about what the gate does when it IS enforcing. Its default-off behaviour --
  // which is what production gets on the next deploy -- has its own test.
  beforeEach(() => {
    runs.length = 0; decisionRecords = []; blueprintNodes.length = 0; settingValue = "on";
    settings = { INTELLIGENCE_RECALL_REQUIRE_REVIEW: "on" };
  });

  const record = (over: any = {}) => ({
    subject: "submission:SUB-2026-8891",
    subjectType: "submission",
    teamAgentId: "teamA",
    runId: "oldrun1",
    // Reviewed by default in the fixture: the gate is exercised by the tests
    // that set reviewState explicitly, not by every unrelated one.
    reviewState: "reviewed",
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

  it("withholds an unreviewed record and SAYS so", async () => {
    // The three reasons that could never fire: a record exists, is deliberately
    // not offered, and the caller is told which of those it is.
    decisionRecords.push(record({ reviewState: "unreviewed" }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(0);
    const o = r.omissions.find((x) => x.reason === "unreviewed");
    expect(o!.detail).toMatch(/exists but no one has reviewed it/);
    // And it must NOT also claim there is no record.
    expect(r.omissions.some((x) => x.reason === "no_record")).toBe(false);
  });

  it("offers a reviewed record, and one a reviewer marked authoritative", async () => {
    for (const reviewState of ["reviewed", "authoritative"]) {
      decisionRecords = [record({ reviewState })];
      const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
      expect(r.items, reviewState).toHaveLength(1);
    }
  });

  it("withholds an expired record without calling it absent", async () => {
    decisionRecords.push(record({ reviewState: "reviewed", expiresAt: new Date("2026-01-01T00:00:00Z") }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(0);
    expect(r.omissions.find((x) => x.reason === "expired")!.detail).toMatch(/expired on 2026-01-01/);
  });

  it("withholds a low-confidence record, but not one nobody has judged", async () => {
    decisionRecords.push(record({ reviewState: "reviewed", confidence: 0.2 }));
    const low = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(low.items).toHaveLength(0);
    expect(low.omissions.find((x) => x.reason === "low_confidence")!.detail).toMatch(/20% confident/);

    // null confidence means unjudged, which is NOT low.
    decisionRecords = [record({ reviewState: "reviewed", confidence: null })];
    const unjudged = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(unjudged.items).toHaveLength(1);
  });

  it("withholds a superseded record and names what replaced it", async () => {
    decisionRecords.push(record({
      reviewState: "reviewed", supersededAt: new Date("2026-10-06T09:00:00Z"),
      supersededBy: "newrecord123", supersededReason: "clausesUsed was wrong; the later run is correct",
    }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(0);
    const o = r.omissions.find((x) => x.reason === "superseded");
    // A reader must be able to follow the chain, not wonder where it went.
    expect(o!.detail).toMatch(/superseded by record newrecor/);
    expect(o!.detail).toMatch(/clausesUsed was wrong/);
  });

  it("serves an unreviewed record while the review requirement is off", async () => {
    // What production gets on the next deploy, and the reason the requirement
    // is a separate flag. review_state defaults to "unreviewed", so adding the
    // column made every record already written -- including the E&S ones this
    // layer was proved on -- unreviewed. Enforcing by default would have taken
    // the layer silently offline under a release note about quality.
    settings = {}; // the requirement unset, i.e. the shipped default
    decisionRecords.push(record({ reviewState: "unreviewed" }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(1);
    expect(r.omissions.some((x) => x.reason === "unreviewed")).toBe(false);

    // And the lifecycle branches are NOT flagged: a superseded record is
    // withheld whether or not the review requirement is on, because someone
    // set that state deliberately.
    decisionRecords = [record({ reviewState: "unreviewed", supersededAt: new Date("2026-10-06T09:00:00Z"), supersededBy: "newrec01" })];
    const sup = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(sup.items).toHaveLength(0);
    expect(sup.omissions.some((x) => x.reason === "superseded")).toBe(true);
  });

  it("suppresses no_record only for the gated subject, not for its neighbours", async () => {
    // The complement of the test above, and the reason it is needed: the fix
    // that stopped a withheld subject reading as absent could just as easily
    // have silenced a genuine absence sitting beside it. One subject is held
    // back by the gate, the other has nothing at all; each must get its OWN
    // reason.
    decisionRecords.push(record({ subject: "submission:SUB-2026-8891", reviewState: "unreviewed" }));
    const r = await resolveContext({
      subjects: ["submission:SUB-2026-8891", "submission:SUB-NOTHING-HERE"],
      purpose: "draft", surface: "team_run", teamAgentId: "teamA",
    });
    expect(r.items).toHaveLength(0);
    expect(r.omissions.filter((x) => x.reason === "no_record").map((x) => x.subject))
      .toEqual(["submission:SUB-NOTHING-HERE"]);
    expect(r.omissions.filter((x) => x.reason === "unreviewed").map((x) => x.subject))
      .toEqual(["submission:SUB-2026-8891"]);
  });

  it("honours effectiveFrom, so a record does not apply before it applies", async () => {
    decisionRecords.push(record({ reviewState: "reviewed", effectiveFrom: new Date("2027-01-01T00:00:00Z") }));
    const r = await resolveContext({ subjects: ["submission:SUB-2026-8891"], purpose: "draft", surface: "team_run", teamAgentId: "teamA" });
    expect(r.items).toHaveLength(0);
    // Held back, so SAID -- the gate's one rule. This was a silent `continue`
    // at first, which is the defect the other five branches were written to
    // avoid.
    expect(r.omissions.find((x) => x.reason === "not_yet_effective")!.detail).toMatch(/until 2027-01-01/);
    expect(r.omissions.some((x) => x.reason === "no_record")).toBe(false);
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
    // The index is shared state too: without this, a test that seeds decision
    // records leaves them for the next one, which then measures something
    // nobody set up.
    decisionRecords = [];
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

  it("records which objects each prior decision covered, not just the headline", async () => {
    // Without this the run record understates what the step saw: a decision
    // covering a submission, its policy and its binder read as covering one,
    // and twice led me to report "collapse not proven" from a record that
    // could not show it either way.
    decisionRecords = [];
    for (const subject of ["submission:SUB-2026-8891", "policy:POL-2026-8891-CP", "binder:CP-2026-17"]) {
      decisionRecords.push({
        subject, subjectType: subject.split(":")[0], teamAgentId: "teamA", runId: "oneRun",
        // Reviewed, or the recall gate withholds it and this test measures the
        // gate instead of the subject coverage it is about.
        reviewState: "reviewed",
        decidedAt: new Date("2026-10-05T10:00:00Z"),
        decision: { status: "bound and active" }, evidence: {}, fromKeys: ["status"],
      });
    }
    const prior = await priorDecisionsForPrompt({
      teamAgentId: "teamA",
      state: { submissionId: "SUB-2026-8891", policyNumber: "POL-2026-8891-CP", treatyReference: "CP-2026-17" },
      purpose: "draft",
    });
    expect(prior.items).toHaveLength(1);
    expect(prior.items[0].subjects.sort()).toEqual(["binder:CP-2026-17", "policy:POL-2026-8891-CP", "submission:SUB-2026-8891"]);
    expect(prior.items[0].runId).toBe("oneRun");
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
  beforeEach(() => { runs.length = 0; decisionRecords = []; });

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

describe("the contract cannot name a condition it cannot report", () => {
  /**
   * The defect this exists for is written up in design section 6b: `expired`,
   * `unreviewed` and `low_confidence` sat in the OmissionReason union for two
   * days with nothing in the codebase able to produce them. Every behavioural
   * test passed throughout, because a reason that never fires breaks no
   * assertion -- it just quietly makes the contract a claim rather than a
   * description.
   *
   * So this reads the two files as TEXT and reports what it found, not what it
   * concluded: the union's members on one side, the reasons actually pushed on
   * the other. It is a static check and says so.
   */
  const read = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8");

  it("every declared OmissionReason is pushed somewhere in the server", () => {
    const shared = read("shared/intelligence-context.ts");
    const union = shared.slice(shared.indexOf("export type OmissionReason ="));
    const declared = [...union.slice(0, union.indexOf(";")).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    // Guard the parser itself: a regex that matched nothing would make this
    // test pass by measuring an empty list.
    expect(declared.length).toBeGreaterThan(8);
    expect(declared).toContain("no_record");

    const server = read("server/intelligence-context.ts");
    const produced = new Set([...server.matchAll(/reason:\s*"([a-z_]+)"/g)].map((m) => m[1]));
    expect([...produced].length).toBeGreaterThan(0);

    const unreachable = declared.filter((r) => !produced.has(r));
    expect(unreachable, `declared but never pushed: ${unreachable.join(", ")}`).toEqual([]);
  });

  it("and every reason pushed is declared, so no caller sees an unknown one", () => {
    const server = read("server/intelligence-context.ts");
    const shared = read("shared/intelligence-context.ts");
    const union = shared.slice(shared.indexOf("export type OmissionReason ="));
    const declared = new Set([...union.slice(0, union.indexOf(";")).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
    const produced = [...new Set([...server.matchAll(/reason:\s*"([a-z_]+)"/g)].map((m) => m[1]))];
    const undeclared = produced.filter((r) => !declared.has(r));
    expect(undeclared, `pushed but not in the union: ${undeclared.join(", ")}`).toEqual([]);
  });
});

describe("recallVerdict: the gate, as the review queue sees it", () => {
  /**
   * The queue and the resolver must never disagree about why a record is
   * withheld, which is why both call this. These test the function directly,
   * because the route layer would otherwise be the only place the reviewer's
   * view is checked, and a second copy of five branches is how `?? 0` ended up
   * in fourteen readers.
   */
  const rec = (over: any = {}) => ({ subject: "submission:SUB-1", runId: "runabcdef12", reviewState: "reviewed", ...over });

  it("offers a reviewed, live record", () => {
    expect(recallVerdict(rec(), { requireReview: true })).toEqual({ recallable: true });
  });

  it("explains each refusal in terms a reviewer can act on", () => {
    const cases: Array<[any, string, RegExp]> = [
      [{ supersededAt: new Date(), supersededBy: "newrec0099", supersededReason: "clausesUsed was wrong" }, "superseded", /superseded by record newrec00.*clausesUsed was wrong/],
      [{ expiresAt: new Date("2020-01-01") }, "expired", /expired on 2020-01-01/],
      [{ effectiveFrom: new Date("2099-01-01") }, "not_yet_effective", /until 2099-01-01/],
      [{ reviewState: "unreviewed" }, "unreviewed", /no one has reviewed it/],
      [{ confidence: 0.1 }, "low_confidence", /10% confident/],
    ];
    for (const [over, reason, detail] of cases) {
      const v = recallVerdict(rec(over), { requireReview: true });
      expect(v.recallable, reason).toBe(false);
      expect(v.reason, reason).toBe(reason);
      expect(v.detail, reason).toMatch(detail);
    }
  });

  it("reports supersession ahead of expiry when a record is both", () => {
    // More useful to hear from the person who replaced it than from the clock.
    const v = recallVerdict(rec({ supersededAt: new Date(), expiresAt: new Date("2020-01-01") }), { requireReview: true });
    expect(v.reason).toBe("superseded");
  });

  it("leaves the two flagged branches alone when the requirement is off", () => {
    expect(recallVerdict(rec({ reviewState: "unreviewed" }), { requireReview: false })).toEqual({ recallable: true });
    expect(recallVerdict(rec({ confidence: 0.1 }), { requireReview: false })).toEqual({ recallable: true });
    // The lifecycle branches still apply either way: someone set those states.
    expect(recallVerdict(rec({ supersededAt: new Date() }), { requireReview: false }).recallable).toBe(false);
  });

  it("treats an unjudged confidence as unjudged, not as low", () => {
    expect(recallVerdict(rec({ confidence: null }), { requireReview: true }).recallable).toBe(true);
  });
});

/**
 * Phase 4 (design section 6e): what the decision was made ON, and under which
 * controls. The two NAIC rows we scored worst on.
 *
 * Both are gathered inside recordRunDecisions rather than passed from the
 * engine, because server/dag-execution-engine.ts carried another session's
 * uncommitted work and a change interleaved there is a change one of us
 * commits on the other's behalf.
 */
describe("recordRunDecisions records its provenance (phase 4)", () => {
  // The shape the phase 1 tests above already prove produces a record: a
  // decision step's output plus a tool step's evidence. Inventing a new one
  // here wrote nothing and made four tests fail on an empty mock rather than
  // on what they were about.
  const nodeConfig = {
    n1: { stateKey: "bind_policy", nodeType: "decision" },
    n2: { stateKey: "fetch_treaty_terms", nodeType: "tool_call" },
  };
  const state = { submissionId: "SUB-2026-8891", bind_policy: "bound", fetch_treaty_terms: { limit: 50 } };

  beforeEach(() => {
    decisionRecords = []; upsertDecisionRecord.mockClear();
    dagRun = null; policyBundle = null;
  });

  const write = () => recordRunDecisions({
    runId: "run-1", teamAgentId: "teamA", teamName: "E&S", orgId: "org1",
    state, nodeConfig, decidedAt: new Date("2026-10-08T10:00:00Z"),
  });

  it("captures what the step was SHOWN, as citations rather than prompt text", async () => {
    dagRun = { id: "run-1", waveResults: [{ results: [{ nodeId: "n1", priorContext: {
      text: "## What was already decided ...the whole rendered block...",
      subjects: ["submission:SUB-2026-8891"],
      items: [{ subject: "submission:SUB-2026-8891", tier: "authoritative", runId: "oldrun1", decidedAt: "2026-10-03T00:00:00Z" }],
      conflicts: [{ subject: "submission:SUB-2026-8891", field: "status" }],
      omissions: [{ reason: "unreviewed", detail: "A decision on binder:CP-1 exists but no one has reviewed it" }],
    } }] }] };
    await write();
    const rec = upsertDecisionRecord.mock.calls[0][0];
    expect(rec.contextUsed.stepsShown).toBe(1);
    expect(rec.contextUsed.items[0]).toEqual({
      subject: "submission:SUB-2026-8891", tier: "authoritative", matchAxis: null,
      runId: "oldrun1", decidedAt: "2026-10-03T00:00:00Z",
    });
    expect(rec.contextUsed.conflicts[0].field).toBe("status");
    expect(rec.contextUsed.omissions[0].reason).toBe("unreviewed");
    // Pointer, never copy: the rendered block must NOT be duplicated here.
    expect(JSON.stringify(rec.contextUsed)).not.toContain("What was already decided");
  });

  it("distinguishes 'nothing was shown' from 'we could not read it'", async () => {
    // A run that exists and showed nothing: captured, empty.
    dagRun = { id: "run-1", waveResults: [{ results: [{ nodeId: "n1" }] }] };
    await write();
    const shown = upsertDecisionRecord.mock.calls[0][0].contextUsed;
    expect(shown).not.toBeNull();
    expect(shown.stepsShown).toBe(0);
    expect(shown.items).toEqual([]);

    // A run that cannot be read: null, not an empty object pretending to be a
    // measurement. This is the pass_rate DEFAULT 0 lesson, one layer over.
    upsertDecisionRecord.mockClear();
    dagRun = null;
    await write();
    expect(upsertDecisionRecord.mock.calls[0][0].contextUsed).toBeNull();
  });

  it("records which controls applied, with their versions", async () => {
    policyBundle = {
      appliedPolicies: [{ id: "p1", name: "Treaty limit check", version: 3, enforcement: "strict", scope: "agent", domain: "underwriting" }],
      guardrails: ["no_pii_in_output"], blockedTools: ["send_email"],
    };
    dagRun = { id: "run-1", waveResults: [] };
    await write();
    const rec = upsertDecisionRecord.mock.calls[0][0];
    expect(rec.controlsApplied.policies[0]).toMatchObject({ id: "p1", version: 3, enforcement: "strict" });
    expect(rec.controlsApplied.guardrails).toEqual(["no_pii_in_output"]);
    // The version is the point: a policy edited later must not make this
    // decision look as though it was taken under the newer rules.
    expect(rec.controlsApplied.policies[0].version).toBe(3);
  });

  it("still indexes the decision when provenance cannot be gathered", async () => {
    // recordRunDecisions runs un-awaited after a finished run. Losing the
    // decision because its provenance could not be read would be a worse
    // failure than recording it without.
    dagRun = null; policyBundle = "throw";
    await expect(write()).resolves.toBeTruthy();
    const rec = upsertDecisionRecord.mock.calls[0][0];
    expect(rec.subject).toBe("submission:SUB-2026-8891");
    expect(rec.contextUsed).toBeNull();
    expect(rec.controlsApplied).toBeNull();
  });
});

describe("contextUsed counts each prior decision once, not once per step", () => {
  /**
   * Found in production, not here. The first live record carried 9 items
   * describing 3 prior decisions, 3 conflicts describing 1, and 3 omissions
   * describing 1, because every step in a run is shown the SAME prior context
   * and it was collected per step.
   *
   * Every fixture above had a single step, so the multiplication could not
   * appear. That is the same blind spot as the drift-signals loop: a fixture
   * that cannot reach the condition reports a clean green.
   *
   * It matters because this record exists to say what a decision was made on.
   * "Nine precedents were in view" when three were is a false statement in a
   * compliance artefact, not a tidiness problem.
   */
  const nodeConfig = {
    n1: { stateKey: "bind_policy", nodeType: "decision" },
    n2: { stateKey: "fetch_treaty_terms", nodeType: "tool_call" },
  };
  const state = { submissionId: "SUB-2026-8891", bind_policy: "bound", fetch_treaty_terms: { limit: 50 } };

  // What the engine actually persists: the same block attached to each step.
  const shown = {
    subjects: ["submission:SUB-2026-8891"],
    items: [
      { subject: "submission:SUB-2026-8891", tier: "authoritative", runId: "runAAA", decidedAt: "2026-10-08T09:00:00Z" },
      { subject: "submission:SUB-2026-8891", tier: "authoritative", runId: "runBBB", decidedAt: "2026-10-08T10:00:00Z" },
    ],
    conflicts: [{ subject: "submission:SUB-2026-8891", field: "status" }],
    omissions: [{ reason: "unclassified_keys", detail: "3 state keys could not be classified" }],
  };

  beforeEach(() => {
    decisionRecords = []; upsertDecisionRecord.mockClear();
    policyBundle = null;
    dagRun = { id: "run-1", waveResults: [{ results: [
      { nodeId: "n1", priorContext: shown },
      { nodeId: "n2", priorContext: shown },
      { nodeId: "n3", priorContext: shown },
    ] }] };
  });

  it("reports 3 steps and 2 prior decisions, not 6", async () => {
    await recordRunDecisions({
      runId: "run-1", teamAgentId: "teamA", teamName: "E&S", orgId: "org1",
      state, nodeConfig, decidedAt: new Date("2026-10-08T12:00:00Z"),
    });
    const cu = upsertDecisionRecord.mock.calls[0][0].contextUsed;
    expect(cu.stepsShown).toBe(3);
    expect(cu.items).toHaveLength(2);
    expect(cu.items.map((i: any) => i.runId).sort()).toEqual(["runAAA", "runBBB"]);
    expect(cu.conflicts).toHaveLength(1);
    expect(cu.omissions).toHaveLength(1);
  });

  it("keeps two decisions that differ only by the run that made them", async () => {
    // Dedupe must not collapse genuinely different precedents. Same object,
    // two runs, is two decisions -- that is corroboration and it is real.
    await recordRunDecisions({
      runId: "run-1", teamAgentId: "teamA", teamName: "E&S", orgId: "org1",
      state, nodeConfig, decidedAt: new Date("2026-10-08T12:00:00Z"),
    });
    const cu = upsertDecisionRecord.mock.calls[0][0].contextUsed;
    expect(new Set(cu.items.map((i: any) => i.runId)).size).toBe(2);
  });

  it("keeps the same run's decisions about DIFFERENT objects", async () => {
    const twoSubjects = {
      ...shown,
      items: [
        { subject: "submission:SUB-2026-8891", tier: "authoritative", runId: "runAAA", decidedAt: "2026-10-08T09:00:00Z" },
        { subject: "binder:CP-2026-17", tier: "authoritative", runId: "runAAA", decidedAt: "2026-10-08T09:00:00Z" },
      ],
    };
    dagRun = { id: "run-1", waveResults: [{ results: [
      { nodeId: "n1", priorContext: twoSubjects },
      { nodeId: "n2", priorContext: twoSubjects },
    ] }] };
    await recordRunDecisions({
      runId: "run-1", teamAgentId: "teamA", teamName: "E&S", orgId: "org1",
      state, nodeConfig, decidedAt: new Date("2026-10-08T12:00:00Z"),
    });
    const cu = upsertDecisionRecord.mock.calls[0][0].contextUsed;
    expect(cu.items).toHaveLength(2);
    expect(cu.items.map((i: any) => i.subject).sort()).toEqual(["binder:CP-2026-17", "submission:SUB-2026-8891"]);
  });
});

describe("P4.2: why, what was flagged, and which person settled it", () => {
  /**
   * The two NAIC rows the record scored worst on after P4.1: "what rationale
   * was recorded" and the half of "which system or person acted" that names a
   * person.
   *
   * The trap the rationale avoids is asking the model. An agent asked "why did
   * you decide that?" produces a justification, and this platform has already
   * caught one asserting a figure it had not read. So every part of the
   * rationale is something that HAPPENED and says where it came from, and the
   * model's own words are labelled as the model's words.
   */
  const nodeConfig = {
    n1: { stateKey: "bind_policy", nodeType: "decision", label: "Binding Decision" },
    n2: { stateKey: "fetch_treaty_terms", nodeType: "tool_call", label: "Treaty Lookup" },
  };
  const state = {
    submissionId: "SUB-2026-8891",
    bind_policy: "bound",
    fetch_treaty_terms: { limit: 50 },
    fetch_treaty_terms_verified: [{ fact: "treaty limit 50M", source: "treaty_api" }],
    fetch_treaty_terms_sources: ["treaty_api"],
  };

  beforeEach(() => {
    decisionRecords = []; upsertDecisionRecord.mockClear();
    policyBundle = null; approvals = [];
    dagRun = { id: "run-1", waveResults: [{ results: [
      { nodeId: "n1", judgments: [
        { kind: "facts", subject: "treaty limit", ok: false, severity: "high", evidence: "stated 50M, tool returned 50M for a different treaty" },
        { kind: "appetite", subject: "coastal TIV", ok: true },
      ] },
      { nodeId: "n2", judgments: [{ kind: "facts", subject: "treaty limit", ok: false, severity: "high" }] },
    ] }] };
  });

  const write = () => recordRunDecisions({
    runId: "run-1", teamAgentId: "teamA", teamName: "E&S", orgId: "org1",
    state, nodeConfig, decidedAt: new Date("2026-10-09T10:00:00Z"),
  });

  it("records only the checks that FAILED, named by step", async () => {
    await write();
    const pf = upsertDecisionRecord.mock.calls[0][0].patternsFlagged;
    // The passing judgment is the absence of a flag; recording it would bury
    // the ones that matter.
    expect(pf.map((p: any) => p.subject)).toEqual(["treaty limit", "treaty limit"]);
    expect(pf[0]).toMatchObject({ step: "Binding Decision", kind: "facts", severity: "high" });
    expect(pf[1].step).toBe("Treaty Lookup");
    expect(pf.some((p: any) => p.subject === "coastal TIV")).toBe(false);
  });

  it("does not report the same judgment once per step as several findings", async () => {
    // Two steps, same kind and subject, different steps: two entries, because
    // they ARE different checks. The same step twice would be one.
    dagRun.waveResults[0].results.push({ nodeId: "n1", judgments: [{ kind: "facts", subject: "treaty limit", ok: false }] });
    await write();
    const pf = upsertDecisionRecord.mock.calls[0][0].patternsFlagged;
    expect(pf).toHaveLength(2);
  });

  it("builds the rationale from what happened, each part saying where it came from", async () => {
    await write();
    const r = upsertDecisionRecord.mock.calls[0][0].rationale;
    // Facts a tool actually returned, found by the engine's evidence suffixes.
    expect(r.verifiedFacts.stateKeys.sort()).toEqual(["fetch_treaty_terms_sources", "fetch_treaty_terms_verified"]);
    expect(r.verifiedFacts.source).toBe("tool_output");
    expect(r.flagged.count).toBe(2);
    expect(r.flagged.kinds).toEqual(["facts"]);
    expect(r.gate.source).toBe("approval_record");
  });

  it("labels the model's own words as the model's words", async () => {
    // Kept because it is often the clearest summary; labelled because it is
    // not evidence of anything.
    // teamStateKeyFor("E&S") is "e_s" -- lowercased, non-alphanumerics to
    // underscores. The first version of this test wrote "E_S", so the key
    // never matched, narrative was undefined, and both assertions sat behind
    // an `if` that never ran. A test that cannot fail is not a test.
    (state as any).e_s = "Bound at 50M because the treaty permits it.";
    await write();
    const r = upsertDecisionRecord.mock.calls[0][0].rationale;
    expect(r.narrative, "the narrative was not captured at all").toBeTruthy();
    expect(r.narrative.text).toContain("Bound at 50M");
    expect(r.narrative.source).toBe("model_output");
    // Nothing else: the model's words carry their label and no implied status.
    expect(Object.keys(r.narrative).sort()).toEqual(["source", "text"]);
    delete (state as any).e_s;
  });

  it("names the person who settled the gate, not just the team", async () => {
    approvals = [
      { objectId: "run-1", decidedBy: "u-priya", decidedAt: new Date("2026-10-09T09:30:00Z") },
      { objectId: "another-run", decidedBy: "u-someone-else", decidedAt: new Date() },
    ];
    await write();
    const rec = upsertDecisionRecord.mock.calls[0][0];
    expect(rec.decidedByUserId).toBe("u-priya");
    expect(rec.rationale.gate).toMatchObject({ passed: true, by: "u-priya" });
    // decidedBy still answers "which system".
    expect(rec.decidedBy).toBe("E&S");
  });

  it("says a gate was NOT passed rather than leaving it ambiguous", async () => {
    approvals = [];
    await write();
    const rec = upsertDecisionRecord.mock.calls[0][0];
    expect(rec.decidedByUserId).toBeNull();
    expect(rec.rationale.gate).toEqual({ passed: false, source: "approval_record" });
  });

  it("still indexes the decision when the rationale cannot be assembled", async () => {
    dagRun = null;
    await expect(write()).resolves.toBeTruthy();
    const rec = upsertDecisionRecord.mock.calls[0][0];
    expect(rec.subject).toBe("submission:SUB-2026-8891");
    expect(rec.rationale).toBeNull();
    expect(rec.patternsFlagged).toBeNull();
  });
});

describe("'nothing flagged' and 'nothing checked' are different answers", () => {
  /**
   * Found on a live E&S run: ONE judgment across seven steps. For six of them
   * `flagged: 0` meant "no check ran", while reading exactly like "every check
   * passed" -- the reassuring interpretation, and the wrong one.
   *
   * This is the same defect as a pass rate defaulting to 0, at a third layer.
   */
  const nodeConfig = { n1: { stateKey: "bind_policy", nodeType: "decision", label: "Binding Decision" } };
  const state = { submissionId: "SUB-2026-8891", bind_policy: "bound" };
  const write = () => recordRunDecisions({
    runId: "run-1", teamAgentId: "teamA", teamName: "E&S", orgId: "org1",
    state, nodeConfig, decidedAt: new Date("2026-10-09T10:00:00Z"),
  });

  beforeEach(() => { decisionRecords = []; upsertDecisionRecord.mockClear(); policyBundle = null; approvals = []; });

  it("says none_ran when no step checked anything", async () => {
    dagRun = { id: "run-1", waveResults: [{ results: [{ nodeId: "n1" }] }] };
    await write();
    const f = upsertDecisionRecord.mock.calls[0][0].rationale.flagged;
    expect(f).toMatchObject({ count: 0, checksRun: 0, verification: "none_ran" });
  });

  it("says all_passed when checks ran and none failed", async () => {
    dagRun = { id: "run-1", waveResults: [{ results: [
      { nodeId: "n1", judgments: [{ kind: "policy", subject: "limits", ok: true }, { kind: "facts", subject: "tiv", ok: true }] },
    ] }] };
    await write();
    const f = upsertDecisionRecord.mock.calls[0][0].rationale.flagged;
    expect(f).toMatchObject({ count: 0, checksRun: 2, verification: "all_passed" });
    // The distinction the live run needed: same count, different answer.
    expect(f.verification).not.toBe("none_ran");
  });

  it("counts every check that ran, not only the ones that failed", async () => {
    dagRun = { id: "run-1", waveResults: [{ results: [
      { nodeId: "n1", judgments: [
        { kind: "policy", subject: "limits", ok: true },
        { kind: "facts", subject: "tiv", ok: false, severity: "high" },
        { kind: "appetite", subject: "coastal", ok: true },
      ] },
    ] }] };
    await write();
    const rec = upsertDecisionRecord.mock.calls[0][0];
    expect(rec.rationale.flagged).toMatchObject({ count: 1, checksRun: 3, verification: "flagged" });
    expect(rec.patternsFlagged).toHaveLength(1);
  });
});

describe("coverage: how much of the run was checked", () => {
  /**
   * A live E&S run reported all_passed off ONE judgment across seven steps.
   * True, and far more reassuring than it should be. "1 check across 7 steps"
   * and "7 checks across 7 steps" both read all_passed and are not the same
   * assurance, so the record carries the coverage too.
   */
  const nodeConfig = { n1: { stateKey: "bind_policy", nodeType: "decision", label: "Binding Decision" } };
  const state = { submissionId: "SUB-2026-8891", bind_policy: "bound" };
  const write = () => recordRunDecisions({
    runId: "run-1", teamAgentId: "teamA", teamName: "E&S", orgId: "org1",
    state, nodeConfig, decidedAt: new Date("2026-10-09T10:00:00Z"),
  });
  beforeEach(() => { decisionRecords = []; upsertDecisionRecord.mockClear(); policyBundle = null; approvals = []; });

  it("shows one check covering a seven-step run as exactly that", async () => {
    // The live shape that prompted this.
    dagRun = { id: "run-1", waveResults: [{ results: [
      { nodeId: "n1", judgments: [{ kind: "policy", subject: "limits", ok: true }] },
      ...Array.from({ length: 6 }, (_, i) => ({ nodeId: `x${i}` })),
    ] }] };
    await write();
    const f = upsertDecisionRecord.mock.calls[0][0].rationale.flagged;
    expect(f).toMatchObject({ verification: "all_passed", checksRun: 1, stepsWithChecks: 1, steps: 7 });
  });

  it("distinguishes that from a run where every step was checked", async () => {
    dagRun = { id: "run-1", waveResults: [{ results:
      Array.from({ length: 7 }, (_, i) => ({ nodeId: `n${i}`, judgments: [{ kind: "policy", subject: `s${i}`, ok: true }] })),
    }] };
    await write();
    const f = upsertDecisionRecord.mock.calls[0][0].rationale.flagged;
    // Same verification, very different coverage -- which is the point.
    expect(f).toMatchObject({ verification: "all_passed", checksRun: 7, stepsWithChecks: 7, steps: 7 });
  });

  it("counts steps even when none of them checked anything", async () => {
    dagRun = { id: "run-1", waveResults: [{ results: Array.from({ length: 4 }, (_, i) => ({ nodeId: `n${i}` })) }] };
    await write();
    const f = upsertDecisionRecord.mock.calls[0][0].rationale.flagged;
    expect(f).toMatchObject({ verification: "none_ran", checksRun: 0, stepsWithChecks: 0, steps: 4 });
  });
});

describe("P4.4: what followed, as a link and never a verdict", () => {
  /**
   * The last of the NAIC bulletin's five rows, and the one where the obvious
   * design is wrong. `outcome: {kpiId, wasCorrect, measuredAt}` has no state
   * for "we cannot tell", which is the honest answer for most decisions -- the
   * same defect as pass_rate defaulting to 0, but inside a compliance record.
   *
   * kpi_readings are AGGREGATE and time-windowed. They can say what a measure
   * did after a decision took effect; they cannot say whether one decision
   * about one submission was right.
   */
  const DAY = 86_400_000;
  const base = new Date("2026-10-01T00:00:00Z").getTime();
  beforeEach(() => { agentsById = {}; kpisByOutcome = {}; readingsByOutcome = {}; });

  it("never reports a verdict, only the measurements and their attribution", async () => {
    agentsById["teamA"] = { id: "teamA", outcomeId: "o1" };
    kpisByOutcome["o1"] = [{ id: "k1", name: "Treaty breach detection rate", unit: "percent", target: 99 }];
    readingsByOutcome["o1"] = [
      { id: "r0", kpiId: "k1", takenAt: new Date(base - 2 * DAY), value: 91, source: "agent_runs", statistic: "pass_rate", windowDays: 7 },
      { id: "r1", kpiId: "k1", takenAt: new Date(base + 2 * DAY), value: 96, source: "agent_runs", statistic: "pass_rate", windowDays: 7 },
    ];
    const o: any = await resolveOutcomeFor({ teamAgentId: "teamA", effectiveFrom: new Date(base), organizationId: "org1" });
    expect(o.status).toBe("measured");
    expect(o.attribution).toBe("aggregate");
    expect(o.note).toMatch(/do not attribute the movement to this decision/);
    // The refusal, pinned: nothing anywhere claims the decision was right.
    expect(JSON.stringify(o)).not.toMatch(/wasCorrect|correct|verdict/i);
  });

  it("reads from when the decision APPLIED, not when it was written", async () => {
    // A decision dated to take effect later must not claim the readings from
    // before it did.
    agentsById["teamA"] = { id: "teamA", outcomeId: "o1" };
    kpisByOutcome["o1"] = [{ id: "k1", name: "K", unit: "percent", target: 99 }];
    readingsByOutcome["o1"] = [
      { id: "early", kpiId: "k1", takenAt: new Date(base + 1 * DAY), value: 50, source: "manual" },
      { id: "late", kpiId: "k1", takenAt: new Date(base + 9 * DAY), value: 70, source: "manual" },
    ];
    const o: any = await resolveOutcomeFor({
      teamAgentId: "teamA", decidedAt: new Date(base), effectiveFrom: new Date(base + 5 * DAY), organizationId: "org1",
    });
    expect(o.kpis[0].readingsAfter.map((r: any) => r.readingId)).toEqual(["late"]);
    // And the one before is kept, because "what it did after" needs something
    // to read it against.
    expect(o.kpis[0].before.readingId).toBe("early");
  });

  it("separates the three absences instead of returning an empty list for all", async () => {
    // No outcome bound to the team.
    agentsById["teamA"] = { id: "teamA", outcomeId: null };
    expect((await resolveOutcomeFor({ teamAgentId: "teamA" }) as any).status).toBe("no_outcome_bound");

    // An outcome, but nothing measures it.
    agentsById["teamA"] = { id: "teamA", outcomeId: "o1" };
    kpisByOutcome["o1"] = [];
    expect((await resolveOutcomeFor({ teamAgentId: "teamA" }) as any).status).toBe("no_kpis");

    // KPIs exist, nothing measured since -- the only one that means
    // "too early to tell".
    kpisByOutcome["o1"] = [{ id: "k1", name: "K", unit: "percent", target: 99 }];
    readingsByOutcome["o1"] = [{ id: "old", kpiId: "k1", takenAt: new Date(base - DAY), value: 10, source: "manual" }];
    const o: any = await resolveOutcomeFor({ teamAgentId: "teamA", effectiveFrom: new Date(base) });
    expect(o.status).toBe("no_readings_since");
    expect(o.kpis[0].before.readingId).toBe("old");
  });

  it("says 'unavailable' when it could not look, which is not 'nothing found'", async () => {
    agentsById["explode"] = "throw";
    expect((await resolveOutcomeFor({ teamAgentId: "explode" }) as any).status).toBe("unavailable");
  });

  it("counts how many KPIs actually moved, so one reading does not read as full coverage", async () => {
    agentsById["teamA"] = { id: "teamA", outcomeId: "o1" };
    kpisByOutcome["o1"] = [
      { id: "k1", name: "Measured", unit: "percent", target: 99 },
      { id: "k2", name: "Never measured", unit: "percent", target: 99 },
    ];
    readingsByOutcome["o1"] = [{ id: "r1", kpiId: "k1", takenAt: new Date(base + DAY), value: 96, source: "manual" }];
    const o: any = await resolveOutcomeFor({ teamAgentId: "teamA", effectiveFrom: new Date(base) });
    expect(o).toMatchObject({ status: "measured", kpisMeasuredSince: 1, kpisTotal: 2 });
  });
});

describe("actionsTaken: what the run DID, not only what it concluded", () => {
  /**
   * The other half of the NAIC row "which system or person acted". Until
   * tool_invocations existed the platform kept only a COUNT -- the DAG engine
   * carries toolCallCount and discards the identities -- so nothing persisted
   * said which tools a run used. Verified on the live app: no tool name
   * appeared anywhere in a persisted run.
   *
   * Recorded by the DISPATCHER, not the engine, so it covers every execution
   * path rather than DAG runs only.
   */
  const nodeConfig = { n1: { stateKey: "bind_policy", nodeType: "decision", label: "Binding Decision" } };
  const state = { submissionId: "SUB-2026-8891", bind_policy: "bound" };
  const write = () => recordRunDecisions({
    runId: "run-1", teamAgentId: "teamA", teamName: "E&S", orgId: "org1",
    state, nodeConfig, decidedAt: new Date("2026-10-09T10:00:00Z"),
  });
  beforeEach(() => {
    decisionRecords = []; upsertDecisionRecord.mockClear(); policyBundle = null; approvals = [];
    toolInvocations = []; dagRun = { id: "run-1", waveResults: [] };
  });

  it("names the tools, not just a count", async () => {
    toolInvocations = [
      { serverName: "salesforce", toolName: "get_account", outcome: "success", durationMs: 120, createdAt: new Date("2026-10-09T09:00:00Z") },
      { serverName: "treaty_api", toolName: "fetch_limits", outcome: "success", durationMs: 300, createdAt: new Date("2026-10-09T09:01:00Z") },
    ];
    await write();
    const a = upsertDecisionRecord.mock.calls[0][0].actionsTaken;
    expect(a.map((x: any) => `${x.server}.${x.tool}`)).toEqual(["salesforce.get_account", "treaty_api.fetch_limits"]);
    expect(a[0]).toMatchObject({ outcome: "success", calls: 1 });
  });

  it("keeps refusals, because 'tried and was blocked' is not 'never tried'", async () => {
    toolInvocations = [
      { serverName: "teams", toolName: "post_message", outcome: "gate_blocked_policy", durationMs: 2, createdAt: new Date() },
    ];
    await write();
    const a = upsertDecisionRecord.mock.calls[0][0].actionsTaken;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ tool: "post_message", outcome: "gate_blocked_policy" });
  });

  it("collapses a loop into one action called many times", async () => {
    // Nine calls to the same tool is one action taken nine times, not nine
    // actions -- the inflation that made contextUsed read as 9 precedents.
    toolInvocations = Array.from({ length: 9 }, () => ({
      serverName: "treaty_api", toolName: "fetch_limits", outcome: "success", durationMs: 10, createdAt: new Date(),
    }));
    await write();
    const a = upsertDecisionRecord.mock.calls[0][0].actionsTaken;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ calls: 9, totalMs: 90 });
  });

  it("separates the same tool succeeding and failing", async () => {
    toolInvocations = [
      { serverName: "treaty_api", toolName: "fetch_limits", outcome: "success", durationMs: 10, createdAt: new Date() },
      { serverName: "treaty_api", toolName: "fetch_limits", outcome: "tool_error", durationMs: 5, createdAt: new Date() },
    ];
    await write();
    const a = upsertDecisionRecord.mock.calls[0][0].actionsTaken;
    expect(a.map((x: any) => x.outcome).sort()).toEqual(["success", "tool_error"]);
  });

  it("distinguishes 'used no tools' from 'could not look'", async () => {
    toolInvocations = [];
    await write();
    expect(upsertDecisionRecord.mock.calls[0][0].actionsTaken).toEqual([]);

    upsertDecisionRecord.mockClear();
    toolInvocations = "throw";
    await write();
    expect(upsertDecisionRecord.mock.calls[0][0].actionsTaken).toBeNull();
  });
});

describe("the approver lookup, after the link was moved out of prose", () => {
  /**
   * Found live: four gates on one run were approved by "admin", reviewState
   * correctly read "reviewed", and decidedByUserId was still null. The cause
   * was not the lookup but the data -- a hitl_gate approval carried
   * objectId: null, and the run id existed only inside the description text
   * as "Run: a22b22ee-...".
   *
   * Fixed at the source (agent-runtime.ts now sets objectId to the dag run
   * id) rather than by parsing the description, because a compliance field
   * populated from free text is a field that asserts what it inferred.
   */
  const nodeConfig = { n1: { stateKey: "bind_policy", nodeType: "decision", label: "Binding Decision" } };
  const state = { submissionId: "SUB-2026-8891", bind_policy: "bound" };
  const write = () => recordRunDecisions({
    runId: "run-1", teamAgentId: "teamA", teamName: "E&S", orgId: "org1",
    state, nodeConfig, decidedAt: new Date("2026-10-09T10:00:00Z"),
  });
  beforeEach(() => {
    decisionRecords = []; upsertDecisionRecord.mockClear();
    policyBundle = null; toolInvocations = []; dagRun = { id: "run-1", waveResults: [] };
  });

  it("names the approver when the gate carries the run as objectId", async () => {
    approvals = [{ objectId: "run-1", decidedBy: "admin", decidedAt: new Date("2026-10-09T09:30:00Z") }];
    await write();
    const rec = upsertDecisionRecord.mock.calls[0][0];
    expect(rec.decidedByUserId).toBe("admin");
    expect(rec.rationale.gate).toMatchObject({ passed: true, by: "admin" });
  });

  it("does not claim an approver for a gate from before the link existed", async () => {
    // The live shape: decided by a person, but no structured tie to the run.
    approvals = [{ objectId: null, decidedBy: "admin", decidedAt: new Date(), description: "Run: run-1" }];
    await write();
    const rec = upsertDecisionRecord.mock.calls[0][0];
    expect(rec.decidedByUserId).toBeNull();
    expect(rec.rationale.gate).toEqual({ passed: false, source: "approval_record" });
  });

  it("does not pick up another run's approver", async () => {
    approvals = [{ objectId: "some-other-run", decidedBy: "someone-else", decidedAt: new Date() }];
    await write();
    expect(upsertDecisionRecord.mock.calls[0][0].decidedByUserId).toBeNull();
  });

  it("takes the most recent decision when a run had several gates", async () => {
    // The live run had four. The last one settled is the one that released it.
    approvals = [
      { objectId: "run-1", decidedBy: "first", decidedAt: new Date("2026-10-09T09:00:00Z") },
      { objectId: "run-1", decidedBy: "last", decidedAt: new Date("2026-10-09T09:45:00Z") },
    ];
    await write();
    expect(upsertDecisionRecord.mock.calls[0][0].decidedByUserId).toBe("last");
  });
});
