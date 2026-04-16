import { Router, type Request, type Response } from "express";

const router = Router();

const SESSION_STORE: Record<string, {
  txn_id: string; signer_email: string; events: Array<{ ts: string; event: string; detail: string }>;
  status: string; decline_code: string | null; decline_reason: string | null;
}> = {
  "TXN-2026-00847": {
    txn_id: "TXN-2026-00847",
    signer_email: "s.keating@meridian-capital.com",
    events: [
      { ts: new Date(Date.now() - 14 * 3600 * 1000).toISOString(), event: "envelope_opened",   detail: "Signer opened envelope on web browser — Chrome 122, macOS" },
      { ts: new Date(Date.now() - 13.8 * 3600 * 1000).toISOString(), event: "document_viewed", detail: "Viewed page 1–3 of Commercial Loan Agreement v1.2" },
      { ts: new Date(Date.now() - 13.5 * 3600 * 1000).toISOString(), event: "decline_initiated",detail: "Signer clicked 'Decline to Sign' — document version field mismatch" },
      { ts: new Date(Date.now() - 13.4 * 3600 * 1000).toISOString(), event: "decline_completed",detail: "Decline confirmed. Reason: Document version v1.2 does not match expected v1.4 per internal compliance policy." },
    ],
    status:         "declined",
    decline_code:   "DOCUMENT_VERSION_MISMATCH",
    decline_reason: "Document version v1.2 does not match expected v1.4 per internal compliance policy.",
  },
};

// GET /transaction-detail — transaction metadata and signer list
router.get("/transaction-detail", (req: Request, res: Response) => {
  const txnId = (req.query.txn_id as string) || "TXN-2026-00847";

  const defaultDetail = {
    txn_id:    txnId,
    client:    txnId === "TXN-2026-00847" ? "Meridian Capital Partners" : "Unknown Client",
    product:   "Commercial Loan",
    amount_usd: txnId === "TXN-2026-00847" ? 1200000 : 0,
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    status:    txnId === "TXN-2026-00847" ? "declined" : "pending",
    doc_version_sent: txnId === "TXN-2026-00847" ? "v1.2" : "latest",
    doc_version_required: txnId === "TXN-2026-00847" ? "v1.4" : "latest",
    signers: [
      { id: "SGR-001", name: "Sarah Keating",  title: "VP Treasury",        email: "s.keating@meridian-capital.com", status: txnId === "TXN-2026-00847" ? "declined" : "pending", order: 1 },
      { id: "SGR-002", name: "Marcus Webb",    title: "CFO",                email: "m.webb@meridian-capital.com",   status: "awaiting_prior",  order: 2 },
    ],
    envelope_id:  `ENV-${txnId.replace("TXN-", "")}`,
    template_id:  "TMPL-COMM-LOAN-2026",
    sender:       { name: "Loan Operations Team", email: "loan-ops@bank.com" },
    priority:     txnId === "TXN-2026-00847" ? "vip" : "normal",
  };

  res.json({ transaction: defaultDetail, generated_at: new Date().toISOString() });
});

// GET /signer-session — signer click-stream and session events
router.get("/signer-session", (req: Request, res: Response) => {
  const txnId = (req.query.txn_id as string) || "TXN-2026-00847";
  const session = SESSION_STORE[txnId] ?? null;

  if (!session) {
    return res.json({ session: null, message: `No session data found for transaction ${txnId}` });
  }

  res.json({
    session: {
      ...session,
      session_duration_minutes: 12,
      device: "Chrome 122 / macOS 14.2",
      ip_country: "US",
      pages_viewed: 3,
      total_pages: 18,
      completion_pct: 16.7,
    },
    generated_at: new Date().toISOString(),
  });
});

// GET /document-versions — available document versions for a template
router.get("/document-versions", (req: Request, res: Response) => {
  const templateId = (req.query.template_id as string) || "TMPL-COMM-LOAN-2026";

  res.json({
    template_id:      templateId,
    template_name:    "Commercial Loan Agreement 2026",
    current_version:  "v1.4",
    versions: [
      { version: "v1.4", released_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), changes: ["Added AML attestation clause (regulatory 2026-Q1)", "Updated SOFR reference rate language", "Corrected Schedule B formatting"], status: "current", requires_recipient_acknowledgment: true },
      { version: "v1.3", released_at: new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString(), changes: ["Updated penalty interest clause"], status: "deprecated", requires_recipient_acknowledgment: false },
      { version: "v1.2", released_at: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString(), changes: ["Initial AML language (pre-regulatory update)"], status: "invalid", requires_recipient_acknowledgment: false },
    ],
    version_sent_in_txn:      "v1.2",
    version_delta_summary:    "v1.4 adds mandatory AML attestation clause required under 2026-Q1 regulatory update. All commercial loans >$500K must use v1.4 from 2026-01-15.",
    correction_required:      true,
  });
});

// GET /classify-decline-reason — classify the decline event for a transaction
router.get("/classify-decline-reason", (req: Request, res: Response) => {
  const txnId = (req.query.txn_id as string) || "TXN-2026-00847";
  const session = SESSION_STORE[txnId];

  const isKnown = txnId === "TXN-2026-00847";

  res.json({
    txn_id:             txnId,
    decline_code:       isKnown ? "DOCUMENT_VERSION_MISMATCH" : "UNKNOWN",
    classification:     isKnown ? "CORRECTABLE" : "REQUIRES_REVIEW",
    confidence_pct:     isKnown ? 98 : 50,
    root_cause:         isKnown ? "Outdated document version sent — v1.2 missing mandatory AML attestation clause" : "Insufficient data",
    recommended_action: isKnown ? "Resend envelope with document version v1.4" : "Manual review required",
    correctable:        isKnown,
    correction_effort:  isKnown ? "LOW — automated resend with correct template" : "MEDIUM",
    precedent_cases:    isKnown ? 3 : 0,
    signer_decline_text: session?.decline_reason ?? null,
    generated_at: new Date().toISOString(),
  });
});

export default router;
