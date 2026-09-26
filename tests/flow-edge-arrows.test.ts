/**
 * Arrowheads on the process flow canvas.
 *
 * A flow is a directed graph, and the canvas drew it as an undirected one: no
 * markerEnd anywhere, so which way a step led could only be worked out by
 * dragging a node and watching which end of the line followed.
 *
 * The fiddly part is the colour. React Flow's arrow symbol takes a `color`
 * prop and writes it as an INLINE style, defaulting to "none" — so an
 * arrowhead with no colour passed renders invisible, and a plain CSS rule
 * loses to the inline style. Passing a literal colour would fix that and
 * break dark mode, so the colour is a theme token in CSS with !important.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { EDGE_MARKER, markerFor, toRFEdges } from "../client/src/components/flow-graph-canvas";
import type { ProcessEdge } from "../shared/process-flow";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const canvas = read("client", "src", "components", "flow-graph-canvas.tsx");
const css = read("client", "src", "index.css");

describe("every edge carries a head", () => {
  it("a loaded edge does", () => {
    const [edge] = toRFEdges([{ id: "e1", from: "a", to: "b" } as ProcessEdge]);
    expect(edge.markerEnd).toBe(EDGE_MARKER);
  });

  it("a conditional one does too, keeping its dashes", () => {
    const [edge] = toRFEdges([{ id: "e2", from: "d", to: "p", condition: "amount > 10000" } as ProcessEdge]);
    expect(edge.markerEnd).toBe(EDGE_MARKER);
    expect(edge.animated).toBe(true);
  });

  it("and so does one the user draws by hand", () => {
    // addEdge builds the edge from this object, so the head has to be on it.
    expect(canvas).toContain("addEdge({ ...c, id: `e_${newId()}`, markerEnd: EDGE_MARKER }, eds)");
    // ...and on anything the canvas rebuilds when an edge's properties change.
    expect(canvas).toContain("markerEnd: EDGE_MARKER,");
    expect(canvas).toContain("defaultEdgeOptions={{ markerEnd: EDGE_MARKER }}");
  });

  it("is a filled triangle, sized to read without swallowing a short edge", () => {
    expect(EDGE_MARKER.type).toBe("arrowclosed");
    expect(EDGE_MARKER.width).toBe(16);
    expect(EDGE_MARKER.height).toBe(16);
  });
});

describe("the colour", () => {
  it("is carried by the marker, because React Flow defaults it to invisible", () => {
    // Its arrow symbol writes the colour into an inline style defaulting to
    // "none": a marker with no colour renders as nothing at all.
    expect(EDGE_MARKER.color).toBeTruthy();
  });

  it("is a theme token rather than a literal, so it follows light and dark", () => {
    // That works because React Flow writes it as a style, where var() resolves.
    expect(EDGE_MARKER.color).toContain("var(--");
  });

  it("matches the line it ends, in each of the states the canvas draws", () => {
    // Live, the head was muted while the line was foreground/0.55: the canvas
    // styles every edge inline, per selection and per compiler warning, and an
    // inline style outranks any stylesheet rule.
    expect(EDGE_MARKER.color).toBe("hsl(var(--foreground) / 0.55)");
    expect(markerFor("hsl(var(--primary))").color).toBe("hsl(var(--primary))");
    expect(canvas).toContain("markerEnd: markerFor(drawn.stroke),");
    // Including the amber one the compiler flags.
    expect(canvas).toContain('markerEnd: markerFor("#f59e0b")');
  });

  it("doesn't try to colour edges from the stylesheet, where inline styles win", () => {
    expect(css).not.toContain(".react-flow__edge-path {");
    expect(css).toContain("an inline style outranks any rule written here");
  });
});

describe("the other canvases", () => {
  it("the blueprint's heads take each link's own colour, highlighted or not", () => {
    const team = read("client", "src", "components", "team-graph-canvas.tsx");
    expect(team).toContain("markerEnd: {");
    expect(team).toContain('color: hot ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",');
  });

  it("and every edge preset in the agent plan graph has one", () => {
    const plan = read("client", "src", "components", "agent-plan-graph.tsx");
    const presets = plan.split("const EDGE_").slice(1);
    expect(presets.length).toBeGreaterThan(3);
    for (const preset of presets) {
      const body = preset.slice(0, preset.indexOf("} as const;"));
      expect(body, preset.slice(0, 20)).toContain("markerEnd:");
    }
  });
});
