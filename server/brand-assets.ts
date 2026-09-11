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

type BrandAssetRow = { filename: string; kind: string | null; sizeBytes: number | null; extractMeta: unknown };

/**
 * The org's brand assets as a short prompt block, by filename -- for a
 * document-capable agent WITHOUT a code-execution container. It cannot be
 * handed the files, but it must still name a template to the document tools
 * (fill_document_template, inspect_document take templateFilename). Empty
 * string when the org has none.
 */
export async function describeBrandAssetsForPrompt(orgId: string): Promise<string> {
  const rows = await db
    .select({
      filename: uploadedFiles.filename,
      kind: uploadedFiles.kind,
      sizeBytes: uploadedFiles.sizeBytes,
      extractMeta: uploadedFiles.extractMeta,
    })
    .from(uploadedFiles)
    .where(and(eq(uploadedFiles.organizationId, orgId), eq(uploadedFiles.context, "brand")))
    .orderBy(desc(uploadedFiles.createdAt))
    .limit(BRAND_ASSET_LIMIT);
  return formatBrandAssetList(rows);
}

export function formatBrandAssetList(rows: BrandAssetRow[]): string {
  if (rows.length === 0) return "";
  const describe = (r: BrandAssetRow) => {
    const meta = (r.extractMeta ?? {}) as { slides?: number; pages?: number };
    const facts = [
      r.kind,
      meta.slides ? `${meta.slides} slides` : meta.pages ? `${meta.pages} pages` : null,
      r.sizeBytes ? `${(r.sizeBytes / 1_048_576).toFixed(1)} MB` : null,
    ].filter(Boolean);
    return `- ${r.filename}${facts.length ? ` (${facts.join(", ")})` : ""}`;
  };
  return [
    "## BRAND ASSETS",
    "The organization's standing brand assets (templates, logos). Refer to a template by its filename exactly as listed -- " +
      "that is the templateFilename the document tools take. Use the one the request names; if it names none and only one " +
      "listed template fits the task, use that one.",
    ...rows.map(describe),
  ].join("\n");
}
