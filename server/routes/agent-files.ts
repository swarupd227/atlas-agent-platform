import { Router } from "express";
import { Readable } from "stream";
import { db } from "../db";
import { uploadedFiles } from "@shared/schema";
import { storage } from "../storage";
import { getOrgId, getDefaultOrgId } from "../auth";
import { downloadGeneratedFile } from "../anthropic-code-execution";
import { extractTextFromFile } from "../file-extract";
import { describe as describeFileSummary } from "./files";

const router = Router();

// Files agents generate via the code execution tool (server/anthropic-code-execution.ts).
// No bytes are stored locally -- this proxies Anthropic's Files API on demand.
router.get("/api/agent-files/:id/download", async (req, res) => {
  try {
    const file = await storage.getAgentGeneratedFile(req.params.id as string, getOrgId(req));
    if (!file) return res.status(404).json({ message: "File not found" });

    // Platform-rendered documents (server/document-renderer.ts) store their
    // bytes inline; only sandbox-produced files live in Anthropic's Files API.
    const local = (file as any).source === "platform" ? ((file as any).content as Buffer | null) : null;
    if (!local && !file.anthropicFileId) {
      // Neither storage backend has bytes -- say so rather than dereferencing null.
      return res.status(410).json({ message: "File contents are no longer available" });
    }
    const { filename, mimeType, body } = local
      ? { filename: file.filename ?? "document", mimeType: file.mimeType ?? undefined, body: null }
      : await downloadGeneratedFile(file.anthropicFileId!);

    res.setHeader("Content-Disposition", `attachment; filename="${(file.filename || filename).replace(/"/g, "")}"`);
    if (file.mimeType || mimeType) res.setHeader("Content-Type", file.mimeType || mimeType || "application/octet-stream");

    await storage.createAuditEvent({
      organizationId: getOrgId(req) ?? undefined,
      action: "agent_file.downloaded",
      objectType: "agent_generated_file",
      objectId: file.id,
      actorId: getOrgId(req) ?? "system",
      details: JSON.stringify({ agentId: file.agentId, filename: file.filename }),
    });

    if (local) {
      res.end(local);
      return;
    }
    Readable.fromWeb(body as any).pipe(res);
  } catch (e: any) {
    res.status(500).json({ message: e.message || "Failed to download file" });
  }
});

/**
 * POST /api/agent-files/:id/attach — hand a document the agent produced back to
 * a new run as an attachment, so "edit this deck" needs no download/re-upload.
 *
 * Deliberately copies into uploaded_files rather than teaching the attachment
 * path about a second table: extraction, container upload
 * (ensureContainerFileIds), the chip UI and audit already work off that table,
 * and one row per attach keeps a generated file immutable -- an edit produces a
 * NEW generated file rather than mutating the one being read.
 */
router.post("/api/agent-files/:id/attach", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const file = await storage.getAgentGeneratedFile(req.params.id as string, orgId);
    if (!file) return res.status(404).json({ message: "File not found" });

    // Bytes come from whichever backend holds them (see the download route).
    let bytes: Buffer | null =
      (file as any).source === "platform" ? ((file as any).content as Buffer | null) : null;
    if (!bytes) {
      if (!file.anthropicFileId) return res.status(410).json({ message: "File contents are no longer available" });
      const { body } = await downloadGeneratedFile(file.anthropicFileId);
      const chunks: Buffer[] = [];
      for await (const chunk of Readable.fromWeb(body as any)) chunks.push(Buffer.from(chunk));
      bytes = Buffer.concat(chunks);
    }

    const filename = file.filename || "document";
    const mimeType = file.mimeType || "application/octet-stream";
    // Extraction is what lets a text-only agent reason about the file at all;
    // a failure here must not block attaching, since a code-execution agent
    // works from the bytes regardless.
    let extracted: { kind: string; text: string; meta: Record<string, any> };
    try {
      extracted = (await extractTextFromFile(bytes, mimeType, filename)) as any;
    } catch {
      extracted = { kind: "text", text: "", meta: {} };
    }

    const [row] = await db.insert(uploadedFiles).values({
      organizationId: orgId ?? getDefaultOrgId() ?? undefined,
      uploadedBy: (req as any).authUser?.userId ?? undefined,
      filename,
      mimeType,
      sizeBytes: bytes.length,
      kind: extracted.kind,
      extractedText: extracted.text,
      extractMeta: extracted.meta as any,
      context: "workspace",
      content: bytes,
    } as any).returning();

    await storage.createAuditEvent({
      organizationId: orgId ?? undefined,
      actorType: "user",
      action: "agent_file.reattached",
      objectType: "uploaded_file",
      objectId: row.id,
      actorId: (req as any).authUser?.userId ?? "system",
      details: JSON.stringify({ sourceGeneratedFileId: file.id, filename, agentId: file.agentId }),
    }).catch(() => {});

    res.status(201).json({
      id: row.id,
      filename: row.filename,
      kind: row.kind,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      context: row.context,
      createdAt: row.createdAt,
      meta: extracted.meta ?? {},
      summary: describeFileSummary(row.kind, extracted.meta),
      charCount: (row.extractedText ?? "").length,
      sourceGeneratedFileId: file.id,
    });
  } catch (e: any) {
    res.status(500).json({ message: e.message || "Failed to attach file" });
  }
});

/**
 * GET /api/agent-files — every document agents have produced for this org.
 * The run-scoped links only reach the last handful of runs; without a list
 * there was no way back to anything older.
 */
router.get("/api/agent-files", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const files = await storage.listAgentGeneratedFiles(getOrgId(req), limit);
    res.json(files);
  } catch (e: any) {
    res.status(500).json({ message: e.message || "Failed to list files" });
  }
});

export default router;
