import { describe, it, expect } from "vitest";
import { toRFEdges, fromRF } from "../client/src/components/flow-graph-canvas";
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
