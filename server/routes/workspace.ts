/**
 * Agent Workspace routes — the consumption surface's API.
 *
 * A human asks an agent to do work (POST /runs), the run executes through the
 * governed dispatcher and either completes or suspends at an approval gate,
 * and the human approves/denies inline (POST /runs/:id/resume). Every run
 * produces a signed, accountable trace.
 */
import { Router } from "express";
import { z, ZodError } from "zod";
import { getOrgId } from "../auth";
import { getRequestRole } from "../permissions";
import { startWorkspaceRun, resumeWorkspaceRun, getWorkspaceRun, listWorkspaceRuns, getWorkspaceAgents, type WorkspaceEvent } from "../workspace-run";
import { llmInvokeRateLimiter } from "../rate-limits";

const router = Router();

/** Open an SSE stream and return a writer for workspace events. */
function openSse(res: any): (e: WorkspaceEvent | { type: "done"; run: unknown } | { type: "error"; message: string }) => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  return (e) => { try { res.write(`data: ${JSON.stringify(e)}\n\n`); } catch { /* client gone */ } };
}

const resumeSchema = z.object({
  decision: z.enum(["approve", "deny"]),
  edits: z.record(z.any()).optional(),
  note: z.string().max(2000).optional(),
});

// POST /api/workspace/runs — ask an agent to do work.
router.post("/api/workspace/runs", llmInvokeRateLimiter, async (req, res) => {
  try {
    // input may be empty when files carry the request ("summarise this deck"
    // is often just an attachment), but a run with neither is meaningless.
    const { agentId, input, fileIds } = z.object({
      agentId: z.string(),
      input: z.string().default(""),
      fileIds: z.array(z.string()).max(5).optional(),
    }).refine((v) => v.input.trim().length > 0 || (v.fileIds?.length ?? 0) > 0,
      { message: "Provide a message or attach a file" }).parse(req.body);
    const result = await startWorkspaceRun({
      agentId,
      input,
      fileIds,
      orgId: getOrgId(req),
      actorId: getRequestRole(req),
    });
    res.status(201).json(result);
  } catch (e: any) {
    if (e instanceof ZodError) return res.status(400).json({ message: "Validation error", errors: e.errors });
    console.error("[workspace] start error:", e);
    res.status(e.message === "Agent not found" ? 404 : 500).json({ message: e.message });
  }
});

// POST /api/workspace/runs/stream — ask an agent and watch it work live (SSE).
router.post("/api/workspace/runs/stream", llmInvokeRateLimiter, async (req, res) => {
  let agentId: string, input: string, fileIds: string[] | undefined;
  try {
    ({ agentId, input, fileIds } = z.object({
      agentId: z.string(),
      input: z.string().default(""),
      fileIds: z.array(z.string()).max(5).optional(),
    }).refine((v) => v.input.trim().length > 0 || (v.fileIds?.length ?? 0) > 0,
      { message: "Provide a message or attach a file" }).parse(req.body));
  } catch (e: any) {
    return res.status(400).json({ message: "Validation error", errors: e.errors });
  }
  const send = openSse(res);
  try {
    const run = await startWorkspaceRun({ agentId, input, fileIds, orgId: getOrgId(req), actorId: getRequestRole(req) }, send);
    send({ type: "done", run });
  } catch (e: any) {
    send({ type: "error", message: e.message });
  }
  res.end();
});

// POST /api/workspace/runs/:id/resume/stream — approve/deny and keep watching (SSE).
router.post("/api/workspace/runs/:id/resume/stream", async (req, res) => {
  let decision: "approve" | "deny", edits: Record<string, any> | undefined, note: string | undefined;
  try {
    ({ decision, edits, note } = resumeSchema.parse(req.body));
  } catch (e: any) {
    return res.status(400).json({ message: "Validation error", errors: e.errors });
  }
  const send = openSse(res);
  try {
    const run = await resumeWorkspaceRun({ runId: req.params.id, decision, edits, note, orgId: getOrgId(req), actorId: getRequestRole(req) }, send);
    send({ type: "done", run });
  } catch (e: any) {
    send({ type: "error", message: e.message });
  }
  res.end();
});

// GET /api/workspace/runs/:id — poll a run (status, steps, pending approval, outcome).
router.get("/api/workspace/runs/:id", async (req, res) => {
  const run = await getWorkspaceRun(req.params.id, getOrgId(req));
  if (!run) return res.status(404).json({ message: "Run not found" });
  res.json(run);
});

// GET /api/workspace/runs — the caller's own recent runs (My Work).
router.get("/api/workspace/runs", async (req, res) => {
  res.json(await listWorkspaceRuns(getOrgId(req), getRequestRole(req)));
});

// GET /api/workspace/agents — agents this person is allowed to use.
router.get("/api/workspace/agents", async (req, res) => {
  res.json(await getWorkspaceAgents(getOrgId(req), getRequestRole(req)));
});

// POST /api/workspace/runs/:id/resume — approve (optionally with edited args +
// note) or deny the pending action.
router.post("/api/workspace/runs/:id/resume", async (req, res) => {
  try {
    const { decision, edits, note } = resumeSchema.parse(req.body);
    const result = await resumeWorkspaceRun({
      runId: req.params.id,
      decision, edits, note,
      orgId: getOrgId(req),
      actorId: getRequestRole(req),
    });
    res.json(result);
  } catch (e: any) {
    if (e instanceof ZodError) return res.status(400).json({ message: "Validation error", errors: e.errors });
    console.error("[workspace] resume error:", e);
    res.status(/not found/i.test(e.message) ? 404 : 400).json({ message: e.message });
  }
});

export default router;
