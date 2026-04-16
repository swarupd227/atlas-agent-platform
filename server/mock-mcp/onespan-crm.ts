import { Router, type Request, type Response } from "express";

const router = Router();

const CRM_CLIENTS: Record<string, {
  id: string; name: string; tier: string; rm: { name: string; email: string; phone: string };
  aum_usd: number; relationship_years: number; primary_product: string;
  open_deals: Array<{ txn_id: string; product: string; amount_usd: number; status: string }>;
}> = {
  "meridian-capital": {
    id: "CRM-CLIENT-00291",
    name: "Meridian Capital Partners",
    tier: "VIP",
    rm: { name: "David Okafor", email: "d.okafor@bank.com", phone: "+1-415-555-0182" },
    aum_usd: 48000000,
    relationship_years: 7,
    primary_product: "Commercial Lending",
    open_deals: [
      { txn_id: "TXN-2026-00847", product: "Commercial Loan", amount_usd: 1200000, status: "declined" },
    ],
  },
};

// GET /client-profile — CRM profile for a client
router.get("/client-profile", (req: Request, res: Response) => {
  const clientId = (req.query.client_id as string)?.toLowerCase() ?? "";
  const txnId    = (req.query.txn_id as string) ?? "";

  let client = Object.values(CRM_CLIENTS).find(c =>
    c.id.toLowerCase().includes(clientId) ||
    c.name.toLowerCase().includes(clientId) ||
    c.open_deals.some(d => d.txn_id === txnId)
  );

  if (!client) client = CRM_CLIENTS["meridian-capital"];

  res.json({
    client: {
      ...client,
      lifetime_value_usd: client.aum_usd * 0.012,
      risk_rating: "LOW",
      kyc_status: "COMPLETE",
      last_contact: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      preferred_contact: "email",
    },
    generated_at: new Date().toISOString(),
  });
});

// POST /update-crm-record — update CRM record for a transaction
router.post("/update-crm-record", (req: Request, res: Response) => {
  const {
    txn_id    = "TXN-2026-00847",
    client_id = "CRM-CLIENT-00291",
    update_type = "INTERVENTION_INITIATED",
    notes   = "",
    status  = "intervention_active",
    agent   = "AGR-003 Intervention Orchestrator",
  } = req.body || {};

  const updateId = `CRM-UPD-${Date.now().toString(36).toUpperCase()}`;

  res.json({
    success:    true,
    update_id:  updateId,
    txn_id,
    client_id,
    update_type,
    status_updated_to: status,
    notes_appended: notes,
    updated_by: agent,
    updated_at: new Date().toISOString(),
    crm_activity_logged: true,
    audit_entry: `[${new Date().toISOString()}] ${agent}: ${update_type} — ${notes.slice(0, 100) || "Status updated"}`,
  });
});

// POST /notify-relationship-manager — send RM escalation notification
router.post("/notify-relationship-manager", (req: Request, res: Response) => {
  const {
    txn_id         = "TXN-2026-00847",
    rm_email       = "d.okafor@bank.com",
    rm_name        = "David Okafor",
    client_name    = "Meridian Capital Partners",
    priority       = "HIGH",
    subject        = "VIP Transaction Requires Attention",
    message        = "",
    resend_initiated = false,
  } = req.body || {};

  const notifId = `NOTIF-RM-${Date.now().toString(36).toUpperCase()}`;

  const defaultMessage = resend_initiated
    ? `Transaction ${txn_id} (${client_name}, $1.2M Commercial Loan) was declined due to document version mismatch. ATLAS has automatically initiated a resend with the correct document version v1.4. Please follow up with the client to confirm receipt and signing timeline. ETA for completion: 24 hours.`
    : `Transaction ${txn_id} (${client_name}) requires your attention. ATLAS has identified a correctable issue. Please review and contact the client.`;

  res.json({
    success:         true,
    notification_id: notifId,
    txn_id,
    rm_email,
    rm_name,
    client_name,
    priority,
    subject,
    message_sent: message || defaultMessage,
    channels: ["email", "platform_inbox"],
    sent_at:   new Date().toISOString(),
    delivery_status: "delivered",
    response_expected_hours: priority === "HIGH" ? 2 : 24,
  });
});

export default router;
