import { Router, type Request, type Response } from "express";
import { getGlSyncScenario } from "../gl-sync-demo-store";

const router = Router();
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const idempotencyKeys: Set<string> = new Set();
let currentWatermark = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
})();
const postingLog: any[] = [];

router.get("/get-watermark", async (_req: Request, res: Response) => {
  await delay(400);
  const scenario = getGlSyncScenario();
  const bDate = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

  res.json({
    institution: "Cascade Ridge Credit Union",
    watermark_type: "gl_sync",
    last_successful_sync_date: currentWatermark,
    next_expected_date: bDate,
    watermark_updated_at: new Date(Date.now() - 86400000).toISOString(),
    sync_cycle: "DAILY_PRIOR_DAY",
    status: "ACTIVE",
    note: scenario === "control_total_variance"
      ? "Prior run flagged FX rate variance — reconciliation cycle PENDING_REVIEW"
      : undefined,
  });
});

router.post("/set-watermark", async (req: Request, res: Response) => {
  await delay(300);
  const body = req.body || {};
  const newDate = body.sync_date || new Date().toISOString().slice(0, 10);
  currentWatermark = newDate;
  res.json({
    success: true,
    watermark_updated_to: newDate,
    updated_at: new Date().toISOString(),
    updated_by: "gl-sync-orchestrator",
  });
});

router.get("/check-idempotency-key", async (req: Request, res: Response) => {
  await delay(200);
  const key = req.query.key as string || "";
  const alreadyRun = idempotencyKeys.has(key);
  res.json({
    key,
    already_processed: alreadyRun,
    first_seen_at: alreadyRun ? new Date(Date.now() - 300000).toISOString() : null,
    message: alreadyRun
      ? `Idempotency key ${key} already processed — duplicate run prevented.`
      : `Key ${key} is new — safe to proceed.`,
  });
});

router.post("/record-posting", async (req: Request, res: Response) => {
  await delay(300);
  const body = req.body || {};
  const key = body.idempotency_key || `GL-RUN-${Date.now()}`;
  idempotencyKeys.add(key);
  const record = {
    id: `REC-${Date.now()}`,
    idempotency_key: key,
    business_date: body.business_date,
    je_id: body.je_id,
    entries_posted: body.entries_posted,
    debit_total: body.debit_total,
    credit_total: body.credit_total,
    status: body.status || "COMPLETE",
    recorded_at: new Date().toISOString(),
  };
  postingLog.push(record);
  res.json({ success: true, record });
});

router.get("/get-posting-log", async (_req: Request, res: Response) => {
  await delay(200);
  res.json({ log: postingLog, total: postingLog.length });
});

export default router;
