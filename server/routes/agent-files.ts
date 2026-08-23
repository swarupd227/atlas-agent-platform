import { Router } from "express";
import { Readable } from "stream";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { downloadGeneratedFile } from "../anthropic-code-execution";

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

export default router;
