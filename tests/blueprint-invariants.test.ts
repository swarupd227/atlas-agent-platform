/**
 * Whether a team can run, asked before anybody presses run.
 *
 * The gap this closes, in one sentence from the session that found it: "build,
 * deploy and sync all say success, and it only fails when you press run."
 * A blueprint holding one edge that points backwards cannot be planned at all --
 * computeWaves throws -- so every run of that team 500s while every surface that
 * wrote it reported success.
 *
 * The two findings are deliberately not equal. A loop left as an edge stops the
 * run from starting and blocks a deployment. A revision rule aimed at a step
 * that is gone runs fine and silently never fires: worth saying, not worth
 * refusing a deployment over, because refusing would help nobody.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const db = vi.hoisted(() => ({ nodes: [] as any[], edges: [] as any[] }));

vi.mock("../server/storage", () => ({
  storage: {
    getTeamBlueprintNodes: vi.fn(async () => db.nodes),
    getTeamBlueprintEdges: vi.fn(async () => db.edges),
  },
}));

const { checkBlueprintInvariants } = await import("../server/blueprint-invariants");

const node = (id: string, label: string, revisionTarget?: string) => ({
  id,
  label,
  nodeType: "internal_agent",
  stateKey: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
  config: revisionTarget ? { revision: { targetNodeId: revisionTarget, maxRounds: 2 } } : {},
});
const edge = (from: string, to: string, over: Record<string, unknown> = {}) => ({
  id: `${from}-${to}`,
  sourceNodeId: from,
  targetNodeId: to,
  condition: null,
  evaluationMode: "ai",
  rule: null,
  ...over,
});
const rule = (field: string) => ({ combinator: "AND", conditions: [{ field, operator: ">", value: 1 }] });

beforeEach(() => {
  db.nodes = [node("n1", "Draft endorsement"), node("n2", "Check contract certainty"), node("n3", "File it")];
  db.edges = [edge("n1", "n2"), edge("n2", "n3")];
});

describe("a team that can run", () => {
  it("says so, and says how much it looked at", async () => {
    const check = await checkBlueprintInvariants("bp-1");
    expect(check).toMatchObject({ runnable: true, findings: [], checked: { nodes: 3, edges: 2 } });
  });

  it("treats a loop expressed as a revision rule as fine, because that is how the platform expresses one", async () => {
    db.nodes = [node("n1", "Draft endorsement"), node("n2", "Check contract certainty", "n1"), node("n3", "File it")];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.runnable).toBe(true);
    expect(check.findings).toEqual([]);
  });

  it("has nothing to say about a team with no blueprint at all", async () => {
    expect(await checkBlueprintInvariants(null)).toMatchObject({ runnable: true, findings: [] });
  });
});

describe("a team that cannot", () => {
  it("names the loop, blocks on it, and says where the loop belongs instead", async () => {
    db.edges = [edge("n1", "n2"), edge("n2", "n3"), edge("n2", "n1")];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.runnable).toBe(false);
    expect(check.findings).toHaveLength(1);
    const [finding] = check.findings;
    expect(finding.kind).toBe("cycle");
    expect(finding.blocksRun).toBe(true);
    // The steps by name, because a node id tells the reader nothing.
    expect(finding.steps).toEqual(["Check contract certainty", "Draft endorsement"]);
    expect(finding.message).toContain("no run can start");
    expect(finding.message).toContain("revision rule");
  });

  it("finds every loop, not the first one", async () => {
    db.edges = [edge("n1", "n2"), edge("n2", "n3"), edge("n2", "n1"), edge("n3", "n1")];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings.filter((f) => f.kind === "cycle")).toHaveLength(2);
  });
});

/**
 * A run that did nothing and said it worked.
 *
 * Live 2026-09-27, on the first runs of a team that had never run: a router step
 * completed, both of its outgoing conditions evaluated false (the step emitted
 * {"route":"escalate"} while the edges asked about "Endorsement approved"), and
 * every remaining step was skipped. Terminal status completed_with_skips.
 *
 * What is reported is the consequence, never "these conditions cannot match":
 * proving that needs an expression's output keys inferred from its JSONata, and a
 * confident wrong claim in a governance check is worse than the gap it closes.
 * None of these block a deployment, because a decision whose author knows one
 * branch always matches is a legitimate design.
 */
describe("a decision with no way through", () => {
  it("is reported, with the consequence rather than a claim about satisfiability", async () => {
    db.edges = [
      edge("n1", "n2", { condition: "Endorsement approved" }),
      edge("n1", "n3", { condition: "Endorsement rejected" }),
    ];
    const check = await checkBlueprintInvariants("bp-1");
    const found = check.findings.find((f) => f.kind === "no_fallback_branch")!;
    expect(found).toBeTruthy();
    expect(found.message).toContain("2 ways on and every one of them is conditional");
    // With two or more ways on, the engine now calls this a dead end and fails the
    // run (fd8cba5). Saying "the run still reports completed" here would be false.
    expect(found.message).toContain("the run then fails and names this step");
    expect(found.message).toContain("nothing says so until it has run");
    expect(found.message).not.toContain("still reports completed");
    // Never asserts the conditions are unsatisfiable.
    expect(found.message).not.toMatch(/never match|cannot match|impossible/i);
  });

  it("does not block a deployment, because one branch always matching is a real design", async () => {
    db.edges = [edge("n1", "n2", { condition: "approved" }), edge("n1", "n3", { condition: "rejected" })];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.runnable).toBe(true);
    expect(check.findings.every((f) => !f.blocksRun)).toBe(true);
  });

  it("says nothing when one path out is unconditional, because that is the fallback", async () => {
    db.edges = [edge("n1", "n2", { condition: "aggregate > 50000000" }), edge("n1", "n3")];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings.map((f) => f.kind)).not.toContain("no_fallback_branch");
  });

  it("says nothing when the branch is decided by a rule, which is the ordinary well-built decision", async () => {
    // Measured, not assumed: flagging every all-conditional node hit 50 nodes
    // across 30 of the 85 team blueprints on Azure (2026-09-27), most of them
    // sound. Requiring that nothing about the branch be checkable took it to 4
    // nodes across 4 teams, the first being the live failure this exists for.
    db.edges = [
      edge("n1", "n2", { condition: "aggregate > 50000000", evaluationMode: "deterministic", rule: rule("aggregate") }),
      edge("n1", "n3", { condition: "aggregate <= 50000000", evaluationMode: "deterministic", rule: rule("aggregate") }),
    ];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings.map((f) => f.kind)).not.toContain("no_fallback_branch");
  });

  it("still fires for a single conditional way on, and says nothing at run time will raise it", async () => {
    // Two of the four steps this found across the fleet are this shape. The engine
    // deliberately does not treat a lone conditional path as a dead end, so this
    // finding is the only warning those two will ever get -- and the message has to
    // say that rather than implying the run will catch it.
    db.edges = [edge("n1", "n2", { condition: "All assets meet brand guide standards" })];
    const check = await checkBlueprintInvariants("bp-1");
    const found = check.findings.find((f) => f.kind === "no_fallback_branch")!;
    expect(found.message).toContain("one way on and it is conditional");
    expect(found.message).toContain("the run still reports completed");
    expect(found.message).toContain("This is the only warning it gets");
    expect(found.message).not.toContain("fails and names this step");
  });

  it("matches the engine's own rule for what counts as a dead end", () => {
    // My copy promises a failed run for two or more ways on and none for one. That
    // promise is only true while execute() keeps `branching.length >= 2`. If this
    // fails, the engine changed and the messages above are now lying: re-read
    // server/dag-execution-engine.ts and fix the wording, do not delete the test.
    const engine = readFileSync(join(__dirname, "..", "server", "dag-execution-engine.ts"), "utf8");
    expect(engine).toContain("branching.length >= 2");
    expect(engine).toContain("if (routingDeadEndNodeIds.length > 0) success = false;");
  });

  it("exempts an approval gate, which resolves its own approve and reject paths", async () => {
    db.nodes = [{ ...node("n1", "Carrier sign-off"), nodeType: "edge_gate", gateType: "approval" }, node("n2", "Bind"), node("n3", "Decline")];
    db.edges = [edge("n1", "n2", { condition: "approved" }), edge("n1", "n3", { condition: "rejected" })];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings.map((f) => f.kind)).not.toContain("no_fallback_branch");
  });

  it("says nothing about a terminal step, which has no ways on to be conditional", async () => {
    db.edges = [edge("n1", "n2"), edge("n2", "n3")];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings).toEqual([]);
  });
});

describe("a rule reading a step that is not there", () => {
  it("is reported when the prefix matches no step's state key", async () => {
    // The live shape: the step it named was replaced and took its state key with it.
    db.edges = [edge("n1", "n2", { evaluationMode: "deterministic", rule: rule("endorsement_accepted.approved"), condition: "approved" }), edge("n1", "n3")];
    const check = await checkBlueprintInvariants("bp-1");
    const found = check.findings.find((f) => f.kind === "unreachable_rule_field")!;
    expect(found.message).toContain("endorsement_accepted.approved");
    expect(found.message).toContain("no step in this team writes \"endorsement_accepted\"");
    expect(found.blocksRun).toBe(false);
  });

  it("accepts a prefix that IS a step's state key", async () => {
    db.edges = [edge("n1", "n2", { evaluationMode: "deterministic", rule: rule("check_contract_certainty.score"), condition: "x" }), edge("n1", "n3")];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings.map((f) => f.kind)).not.toContain("unreachable_rule_field");
  });

  it("leaves a bare field alone, because it comes from inside a step's output and cannot be known here", async () => {
    db.edges = [edge("n1", "n2", { evaluationMode: "deterministic", rule: rule("aggregate"), condition: "aggregate > 1" }), edge("n1", "n3")];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings.map((f) => f.kind)).not.toContain("unreachable_rule_field");
  });

  it("leaves the run's own values alone", async () => {
    db.edges = [edge("n1", "n2", { evaluationMode: "deterministic", rule: rule("output.total"), condition: "x" }), edge("n1", "n3")];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings.map((f) => f.kind)).not.toContain("unreachable_rule_field");
  });
});

describe("a structured step whose branches are prose", () => {
  it("is reported: a model call per run, and nothing notices a vocabulary mismatch", async () => {
    db.nodes = [{ ...node("n1", "Endorsement Decision Router"), nodeType: "expression" }, node("n2", "Filing lookup"), node("n3", "Escalation")];
    db.edges = [
      edge("n1", "n2", { condition: "Endorsement approved" }),
      edge("n1", "n3", { condition: "Endorsement rejected" }),
    ];
    const check = await checkBlueprintInvariants("bp-1");
    const found = check.findings.find((f) => f.kind === "branch_judged_by_model")!;
    expect(found.steps).toEqual(["Endorsement Decision Router"]);
    expect(found.message).toContain("Endorsement approved");
    expect(found.message).toContain("model call on every run");
    expect(found.blocksRun).toBe(false);
  });

  it("is the only finding for that node, so one step is not described twice", async () => {
    db.nodes = [{ ...node("n1", "Endorsement Decision Router"), nodeType: "expression" }, node("n2", "Filing lookup"), node("n3", "Escalation")];
    db.edges = [edge("n1", "n2", { condition: "Endorsement approved" }), edge("n1", "n3", { condition: "Endorsement rejected" })];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings.map((f) => f.kind)).toEqual(["branch_judged_by_model"]);
  });

  it("says nothing once one of those paths is a rule on a field the step emits", async () => {
    db.nodes = [{ ...node("n1", "Endorsement Decision Router"), nodeType: "expression" }, node("n2", "Filing lookup"), node("n3", "Escalation")];
    db.edges = [
      edge("n1", "n2", { condition: "route is bind", evaluationMode: "deterministic", rule: rule("endorsement_decision_router.route") }),
      edge("n1", "n3", { condition: "route is escalate" }),
    ];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings.map((f) => f.kind)).not.toContain("branch_judged_by_model");
  });
});

describe("a loop pointing at a step that is gone", () => {
  it("is reported, and does not block, because the team still runs -- the loop just never fires", async () => {
    // The live shape: the step it pointed at was superseded by a sync and the
    // pointer kept naming the retired node.
    db.nodes = [node("n1", "Draft endorsement"), node("n2", "Check contract certainty", "node-that-was-replaced"), node("n3", "File it")];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.runnable).toBe(true);
    expect(check.findings).toHaveLength(1);
    expect(check.findings[0]).toMatchObject({ kind: "dangling_revision", blocksRun: false, steps: ["Check contract certainty"] });
    expect(check.findings[0].message).toContain("can never fire");
  });

  it("is reported alongside a loop that does block, so one does not hide the other", async () => {
    db.nodes = [node("n1", "Draft endorsement"), node("n2", "Check contract certainty", "gone"), node("n3", "File it")];
    db.edges = [edge("n1", "n2"), edge("n2", "n3"), edge("n3", "n1")];
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.findings.map((f) => f.kind).sort()).toEqual(["cycle", "dangling_revision"]);
    expect(check.runnable).toBe(false);
  });
});
