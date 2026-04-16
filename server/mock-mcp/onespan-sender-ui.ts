import { Router, type Request, type Response } from "express";

const router = Router();

const TXN_PORTFOLIO = [
  { id: "TXN-2026-00847", client: "Meridian Capital Partners", product: "Commercial Loan", amount: 1200000, status: "declined",   signers: 2, docVersion: "v1.2", correctVersion: "v1.4", stall: true,  priority: "vip" },
  { id: "TXN-2026-00831", client: "Apex Realty Group",         product: "Mortgage",        amount: 850000,  status: "stalled",    signers: 3, docVersion: "v2.1", correctVersion: "v2.1", stall: true,  priority: "high" },
  { id: "TXN-2026-00819", client: "Sunrise Logistics LLC",     product: "Credit Facility", amount: 500000,  status: "stalled",    signers: 1, docVersion: "v3.0", correctVersion: "v3.0", stall: true,  priority: "normal" },
  { id: "TXN-2026-00802", client: "Harbor Financial Corp",     product: "Term Loan",       amount: 2100000, status: "completed",  signers: 4, docVersion: "v1.4", correctVersion: "v1.4", stall: false, priority: "high" },
  { id: "TXN-2026-00798", client: "Clearview Ventures",        product: "LOC",             amount: 350000,  status: "pending",    signers: 2, docVersion: "v2.0", correctVersion: "v2.0", stall: false, priority: "normal" },
  { id: "TXN-2026-00791", client: "Pacific Meridian Bank",     product: "Mortgage",        amount: 980000,  status: "in_review",  signers: 3, docVersion: "v1.4", correctVersion: "v1.4", stall: false, priority: "high" },
  { id: "TXN-2026-00784", client: "TechGrowth Capital",        product: "Credit Facility", amount: 650000,  status: "stalled",    signers: 2, docVersion: "v2.1", correctVersion: "v2.1", stall: true,  priority: "normal" },
  { id: "TXN-2026-00777", client: "National Bridge Corp",      product: "Term Loan",       amount: 4500000, status: "completed",  signers: 5, docVersion: "v1.4", correctVersion: "v1.4", stall: false, priority: "vip" },
];

// GET /portfolio-health — overall portfolio completion metrics
router.get("/portfolio-health", (_req: Request, res: Response) => {
  const total       = TXN_PORTFOLIO.length;
  const completed   = TXN_PORTFOLIO.filter(t => t.status === "completed").length;
  const declined    = TXN_PORTFOLIO.filter(t => t.status === "declined").length;
  const stalled     = TXN_PORTFOLIO.filter(t => t.stall).length;
  const inProgress  = TXN_PORTFOLIO.filter(t => ["pending","in_review"].includes(t.status)).length;
  const revenueAtRisk = TXN_PORTFOLIO.filter(t => t.stall || t.status === "declined").reduce((s, t) => s + t.amount, 0);

  res.json({
    portfolio: {
      total_transactions: total,
      completed,
      completion_rate_pct: +((completed / total) * 100).toFixed(1),
      declined,
      decline_rate_pct:    +((declined / total) * 100).toFixed(1),
      stalled,
      in_progress:         inProgress,
      revenue_at_risk_usd: revenueAtRisk,
      benchmark_completion_pct: 92.5,
      health_score: 67,
      health_signal: "DEGRADED",
      critical_items: [
        { txn_id: "TXN-2026-00847", reason: "VIP declined — doc version mismatch v1.2 vs v1.4", priority: "vip" },
        { txn_id: "TXN-2026-00831", reason: "Stalled 72h — awaiting signer 2 of 3", priority: "high" },
        { txn_id: "TXN-2026-00784", reason: "Stalled 48h — signer not opening envelope", priority: "normal" },
      ],
    },
    generated_at: new Date().toISOString(),
  });
});

// GET /stall-analysis — per-transaction stall details
router.get("/stall-analysis", (_req: Request, res: Response) => {
  const stalledTxns = TXN_PORTFOLIO.filter(t => t.stall || t.status === "declined");

  const analysis = stalledTxns.map((t, i) => ({
    txn_id:        t.id,
    client:        t.client,
    product:       t.product,
    amount_usd:    t.amount,
    status:        t.status,
    stall_hours:   [52, 72, 48, 0, 0, 0, 36][i] ?? 0,
    stall_reason:  t.status === "declined"
      ? `Document version mismatch — sent ${t.docVersion}, required ${t.correctVersion}`
      : "Signer inactivity — no envelope open event in 48+ hours",
    recommended_action: t.status === "declined"
      ? `Resend envelope with correct document version ${t.correctVersion}`
      : "Send nudge reminder to pending signers",
    priority: t.priority,
    signer_count: t.signers,
  }));

  res.json({ stall_analysis: analysis, total_stalls: analysis.length, generated_at: new Date().toISOString() });
});

// GET /completion-funnel — funnel stages with drop-off rates
router.get("/completion-funnel", (_req: Request, res: Response) => {
  res.json({
    funnel: {
      period: "rolling_30d",
      stages: [
        { stage: "Envelope Created",    count: 284, pct: 100.0, drop_off_pct: 0 },
        { stage: "Sent to Signers",     count: 271, pct:  95.4, drop_off_pct: 4.6 },
        { stage: "First Open",          count: 251, pct:  88.4, drop_off_pct: 7.0 },
        { stage: "Partially Signed",    count: 234, pct:  82.4, drop_off_pct: 6.0 },
        { stage: "Fully Signed",        count: 251, pct:  88.4, drop_off_pct: 0 },
        { stage: "Completed",           count: 251, pct:  88.4, drop_off_pct: 0 },
      ],
      key_drop_offs: [
        { stage: "Created → Sent",          loss_pct: 4.6, root_cause: "Recipient validation failures" },
        { stage: "Sent → First Open",        loss_pct: 7.0, root_cause: "Email deliverability + signer inactivity" },
        { stage: "Partially → Fully Signed", loss_pct: 6.0, root_cause: "Multi-party coordination delays" },
      ],
      benchmark_completion_pct: 92.5,
      current_completion_pct: 88.3,
      gap_vs_benchmark: -4.2,
    },
    generated_at: new Date().toISOString(),
  });
});

// GET /decline-summary — declined transaction analysis
router.get("/decline-summary", (req: Request, res: Response) => {
  const txnId = (req.query.txn_id as string) || null;

  const TARGET = TXN_PORTFOLIO.find(t => t.status === "declined");
  const base = {
    txn_id: TARGET!.id,
    client: TARGET!.client,
    product: TARGET!.product,
    amount_usd: TARGET!.amount,
    status: "declined",
    priority: TARGET!.priority,
    decline_reason: "DOCUMENT_VERSION_MISMATCH",
    decline_detail: `Document version v1.2 sent but current approved version is v1.4. Signer Sarah Keating (VP Treasury) rejected — version delta includes updated AML attestation clause required per regulatory update 2026-Q1.`,
    correctable: true,
    correction_action: `Resend envelope with document version ${TARGET!.correctVersion}`,
    primary_signer: { name: "Sarah Keating", title: "VP Treasury", email: "s.keating@meridian-capital.com" },
    relationship_manager: { name: "David Okafor", email: "d.okafor@bank.com", phone: "+1-415-555-0182" },
    doc_sent:    TARGET!.docVersion,
    doc_required: TARGET!.correctVersion,
    time_to_decline_hours: 14,
    declined_at: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
  };

  if (txnId && txnId !== TARGET!.id) {
    return res.json({ decline_summary: null, message: `No declined transaction found for ${txnId}` });
  }
  res.json({ decline_summary: base, generated_at: new Date().toISOString() });
});

// POST /resend-envelope — resend with corrected document
router.post("/resend-envelope", (req: Request, res: Response) => {
  const {
    txn_id     = "TXN-2026-00847",
    doc_version = "v1.4",
    signer_email = "s.keating@meridian-capital.com",
    message    = "Updated document enclosed. Please review and sign at your earliest convenience.",
    priority   = "high",
  } = req.body || {};

  const envelopeId = `ENV-${Date.now().toString(36).toUpperCase()}`;

  res.json({
    success:        true,
    txn_id,
    envelope_id:    envelopeId,
    doc_version_sent: doc_version,
    sent_to:        signer_email,
    priority,
    message_preview: message.slice(0, 80),
    expected_completion_hours: 24,
    resent_at:      new Date().toISOString(),
    audit_trail_entry: `Envelope resent by AGR-003 Intervention Orchestrator — doc upgraded ${doc_version}, priority ${priority}`,
    status:         "sent",
  });
});

export default router;
