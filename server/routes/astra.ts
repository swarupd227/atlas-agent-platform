/**
 * Astra Workspace routes (docs/ux/agentic-modernization.md).
 *
 * Behind the ASTRA_WORKSPACE_ENABLED platform setting: when it isn't "true"
 * every route answers 404, whatever the client thinks the flag is. Every
 * route needs the use_astra permission (all roles have it; what each role can
 * actually do is decided per tool). Threads are scoped to the caller's
 * organization and to the user who started them.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { getDefaultOrgId, getOrgId } from "../auth";
import { checkPermission, getRequestRole } from "../permissions";
import { llmInvokeRateLimiter } from "../rate-limits";
import { storage } from "../storage";
import { AstraBusyError, AstraNotFoundError, resolveAction, runTurn } from "../astra/engine";
import { getAstraRuntime } from "../astra/wiring";
import type { AstraContext, AstraEvent } from "../astra/types";

const router = Router();

export const ASTRA_FLAG_KEY = "ASTRA_WORKSPACE_ENABLED";
const FLAG_CACHE_MS = 30_000;
let flagCache: { value: boolean; at: number } | null = null;

async function astraEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < FLAG_CACHE_MS) return flagCache.value;
  const setting = await storage.getPlatformSetting(ASTRA_FLAG_KEY).catch(() => undefined);
  const value = String(setting?.value ?? "").toLowerCase() === "true";
  flagCache = { value, at: Date.now() };
  return value;
}

async function requireAstraEnabled(_req: Request, res: Response, next: NextFunction) {
  if (await astraEnabled()) return next();
  res.status(404).json({ message: "Astra Workspace is not enabled for this deployment." });
}

router.use("/api/astra", requireAstraEnabled);

function callerContext(req: Request, industryId?: string | null): AstraContext | null {
  const orgId = getOrgId(req) ?? getDefaultOrgId();
  if (!orgId) return null;
  return { orgId, userId: req.authUser?.userId ?? null, role: getRequestRole(req), industryId: industryId ?? null };
}

/** SSE writer with a heartbeat, so Azure's idle timeout doesn't cut a long turn. */
function openSse(res: Response): (event: AstraEvent) => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const heartbeat = setInterval(() => {
    try { res.write(":hb\n\n"); } catch { /* client gone */ }
  }, 15_000);
  res.on("close", () => clearInterval(heartbeat));
  return (event) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* client gone; the turn still completes and is saved */ }
  };
}

function streamError(send: (e: AstraEvent) => void, err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  send({ type: "error", message });
}

router.get("/api/astra/status", checkPermission("use_astra"), (_req, res) => {
  res.json({ enabled: true });
});

router.get("/api/astra/threads", checkPermission("use_astra"), async (req, res) => {
  const ctx = callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const { store } = getAstraRuntime();
  res.json(await store.listThreads(ctx.orgId, ctx.userId));
});

const createThreadSchema = z.object({ title: z.string().max(200).optional() });

router.post("/api/astra/threads", checkPermission("use_astra"), async (req, res) => {
  const ctx = callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const parsed = createThreadSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
  const { store } = getAstraRuntime();
  res.status(201).json(await store.createThread(ctx.orgId, ctx.userId, parsed.data.title));
});

router.get("/api/astra/threads/:id", checkPermission("use_astra"), async (req, res) => {
  const ctx = callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const { store } = getAstraRuntime();
  const found = await store.getThreadForCaller(String(req.params.id), ctx.orgId, ctx.userId);
  if (!found) return res.status(404).json({ message: "Thread not found" });
  res.json(found);
});

const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  industryId: z.string().max(100).nullable().optional(),
});

router.post("/api/astra/threads/:id/messages/stream", llmInvokeRateLimiter, checkPermission("use_astra"), async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
  const ctx = callerContext(req, parsed.data.industryId);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const threadId = String(req.params.id);
  const { deps, store } = getAstraRuntime();
  if (!(await store.getThreadForCaller(threadId, ctx.orgId, ctx.userId))) {
    return res.status(404).json({ message: "Thread not found" });
  }

  const send = openSse(res);
  try {
    await store.titleIfDefault(threadId, ctx.orgId, parsed.data.text).catch(() => {});
    await runTurn(deps, ctx, threadId, parsed.data.text, send);
  } catch (err) {
    if (err instanceof AstraBusyError || err instanceof AstraNotFoundError) streamError(send, err);
    else {
      console.error("[astra] turn failed:", err);
      streamError(send, err);
    }
  } finally {
    res.end();
  }
});

const decisionSchema = z.object({ decision: z.enum(["confirm", "cancel"]) });

router.post("/api/astra/threads/:id/actions/:actionId/stream", llmInvokeRateLimiter, checkPermission("use_astra"), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
  const ctx = callerContext(req, typeof req.body?.industryId === "string" ? req.body.industryId : null);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const threadId = String(req.params.id);
  const { deps, store } = getAstraRuntime();
  if (!(await store.getThreadForCaller(threadId, ctx.orgId, ctx.userId))) {
    return res.status(404).json({ message: "Thread not found" });
  }

  const send = openSse(res);
  try {
    await resolveAction(deps, ctx, threadId, String(req.params.actionId), parsed.data.decision, send);
  } catch (err) {
    if (!(err instanceof AstraNotFoundError)) console.error("[astra] action failed:", err);
    streamError(send, err);
  } finally {
    res.end();
  }
});

export default router;
