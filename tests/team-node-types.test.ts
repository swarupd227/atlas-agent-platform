/**
 * Every node type the engine runs has to be a node type the validator accepts.
 *
 * Maintaining that agreement by hand failed three times, each identically: a
 * node type ships, the engine executes it, and a validator nobody updated
 * rejects it as "invalid type". The file's own comment recorded two of them
 * (knowledge_base, then sub_flow and expression).
 *
 * The third was tool_call, and it was the worst, because the failure was
 * invisible where the team was built. A six-connector underwriting team ran
 * through the run API and bound a policy; asked to run the same team, Astra
 * Cowork refused with "the team's wiring has 6 blocking errors", because Cowork
 * asks this validator first. Live 2026-09-26.
 *
 * The last test here is the one that matters: it reads the engine's own
 * dispatch and fails if it mentions a node type the shared list does not.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { TEAM_NODE_TYPES, isTeamNodeType, missingRequirement } from "../shared/team-node-types";
import { validateTeamGraph } from "../server/team-graph-validate";

const node = (over: Record<string, any> = {}) => ({
  id: "n1", label: "A step", nodeType: "internal_agent", refAgentId: "agent-1",
  config: {}, gateType: null, refToolIds: [], ...over,
}) as any;

describe("the node types a team may contain", () => {
  it("accepts a connector call, which it did not before", () => {
    expect(isTeamNodeType("tool_call")).toBe(true);
    const { errors } = validateTeamGraph({}, [node({
      nodeType: "tool_call", refAgentId: null, label: "Treaty Terms Fetcher",
      config: { toolName: "get_treaty_terms", toolServerId: "b68c16a5-218b-48d9-a419-d802a4b9b037" },
    })], []);
    expect(errors).toEqual([]);
  });

  it("accepts every type the builder can emit", () => {
    for (const nodeType of TEAM_NODE_TYPES) expect(isTeamNodeType(nodeType), nodeType).toBe(true);
    expect(isTeamNodeType("something_else")).toBe(false);
    expect(isTeamNodeType(undefined)).toBe(false);
  });

  it("still reports a node that cannot run, rather than waving it through", () => {
    // Accepting the type but not its requirements would be half a check.
    expect(missingRequirement(node({ nodeType: "tool_call", refAgentId: null, config: {} }))).toBe("has no tool bound");
    expect(missingRequirement(node({ nodeType: "tool_call", refAgentId: null, config: { toolName: "x" } }))).toBe("has no tool bound");
    expect(missingRequirement(node({ nodeType: "expression", refAgentId: null, config: {} }))).toBe("has no expression written");
    expect(missingRequirement(node({ nodeType: "internal_agent", refAgentId: null }))).toBe("has no agent selected");
    expect(missingRequirement(node({ nodeType: "skill", refAgentId: null }))).toBe("has no skill selected");
    expect(missingRequirement(node({ nodeType: "knowledge_base", refAgentId: null }))).toBe("has no knowledge base selected");
    expect(missingRequirement(node({ nodeType: "sub_flow", refAgentId: null }))).toBe("has no flow selected");
    // A gate needs nothing beyond itself; a missing gate type is a warning.
    expect(missingRequirement(node({ nodeType: "edge_gate", refAgentId: null }))).toBeNull();
  });

  it("reports the real six-node team that Cowork refused as clean", () => {
    // The live blueprint's shape: connector calls, calculations and gates.
    const team = [
      node({ id: "a", nodeType: "internal_agent", label: "COPE Normalizer", refAgentId: "a1" }),
      node({ id: "b", nodeType: "tool_call", label: "Submission Schedule Fetcher", refAgentId: null, config: { toolName: "fetch_submission", toolServerId: "s1" } }),
      node({ id: "c", nodeType: "tool_call", label: "Treaty Terms Fetcher", refAgentId: null, config: { toolName: "get_treaty_terms", toolServerId: "s2" } }),
      node({ id: "d", nodeType: "expression", label: "Treaty Limit Evaluator", refAgentId: null, config: { expression: "(a > b)" } }),
      node({ id: "e", nodeType: "edge_gate", label: "Carrier Underwriter Approval", refAgentId: null, gateType: "approval" }),
    ];
    const edges = [
      { sourceNodeId: "a", targetNodeId: "b" }, { sourceNodeId: "b", targetNodeId: "c" },
      { sourceNodeId: "c", targetNodeId: "d" }, { sourceNodeId: "d", targetNodeId: "e" },
    ] as any;
    const { errors } = validateTeamGraph({ riskTier: "HIGH" }, team, edges);
    expect(errors).toEqual([]);
  });
});

describe("the list cannot drift from the engine again", () => {
  it("covers every node type the engine dispatches on", () => {
    const engine = readFileSync(join(__dirname, "..", "server", "dag-execution-engine.ts"), "utf8");
    // Every `nc.nodeType === "x"` the executor branches on.
    const dispatched = new Set(
      [...engine.matchAll(/nc\.nodeType === "([a-z_]+)"/g)].map((m) => m[1]),
    );
    expect(dispatched.size).toBeGreaterThan(3);
    const missing = [...dispatched].filter((t) => !isTeamNodeType(t));
    expect(missing, `the engine executes these but the validator rejects them: ${missing.join(", ")}`).toEqual([]);
  });

  it("is what the validator actually reads", () => {
    const source = readFileSync(join(__dirname, "..", "server", "team-graph-validate.ts"), "utf8");
    expect(source).toContain('from "@shared/team-node-types"');
    // No second hand-maintained copy of the list.
    expect(source).not.toContain("const validTeamNodeTypes");
  });
});
