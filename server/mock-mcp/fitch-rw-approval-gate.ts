import { Router, type Request, type Response } from "express";

const router = Router();

// In-memory submission store (demo-only — resets on server restart)
const _submissions: Record<string, any> = {};
let _seqCounter = 1000;

function nowIso() { return new Date().toISOString(); }

// POST /submit-memo — submit a draft rating action memo to the committee queue
router.post("/submit-memo", (req: Request, res: Response) => {
  const {
    issuer_id   = "UNKNOWN",
    issuer_name = "Unknown Issuer",
    action_type = "Rating Watch Negative",
    proposed_rating = "BBB-",
    analyst_id  = "FITCH-ANALYST-001",
    rationale   = "Multiple stress signals detected across market, filing, and peer data sources.",
    key_findings = [],
    urgency     = "standard",
  } = req.body || {};

  const memoId  = `FITCH-MEMO-${(++_seqCounter).toString().padStart(6, "0")}`;
  const status  = urgency === "expedited" ? "committee_review" : "pending_review";
  const reviewEta = urgency === "expedited"
    ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const submission = {
    memo_id:        memoId,
    issuer_id,
    issuer_name,
    action_type,
    proposed_rating,
    analyst_id,
    rationale,
    key_findings,
    urgency,
    status,
    review_eta:     reviewEta,
    submitted_at:   nowIso(),
    committee_members: [
      { id: "COMM-001", name: "Dr. Helena Marsh",    role: "Committee Chair" },
      { id: "COMM-002", name: "Richard Okonkwo",     role: "Senior Analyst"  },
      { id: "COMM-003", name: "Camille Devereux",    role: "Risk Review"     },
    ],
    regulatory_notices_required: ["SEC-17g-7", "EU-CRA-III-Art11"],
    disclosure_timeline_hours:   urgency === "expedited" ? 4 : 24,
  };

  _submissions[memoId] = submission;

  res.json({
    success:     true,
    memo_id:     memoId,
    status,
    review_eta:  reviewEta,
    message:     `Rating action memo ${memoId} submitted to committee queue (${urgency} track). ETA: ${reviewEta}.`,
    submission,
  });
});

// GET /validator-queue — current state of the committee approval queue
router.get("/validator-queue", (_req: Request, res: Response) => {
  const openMemos = Object.values(_submissions).filter(s => s.status !== "approved" && s.status !== "rejected");

  const queue = openMemos.length > 0 ? openMemos : [
    {
      memo_id:        "FITCH-MEMO-000998",
      issuer_id:      "MPW",
      issuer_name:    "Medical Properties Trust",
      action_type:    "Rating Watch Negative",
      proposed_rating:"BB-",
      status:         "committee_review",
      urgency:        "expedited",
      submitted_at:   new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      review_eta:     new Date(Date.now() + 75 * 60 * 1000).toISOString(),
      analyst_id:     "FITCH-ANALYST-007",
    },
    {
      memo_id:        "FITCH-MEMO-000999",
      issuer_id:      "NCLH",
      issuer_name:    "Norwegian Cruise Line",
      action_type:    "Downgrade",
      proposed_rating:"B",
      status:         "pending_review",
      urgency:        "standard",
      submitted_at:   new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      review_eta:     new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
      analyst_id:     "FITCH-ANALYST-003",
    },
  ];

  res.json({
    queue_depth:    queue.length,
    expedited_count: queue.filter(q => q.urgency === "expedited").length,
    pending_count:  queue.filter(q => q.status === "pending_review").length,
    in_review_count: queue.filter(q => q.status === "committee_review").length,
    items:          queue,
    as_of:          nowIso(),
  });
});

// GET /committee-decision — get the committee decision for a memo
router.get("/committee-decision", (req: Request, res: Response) => {
  const memoId = req.query.memo_id as string | undefined;

  if (memoId && _submissions[memoId]) {
    const sub = _submissions[memoId];
    // Auto-approve demo submissions after a short time
    const submittedMs = new Date(sub.submitted_at).getTime();
    const elapsed     = Date.now() - submittedMs;
    if (elapsed > 5000) {
      sub.status = "approved";
      sub.decided_at = new Date(submittedMs + 5000).toISOString();
      sub.decision   = "APPROVED";
      sub.committee_notes = "Approved unanimously. Analyst rationale supported by quantitative signals.";
    }
    return res.json({ memo_id: memoId, ...sub });
  }

  // Return a synthetic historical decision for demo continuity
  const decision = memoId ? {
    memo_id:         memoId,
    status:          "approved",
    decision:        "APPROVED",
    decided_at:      new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    committee_notes: "Approved with minor wording revisions. Quantitative analysis supported the action.",
    dissenting_votes: 0,
    regulatory_notices_filed: ["SEC-17g-7-FILED", "EU-CRA-III-Art11-FILED"],
  } : {
    memo_id:         "FITCH-MEMO-000997",
    status:          "approved",
    decision:        "APPROVED",
    decided_at:      new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    committee_notes: "Approved. Rating Watch Negative placement consistent with peer and market data.",
    dissenting_votes: 0,
    regulatory_notices_filed: ["SEC-17g-7-FILED"],
  };

  res.json(decision);
});

// POST /log-regulatory-disclosure — log that SEC-17g-7 / EU CRA III disclosures were filed
router.post("/log-regulatory-disclosure", (req: Request, res: Response) => {
  const {
    memo_id       = "UNKNOWN",
    regulation    = "SEC-17g-7",
    issuer_id     = "UNKNOWN",
    action_type   = "Rating Watch Negative",
    filed_by      = "FITCH-COMPLIANCE-001",
    effective_date = new Date().toISOString().split("T")[0],
  } = req.body || {};

  const logId = `DISC-LOG-${Date.now()}`;
  const record = {
    log_id:         logId,
    memo_id,
    regulation,
    issuer_id,
    action_type,
    filed_by,
    effective_date,
    filed_at:       nowIso(),
    confirmation:   `${regulation} disclosure filed and logged. Reference: ${logId}.`,
    public_disclosure_url: `https://www.fitchratings.com/disclosures/${logId}`,
    retention_years: 7,
    status:         "filed",
  };

  res.json({
    success:  true,
    log_id:   logId,
    message:  record.confirmation,
    record,
  });
});

export default router;
