import { Router, type Request, type Response } from "express";

const router = Router();

const _tickets: Record<string, {
  id: string; txn_id: string; category: string; severity: string;
  summary: string; status: string; created_at: string;
}> = {};
let _ticketSeq = 4000;

// POST /log-helpdesk-ticket — create IT helpdesk ticket for a transaction issue
router.post("/log-helpdesk-ticket", (req: Request, res: Response) => {
  const {
    txn_id      = "TXN-2026-00847",
    category    = "DOCUMENT_ISSUE",
    severity    = "HIGH",
    summary     = "Document version mismatch detected",
    description = "",
    reported_by = "AGR-003 Intervention Orchestrator",
    auto_resolve = true,
  } = req.body || {};

  const ticketId = `HD-${(++_ticketSeq)}`;
  const status   = auto_resolve ? "auto_resolved" : "open";

  const ticket = {
    id:          ticketId,
    txn_id,
    category,
    severity,
    summary,
    description: description || `Automated ticket raised by ATLAS ${reported_by} for transaction ${txn_id}. ${summary}`,
    status,
    reported_by,
    created_at:  new Date().toISOString(),
    resolved_at: auto_resolve ? new Date().toISOString() : null,
    resolution:  auto_resolve
      ? "ATLAS AGR-003 automatically initiated corrective resend with updated document version v1.4. No manual helpdesk action required. CRM and RM notified."
      : null,
    sla_target_hours: severity === "CRITICAL" ? 1 : severity === "HIGH" ? 4 : 24,
  };

  _tickets[ticketId] = ticket;

  res.json({
    success:   true,
    ticket_id: ticketId,
    ticket,
    message:   `Helpdesk ticket ${ticketId} created (${status}). ${auto_resolve ? "Auto-resolved by ATLAS intervention pipeline." : "Assigned to L1 support queue."}`,
  });
});

// GET /helpdesk-status — status of open and recent tickets
router.get("/helpdesk-status", (_req: Request, res: Response) => {
  const allTickets = Object.values(_tickets);
  const open       = allTickets.filter(t => t.status === "open");
  const resolved   = allTickets.filter(t => t.status !== "open");

  res.json({
    helpdesk: {
      open_tickets:     open.length,
      resolved_tickets: resolved.length,
      recent_tickets:   allTickets.slice(-10),
      queue_depth:      open.length + 3,
      avg_resolution_hours: 1.4,
      top_categories: [
        { category: "DOCUMENT_ISSUE", count: allTickets.filter(t => t.category === "DOCUMENT_ISSUE").length + 4 },
        { category: "SIGNER_AUTH",    count: 3 },
        { category: "DELIVERY",       count: 2 },
      ],
    },
    generated_at: new Date().toISOString(),
  });
});

// POST /escalate-ticket — escalate a helpdesk ticket
router.post("/escalate-ticket", (req: Request, res: Response) => {
  const {
    ticket_id   = "",
    escalate_to = "L2_OPERATIONS",
    reason      = "VIP client impact — requires immediate attention",
    txn_id      = "TXN-2026-00847",
  } = req.body || {};

  const escalationId = `ESC-${Date.now().toString(36).toUpperCase()}`;

  if (ticket_id && _tickets[ticket_id]) {
    _tickets[ticket_id].status = "escalated";
  }

  res.json({
    success:       true,
    escalation_id: escalationId,
    ticket_id,
    txn_id,
    escalated_to:  escalate_to,
    reason,
    priority:      "HIGH",
    escalated_at:  new Date().toISOString(),
    expected_response_hours: 1,
    notification_sent_to: ["ops-lead@bank.com", "d.okafor@bank.com"],
  });
});

export default router;
