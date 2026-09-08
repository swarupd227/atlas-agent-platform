// Prompt assembly for an agent's system message, kept dependency-free so it can
// be unit-tested without dragging in the runtime's data layer.
//
// Ordering is deliberate and respects the "lost-in-the-middle" effect (Liu et
// al.): a long input's beginning and end get the most model attention, the
// middle the least. So we put the agent's own instructions at the TOP, the bulk
// retrieved reference material (KB/RAG) in the MIDDLE under a labeled header,
// and the operational task/tool instructions LAST — immediately above the
// separate user turn that carries the question. That keeps the two
// highest-attention zones (top + bottom) holding instruction text and the
// query, with bulk documents in the low-attention middle where a section header
// keeps them navigable. tests/agent-prompt-ordering.test.ts pins this.

export interface AgentSystemMessageParts {
  /** The agent's core instructions (already includes any enriched context
   *  sections, with the raw system prompt first). Absent → autonomous fallback. */
  agentSystemPrompt?: string;
  industry?: string;
  /** Heading that introduces `baseInstructions` (e.g. "## MCP TOOL EXECUTION INSTRUCTIONS"). */
  instructionHeader: string;
  /** Operational task/tool-execution instructions. */
  baseInstructions: string;
  /** Retrieved KB/RAG context block (already carrying its own "## KNOWLEDGE
   *  BASE CONTEXT" header and leading newlines), or empty when none. */
  kbContext?: string;
}

export function assembleAgentSystemMessage(parts: AgentSystemMessageParts): string {
  const { agentSystemPrompt, industry, instructionHeader, baseInstructions } = parts;
  const kbContext = parts.kbContext ?? "";
  // instructions (top) -> reference docs (middle) -> task instructions (bottom).
  if (agentSystemPrompt) {
    return `${agentSystemPrompt}${kbContext}\n\n${instructionHeader}\n${baseInstructions}`;
  }
  return `You are an autonomous agent executing a task.\nIndustry context: ${industry || "general"}.${kbContext}\n\n${baseInstructions}`;
}
