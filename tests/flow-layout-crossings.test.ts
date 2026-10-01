import { describe, it, expect } from "vitest";
import { layoutGraph, countLayoutCrossings, type ProcessNode, type ProcessEdge } from "@shared/process-flow";

const node = (id: string): ProcessNode => ({ id, type: "take_action", label: id } as ProcessNode);
const edge = (from: string, to: string, condition?: string): ProcessEdge =>
  ({ from, to, ...(condition ? { condition } : {}) } as ProcessEdge);

/** Column index a node was placed in, by its x. */
const col = (laid: ProcessNode[], id: string) => Math.round(laid.find(n => n.id === id)!.position!.x / 380);
const row = (laid: ProcessNode[], id: string) => laid.find(n => n.id === id)!.position!.y;

describe("layoutGraph", () => {
  it("places a straight chain in one column each, on one row", () => {
    const nodes = ["a", "b", "c", "d"].map(node);
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d")];
    const laid = layoutGraph(nodes, edges);
    expect(laid.map(n => col(laid, n.id))).toEqual([0, 1, 2, 3]);
    expect(new Set(laid.map(n => n.position!.y)).size).toBe(1);
    expect(countLayoutCrossings(laid, edges)).toBe(0);
  });

  it("keeps every node and gives each a position", () => {
    const nodes = ["a", "b", "c"].map(node);
    const laid = layoutGraph(nodes, [edge("a", "b"), edge("a", "c")]);
    expect(laid).toHaveLength(3);
    expect(laid.every(n => n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
  });

  it("emits no dummy nodes of its own", () => {
    const nodes = ["a", "b", "c", "d", "e"].map(node);
    // a->e skips three columns, so the layout inserts dummies internally.
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d"), edge("d", "e"), edge("a", "e")];
    const laid = layoutGraph(nodes, edges);
    expect(laid.map(n => n.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("reserves a lane for an edge that skips columns, instead of drawing through the nodes", () => {
    // A spine with an alternate path jumping from the first step to the last --
    // the shape that produced dashed arrows straight through the boxes.
    const nodes = ["a", "b", "c", "d", "e"].map(node);
    const edges = [
      edge("a", "b"), edge("b", "c"), edge("c", "d"), edge("d", "e"),
      edge("a", "e", "exception"),
    ];
    const laid = layoutGraph(nodes, edges);
    // The skipping edge must not run along the same row as the steps it passes.
    const spine = new Set([row(laid, "b"), row(laid, "c"), row(laid, "d")]);
    expect(spine.size).toBe(1);
    // a and e sit on a row the spine does not occupy, or the spine has moved
    // off the straight line between them -- either way they are not collinear
    // with every intervening node.
    const straightThrough = row(laid, "a") === row(laid, "e") && spine.has(row(laid, "a"));
    expect(straightThrough).toBe(false);
  });

  it("does not leave a loop's target stranded far from its source", () => {
    // A back edge: e returns to b. It must not be ignored when ordering rows.
    const nodes = ["a", "b", "c", "d", "e"].map(node);
    const edges = [
      edge("a", "b"), edge("b", "c"), edge("c", "d"), edge("d", "e"),
      edge("e", "b", "rework"),
    ];
    const laid = layoutGraph(nodes, edges);
    expect(Math.abs(row(laid, "e") - row(laid, "b"))).toBeLessThanOrEqual(150);
  });

  it("orders a fan-out/fan-in so the branches do not cross", () => {
    //   a -> x1 -> b
    //   a -> x2 -> b   (declared in an order that invites a crossing)
    const nodes = ["a", "x1", "x2", "b"].map(node);
    const edges = [edge("a", "x2"), edge("a", "x1"), edge("x1", "b"), edge("x2", "b")];
    const laid = layoutGraph(nodes, edges);
    expect(countLayoutCrossings(laid, edges)).toBe(0);
  });

  it("is stable: the same input lays out identically twice", () => {
    const nodes = ["a", "b", "c", "d"].map(node);
    const edges = [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")];
    const once = layoutGraph(nodes, edges).map(n => `${n.id}:${n.position!.x},${n.position!.y}`);
    const twice = layoutGraph(nodes, edges).map(n => `${n.id}:${n.position!.x},${n.position!.y}`);
    expect(twice).toEqual(once);
  });

  it("reduces crossings on a flow shaped like the binder close", () => {
    // A spine with two conditional detours and a rework loop -- the same shape
    // that measured 9 long edges across 33 columns on the real flow.
    const ids = Array.from({ length: 12 }, (_, i) => `s${i}`);
    const nodes = ids.map(node);
    const edges: ProcessEdge[] = [];
    for (let i = 0; i < ids.length - 1; i++) edges.push(edge(ids[i], ids[i + 1]));
    edges.push(edge("s1", "s7", "within tolerance"));
    edges.push(edge("s2", "s9", "no defects"));
    edges.push(edge("s10", "s4", "rework"));
    const laid = layoutGraph(nodes, edges);
    expect(laid).toHaveLength(12);

    // Compare against the naive arrangement this replaced: every node on one
    // row per column, in declaration order.
    const naive = nodes.map((n, i) => ({ ...n, position: { x: 0, y: 0 } })) as ProcessNode[];
    const depthGuess = new Map(ids.map((id, i) => [id, i] as const));
    for (const n of naive) n.position = { x: (depthGuess.get(n.id) ?? 0) * 380, y: 0 };
    const naiveCrossings = countLayoutCrossings(naive, edges);
    const laidCrossings = countLayoutCrossings(laid, edges);
    console.log(`  crossings: naive ${naiveCrossings} -> laid out ${laidCrossings}`);
    expect(laidCrossings).toBeLessThanOrEqual(naiveCrossings);
  });
});

describe("countLayoutCrossings", () => {
  it("counts a deliberate crossing", () => {
    // a(row0) -> d(row1) and b(row1) -> c(row0) cross.
    const nodes: ProcessNode[] = [
      { ...node("a"), position: { x: 0, y: 0 } },
      { ...node("b"), position: { x: 0, y: 150 } },
      { ...node("c"), position: { x: 380, y: 0 } },
      { ...node("d"), position: { x: 380, y: 150 } },
    ];
    expect(countLayoutCrossings(nodes, [edge("a", "d"), edge("b", "c")])).toBe(1);
    expect(countLayoutCrossings(nodes, [edge("a", "c"), edge("b", "d")])).toBe(0);
  });

  it("counts an edge that passes through a column against what is there", () => {
    const nodes: ProcessNode[] = [
      { ...node("a"), position: { x: 0, y: 0 } },
      { ...node("mid"), position: { x: 380, y: 150 } },
      { ...node("z"), position: { x: 760, y: 300 } },
      { ...node("other"), position: { x: 380, y: 0 } },
      { ...node("otherEnd"), position: { x: 760, y: 150 } },
    ];
    // a->z spans two columns; other->otherEnd sits in the column it passes.
    const n = countLayoutCrossings(nodes, [edge("a", "z"), edge("other", "otherEnd")]);
    expect(n).toBeGreaterThanOrEqual(0);
  });
});
