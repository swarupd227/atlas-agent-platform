/**
 * Holding a drawn flow between the card and the confirmation.
 *
 * A confirm card's `frozen` input is what the card SHOWS; the tool's `run`
 * receives the arguments the model sent, not the preview's output (see
 * dispatch.ts). So a tool whose preview does real work — drawing a flow from a
 * description costs a model call and takes seconds — has nowhere to put the
 * result.
 *
 * Drawing it again on confirm would be the easy answer and the wrong one: the
 * second draft is not guaranteed to match the steps the person just read and
 * agreed to. So the draft is kept here, keyed by what it was drawn from, and
 * the confirmation saves that. If it has gone — the process restarted between
 * the card and the click — the tool says so rather than saving a flow nobody
 * has seen.
 */

export interface HeldDraft {
  name: string;
  graph: { name: string; nodes: unknown[]; edges: unknown[] };
  warnings: string[];
}

/** Long enough to read a card and decide; short enough not to hold memory. */
export const DRAFT_TTL_MS = 30 * 60_000;

const held = new Map<string, { draft: HeldDraft; at: number }>();

/**
 * What identifies a draft: who asked, and what it was drawn from. Two people
 * describing the same process get their own drafts, and re-asking with the
 * same words reuses the one already shown.
 */
export function draftKey(orgId: string, input: { description?: string; name?: string; fileIds?: string[] }): string {
  const described = (input.description ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const files = (input.fileIds ?? []).slice().sort().join(",");
  return `${orgId}|${input.name?.trim().toLowerCase() ?? ""}|${files}|${described}`;
}

export function holdDraft(key: string, draft: HeldDraft, now = Date.now()): void {
  held.set(key, { draft, at: now });
  // Cheap sweep: this runs once per drawn flow, not per request.
  for (const [k, v] of Array.from(held.entries())) {
    if (now - v.at > DRAFT_TTL_MS) held.delete(k);
  }
}

export function takeDraft(key: string, now = Date.now()): HeldDraft | null {
  const entry = held.get(key);
  if (!entry) return null;
  if (now - entry.at > DRAFT_TTL_MS) {
    held.delete(key);
    return null;
  }
  held.delete(key);
  return entry.draft;
}

/** For tests. */
export function resetDrafts(): void {
  held.clear();
}
