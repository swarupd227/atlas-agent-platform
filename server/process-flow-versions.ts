/**
 * Keeping every saved state of a flow, so a change can be undone.
 *
 * `process_flows` holds one graph, overwritten in place. That was tolerable
 * while every edit was a deliberate drag on a canvas. It stops being tolerable
 * the moment a model can rewrite a flow from a sentence: "Astra changed my
 * flow and I can't get it back" is the one failure that would make nobody
 * trust the feature again.
 *
 * So each save writes a row first — Studio or Astra, it doesn't matter which —
 * and restoring one is itself a save, which means the state you undid is still
 * there if you undid it by mistake.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { processFlowVersions } from "@shared/schema";

export interface FlowVersionNote {
  via: string;
  /** What changed, in the words shown to whoever approved it. */
  changeNote?: string | null;
  savedBy?: string | null;
  orgId?: string | null;
}

/** Record the state a flow has just been saved in. */
export async function recordFlowVersion(flowId: string, name: string, graph: unknown, note: FlowVersionNote) {
  const [row] = await db
    .insert(processFlowVersions)
    .values({
      flowId,
      organizationId: note.orgId ?? null,
      name,
      graph: graph as any,
      via: note.via,
      changeNote: note.changeNote ?? null,
      savedBy: note.savedBy ?? null,
    })
    .returning();
  return row;
}

/** Newest first. */
export async function listFlowVersions(flowId: string, orgId?: string, limit = 20) {
  const where = orgId
    ? and(eq(processFlowVersions.flowId, flowId), eq(processFlowVersions.organizationId, orgId))
    : eq(processFlowVersions.flowId, flowId);
  return db.select().from(processFlowVersions).where(where).orderBy(desc(processFlowVersions.createdAt)).limit(limit);
}

/**
 * The state to go back to: the one before the current save. The newest row is
 * what the flow looks like now, so undoing means the one behind it.
 */
export async function previousFlowVersion(flowId: string, orgId?: string) {
  const recent = await listFlowVersions(flowId, orgId, 2);
  return recent.length > 1 ? recent[1] : null;
}

/** How a version reads in a list or on a card. */
export function versionLine(v: { createdAt: Date | null; via: string | null; changeNote: string | null; savedBy: string | null }): string {
  const when = v.createdAt ? new Date(v.createdAt).toLocaleString() : "at an unknown time";
  const who = v.savedBy ? ` by ${v.savedBy}` : "";
  return `${when}${who} · ${v.via ?? "unknown"}${v.changeNote ? ` — ${v.changeNote}` : ""}`;
}
