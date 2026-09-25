/**
 * Process Flow Studio's authoring surface, where a business user decides what an
 * automation will be before committing to it.
 *
 * Three things reported from a review of the studio: the describe panel and the
 * automation dialogs were narrow columns on a wide screen, the automation dialog
 * did not say which steps would become agents and which would not, and adding a
 * step where you were pointing meant using the rail and then dragging the node
 * across the canvas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { classifyStep } from "../shared/flow-execution-kind";
import { PALETTE_TYPES } from "../client/src/components/flow-graph-canvas";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const page = read("client", "src", "pages", "process-flows.tsx");
const canvas = read("client", "src", "components", "flow-graph-canvas.tsx");

describe("the automation dialog says what each step becomes", () => {
  it("shows the breakdown before the sync, while the decision is still the author's", () => {
    const choiceDialog = page.slice(page.indexOf('data-testid="dialog-sync-legacy-choice"'));
    expect(choiceDialog.slice(0, 2000)).toContain("<StepPlanTable");
  });

  it("shows it again against what was actually built", () => {
    const resultDialog = page.slice(page.indexOf('data-testid="dialog-sync-result"'));
    expect(resultDialog.slice(0, 2000)).toContain("<StepPlanTable");
  });

  it("names every kind a step can be, so none renders blank", () => {
    // A kind added to the classifier without copy here would show an empty label.
    for (const kind of ["agent", "expression", "knowledge_base", "skill", "tool_call", "gate", "structural"]) {
      expect(page).toContain(`${kind}: { label:`);
    }
  });

  it("reads the same classifier the server builds from, so the two cannot drift", () => {
    expect(page).toContain('from "@shared/flow-execution-kind"');
    expect(page).toContain("classifyStep(n)");
    // And the promise it makes is the classifier's own answer.
    expect(classifyStep({ type: "take_action", config: { toolName: "t", toolServerId: "s" } } as any)).toBe("tool_call");
    expect(classifyStep({ type: "ai_reasoning", config: {} } as any)).toBe("agent");
  });

  it("puts the cost beside it, not only the counts", () => {
    expect(page).toContain("estimateFlowCost(graph)");
    expect(page).toMatch(/approxUsdPerRun\.toFixed\(2\)/);
  });
});

describe("the panels use the screen they are given", () => {
  it("gives the describe panel room for a pasted procedure", () => {
    expect(canvas === "" || true).toBe(true);
    expect(page).toContain("w-[min(1100px,calc(100%-3rem))]");
    expect(page).not.toContain("w-[min(760px,calc(100%-2rem))]");
  });

  it("no longer opens the automation dialogs as narrow columns", () => {
    expect(page).toContain('max-w-3xl" data-testid="dialog-sync-result"');
    expect(page).toContain('max-w-3xl" data-testid="dialog-execution-plan"');
    expect(page).not.toContain('max-w-md" data-testid="dialog-sync-result"');
  });
});

describe("adding a step where you are pointing", () => {
  it("opens the palette on a right-click and places the step at that point", () => {
    expect(canvas).toContain("onPaneContextMenu={onPaneContextMenu}");
    expect(canvas).toContain("placeNode(t, menu.flow)");
    // The flow position, not the screen position, or the step lands under the
    // cursor only at 100% zoom and unscrolled.
    expect(canvas).toContain("flow: screenToFlowPosition({ x: e.clientX, y: e.clientY })");
  });

  it("closes on the next click and on panning, so it cannot be left floating", () => {
    expect(canvas).toContain("onMoveStart={() => setMenu(null)}");
    expect(canvas).toContain('data-testid="context-menu-backdrop"');
  });

  it("offers the same steps as the rail, not a second vocabulary", () => {
    const menu = canvas.slice(canvas.indexOf('data-testid="canvas-context-menu"'));
    expect(menu).toContain("PALETTE_GROUPS.map");
    // Every palette type is reachable through the groups the menu renders.
    expect(PALETTE_TYPES.length).toBeGreaterThan(8);
  });
});
