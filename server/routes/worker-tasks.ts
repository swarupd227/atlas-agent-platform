// Worker-task queue routes (Initiative 04, worker model). The external-worker
// contract: poll a taskType, do the work in any language, report back. These
// routes are additive and isolated — they touch no existing route and are not
// yet produced/consumed by the DAG engine (that wiring is a separate slice).
import { Router } from "express";
import { z, ZodError } from "zod";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { handleZodError } from "./helpers";

const router = Router();

// Enqueue a task. Mainly used by the engine (later slice) and for testing; a
// worker never enqueues its own work.
router.post("/api/worker-tasks", async (req, res) => {
  try {
    const body = z.object({
      taskType: z.string().min(1),
      input: z.any().optional(),
      dagRunId: z.string().optional(),
      nodeKey: z.string().optional(),
      maxAttempts: z.number().int().min(1).max(20).optional(),
    }).parse(req.body);
    const task = await storage.createWorkerTask({
      taskType: body.taskType,
      input: body.input ?? null,
      dagRunId: body.dagRunId ?? null,
      nodeKey: body.nodeKey ?? null,
      maxAttempts: body.maxAttempts ?? 3,
      status: "pending",
    } as any);
    res.status(201).json(task);
  } catch (e) { handleZodError(res, e); }
});

// A worker claims the next available task of a type (atomic; lease-based).
router.post("/api/worker-tasks/poll", async (req, res) => {
  try {
    const body = z.object({
      taskType: z.string().min(1),
      workerId: z.string().optional(),
      leaseMs: z.number().int().min(1000).max(3_600_000).optional(),
    }).parse(req.body);
    const task = await storage.claimNextWorkerTask(
      body.taskType,
      body.workerId || "anonymous-worker",
      getOrgId(req),
      body.leaseMs ?? 60_000,
    );
    if (!task) return res.status(204).send(); // nothing to do — 204, not an error
    res.json(task);
  } catch (e) { handleZodError(res, e); }
});

router.post("/api/worker-tasks/:id/complete", async (req, res) => {
  try {
    const { output } = z.object({ output: z.any().optional() }).parse(req.body ?? {});
    const r = await storage.completeWorkerTask(String(req.params.id), output ?? null, getOrgId(req));
    if (!r.ok) return res.status(r.reason === "not found" ? 404 : 409).json({ message: r.reason });
    res.json(r.task);
  } catch (e) { handleZodError(res, e); }
});

router.post("/api/worker-tasks/:id/fail", async (req, res) => {
  try {
    const { error } = z.object({ error: z.string().default("worker reported failure") }).parse(req.body ?? {});
    const r = await storage.failWorkerTask(String(req.params.id), error, getOrgId(req));
    if (!r.ok) return res.status(r.reason === "not found" ? 404 : 409).json({ message: r.reason });
    res.json(r.task);
  } catch (e) { handleZodError(res, e); }
});

router.get("/api/worker-tasks/:id", async (req, res) => {
  const task = await storage.getWorkerTask(String(req.params.id), getOrgId(req));
  if (!task) return res.status(404).json({ message: "Worker task not found" });
  res.json(task);
});

router.get("/api/worker-tasks", async (req, res) => {
  const tasks = await storage.listWorkerTasks(
    { dagRunId: req.query.dagRunId as string | undefined, taskType: req.query.taskType as string | undefined, status: req.query.status as string | undefined },
    getOrgId(req),
  );
  res.json(tasks);
});

router.delete("/api/worker-tasks/:id", async (req, res) => {
  const ok = await storage.deleteWorkerTask(String(req.params.id), getOrgId(req));
  if (!ok) return res.status(404).json({ message: "Worker task not found" });
  res.status(204).send();
});

export default router;
