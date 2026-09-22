import { Router, type Request, type Response } from "express";

/**
 * Simulated policy system of record -- where a placement stops being a
 * proposal and becomes a contract.
 *
 * This is the step agent prototypes usually skip: they announce a bound
 * policy and a policy number that no system ever issued. Here the number is
 * minted by the system, once, and only when the preconditions a real carrier
 * insists on are actually present:
 *
 *   - a rating id, so the premium is one the rating engine calculated;
 *   - dual-key sign-off, an underwriter AND a senior underwriter, because an
 *     E&S manuscript placement is not a single person's decision;
 *   - the mandatory coastal endorsement whenever there is Tier 1 exposure.
 *
 * Binding is two-phase, as it is in a real core system: the policy is issued
 * pending its ledger, and only becomes bound and active once the general
 * ledger entries are posted and balance. A run that stops halfway leaves a
 * policy visibly pending rather than a half-committed one that reads as done.
 *
 * Deterministic: a submission always mints the same policy number, and
 * binding the same submission twice is refused with the policy that already
 * exists. State lives in memory and resets on restart.
 */

const router = Router();

interface LedgerEntry {
  account: string;
  description: string;
  debit: number;
  credit: number;
}

interface Policy {
  policyNumber: string;
  submissionId: string;
  ratingId: string;
  insuredName: string;
  carrierCode: string;
  lineOfBusiness: string;
  effectiveDate: string;
  expiryDate: string;
  status: "bound_pending_ledger" | "bound_active" | "cancelled";
  locationCount: number;
  coastalTier1Tiv: number;
  endorsementIds: string[];
  signOffs: Array<{ role: string; name: string; decidedAt: string }>;
  premium: { grossPremium: number; brokerCommission: number; surplusLinesTax: number; stampingFee: number; netCarrierPremium: number };
  ledger: { journalId: string; postedAt: string; entries: LedgerEntry[] } | null;
  documentsArchived: string[];
  boundAt: string;
  auditTrail: Array<{ at: string; action: string; actor: string; detail: string }>;
}

const REQUIRED_SIGNOFF_ROLES = ["underwriter", "senior_underwriter"];
/** The coastal windstorm and flood provision required by treaty clause 6.1. */
const COASTAL_ENDORSEMENT_PREFIX = "ME-";

const policies = new Map<string, Policy>();

function now() { return new Date().toISOString(); }

/** SUB-2026-8891 -> POL-2026-8891-CP. The same submission always mints the same number. */
function policyNumberFor(submissionId: string): string {
  const suffix = submissionId.replace(/^SUB-/i, "").trim();
  return `POL-${suffix}-CP`;
}

const money = (n: number) => Math.round(Number(n || 0) * 100) / 100;

router.post("/policies", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const submissionId = String(b.submissionId || "").trim();
  const ratingId = String(b.ratingId || "").trim();
  const insuredName = String(b.insuredName || "").trim();
  const effectiveDate = String(b.effectiveDate || "").trim();
  const endorsementIds: string[] = Array.isArray(b.endorsementIds) ? b.endorsementIds.map((e: unknown) => String(e)) : [];
  const signOffs = Array.isArray(b.signOffs) ? b.signOffs : [];
  const coastalTier1Tiv = Number(b.coastalTier1Tiv ?? 0);

  if (!submissionId || !insuredName || !effectiveDate) {
    res.status(400).json({ error: "submissionId, insuredName and effectiveDate are required." });
    return;
  }
  if (!ratingId) {
    res.status(422).json({
      error: "A ratingId is required: a policy cannot be bound against a premium no rating engine calculated.",
      guidance: "Call the rating engine first and pass the ratingId it returned.",
    });
    return;
  }

  const existing = policies.get(policyNumberFor(submissionId));
  if (existing) {
    res.status(409).json({
      bound: false,
      error: `Submission ${submissionId} is already bound as ${existing.policyNumber}.`,
      policy: { policyNumber: existing.policyNumber, status: existing.status, boundAt: existing.boundAt },
      guidance: "Binding is not idempotent by accident: read the existing policy rather than issuing a second contract.",
    });
    return;
  }

  const rolesPresent = signOffs.map((s: any) => String(s?.role || "").toLowerCase().trim());
  const missingRoles = REQUIRED_SIGNOFF_ROLES.filter((r) => !rolesPresent.includes(r));
  if (missingRoles.length > 0) {
    res.status(422).json({
      bound: false,
      error: `Dual-key sign-off incomplete: missing ${missingRoles.join(" and ")}.`,
      requiredRoles: REQUIRED_SIGNOFF_ROLES,
      rolesPresent,
      guidance: "An E&S manuscript placement binds on two signatures. Obtain the outstanding approval before retrying.",
    });
    return;
  }

  if (coastalTier1Tiv > 0 && !endorsementIds.some((id) => id.toUpperCase().startsWith(COASTAL_ENDORSEMENT_PREFIX))) {
    res.status(422).json({
      bound: false,
      error: "Tier 1 windstorm exposure is present but no manuscript endorsement was attached.",
      treatyClause: "6.1",
      guidance: "Treaty clause 6.1 requires the approved coastal windstorm and flood provision on any risk with Tier 1 exposure. Attach the endorsement and retry.",
    });
    return;
  }

  const policyNumber = policyNumberFor(submissionId);
  const policy: Policy = {
    policyNumber,
    submissionId,
    ratingId,
    insuredName,
    carrierCode: String(b.carrierCode || "CARRIER-A"),
    lineOfBusiness: String(b.lineOfBusiness || "Commercial Property (E&S)"),
    effectiveDate,
    expiryDate: String(b.expiryDate || "").trim() || effectiveDate,
    status: "bound_pending_ledger",
    locationCount: Number(b.locationCount ?? 0),
    coastalTier1Tiv,
    endorsementIds,
    signOffs: signOffs.map((s: any) => ({ role: String(s?.role || ""), name: String(s?.name || ""), decidedAt: String(s?.decidedAt || now()) })),
    premium: {
      grossPremium: money(b.grossPremium),
      brokerCommission: money(b.brokerCommission),
      surplusLinesTax: money(b.surplusLinesTax),
      stampingFee: money(b.stampingFee),
      netCarrierPremium: money(b.netCarrierPremium),
    },
    ledger: null,
    documentsArchived: [`${policyNumber}-BINDER.pdf`, `${policyNumber}-POLICY-JACKET.pdf`, ...endorsementIds.map((e) => `${policyNumber}-${e}.pdf`)],
    boundAt: now(),
    auditTrail: [{ at: now(), action: "policy.issued_pending_ledger", actor: "astra-mga-binding", detail: `Issued against rating ${ratingId} with ${signOffs.length} sign-offs.` }],
  };
  policies.set(policyNumber, policy);

  res.status(201).json({
    bound: true,
    phase: "1_of_2",
    policy: { policyNumber, status: policy.status, boundAt: policy.boundAt, insuredName, effectiveDate, expiryDate: policy.expiryDate, endorsementIds, documentsArchived: policy.documentsArchived },
    guidance: "The policy is issued but not yet active: post the general ledger entries to complete the commit. Until then it must not be reported as bound, nor queued to a bordereau.",
  });
});

router.post("/ledger", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const policyNumber = String(b.policyNumber || "").trim();
  const policy = policies.get(policyNumber);
  if (!policy) {
    res.status(404).json({ error: `No policy "${policyNumber}" found.`, guidance: "Bind the policy before posting its ledger." });
    return;
  }
  if (policy.ledger) {
    res.status(409).json({
      posted: false,
      error: `Ledger for ${policyNumber} was already posted as ${policy.ledger.journalId}.`,
      journal: policy.ledger,
      guidance: "Posting twice would double-count the premium. Read the existing journal instead.",
    });
    return;
  }

  const gross = money(b.grossPremium ?? policy.premium.grossPremium);
  const commission = money(b.brokerCommission ?? policy.premium.brokerCommission);
  const tax = money(b.surplusLinesTax ?? policy.premium.surplusLinesTax);
  const stamping = money(b.stampingFee ?? policy.premium.stampingFee);
  const net = money(b.netCarrierPremium ?? policy.premium.netCarrierPremium);

  // The one figure a caller can get wrong and a journal cannot catch by
  // itself: every entry below derives from gross, commission, tax and
  // stamping, so the journal balances whatever net is passed. Net is not
  // derived -- it is asserted by the caller -- so it is checked against the
  // others here. An agent that carried forward a net premium from a
  // superseded rating would otherwise post a balanced journal that disagrees
  // with the policy it settles.
  const expectedNet = money(gross - commission);
  if (Math.abs(net - expectedNet) > 0.01) {
    res.status(422).json({
      posted: false,
      error: `Premium figures do not reconcile: net carrier premium ${net} against gross ${gross} less commission ${commission} (${expectedNet}).`,
      expected: { netCarrierPremium: expectedNet },
      received: { grossPremium: gross, brokerCommission: commission, netCarrierPremium: net },
      guidance: "Re-read the figures from the rating result rather than adjusting them here; a net premium that disagrees with the gross is a superseded rating, not a rounding difference.",
    });
    return;
  }

  const entries: LedgerEntry[] = [
    { account: "1200 Premium Receivable", description: `Gross premium ${policyNumber}`, debit: money(gross + tax + stamping), credit: 0 },
    { account: "4000 Written Premium", description: "Gross written premium", debit: 0, credit: gross },
    { account: "2300 Surplus Lines Tax Payable", description: "Statutory surplus lines tax", debit: 0, credit: tax },
    { account: "2310 Stamping Fee Payable", description: "Stamping office fee", debit: 0, credit: stamping },
    { account: "6100 Broker Commission Expense", description: `Producer commission ${policyNumber}`, debit: commission, credit: 0 },
    { account: "2100 Commission Payable", description: "Payable to producing broker", debit: 0, credit: commission },
  ];
  const totalDebits = money(entries.reduce((s, e) => s + e.debit, 0));
  const totalCredits = money(entries.reduce((s, e) => s + e.credit, 0));
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    res.status(422).json({
      posted: false,
      error: `Journal does not balance: debits ${totalDebits} against credits ${totalCredits}.`,
      entries,
      guidance: "The premium figures passed do not reconcile. Re-read them from the rating result rather than adjusting them here.",
    });
    return;
  }

  const journalId = `JRNL-${policyNumber.replace(/^POL-/, "")}`;
  policy.ledger = { journalId, postedAt: now(), entries };
  policy.premium = { grossPremium: gross, brokerCommission: commission, surplusLinesTax: tax, stampingFee: stamping, netCarrierPremium: net };
  policy.status = "bound_active";
  policy.auditTrail.push({ at: now(), action: "policy.bound_active", actor: "astra-mga-binding", detail: `Ledger ${journalId} posted; debits and credits balance at ${totalDebits}.` });

  res.status(201).json({
    posted: true,
    phase: "2_of_2",
    journalId,
    policyNumber,
    status: policy.status,
    entries,
    totals: { debits: totalDebits, credits: totalCredits, balanced: true },
    postedAt: policy.ledger.postedAt,
    guidance: "The commit is complete: the policy is bound and active and may now be queued to the carrier bordereau.",
  });
});

router.get("/policy", (req: Request, res: Response) => {
  const policyNumber = String(req.query.policyNumber || "").trim();
  const bySubmission = String(req.query.submissionId || "").trim();
  const policy = policyNumber ? policies.get(policyNumber) : bySubmission ? policies.get(policyNumberFor(bySubmission)) : undefined;
  if (!policy) {
    res.status(404).json({ error: `No policy found for ${policyNumber || bySubmission || "(no identifier given)"}.`, boundPolicies: Array.from(policies.keys()) });
    return;
  }
  res.json({ ...policy, retrievedAt: now() });
});

router.post("/reset", (_req: Request, res: Response) => {
  policies.clear();
  res.json({ reset: true, policies: 0, resetAt: now() });
});

export default router;
