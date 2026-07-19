// Public, API-key-authenticated surface for external automation platforms
// (n8n, Make, Zapier, etc.) to integrate with Astra Agents bidirectionally:
//   • Inbound  (n8n → Astra Agents):  POST /api/v1/runs        — run an agent, poll result
//   • Outbound (Astra Agents → n8n):  POST /api/v1/integrations/n8n/call — invoke an n8n workflow
//
// Auth: X-API-Key (or Authorization: Bearer). Accepts a managed per-agent key
// (minted in the agent's API Gateway tab) or, as an admin fallback, the
// ASTRA_PUBLIC_API_KEY env value.
import crypto from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { storage } from "../storage";
import { callN8nWorkflow } from "../integrations/n8n";
import { getOrgId, getDefaultOrgId } from "../auth";
import { decryptCredentialMap } from "../credential-vault";
import { assertSafeOutboundUrl, UnsafeUrlError } from "../url-safety";

const router = Router();

function extractKey(req: Request): string | undefined {
  const header = req.headers["x-api-key"];
  const bearer = typeof req.headers["authorization"] === "string"
    ? req.headers["authorization"].replace(/^Bearer\s+/i, "")
    : undefined;
  return (Array.isArray(header) ? header[0] : header) || bearer;
}

async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const provided = extractKey(req);
  if (!provided) return res.status(401).json({ error: "Missing API key" });

  // 1) Managed per-agent key (same keys the API Gateway tab generates).
  try {
    const hash = crypto.createHash("sha256").update(provided).digest("hex");
    const key = await storage.getAgentApiKeyByHash(hash);
    if (key && key.isActive && (!key.expiresAt || new Date(key.expiresAt) > new Date())) {
      storage.updateAgentApiKey(key.id, { lastUsedAt: new Date() }).catch(() => {});
      (req as any).apiKeyAgentId = key.agentId;
      return next();
    }
  } catch { /* fall through to env key */ }

  // 2) Admin fallback: shared env key.
  if (process.env.ASTRA_PUBLIC_API_KEY && provided === process.env.ASTRA_PUBLIC_API_KEY) return next();

  return res.status(401).json({ error: "Invalid or missing API key" });
}

// ── Inbound: n8n → Astra Agents ─────────────────────────────────────────────
// Start an agent run. Returns a runId to poll. Mirrors the webhook trigger path
// (queues an agent_run job for the worker), but as a clean, documented surface.
router.post("/api/v1/runs", requireApiKey, async (req: Request, res: Response) => {
  try {
    const keyAgentId = (req as any).apiKeyAgentId as string | undefined;
    const { input, payload } = req.body ?? {};
    // A per-agent key fixes the agent; otherwise (admin key) require agentId in body.
    const agentId = keyAgentId || (req.body?.agentId as string | undefined);
    if (!agentId || typeof agentId !== "string") {
      return res.status(400).json({ error: "agentId is required" });
    }
    if (keyAgentId && req.body?.agentId && req.body.agentId !== keyAgentId) {
      return res.status(403).json({ error: "This API key can only run its own agent" });
    }
    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    // Detect n8n as source via X-Source header (sent by n8n-nodes-astra-agents package)
    const xSource = req.headers["x-source"];
    const triggeredBy = xSource === "n8n" ? "n8n" : "api";

    const job = await storage.createJob({
      type: "agent_run",
      agentId,
      status: "queued",
      payload: { triggeredBy, input: input ?? payload ?? null },
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

// ── Inbound: exported agents → Astra Agents knowledge bases ────────────────
// Lets a code-exported agent (running entirely outside this platform, e.g. a
// downloaded "Generic ReAct Loop" package) call back into its linked
// knowledge base(s) for real retrieval, instead of shipping with a
// permanently-empty stub. Uses the same searchKnowledgeBaseChunks() the
// in-platform Search & Query tab and Workspace runs use — same pgvector
// query, same role-based sensitivity filtering. No caller role is available
// for an API-key-only external caller, so this always resolves to the
// fail-safe default (internal-and-below, never restricted) — the same
// behavior as an unattended scheduled run inside the platform.
router.post("/api/v1/knowledge-bases/:id/search", requireApiKey, async (req: Request, res: Response) => {
  try {
    const { query, topK, scoreThreshold } = req.body ?? {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query (string) is required" });
    }
    const kbId = String(req.params.id);
    const kb = await storage.getKnowledgeBase(kbId);
    if (!kb) return res.status(404).json({ error: "Knowledge base not found" });

    const { searchKnowledgeBaseChunks } = await import("../embeddings");
    const results = await searchKnowledgeBaseChunks(
      kbId,
      query,
      Number.isFinite(Number(topK)) ? Number(topK) : 5,
      Number.isFinite(Number(scoreThreshold)) ? Number(scoreThreshold) : 0.3,
      undefined, // no interactive role for an API-key caller — safe default applies
    );
    res.json({
      results: results.map(r => ({ content: r.content, score: r.similarity, metadata: r.metadata })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to search knowledge base" });
  }
});

// ── Outbound: Astra Agents → n8n ────────────────────────────────────────────
// Invoke an n8n workflow by its webhook URL and return its response.
router.post("/api/v1/integrations/n8n/call", requireApiKey, async (req: Request, res: Response) => {
  try {
    let { webhookUrl, apiKey } = req.body ?? {};
    const { path, payload, method } = req.body ?? {};
    // Tracks whether webhookUrl came from the caller directly (needs the SSRF
    // guard) vs. was derived from the org's own stored, admin-configured n8n
    // connector base URL (an already-trusted host, which may legitimately be
    // a self-hosted n8n instance on localhost — same trust model as an
    // admin-registered MCP server).
    const callerSuppliedUrl = !!webhookUrl;

    // If only a workflow path is given, combine it with the stored n8n
    // connection's base URL + API key (connected via the Integrations page).
    if (!webhookUrl && path) {
      const orgId = getOrgId(req) ?? getDefaultOrgId();
      const conn = orgId ? await storage.getIntegrationConnection(orgId, "n8n") : null;
      if (conn?.credentialBlob) {
        try {
          const creds = decryptCredentialMap(conn.credentialBlob);
          const base = String(creds.baseUrl || "").replace(/\/$/, "");
          if (base) webhookUrl = `${base}/${String(path).replace(/^\//, "")}`;
          if (!apiKey && creds.apiKey) apiKey = creds.apiKey;
        } catch { /* fall through */ }
      }
    }

    if (!webhookUrl) {
      return res.status(400).json({ error: "Provide webhookUrl, or a path with a connected n8n integration" });
    }
    if (callerSuppliedUrl) {
      try {
        await assertSafeOutboundUrl(webhookUrl);
      } catch (e: any) {
        return res.status(400).json({ error: e instanceof UnsafeUrlError ? e.message : "That webhookUrl isn't reachable from this action." });
      }
    }
    const out = await callN8nWorkflow({ webhookUrl, payload, method, apiKey });
    res.status(out.ok ? 200 : 502).json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to call n8n" });
  }
});

export default router;
