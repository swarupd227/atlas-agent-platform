/**
 * Standing brand assets — the org's logo, master templates and approved
 * imagery uploaded on the Files page with context "brand".
 *
 * One resolver for every surface that generates documents, so a Workspace run
 * (workspace-run.ts) and a Team DAG worker (agent-runtime.ts) attach exactly
 * the same files under exactly the same rule. Before this lived here, only
 * the Workspace path knew about brand assets, so a Deck Assembler running
 * inside a team could describe the house style but never open the master.
 *
 * The gate is document CAPABILITY, not document MODE: a skill that grants
 * pptx/pdf generation qualifies whether the agent renders through the
 * platform renderer, the Anthropic sandbox, or lets the model choose.
 * (Gating on documentToolsForSkills() would exclude sandbox-mode agents,
 * since that mode deliberately withholds the portable tools -- yet sandbox
 * is precisely the mode that can build on a real .pptx master.) A Q&A agent
 * with no document skill still gets nothing: a logo file would only be noise
 * in every answer.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { uploadedFiles, type Skill } from "@shared/schema";
import { skillGrantsDocumentGeneration } from "./builtin-document-tools";

/** Newest-first cap, so a pile of old uploads can't crowd the request. */
export const BRAND_ASSET_LIMIT = 5;

/**
 * Ids of the org's brand-asset uploads for a document-capable agent, minus any
 * the caller already attached explicitly. Empty when the agent has no active
 * document-generation skill. Throws on a database failure -- callers decide
 * whether that is fatal (so far every caller treats it as best-effort).
 */
export async function resolveBrandAssetFileIds(
  activeSkills: Skill[],
  orgId: string,
  alreadyAttached: string[] = [],
): Promise<string[]> {
  if (!activeSkills.some(skillGrantsDocumentGeneration)) return [];
  const rows = await db.select({ id: uploadedFiles.id }).from(uploadedFiles)
    .where(and(eq(uploadedFiles.organizationId, orgId), eq(uploadedFiles.context, "brand")))
    .orderBy(desc(uploadedFiles.createdAt))
    .limit(BRAND_ASSET_LIMIT);
  const attached = new Set(alreadyAttached);
  return rows.map((r) => r.id).filter((id) => !attached.has(id));
}
