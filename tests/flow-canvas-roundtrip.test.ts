import { describe, it, expect } from "vitest";
import { toRFEdges, fromRF, TOOL_STEP_TYPES } from "../client/src/components/flow-graph-canvas";
import type { ProcessEdge } from "../shared/process-flow";

/**
 * The canvas converts a flow in and out of React Flow, and it fires onChange as
 * soon as it mounts — so anything these two functions drop is gone from the
 * page's graph before the user has touched it.
 *
 * This is deliberately tested here rather than through the API, because the
 * storage path is permissive: normalizeToGraph spreads, so a new edge property
 * saves, reloads and round-trips through PUT perfectly while the editor is
 * quietly discarding it. That is exactly how maxRounds was lost (2026-09-24):
 * a flow said "at most two rounds", every server-side check passed, and the
 * built team still came out with one.
 */
function roundTrip(edges: ProcessEdge[]): ProcessEdge[] {
  return fromRF([], toRFEdges(edges)).edges;
}

describe("flow canvas edge round-trip", () => {
  it("keeps a loop's round limit, which the canvas never renders", () => {
    const [edge] = roundTrip([
      { id: "e25", from: "n11", to: "n9", label: "Rejected — redraft", condition: "Endorsement rejected", maxRounds: 2 },
    ]);
    expect(edge).toEqual({
      id: "e25",
      from: "n11",
      to: "n9",
      label: "Rejected — redraft",
      condition: "Endorsement rejected",
      maxRounds: 2,
    });
  });

  it("leaves an ordinary edge untouched, with no empty maxRounds key", () => {
    const [edge] = roundTrip([{ id: "e1", from: "n1", to: "n2" }]);
    expect(edge).not.toHaveProperty("maxRounds");
    expect(edge).toEqual({ id: "e1", from: "n1", to: "n2", label: undefined, condition: undefined });
  });

  it("survives a second trip, since the canvas re-converts on every change", () => {
    const original: ProcessEdge[] = [
      { id: "e25", from: "n11", to: "n9", condition: "rejected", maxRounds: 3 },
    ];
    expect(roundTrip(roundTrip(original))).toEqual(roundTrip(original));
    expect(roundTrip(roundTrip(original))[0].maxRounds).toBe(3);
  });
});

describe("steps that call one tool directly", () => {
  // The server runs any step with a tool as a direct call, so the inspector must
  // show the tool (and its per-item list) on every type that can carry one, or
  // a Get Info lookup like "screen each party" runs a list nobody can see.
  it("offers the tool and its list on Get Info steps, not only actions", () => {
    expect([...TOOL_STEP_TYPES].sort()).toEqual(["get_info", "send_notification", "take_action"]);
  });

  it("keeps a Get Info step's tool and forEach list through the canvas", () => {
    const config = { toolServerId: "srv", toolName: "screen_party", toolArgs: { fullName: { $expr: "$item.name" } }, forEach: "[case.parties]" };
    const { nodes } = fromRF([{ id: "n_scr", position: { x: 0, y: 0 }, data: { ntype: "get_info", label: "Screen Each Party", config } }], []);
    expect(nodes[0].type).toBe("get_info");
    expect(nodes[0].config).toEqual(config);
  });
});
