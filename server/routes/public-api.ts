// Public, API-key-authenticated surface for external automation platforms
// (n8n, Make, Zapier, etc.) to integrate with Nous bidirectionally:
//   • Inbound  (n8n → Nous):  POST /api/v1/runs        — run an agent, poll result
//   • Outbound (Nous → n8n):  POST /api/v1/integrations/n8n/call — invoke an n8n workflow
//
// Auth: X-API-Key (or Authorization: Bearer) matched against NOUS_PUBLIC_API_KEY.
import { Router, type Request, type Response, type NextFunction } from "express";
import { storage } from "../storage";
import { callN8nWorkflow } from "../integrations/n8n";

const router = Router();

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.NOUS_PUBLIC_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: "Public API is not enabled (NOUS_PUBLIC_API_KEY unset)" });
  }
  const header = req.headers["x-api-key"];
  const bearer = typeof req.headers["authorization"] === "string"
    ? req.headers["authorization"].replace(/^Bearer\s+/i, "")
    : undefined;
  const provided = (Array.isArray(header) ? header[0] : header) || bearer;
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}

// ── Inbound: n8n → Nous ─────────────────────────────────────────────────────
// Start an agent run. Returns a runId to poll. Mirrors the webhook trigger path
// (queues an agent_run job for the worker), but as a clean, documented surface.
router.post("/api/v1/runs", requireApiKey, async (req: Request, res: Response) => {
  try {
    const { agentId, input, payload } = req.body ?? {};
    if (!agentId || typeof agentId !== "string") {
      return res.status(400).json({ error: "agentId is required" });
    }
    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const job = await storage.createJob({
      type: "agent_run",
      agentId,
      status: "queued",
      payload: { triggeredBy: "public_api", input: input ?? payload ?? null },
    });
    res.status(202).json({
      runId: job.id,
      status: "queued",
      statusUrl: `/api/v1/runs/${job.id}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to start run" });
  }
});

// Poll a run's status/result.
router.get("/api/v1/runs/:id", requireApiKey, async (req: Request, res: Response) => {
  try {
    const job = await storage.getJob(String(req.params.id));
    if (!job) return res.status(404).json({ error: "Run not found" });
    res.json({
      runId: job.id,
      status: job.status,            // queued | processing | completed | failed
      progress: (job as any).progress ?? null,
      result: (job as any).result ?? null,
      error: (job as any).error ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to read run" });
  }
});

// ── Outbound: Nous → n8n ────────────────────────────────────────────────────
// Invoke an n8n workflow by its webhook URL and return its response.
router.post("/api/v1/integrations/n8n/call", requireApiKey, async (req: Request, res: Response) => {
  try {
    const { webhookUrl, payload, method, apiKey } = req.body ?? {};
    if (!webhookUrl) return res.status(400).json({ error: "webhookUrl is required" });
    const out = await callN8nWorkflow({ webhookUrl, payload, method, apiKey });
    res.status(out.ok ? 200 : 502).json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to call n8n" });
  }
});

export default router;
