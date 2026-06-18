import { Router, type Request, type Response } from "express";

const router = Router();
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const deliveries: Map<string, any> = new Map();

router.post("/deliver-file", async (req: Request, res: Response) => {
  await delay(1100);
  const body = req.body || {};
  const deliveryId = `DLV-${Date.now()}`;
  const bDate = new Date(); bDate.setDate(bDate.getDate() - 1);
  const record = {
    delivery_id: deliveryId,
    file_name: body.file_name || `CASCADE-RIDGE-GL-${bDate.toISOString().slice(0, 10)}.csv`,
    destination: body.destination || "sftp://intacct-reports.cascaderidge.org/gl-sync/",
    file_size_kb: body.file_size_kb || 384,
    row_count: body.row_count || 1742,
    checksum: `MD5-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    status: "DELIVERED",
    delivered_at: new Date().toISOString(),
    sftp_response: "226 Transfer complete",
    retention_days: 90,
  };
  deliveries.set(deliveryId, record);
  res.json(record);
});

router.get("/get-delivery-status", async (req: Request, res: Response) => {
  await delay(200);
  const id = req.query.delivery_id as string || "";
  const rec = deliveries.get(id);
  if (!rec) {
    res.status(404).json({ error: "Delivery not found", delivery_id: id });
    return;
  }
  res.json(rec);
});

export default router;
