import { describe, expect, it } from "vitest";
import {
  assertProductionWriteAllowed,
  indexUniqueByNormalizedName,
  normalizeResourceName,
  remapTeamGraph,
} from "../scripts/hilti-campaign-migration";

describe("Hilti campaign migration safeguards", () => {
  it("normalizes accidental whitespace without hiding meaningful characters", () => {
    expect(normalizeResourceName("  Hilti   Audience Agent ")).toBe("hilti audience agent");
    expect(normalizeResourceName("Hilti-MarCom")).toBe("hilti-marcom");
  });

  it("refuses ambiguous natural-key matches", () => {
    expect(() => indexUniqueByNormalizedName([
      { id: "a", name: "Hilti Research Agent" },
      { id: "b", name: " Hilti  Research Agent " },
    ], "agent")).toThrow(/ambiguous agent/i);
  });

  it("requires both write mode and the exact production confirmation", () => {
    expect(() => assertProductionWriteAllowed(false, undefined)).not.toThrow();
    expect(() => assertProductionWriteAllowed(true, "AWS_PROD")).toThrow(/AWS_PROD_MONOREPO/);
    expect(() => assertProductionWriteAllowed(true, "AWS_PROD_MONOREPO")).not.toThrow();
  });

  it("remaps agent references and edge node ids without changing graph topology", () => {
    const result = remapTeamGraph(
      [
        { id: "source-node-a", label: "Research", state_key: "research", ref_agent_id: "source-agent-a" },
        { id: "source-node-b", label: "MarCom", state_key: "marcom", ref_agent_id: "source-agent-b" },
      ],
      [{ source_node_id: "source-node-a", target_node_id: "source-node-b", label: null }],
      new Map([["source-agent-a", "target-agent-a"], ["source-agent-b", "target-agent-b"]]),
      new Map([["source-node-a", "target-node-a"], ["source-node-b", "target-node-b"]]),
      "target-blueprint",
    );
    expect(result.nodes.map((node) => node.refAgentId)).toEqual(["target-agent-a", "target-agent-b"]);
    expect(result.edges).toEqual([expect.objectContaining({
      blueprintId: "target-blueprint",
      sourceNodeId: "target-node-a",
      targetNodeId: "target-node-b",
    })]);
  });
});
