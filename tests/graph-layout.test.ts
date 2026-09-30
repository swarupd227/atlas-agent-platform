/**
 * Step cards must not be laid out closer together than they are drawn.
 *
 * What went wrong: the canvas knew a card renders 244px wide, while the builder
 * that writes the positions divided a fixed 600px band between however many
 * parallel workers there were. Six workers got 100px each. On the live E&S
 * Property Binding Orchestrator three cards landed on top of one another, and
 * at a 1024-wide viewport the buried one had NO clickable pixels — a step that
 * could not be opened at all, in a team where nothing else said anything was
 * wrong.
 *
 * The invariant is one line — spacing >= card width — and the point of these
 * tests is that it holds for every team size rather than for the size somebody
 * happened to try.
 */
import { describe, it, expect } from "vitest";
import { COL_WIDTH, LAYOUT_ROW_Y, NODE_WIDTH, ROW_HEIGHT, workerNodePosition } from "../shared/graph-layout";
import { stageLayout } from "../client/src/components/team-graph-canvas";

describe("a layout leaves room for the card it lays out", () => {
  it("spaces columns at least a card apart", () => {
    expect(COL_WIDTH).toBeGreaterThanOrEqual(NODE_WIDTH);
  });

  it("keeps parallel steps a full card apart however many there are", () => {
    // The old form shrank with the count; this is the test that would have
    // caught it. 27 is the live E&S team's size.
    for (const count of [2, 3, 6, 12, 27, 60]) {
      const xs = Array.from({ length: count }, (_, i) => workerNodePosition(i, false).x);
      const gaps = xs.slice(1).map((x, i) => x - xs[i]);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(NODE_WIDTH);
    }
  });

  it("puts parallel steps on one row, because they run at the same time", () => {
    const ys = [0, 1, 2, 3].map((i) => workerNodePosition(i, false).y);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(LAYOUT_ROW_Y);
  });

  it("stacks sequential steps down one column, a row apart", () => {
    const positions = [0, 1, 2, 3].map((i) => workerNodePosition(i, true));
    expect(new Set(positions.map((p) => p.x)).size).toBe(1);
    const gaps = positions.slice(1).map((p, i) => p.y - positions[i].y);
    expect(gaps.every((g) => g === ROW_HEIGHT)).toBe(true);
  });
});

describe("the canvas's own stage layout obeys the same spacing", () => {
  const node = (id: string) => ({ id, positionX: 0, positionY: 0 }) as any;

  it("never overlaps two steps in the same stage or in neighbouring stages", () => {
    const plan = {
      totalWaves: 3,
      maxParallelism: 4,
      waves: [
        { wave_number: 1, nodes: ["a"] },
        { wave_number: 2, nodes: ["b", "c", "d", "e"] },
        { wave_number: 3, nodes: ["f", "g"] },
      ],
    };
    const nodes = ["a", "b", "c", "d", "e", "f", "g"].map(node);
    const placed = stageLayout(plan, nodes);

    const boxes = Object.values(placed);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const overlapX = Math.abs(boxes[i].x - boxes[j].x) < NODE_WIDTH;
        const overlapY = Math.abs(boxes[i].y - boxes[j].y) < ROW_HEIGHT;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it("places a step the plan does not know about without landing it on another", () => {
    const plan = { totalWaves: 1, maxParallelism: 1, waves: [{ wave_number: 1, nodes: ["a"] }] };
    const placed = stageLayout(plan, [node("a"), node("loose")]);
    expect(placed.loose).toBeDefined();
    const apart = Math.abs(placed.loose.x - placed.a.x) >= NODE_WIDTH || Math.abs(placed.loose.y - placed.a.y) >= ROW_HEIGHT;
    expect(apart).toBe(true);
  });
});
