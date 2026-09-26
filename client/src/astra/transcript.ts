/**
 * A conversation as text you can take elsewhere.
 *
 * Cowork could not be exported: to put an exchange in a ticket or an email you
 * selected it by hand, and what you got carried none of the structure. This
 * writes the transcript as markdown, which is what the answers already are.
 *
 * It records what was said, not what was done: a confirm card's decision is
 * noted because it changes the meaning of the reply above it, but the audit
 * trail remains the record of the work itself.
 */
import type { AstraMessage } from "./types";

/** One message, as markdown. */
export function transcriptLine(message: Pick<AstraMessage, "role" | "markdown" | "createdAt" | "pendingAction">, who: string): string {
  const when = message.createdAt ? new Date(message.createdAt).toLocaleString() : null;
  const head = `**${who}**${when ? ` · ${when}` : ""}`;
  const decision = message.pendingAction?.decision;
  const decided = decision ? `\n\n_(${decision === "confirmed" ? "You confirmed this" : "You chose Not now"})_` : "";
  return `${head}\n\n${(message.markdown ?? "").trim()}${decided}`;
}

/**
 * The whole conversation. `title` heads it so a pasted transcript says what it
 * is, and system messages are kept because an error explains the gap after it.
 */
export function transcript(title: string, messages: Array<Pick<AstraMessage, "role" | "markdown" | "createdAt" | "pendingAction">>, you = "You"): string {
  const lines = messages
    .filter((m) => (m.markdown ?? "").trim())
    .map((m) => transcriptLine(m, m.role === "user" ? you : m.role === "system" ? "Note" : "Astra"));
  return [`# ${title || "Conversation"}`, ...lines].join("\n\n---\n\n");
}

/** A file name from the conversation's own name, safe on every platform. */
export function transcriptFilename(title: string, at = new Date()): string {
  const stem = (title || "conversation")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "conversation";
  const day = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().split("T")[0];
  return `${stem}-${day}.md`;
}
