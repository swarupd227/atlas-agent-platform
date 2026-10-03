/**
 * The job that runs a repeated eval run (server/eval-repeat.ts, server/routes/golden-eval.ts).
 *
 * The route creates the run row, queues this job and answers 202; the worker
 * runs the cases here. The worker handles one job at a time, so a long repeated
 * run holds up the jobs behind it for as long as it takes -- the cap on
 * attempts per run (shared/eval-stability.ts) is what bounds that.
 *
 * A job whose process dies mid-run is never finished by anyone, so the run row
 * would read "running" forever. The job beats a heartbeat into its payload while
 * it works, and a sweep fails any job whose heartbeat has stopped, along with
 * its run.
 */
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { jobs, evalRuns, type Job } from "@shared/schema";
import { EVAL_REPEAT_JOB } from "./eval-repeat";
import type { RepeatRunPayload } from "./routes/golden-eval";

export const HEARTBEAT_INTERVAL_MS = 30_000;
/** Six missed beats. A single attempt can take a couple of minutes, but the beat comes from a timer, not from an attempt finishing. */
export const ORPHANED_AFTER_MS = 3 * 60_000;

/** Whether a job that says it is processing has stopped beating. */
export function isOrphanedEvalJob(job: { status: string; startedAt: Date | null; payload: unknown }, now: number): boolean {
  if (job.status !== "processing") return false;
  const beat = Date.parse(String((job.payload as { heartbeatAt?: string } | null)?.heartbeatAt ?? ""));
  const last = Number.isFinite(beat) ? beat : job.startedAt ? job.startedAt.getTime() : 0;
  return now - last > ORPHANED_AFTER_MS;
}

/** Runs a queued repeated run to completion, or fails its run row and rethrows. */
export async function processEvalRepeatRun(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as RepeatRunPayload;
  const beat = () => storage.updateJob(job.id, { payload: { ...payload, heartbeatAt: new Date().toISOString() } as any }).catch(() => undefined);
  await beat();
  const timer = setInterval(() => { void beat(); }, HEARTBEAT_INTERVAL_MS);
  try {
    const { runEvalRepeatJob } = await import("./routes/golden-eval");
    const body: any = await runEvalRepeatJob(payload, async (done, total) => {
      await storage.updateJob(job.id, { progress: Math.min(99, Math.round((done / Math.max(total, 1)) * 100)) }).catch(() => undefined);
    });
    return { runId: payload.runId, mode: payload.mode, repeats: payload.repeats, passRate: body?.passRate ?? null, stability: body?.stability ?? null };
  } catch (err: any) {
    // The run row was created "running" by the route; nobody else will finish it.
    await storage.updateEvalRun(payload.runId, {
      status: "failed",
      completedAt: new Date(),
      resultsJson: { mode: "prompt_level", repeats: payload.repeats, error: err?.message || "Unknown error" } as any,
    }).catch(() => undefined);
    throw err;
  } finally {
    clearInterval(timer);
  }
}

/**
 * Fails every repeated-run job whose process is gone, and its run row. Each is
 * claimed with a guarded update, so a job that finished in the meantime is left
 * alone. Returns how many it failed.
 */
export async function recoverOrphanedEvalRepeatJobs(now = Date.now()): Promise<number> {
  const processing = await db.select().from(jobs).where(and(eq(jobs.type, EVAL_REPEAT_JOB), eq(jobs.status, "processing")));
  let failed = 0;
  for (const job of processing) {
    if (!isOrphanedEvalJob(job, now)) continue;
    const claimed = await db
      .update(jobs)
      .set({ status: "failed", error: "Recovered: the process running this repeated eval stopped", completedAt: new Date() })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, "processing")))
      .returning({ id: jobs.id });
    if (claimed.length === 0) continue;
    const runId = (job.payload as { runId?: string } | null)?.runId;
    if (runId) {
      await db
        .update(evalRuns)
        .set({ status: "failed", completedAt: new Date() })
        .where(and(eq(evalRuns.id, runId), eq(evalRuns.status, "running")));
    }
    failed++;
  }
  return failed;
}
