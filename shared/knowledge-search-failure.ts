/**
 * A knowledge search that did not run.
 *
 * searchKnowledgeBaseChunks (server/embeddings.ts) throws when the search
 * itself fails: the embeddings provider is down, out of credit or not
 * configured. Both run paths keep going without it, which is right, but a run
 * that says nothing about it reads exactly like an agent with no knowledge
 * base linked, or like a search that found nothing relevant. This is the
 * record of the difference and the words for it, shared by the Workspace run
 * (server/workspace-run.ts), the deployed agent's run (server/agent-runtime.ts)
 * and the two views that show what a run knew.
 */
export interface KnowledgeSearchFailure {
  /** null when retrieval failed before any one knowledge base was searched. */
  knowledgeBaseId: string | null;
  name: string | null;
  /** One line from the error, safe to show (searchFailureReason). */
  reason: string;
  /** What the run used in place of the search: the knowledge base's most
   *  recent passages, chosen by date, or nothing. */
  fallback: "recent_passages" | "none";
}

const REASON_CHARS = 160;

/** The error's first sentence, with links and anything key-shaped taken out:
 *  enough to act on, and nothing a run view should not repeat. */
export function searchFailureReason(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const line = raw
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(?:sk|pk|rk|key)[-_][A-Za-z0-9_*-]{6,}/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!line) return "The search did not run.";
  const first = line.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? line;
  return first.length > REASON_CHARS ? `${first.slice(0, REASON_CHARS - 1)}…` : first;
}

const closed = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);

/** The sentence a run view shows for its failed searches; "" when there are none. */
export function knowledgeFailureNote(failures: KnowledgeSearchFailure[] | null | undefined): string {
  const list = failures ?? [];
  if (list.length === 0) return "";
  const reasons = closed(Array.from(new Set(list.map((f) => f.reason))).join(" / "));
  const recent = list.filter((f) => f.fallback === "recent_passages").length;
  const instead = recent === 0
    ? "The run went on without that knowledge."
    : recent === list.length
      ? "The most recent passages were used instead, chosen by date and not by relevance."
      : `${recent} of them used the most recent passages instead, chosen by date and not by relevance.`;
  const what = list.every((f) => f.knowledgeBaseId === null)
    ? "Knowledge retrieval failed before any knowledge base was searched"
    : `Knowledge search failed for ${list.length} knowledge ${list.length === 1 ? "base" : "bases"}`;
  return `${what}: ${reasons} ${instead}`;
}
