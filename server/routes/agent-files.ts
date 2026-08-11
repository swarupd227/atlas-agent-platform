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

    const { filename, mimeType, body } = await downloadGeneratedFile(file.anthropicFileId);

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

    Readable.fromWeb(body as any).pipe(res);
  } catch (e: any) {
    res.status(500).json({ message: e.message || "Failed to download file" });
  }
});

export default router;
