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
vi.mock("../server/storage", () => ({
  storage: {
    listDagExecutionRunsByOrg: vi.fn(async () => runs),
    getAgent: vi.fn(async (id: string) => ({ id, name: "E&S Property Binding Orchestrator", blueprintId: "bp1" })),
    getTeamBlueprintNodes,
  },
}));
const { resolveContext, renderContextForPrompt } = await import("../server/intelligence-context");

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

describe("resolveContext omissions and honesty", () => {
  beforeEach(() => { runs.length = 0; });

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
    // both durable, and both named by the step rather than by the key.
    const keys = Object.keys(r.items[0].decision);
    expect(keys).toContain("fetch_treaty_terms");
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
