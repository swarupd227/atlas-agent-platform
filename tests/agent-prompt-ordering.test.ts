import { describe, it, expect } from "vitest";
import { assembleAgentSystemMessage } from "../server/agent-prompt-assembly";

// Guards the lost-in-the-middle-aware ordering of the agent system message:
// instructions at the top, retrieved reference docs in the middle, operational
// task/tool instructions last (adjacent to the user turn). The failure this
// pins against is the regression where bulk retrieved documents land AFTER the
// final instruction block, pushing instructions into the low-attention middle.

const HEADER = "## MCP TOOL EXECUTION INSTRUCTIONS";
const BASE = "Always call at least one relevant tool, then provide a structured analysis.";
const KB = "\n\n## KNOWLEDGE BASE CONTEXT (retrieved via RAG)\n<chunk-A>\n<chunk-B>";
const KB_MARK = "KNOWLEDGE BASE CONTEXT";

describe("agent system-message prompt ordering (lost-in-the-middle)", () => {
  it("puts retrieved docs in the middle — after the top instructions, before the final task instructions", () => {
    const msg = assembleAgentSystemMessage({
      agentSystemPrompt: "You are a claims triage agent.",
      instructionHeader: HEADER,
      baseInstructions: BASE,
      kbContext: KB,
    });
    const headIdx = msg.indexOf("You are a claims triage agent.");
    const kbIdx = msg.indexOf(KB_MARK);
    const baseIdx = msg.indexOf(BASE);
    expect(headIdx).toBe(0);
    expect(kbIdx).toBeGreaterThan(headIdx); // docs come after the top instructions
    expect(baseIdx).toBeGreaterThan(kbIdx); // docs are NOT last: task instructions follow them
  });

  it("never places retrieved docs after the final instruction block", () => {
    const msg = assembleAgentSystemMessage({
      agentSystemPrompt: "System prompt.",
      instructionHeader: HEADER,
      baseInstructions: BASE,
      kbContext: KB,
    });
    // The final instruction block must be the tail of the message.
    expect(msg.trimEnd().endsWith(BASE)).toBe(true);
    expect(msg.lastIndexOf(KB_MARK)).toBeLessThan(msg.lastIndexOf(BASE));
  });

  it("is byte-identical to the simple concatenation when there is no KB context", () => {
    const msg = assembleAgentSystemMessage({
      agentSystemPrompt: "X",
      instructionHeader: HEADER,
      baseInstructions: BASE,
      kbContext: "",
    });
    expect(msg).toBe(`X\n\n${HEADER}\n${BASE}`);
  });

  it("applies the same ordering on the autonomous fallback (no agent system prompt)", () => {
    const msg = assembleAgentSystemMessage({
      industry: "insurance",
      instructionHeader: HEADER,
      baseInstructions: BASE,
      kbContext: KB,
    });
    expect(msg).toContain("Industry context: insurance");
    expect(msg.indexOf(KB_MARK)).toBeLessThan(msg.indexOf(BASE));
    expect(msg.trimEnd().endsWith(BASE)).toBe(true);
  });
});
