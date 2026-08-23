import { Router, type Request, type Response } from "express";
import multer from "multer";
import { db } from "../db";
import { uploadedFiles } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getOrgId, getDefaultOrgId } from "../auth";
import { checkPermission } from "../permissions";
import { storage } from "../storage";
import {
  extractTextFromFile,
  isSupportedFile,
  UPLOAD_ACCEPT_ATTR,
  SUPPORTED_TYPES_LABEL,
} from "../file-extract";

const router = Router();

/**
 * One upload endpoint for every surface that takes a file — workspace chat
 * attachments, the agent wizard, process flow authoring, eval authoring. Each
 * surface passes its own `context` and then refers to the returned id, so
 * limits, extraction, refusal behaviour and audit live in one place instead of
 * being reimplemented (differently) per page.
 *
 * Memory storage, not disk: the bytes are only needed long enough to extract
 * text, and the platform has no object store — agent_generated_files keeps
 * bytes in Anthropic's Files API and only the id locally. Uploads follow the
 * same principle; the extracted text is what we persist.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 5 },
  // Reject by extension BEFORE buffering 25MB of something unreadable.
  fileFilter: (_req, file, cb) => {
    if (isSupportedFile(file.originalname)) return cb(null, true);
    cb(new Error(`Unsupported file type. Accepted: ${SUPPORTED_TYPES_LABEL}.`));
  },
});

const CONTEXTS = new Set(["workspace", "wizard", "process_flow", "eval", "playground", "other"]);

/** GET /api/files/config — the accept string and limits, so the client cannot
 *  drift from what the reader actually supports. */
router.get("/api/files/config", (_req: Request, res: Response) => {
  res.json({
    accept: UPLOAD_ACCEPT_ATTR,
    maxBytes: MAX_UPLOAD_BYTES,
    maxFiles: 5,
    supportedLabel: SUPPORTED_TYPES_LABEL,
  });
});

/**
 * POST /api/files/upload — multipart, field name "files" (1–5 files).
 *
 * Guarded by view_agents rather than a management permission: an upload feeds
 * an agent's context, so anyone who may USE an agent must be able to attach to
 * one, or the Workspace loses the feature for exactly the business users it was
 * built for. The only role denied view_agents is `finance`, a billing-only role
 * with no reason to push outside content into agent context.
 */
router.post("/api/files/upload", checkPermission("view_agents"), (req: Request, res: Response) => {
  upload.array("files", 5)(req, res, async (uploadErr: any) => {
    if (uploadErr) {
      // Size and type rejections are user-fixable; say which, and say the limit.
      const message = uploadErr.code === "LIMIT_FILE_SIZE"
        ? `File is too large. The limit is ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`
        : uploadErr.message ?? "Upload failed";
      return res.status(400).json({ message });
    }

    try {
      const orgId = getOrgId(req) ?? getDefaultOrgId();
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) return res.status(400).json({ message: "No file provided" });

      const context = CONTEXTS.has(req.body?.context) ? req.body.context : "other";
      const results: any[] = [];

      for (const file of files) {
        let extracted;
        try {
          extracted = await extractTextFromFile(file.buffer, file.mimetype, file.originalname);
        } catch (err: any) {
          // One unreadable file shouldn't discard the others — report it in
          // place so the user can see exactly which one failed and why.
          results.push({ filename: file.originalname, error: err.message });
          continue;
        }

        const [row] = await db.insert(uploadedFiles).values({
          organizationId: orgId ?? undefined,
          uploadedBy: (req as any).authUser?.userId ?? undefined,
          filename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          kind: extracted.kind,
          extractedText: extracted.text,
          extractMeta: extracted.meta as any,
          context,
        }).returning();

        // Uploads bring outside content into agent context, so they belong in
        // the audit trail alongside every other input to a run.
        storage.createAuditEvent({
          actorType: "user",
          action: "file_uploaded",
          objectType: "uploaded_file",
          objectId: row.id,
          details: JSON.stringify({
            filename: file.originalname,
            kind: extracted.kind,
            sizeBytes: file.size,
            context,
            empty: extracted.meta.empty ?? false,
          }),
          organizationId: orgId ?? undefined,
        }).catch(() => {});

        results.push(shape(row, extracted.meta));
      }

      const ok = results.filter((r) => !r.error);
      // All-failed is a 400 (nothing usable came back); a partial success is a
      // 201 carrying the per-file errors.
      if (!ok.length) return res.status(400).json({ message: results[0]?.error ?? "No readable files", files: results });
      res.status(201).json({ files: results });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
});

/** GET /api/files/:id — metadata plus a preview (never the whole text). */
router.get("/api/files/:id", async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const [row] = await db.select().from(uploadedFiles)
      .where(and(eq(uploadedFiles.id, String(req.params.id)), eq(uploadedFiles.organizationId, orgId ?? "")));
    if (!row) return res.status(404).json({ message: "File not found" });
    res.json({ ...shape(row, row.extractMeta as any), preview: (row.extractedText ?? "").slice(0, 4000) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/** GET /api/files?context=workspace — recent uploads, for pickers. */
router.get("/api/files", async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const context = typeof req.query.context === "string" ? req.query.context : undefined;
    const rows = await db.select().from(uploadedFiles)
      .where(context
        ? and(eq(uploadedFiles.organizationId, orgId ?? ""), eq(uploadedFiles.context, context))
        : eq(uploadedFiles.organizationId, orgId ?? ""))
      .orderBy(desc(uploadedFiles.createdAt))
      .limit(50);
    res.json(rows.map((r) => shape(r, r.extractMeta as any)));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/api/files/:id", checkPermission("view_agents"), async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const deleted = await db.delete(uploadedFiles)
      .where(and(eq(uploadedFiles.id, String(req.params.id)), eq(uploadedFiles.organizationId, orgId ?? "")))
      .returning({ id: uploadedFiles.id });
    if (!deleted.length) return res.status(404).json({ message: "File not found" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/** Never returns extractedText — it can be 500k chars and no caller needs it
 *  wholesale; the run path reads it server-side. */
function shape(row: any, meta: any) {
  return {
    id: row.id,
    filename: row.filename,
    kind: row.kind,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    context: row.context,
    createdAt: row.createdAt,
    meta: meta ?? {},
    /** Short human summary for the attachment chip: "3 sheets", "12 slides". */
    summary: describe(row.kind, meta),
    charCount: (row.extractedText ?? "").length,
  };
}

function describe(kind: string | null, meta: any): string {
  if (!meta) return kind ?? "file";
  if (meta.empty) return "no readable text";
  if (kind === "xlsx" && Array.isArray(meta.sheets)) {
    return `${meta.sheets.length} sheet${meta.sheets.length === 1 ? "" : "s"}: ${meta.sheets.slice(0, 3).join(", ")}${meta.sheets.length > 3 ? "…" : ""}`;
  }
  if (kind === "pptx" && typeof meta.slides === "number") {
    return `${meta.slides} slide${meta.slides === 1 ? "" : "s"}`;
  }
  return kind ?? "file";
}

export default router;
