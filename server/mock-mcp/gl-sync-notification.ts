import { Router, type Request, type Response } from "express";
import { getGlSyncScenario } from "../gl-sync-demo-store";

const router = Router();
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const notificationHistory: any[] = [];

router.post("/send-notification", async (req: Request, res: Response) => {
  await delay(600);
  const body = req.body || {};
  const scenario = getGlSyncScenario();
  const msgId = `MSG-${Date.now()}`;

  const defaultRecipients = scenario === "control_total_variance"
    ? ["gl-controller@cascaderidge.org", "cfo@cascaderidge.org", "audit@cascaderidge.org"]
    : scenario === "dimension_mismatch"
    ? ["gl-team@cascaderidge.org", "branch-ops@cascaderidge.org"]
    : ["gl-team@cascaderidge.org"];

  const record = {
    message_id: msgId,
    channel: body.channel || "email",
    recipients: body.recipients || defaultRecipients,
    subject: body.subject || (
      scenario === "control_total_variance"
        ? `⚠️ GL Sync Alert — Control Total Variance Detected (${new Date().toLocaleDateString()})`
        : scenario === "dimension_mismatch"
        ? `ℹ️ GL Sync Complete — 47 Entries Excepted (Kirkland Branch Dimension)`
        : `✅ GL Sync Complete — All ${1742} Entries Posted Successfully`
    ),
    body_preview: body.body_preview || "See attached reconciliation report for details.",
    status: "DELIVERED",
    delivered_at: new Date().toISOString(),
    open_tracking: true,
  };
  notificationHistory.push(record);
  res.json({ success: true, message: record });
});

router.get("/get-notification-history", async (_req: Request, res: Response) => {
  await delay(200);
  res.json({ notifications: notificationHistory, total: notificationHistory.length });
});

export default router;
