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
  config: revisionTarget ? { revision: { targetNodeId: revisionTarget, maxRounds: 2 } } : {},
});
const edge = (from: string, to: string) => ({ id: `${from}-${to}`, sourceNodeId: from, targetNodeId: to });

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
