/**
 * The memory tool: how an agent PROPOSES a change to its own notes.
 *
 * Offered only when the platform flag is on and the agent has opted in (see
 * isAgentMemoryEnabled). It files a request that a person must approve, so it
 * changes nothing a model reads until someone has decided -- which is why, like
 * the skill reader, it is exempt from the allow-lists that predate it (an agent
 * with a tool allow-list would otherwise silently lose it). Unlike the skill
 * reader it is NOT exempt from shadow runs: a shadow run must not file requests.
 * An explicit policy or AAR block naming the tool still refuses it.
 *
 * Dispatched in-process by executeTool, after every gate in dispatchToolCall.
 */

import type { AvailableTool } from "./tool-dispatcher";
import { BUILTIN_MEMORY_SERVER_ID, MEMORY_LIMITS, MEMORY_TOOL, proposeMemoryChange } from "./agent-memory";

export { BUILTIN_MEMORY_SERVER_ID, MEMORY_TOOL };

const SERVER_NAME = "Memory";

export function memoryToolsFor(): AvailableTool[] {
  return [
    {
      serverId: BUILTIN_MEMORY_SERVER_ID,
      serverName: SERVER_NAME,
      serverUrl: "",
      toolName: MEMORY_TOOL,
      toolDescription:
        "Propose saving, replacing or removing one of your own notes, which are shown to you at the start of every run. " +
        "A person must approve each change before it takes effect, so never rely on a proposal in the run that makes it. " +
        `A note is one short fact (at most ${MEMORY_LIMITS.maxNoteChars} characters) that will help a later run: an environment detail, a stable preference, a lesson learned. ` +
        "Do not save secrets, personal data, links, instructions, or details that belong to a single task. " +
        "To change or remove a note, give its id (the code in square brackets).",
      toolInputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["add", "replace", "remove"], description: "add a new note, replace an existing one, or remove one." },
          content: { type: "string", description: "The note's text (for add and replace)." },
          note_id: { type: "string", description: "The id of the note to replace or remove, as shown in your notes." },
          reason: { type: "string", description: "Why this change helps a later run, in a sentence. The reviewer reads it." },
        },
        required: ["action"],
      },
    },
  ];
}

export function isBuiltinMemoryTool(tool: Pick<AvailableTool, "serverId">): boolean {
  return tool.serverId === BUILTIN_MEMORY_SERVER_ID;
}

/** Returns a result rather than throwing: the model reads it and can fix its request. */
export async function executeBuiltinMemoryTool(
  toolName: string,
  args: Record<string, any>,
  ctx: { orgId?: string | null; agentId?: string; runId?: string | null },
): Promise<any> {
  if (toolName !== MEMORY_TOOL) throw new Error(`Unknown memory tool "${toolName}"`);
  if (!ctx.agentId) return { ok: false, error: "No agent context to keep a note for." };
  return proposeMemoryChange({
    orgId: ctx.orgId,
    agentId: ctx.agentId,
    action: String(args?.action ?? "") as any,
    content: typeof args?.content === "string" ? args.content : undefined,
    noteId: typeof args?.note_id === "string" ? args.note_id : undefined,
    reason: typeof args?.reason === "string" ? args.reason : undefined,
    runId: ctx.runId ?? null,
  });
}
