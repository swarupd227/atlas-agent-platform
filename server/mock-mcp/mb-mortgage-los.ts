import { Router, type Response } from "express";
import {
  AGENT_CLEARABLE, BANKS, CONDITION_CATALOG, FIXTURE_NOTICE, LOANS, MODE, TENANT_ID,
  conditionCode, getLoan, money, now, publicLoan, type LoanSeed,
} from "./mb-mortgage-seed";
import {
  list, logActivity, nextId, resetMortgageState, resolveCitation, resolveRule, stateOf,
  type Condition, type LoanState, type Upload,
} from "./mb-mortgage-state";

/**
 * Simulated Mutual Bancorp mortgage loan origination system (fixture mode),
 * shared by Cape Cod 5 and Fidelity Bank with a bank boundary on every loan.
 *
 * It is the system of record for what the agents produce and what people
 * decide: extracted fields, the proposed income calculation, the conditions,
 * the underwriter brief, the borrower request, the clear-to-close, the
 * disclosure alerts and the HMDA fix proposals.
 *
 * Rules it enforces rather than trusts:
 *  - Every condition and every brief finding cites a page in this loan's file
 *    and a rule that applies to this loan's bank. A finding without both is
 *    withheld from the underwriter, never shown.
 *  - Agents propose; people decide. Setting conditions, sending the borrower
 *    request, clearing a credit condition and issuing the clear-to-close need a
 *    person in the right role and the approval that authorised it.
 *  - An agent may clear a condition only if it is documentary, its code is on
 *    the owning bank's clearing schedule, and the document it cites matches.
 *  - Government monitoring information never leaves this system.
 */
const router = Router();

const UNDERWRITER_ROLES = ["underwriter", "senior_underwriter"];
const LOAN_OFFICER_ROLES = ["loan_officer"];
const TIMINGS = new Set(["prior_to_doc", "prior_to_funding"]);

const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });

function loanOr404(id: unknown, res: Response): { l: LoanSeed; st: LoanState } | null {
  const l = getLoan(id);
  const st = stateOf(id);
  if (!l || !st) {
    res.status(404).json(envelope({ error: `No loan "${String(id ?? "")}".`, availableLoans: Object.keys(LOANS) }));
    return null;
  }
  return { l, st };
}

/** A decision must come from a person in an allowed role, under a named approval. */
function humanActor(b: Record<string, any>, res: Response, roles: string[]): { actorId: string; actorRole: string; approvalId: string } | null {
  const actorId = String(b.actorId || b.decidedBy || "").trim();
  const actorRole = String(b.actorRole || "").trim();
  const approvalId = String(b.approvalId || "").trim();
  if (!actorId || !actorRole) {
    res.status(422).json(envelope({ error: "A decision needs the person who made it: actorId and actorRole.", guidance: "Pass the identity recorded by the approval step, not a typed name." }));
    return null;
  }
  if (/agent|bot|assistant|copilot|orchestrator|automation/i.test(actorRole) || !roles.includes(actorRole)) {
    res.status(403).json(envelope({ error: `Role "${actorRole}" cannot make this decision.`, allowedRoles: roles, guidance: "Agents propose; only a named underwriter or loan officer decides, changes or communicates a credit decision." }));
    return null;
  }
  if (!approvalId) {
    res.status(422).json(envelope({ error: "approvalId is required.", guidance: "Name the approval that authorised this decision." }));
    return null;
  }
  return { actorId, actorRole, approvalId };
}

function citations(l: LoanSeed, st: LoanState, refs: unknown, rules: unknown) {
  const evidence = list(refs).map((r) => resolveCitation(l, st, r));
  const ruleRes = list(rules).map((r) => resolveRule(l, r));
  const problems = [
    ...evidence.filter((e): e is { error: string } => "error" in e).map((e) => e.error),
    ...ruleRes.filter((r): r is { error: string } => "error" in r).map((r) => r.error),
  ];
  const okEvidence = evidence.filter((e): e is Exclude<typeof e, { error: string }> => !("error" in e)).map((e) => e.ref);
  const okRules = ruleRes.filter((r): r is { ruleId: string } => !("error" in r)).map((r) => r.ruleId);
  if (!okEvidence.length) problems.push("No valid page citation: every finding must cite a document page.");
  if (!okRules.length) problems.push("No valid rule citation: every finding must cite a rule section that applies to this loan.");
  return { ok: problems.length === 0, problems, evidence: okEvidence, rules: okRules };
}

// ── Loans ────────────────────────────────────────────────────────────────────

router.get("/loans", (req, res) => {
  const bank = String(req.query.bankId ?? "").trim().toUpperCase();
  const rows = Object.values(LOANS).filter((l) => !bank || l.bankId === bank).map((l) => ({
    loanId: l.loanId, owningBank: BANKS[l.bankId].name, bankId: l.bankId, borrowers: l.borrowers.map((b) => b.name), loanAmount: l.loanAmount,
    program: l.program, purpose: l.purpose, status: stateOf(l.loanId)!.status, scheduledConsummation: l.scheduledConsummation, packageId: l.packageId,
  }));
  res.json(envelope({ loans: rows }));
});

router.get("/loan", (req, res) => {
  const x = loanOr404(req.query.loanId, res); if (!x) return;
  const { l, st } = x;
  const housing = Object.values(l.housingExpense).reduce((s, v) => s + v, 0);
  res.json(envelope({
    loan: publicLoan(l),
    derivedFromLos: {
      loanToValueBasis: "lesser of purchase price and appraised value",
      proposedMonthlyHousingExpense: money(housing),
    },
    status: st.status,
    conditionCounts: [...st.conditions.values()].reduce((acc: Record<string, number>, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {}),
    governmentMonitoringInformation: "Masked. Held only in the HMDA record and never available to decisioning.",
  }));
});

router.get("/condition-catalog", (req, res) => {
  const x = loanOr404(req.query.loanId, res); if (!x) return;
  const clearable = AGENT_CLEARABLE[x.l.bankId];
  res.json(envelope({
    loanId: x.l.loanId, owningBank: BANKS[x.l.bankId].name,
    conditionCodes: CONDITION_CATALOG.map((c) => ({ ...c, agentMayClear: clearable.includes(c.code) })),
    clearingSchedule: { bank: BANKS[x.l.bankId].name, agentClearableCodes: clearable, rule: "An agent may clear only these documentary codes, and only when the cited document matches. Every other condition goes to the underwriter." },
    timings: [...TIMINGS],
  }));
});

// ── What the agents produce ──────────────────────────────────────────────────

router.post("/extracted-fields", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];
  const conflicts = Array.isArray(req.body?.conflicts) ? req.body.conflicts : [];
  const rejected: Array<{ item: unknown; reason: string }> = [];
  let accepted = 0;
  for (const f of fields) {
    const c = resolveCitation(l, st, f?.evidenceRef);
    if (!f?.field || "error" in c) { rejected.push({ item: f, reason: !f?.field ? "field is required" : (c as any).error }); continue; }
    st.extractedFields.push({ field: String(f.field), value: f.value, borrower: f.borrower, evidenceRef: c.ref, at: now() });
    accepted++;
  }
  const recordedConflicts: string[] = [];
  for (const k of conflicts) {
    const refs = list(k?.evidenceRefs).map((r) => resolveCitation(l, st, r));
    const bad = refs.filter((r) => "error" in r);
    if (!k?.summary || !refs.length || bad.length) { rejected.push({ item: k, reason: !k?.summary ? "summary is required" : !refs.length ? "a conflict must cite the pages that disagree" : (bad[0] as any).error }); continue; }
    const conflictId = nextId("RCN");
    st.reconciliationConflicts.push({ conflictId, summary: String(k.summary), evidenceRefs: refs.map((r: any) => r.ref), at: now() });
    recordedConflicts.push(conflictId);
  }
  if (!accepted && !recordedConflicts.length) return res.status(422).json(envelope({ error: "Nothing recorded.", rejected }));
  logActivity(st, "agent", "extracted_fields_recorded", `${accepted} field(s), ${recordedConflicts.length} conflict(s)`);
  res.json(envelope({ loanId: l.loanId, fieldsRecorded: accepted, conflictsRecorded: recordedConflicts, rejected }));
});

router.post("/income-calculation", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const borrowers = Array.isArray(req.body?.borrowers) ? req.body.borrowers : [];
  const problems: string[] = [];
  const ids = new Set(l.borrowers.map((b) => b.borrowerId));
  const allRefs: string[] = []; const allRules: string[] = [];
  for (const b of borrowers) {
    if (!ids.has(String(b?.borrowerId))) problems.push(`Unknown borrowerId "${b?.borrowerId}"; this loan's borrowers are ${[...ids].join(", ")}.`);
    if (!Number.isFinite(Number(b?.monthlyAmount))) problems.push(`monthlyAmount for ${b?.borrowerId} must be a number.`);
    const c = citations(l, st, b?.evidenceRefs, b?.ruleRefs);
    if (!c.ok) problems.push(...c.problems.map((p) => `${b?.borrowerId}: ${p}`));
    allRefs.push(...c.evidence); allRules.push(...c.rules);
  }
  if (!borrowers.length) problems.push("borrowers is required: one entry per income stream.");
  const sum = money(borrowers.reduce((s: number, b: any) => s + (Number(b?.monthlyAmount) || 0), 0));
  const total = Number(req.body?.totalMonthlyQualifyingIncome);
  if (!Number.isFinite(total) || Math.abs(total - sum) > 0.01) problems.push(`totalMonthlyQualifyingIncome (${req.body?.totalMonthlyQualifyingIncome}) must equal the sum of the borrower amounts (${sum}).`);
  if (problems.length) return res.status(422).json(envelope({ error: "Income calculation not recorded.", problems }));
  const proposalId = nextId("INC");
  st.incomeProposals.push({ proposalId, at: now(), borrowers, totalMonthlyQualifyingIncome: sum, method: String(req.body?.method ?? ""), notes: String(req.body?.notes ?? ""), evidenceRefs: [...new Set(allRefs)], ruleRefs: [...new Set(allRules)] });
  logActivity(st, "agent", "income_proposed", `${proposalId}: ${sum}/month`);
  res.json(envelope({ loanId: l.loanId, proposalId, status: "proposed", totalMonthlyQualifyingIncome: sum, note: "Proposed only. The underwriter confirms qualifying income in the underwriter review." }));
});

router.post("/conditions/propose", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const items = Array.isArray(req.body?.conditions) ? req.body.conditions : [];
  if (!items.length) return res.status(422).json(envelope({ error: "conditions is required: a list of proposed conditions." }));
  const accepted: Condition[] = [];
  const rejected: Array<{ item: unknown; problems: string[] }> = [];
  for (const it of items) {
    const problems: string[] = [];
    const code = conditionCode(it?.code);
    if (!code) problems.push(`Unknown condition code "${it?.code}". Read get_condition_catalog.`);
    const timing = String(it?.timing ?? "").trim();
    if (!TIMINGS.has(timing)) problems.push(`timing must be prior_to_doc or prior_to_funding.`);
    if (!String(it?.description ?? "").trim()) problems.push("description is required.");
    if (!String(it?.borrowerRequest ?? "").trim()) problems.push("borrowerRequest is required: the plain-language request the loan officer will send.");
    const c = citations(l, st, it?.evidenceRefs, it?.ruleRefs);
    problems.push(...c.problems);
    if (code && [...st.conditions.values()].some((k) => k.code === code.code && ["proposed", "open", "routed_to_underwriter"].includes(k.status))) problems.push(`A ${code.code} condition is already pending on this loan.`);
    if (problems.length) { rejected.push({ item: it, problems }); continue; }
    const cond: Condition = {
      conditionId: nextId("COND"), code: code!.code, conditionClass: code!.conditionClass, timing: timing as Condition["timing"], status: "proposed",
      description: String(it.description), borrowerRequest: String(it.borrowerRequest), evidenceRefs: c.evidence, ruleRefs: c.rules,
      proposedBy: String(req.body?.proposedBy ?? "agent"), events: [{ type: "proposed", actorId: String(req.body?.proposedBy ?? "agent"), at: now() }],
    };
    st.conditions.set(cond.conditionId, cond);
    accepted.push(cond);
  }
  if (!accepted.length) return res.status(422).json(envelope({ error: "No condition recorded: every proposal was missing a citation or was invalid.", rejected }));
  st.status = "in_underwriting";
  logActivity(st, "agent", "conditions_proposed", accepted.map((c) => `${c.conditionId} ${c.code}`).join(", "));
  res.json(envelope({ loanId: l.loanId, proposed: accepted, rejected }));
});

router.get("/conditions", (req, res) => {
  const x = loanOr404(req.query.loanId, res); if (!x) return;
  const status = String(req.query.status ?? "").trim();
  const rows = [...x.st.conditions.values()].filter((c) => !status || c.status === status);
  res.json(envelope({ loanId: x.l.loanId, conditions: rows, openPriorToDoc: rows.filter((c) => c.timing === "prior_to_doc" && ["open", "routed_to_underwriter"].includes(c.status)).map((c) => c.conditionId) }));
});

router.post("/brief", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const findings = Array.isArray(req.body?.findings) ? req.body.findings : [];
  if (!String(req.body?.summary ?? "").trim()) return res.status(422).json(envelope({ error: "summary is required." }));
  const shown: unknown[] = []; const withheld: unknown[] = [];
  for (const f of findings) {
    const c = citations(l, st, f?.evidenceRefs, f?.ruleRefs);
    if (!String(f?.title ?? f?.summary ?? "").trim()) { withheld.push({ finding: f, reasons: ["A finding needs a title."] }); continue; }
    if (c.ok) shown.push({ ...f, evidenceRefs: c.evidence, ruleRefs: c.rules });
    else withheld.push({ finding: f, reasons: c.problems });
  }
  const proposedConditionIds = list(req.body?.proposedConditionIds).filter((id) => st.conditions.has(id));
  const version = st.briefs.length + 1;
  st.briefs.push({ version, at: now(), summary: String(req.body.summary), findings: shown, withheld, proposedConditionIds, draftedBy: String(req.body?.draftedBy ?? "agent") });
  logActivity(st, "agent", "brief_saved", `version ${version}: ${shown.length} finding(s) shown, ${withheld.length} withheld`);
  res.json(envelope({ loanId: l.loanId, version, findingsShown: shown.length, findingsWithheld: withheld, note: withheld.length ? "Withheld findings are not shown to the underwriter: each lacked a valid page or rule citation." : undefined }));
});

router.get("/brief", (req, res) => {
  const x = loanOr404(req.query.loanId, res); if (!x) return;
  const b = x.st.briefs.at(-1);
  if (!b) return res.status(404).json(envelope({ error: `No brief has been saved for ${x.l.loanId}.` }));
  const { withheld, ...visible } = b;
  res.json(envelope({ loanId: x.l.loanId, brief: { ...visible, withheldCount: withheld.length }, conditions: b.proposedConditionIds.map((id) => x.st.conditions.get(id)).filter(Boolean) }));
});

// ── What people decide ───────────────────────────────────────────────────────

router.post("/underwriter-review", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const who = humanActor(req.body ?? {}, res, UNDERWRITER_ROLES); if (!who) return;
  const proposed = [...st.conditions.values()].filter((c) => c.status === "proposed");
  const rejectIds = new Set(list(req.body?.rejectedConditionIds));
  const acceptIds = req.body?.acceptedConditionIds !== undefined ? new Set(list(req.body.acceptedConditionIds)) : new Set(proposed.map((c) => c.conditionId).filter((id) => !rejectIds.has(id)));
  const unknown = [...acceptIds, ...rejectIds].filter((id) => !st.conditions.has(id));
  if (unknown.length) return res.status(422).json(envelope({ error: `Unknown condition id(s): ${unknown.join(", ")}.` }));
  for (const c of proposed) {
    const accept = acceptIds.has(c.conditionId) && !rejectIds.has(c.conditionId);
    c.status = accept ? "open" : "rejected";
    c.events.push({ type: accept ? "set_by_underwriter" : "rejected_by_underwriter", actorId: who.actorId, actorRole: who.actorRole, approvalId: who.approvalId, at: now(), rationale: req.body?.notes });
  }
  const income = req.body?.confirmedMonthlyQualifyingIncome;
  st.underwriterReview = {
    at: now(), underwriter: who.actorId, approvalId: who.approvalId,
    confirmedMonthlyQualifyingIncome: income === undefined || income === null || income === "" ? null : Number(income),
    acceptedConditionIds: proposed.filter((c) => c.status === "open").map((c) => c.conditionId),
    rejectedConditionIds: proposed.filter((c) => c.status === "rejected").map((c) => c.conditionId), notes: String(req.body?.notes ?? ""),
  };
  st.status = "conditions_set";
  logActivity(st, who.actorId, "underwriter_review", `${st.underwriterReview.acceptedConditionIds.length} condition(s) set, ${st.underwriterReview.rejectedConditionIds.length} rejected`);
  res.json(envelope({ loanId: l.loanId, review: st.underwriterReview, openConditions: [...st.conditions.values()].filter((c) => c.status === "open").map((c) => ({ conditionId: c.conditionId, code: c.code, conditionClass: c.conditionClass, timing: c.timing })) }));
});

/** The borrower's reply, in fixture mode: one upload per document the request asks for. */
function borrowerReply(l: LoanSeed, st: LoanState, conds: Condition[], requestNo: number): { uploads: Upload[]; notSupplied: Array<{ conditionId: string; reason: string }> } {
  const n = l.packageId.slice(-5);
  const bank = BANKS[l.bankId];
  const f = l.replyFacts as Record<string, any>;
  const addr = `${l.property.address}, ${l.property.city} ${l.property.state} ${l.property.zip}`;
  const names = l.borrowers.map((b) => b.name).join(" and ");
  const uploads: Upload[] = []; const notSupplied: Array<{ conditionId: string; reason: string }> = [];
  const at = now();
  const up = (kind: string, title: string, respondsTo: string, pages: string[], facts: Record<string, unknown>) => uploads.push({
    documentId: `DOC-${n}-R${requestNo}-${String(uploads.length + 1).padStart(2, "0")}`, kind, title, receivedAt: at, respondsTo: [respondsTo], pages: pages.map((text, i) => ({ page: i + 1, text })), facts,
  });
  for (const c of conds) {
    switch (c.code) {
      case "INCOME_VERIFICATION": {
        const b = l.borrowers.find((x) => x.employment.type === "salaried")!;
        up("written_voe", `Written verification of employment -- ${b.name}`, c.conditionId, [
          `REQUEST FOR VERIFICATION OF EMPLOYMENT (Fannie Mae Form 1005) -- completed by employer\nEmployer: ${b.employment.employer}   Employee: ${b.name}   Position: ${b.employment.position}   Hire date: ${b.employment.startDate}\nCurrent base pay: ${f.salaryText}\nProbability of continued employment: excellent\n${f.unpaidLeave ? `Remarks: Employee was on approved unpaid family leave ${f.unpaidLeave} (four pay periods without pay) and returned to full-time duties on 2026-06-01 at the same salary. No further leave is scheduled.` : "Remarks: none"}\nCompleted by: HR Director, ${new Date().toISOString().slice(0, 10)}`,
        ], { kind: "written_voe" });
        if (f.unpaidLeave) up("borrower_explanation", `Letter of explanation -- year-to-date earnings (${b.name})`, c.conditionId, [
          `To ${bank.name}: My 2026 year-to-date pay is lower than my salary because I took unpaid family leave from April 6 to May 29, 2026 to care for my father after surgery. I returned to my full-time position on June 1 and my salary is unchanged. -- ${b.name}`,
        ], { kind: "borrower_explanation" });
        break;
      }
      case "INCOME_SELF_EMPLOYED": {
        const b = l.borrowers.find((x) => x.employment.type === "self_employed");
        if (!b) { notSupplied.push({ conditionId: c.conditionId, reason: "No borrower on this loan is self-employed." }); break; }
        up("ytd_profit_and_loss", `Year-to-date profit and loss -- ${b.employment.employer}`, c.conditionId, [
          `ROURKE DESIGN STUDIO -- Profit and loss, January 1 to September 30, 2026 (unaudited, signed by the owner)\nGross receipts 104,600.00   Total expenses 66,700.00 (includes depreciation 3,100.00)   Net profit ${(f.ytdPnlNet ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}\nSigned: Erin M. Rourke, 2026-10-20`,
          `Nauset Tax & Accounting -- CPA letter: Rourke Design Studio has operated continuously since May 2017 under Erin M. Rourke's 100% ownership. The use of business funds for the down payment would not affect operations.`,
        ], { kind: "ytd_profit_and_loss" });
        break;
      }
      case "ASSET_SOURCING": {
        if (f.giftAmount) {
          up("gift_letter", `Gift letter -- ${f.donor}`, c.conditionId, [
            `GIFT LETTER\nI, ${f.donor} (${f.donorRelationship}), have given a gift of $${Number(f.giftAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })} to ${names} toward the purchase of ${addr}. No repayment is expected or implied. The funds were given by my personal check #1047 dated ${f.giftDate}.\nSigned: ${f.donor}, 2026-10-20   Donor address: 5 Main Street, Sandwich MA 02563`,
          ], { kind: "gift_letter", amount: f.giftAmount });
          up("donor_bank_statement", `Donor's bank statement showing the gift check`, c.conditionId, [
            `Sandwich Cooperative Bank -- statement for Margaret A. Rourke, checking ****0915, 08/01/2026 - 08/31/2026\n08/17 CHECK #1047 PAID  -18,500.00   (payee: Daniel J. Rourke)\nEnding balance 212,406.77`,
          ], { kind: "donor_bank_statement", amount: f.giftAmount });
        } else {
          up("asset_source_statement", "Statement of the account the transfer came from", c.conditionId, [
            `Statement for the borrower's own savings account XXXXXX8812 at Workers Credit Union, 08/01/2026 - 08/31/2026\n08/20 ONLINE TRANSFER TO ${bank.name.toUpperCase()} -5,600.00   Ending balance 24,180.55`,
          ], { kind: "asset_source_statement" });
        }
        break;
      }
      case "LIABILITY_EXPLANATION":
      case "CREDIT_EXPLANATION":
        up("borrower_explanation", "Borrower letter of explanation", c.conditionId, [`To ${bank.name}: in answer to your request (${c.description}) -- the information on our credit report is accurate and complete; we have not opened or applied for any other credit. -- ${names}`], { kind: "borrower_explanation" });
        break;
      case "FLOOD_INS_EVIDENCE":
        if (!l.property.specialFloodHazardArea) { notSupplied.push({ conditionId: c.conditionId, reason: "The property is not in a special flood hazard area; the borrower has no flood policy to send." }); break; }
        up("flood_insurance_declarations", "Flood insurance declarations page", c.conditionId, [
          `NATIONAL FLOOD INSURANCE PROGRAM -- FLOOD POLICY DECLARATIONS   Atlantic Shore Flood Insurance (WYO)   Policy FLD-${n}-26\nInsured: ${names}   Property: ${addr}   Zone AE   Policy term ${l.scheduledConsummation} to 2027-${l.scheduledConsummation.slice(5)}\nBuilding coverage $250,000   Contents coverage $50,000   Annual premium $1,416.00\nFirst mortgagee: ${bank.legalName} ISAOA/ATIMA, loan ${l.loanId}`,
        ], { kind: "flood_insurance_declarations", address: addr, mortgagee: bank.legalName, buildingCoverage: 250000, effective: l.scheduledConsummation });
        break;
      case "HAZARD_INS_EVIDENCE":
        up("hazard_insurance_declarations", "Homeowner's insurance declarations page", c.conditionId, [
          `HOMEOWNERS POLICY DECLARATIONS (HO-3)   Plymouth Rock Assurance   Policy HO-${n}-26\nNamed insureds: ${names}   Residence premises: ${addr}   Policy period ${l.scheduledConsummation} to 2027-${l.scheduledConsummation.slice(5)}\nCoverage A Dwelling $${(f.replacementCost ?? l.loanAmount).toLocaleString("en-US")} (100% replacement cost)   Deductible $2,500   Annual premium $1,740.00\nMortgagee: ${bank.legalName} ISAOA/ATIMA, loan ${l.loanId}`,
        ], { kind: "hazard_insurance_declarations", address: addr, mortgagee: bank.legalName, dwellingCoverage: f.replacementCost ?? l.loanAmount, replacementCost: f.replacementCost ?? l.loanAmount, effective: l.scheduledConsummation });
        break;
      case "SIGNED_4506C":
        up("signed_4506c", "IRS Form 4506-C, signed", c.conditionId, [
          `IRS Form 4506-C IVES Request for Transcript of Tax Return   IVES participant: ${bank.legalName}\nTaxpayers: ${names}   Tax years 2024, 2025\n${l.borrowers.map((b) => `Signature: /s/ ${b.name}  Date: 2026-10-20`).join("\n")}  (SIGNED)`,
        ], { kind: "signed_4506c", signedBy: l.borrowers.map((b) => b.name) });
        break;
      case "PURCHASE_CONTRACT_ADDENDUM":
        up("purchase_addendum", "Addendum to the purchase and sale agreement", c.conditionId, [`ADDENDUM 1 to the purchase and sale agreement for ${addr}: mortgage commitment date extended to 2026-11-06. Signed by all buyers and sellers 2026-10-20.`], { kind: "purchase_addendum", executed: true, address: addr });
        break;
      default:
        notSupplied.push({ conditionId: c.conditionId, reason: `${c.code} is not a borrower document; it is resolved by the underwriter.` });
    }
  }
  return { uploads, notSupplied };
}

router.post("/borrower-request", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const who = humanActor(req.body ?? {}, res, LOAN_OFFICER_ROLES); if (!who) return;
  const named = list(req.body?.conditionIds);
  const open = [...st.conditions.values()].filter((c) => c.status === "open");
  const conds = named.length ? named.map((id) => st.conditions.get(id)).filter((c): c is Condition => !!c && c.status === "open") : open;
  if (!conds.length) return res.status(422).json(envelope({ error: "No open condition to request documents for.", guidance: "The underwriter sets conditions before the loan officer requests documents.", openConditions: open.map((c) => c.conditionId) }));
  const requestNo = st.borrowerRequests.length + 1;
  const requestId = nextId("BRQ");
  st.borrowerRequests.push({ requestId, at: now(), sentBy: who.actorId, approvalId: who.approvalId, conditionIds: conds.map((c) => c.conditionId), message: String(req.body?.message ?? "") });
  const { uploads, notSupplied } = borrowerReply(l, st, conds, requestNo);
  st.uploads.push(...uploads);
  st.status = "documents_requested";
  for (const c of conds) c.events.push({ type: "requested_from_borrower", actorId: who.actorId, actorRole: who.actorRole, approvalId: who.approvalId, at: now() });
  logActivity(st, who.actorId, "borrower_request_sent", `${requestId}: ${conds.length} condition(s); ${uploads.length} document(s) received in reply`);
  res.json(envelope({
    loanId: l.loanId, requestId, sentBy: who.actorId, conditionIds: conds.map((c) => c.conditionId),
    documentsReceived: uploads.map((u) => ({ documentId: u.documentId, kind: u.kind, title: u.title, respondsTo: u.respondsTo, pageCount: u.pages.length })), notSupplied,
    note: "Fixture mode: the borrower's reply is added to the document repository at once. Nothing has been cleared; match each document to its condition.",
  }));
});

function documentaryMatch(l: LoanSeed, c: Condition, u: Upload): string[] {
  const bank = BANKS[l.bankId];
  const addr = `${l.property.address}, ${l.property.city} ${l.property.state} ${l.property.zip}`;
  const f = u.facts as Record<string, any>;
  const p: string[] = [];
  const want: Record<string, string> = { FLOOD_INS_EVIDENCE: "flood_insurance_declarations", HAZARD_INS_EVIDENCE: "hazard_insurance_declarations", SIGNED_4506C: "signed_4506c", PURCHASE_CONTRACT_ADDENDUM: "purchase_addendum" };
  if (f.kind !== want[c.code]) return [`${u.documentId} is a ${f.kind}; ${c.code} needs a ${want[c.code]}.`];
  if (f.address !== undefined && f.address !== addr) p.push(`${u.documentId} names ${f.address}, not the subject property ${addr}.`);
  if (f.mortgagee !== undefined && f.mortgagee !== bank.legalName) p.push(`${u.documentId} names ${f.mortgagee} as mortgagee; the owning bank is ${bank.legalName}.`);
  if (c.code === "FLOOD_INS_EVIDENCE" && Number(f.buildingCoverage) < Math.min(l.loanAmount, 250000)) p.push(`Building coverage ${f.buildingCoverage} is below the lesser of the loan amount and the NFIP maximum.`);
  if (c.code === "HAZARD_INS_EVIDENCE" && Number(f.dwellingCoverage) < Math.min(l.loanAmount, Number(f.replacementCost))) p.push(`Dwelling coverage ${f.dwellingCoverage} is below the lesser of replacement cost and the loan amount.`);
  if (c.code === "SIGNED_4506C" && l.borrowers.some((b) => !(f.signedBy ?? []).includes(b.name))) p.push("Form 4506-C is not signed by every borrower.");
  if (c.code === "PURCHASE_CONTRACT_ADDENDUM" && !f.executed) p.push("The addendum is not executed.");
  return p;
}

router.post("/conditions/clear-documentary", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const c = st.conditions.get(String(req.body?.conditionId ?? "").trim());
  if (!c) return res.status(404).json(envelope({ error: `No condition "${req.body?.conditionId}" on ${l.loanId}.` }));
  if (c.status !== "open") return res.status(409).json(envelope({ error: `${c.conditionId} is ${c.status}; only an open condition set by the underwriter can be cleared.` }));
  if (c.conditionClass === "credit") {
    return res.status(403).json(envelope({ error: `${c.conditionId} (${c.code}) is a credit condition. Clearing it is a credit decision and is outside any agent's clearing authority.`, requiredAction: "Route it to the underwriter with route_condition_to_underwriter, citing the documents received." }));
  }
  if (!AGENT_CLEARABLE[l.bankId].includes(c.code)) {
    return res.status(403).json(envelope({ error: `${c.code} is not on ${BANKS[l.bankId].name}'s clearing schedule for agents.`, agentClearableCodes: AGENT_CLEARABLE[l.bankId], requiredAction: "Route it to the underwriter." }));
  }
  const refs = list(req.body?.evidenceRefs ?? req.body?.documentId);
  const docIds = [...new Set(refs.map((r) => r.split(":")[0].trim().toUpperCase()))];
  const docs = docIds.map((id) => st.uploads.find((u) => u.documentId === id)).filter((u): u is Upload => !!u);
  if (!docs.length) return res.status(422).json(envelope({ error: "Cite the received document that satisfies the condition (evidenceRefs: [\"DOC-...:p1\"]).", receivedDocuments: st.uploads.map((u) => ({ documentId: u.documentId, kind: u.kind })) }));
  const results = docs.map((u) => ({ documentId: u.documentId, problems: documentaryMatch(l, c, u) }));
  const match = results.find((r) => !r.problems.length);
  if (!match) return res.status(422).json(envelope({ error: `No cited document satisfies ${c.conditionId} (${c.code}). It stays open.`, results }));
  const actorId = String(req.body?.actorId ?? "agent");
  c.status = "cleared";
  c.events.push({ type: "cleared_documentary", actorId, at: now(), documentRefs: [`${match.documentId}:p1`], rationale: String(req.body?.rationale ?? "") });
  logActivity(st, actorId, "condition_cleared", `${c.conditionId} ${c.code} with ${match.documentId}`);
  res.json(envelope({ loanId: l.loanId, conditionId: c.conditionId, code: c.code, status: c.status, clearedWith: match.documentId, authority: `${BANKS[l.bankId].name} clearing schedule (documentary)` }));
});

router.post("/conditions/route", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const c = st.conditions.get(String(req.body?.conditionId ?? "").trim());
  if (!c) return res.status(404).json(envelope({ error: `No condition "${req.body?.conditionId}" on ${l.loanId}.` }));
  if (!["open", "routed_to_underwriter"].includes(c.status)) return res.status(409).json(envelope({ error: `${c.conditionId} is ${c.status}; nothing to route.` }));
  if (!String(req.body?.reason ?? "").trim()) return res.status(422).json(envelope({ error: "reason is required: why this goes to the underwriter, and what the received documents show." }));
  const refs = list(req.body?.documentRefs).map((r) => resolveCitation(l, st, r));
  const bad = refs.filter((r) => "error" in r);
  if (bad.length) return res.status(422).json(envelope({ error: (bad[0] as any).error }));
  c.status = "routed_to_underwriter";
  c.events.push({ type: "routed_to_underwriter", actorId: String(req.body?.actorId ?? "agent"), at: now(), rationale: String(req.body.reason), documentRefs: refs.map((r: any) => r.ref) });
  logActivity(st, "agent", "condition_routed", `${c.conditionId} ${c.code}`);
  res.json(envelope({ loanId: l.loanId, conditionId: c.conditionId, code: c.code, status: c.status }));
});

router.post("/conditions/underwriter-decision", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const who = humanActor(req.body ?? {}, res, UNDERWRITER_ROLES); if (!who) return;
  const decision = String(req.body?.decision ?? "").trim();
  if (!["clear", "waive"].includes(decision)) return res.status(422).json(envelope({ error: "decision must be clear or waive." }));
  if (!String(req.body?.rationale ?? "").trim()) return res.status(422).json(envelope({ error: "rationale is required." }));
  const ids = list(req.body?.conditionIds);
  const targets = ids.length === 1 && ids[0] === "all_routed"
    ? [...st.conditions.values()].filter((c) => c.status === "routed_to_underwriter")
    : ids.map((id) => st.conditions.get(id)).filter((c): c is Condition => !!c);
  if (!targets.length) return res.status(422).json(envelope({ error: "No condition named.", routed: [...st.conditions.values()].filter((c) => c.status === "routed_to_underwriter").map((c) => c.conditionId) }));
  const notActionable = targets.filter((c) => !["open", "routed_to_underwriter"].includes(c.status));
  if (notActionable.length) return res.status(409).json(envelope({ error: `Not open: ${notActionable.map((c) => `${c.conditionId} (${c.status})`).join(", ")}.` }));
  for (const c of targets) {
    c.status = decision === "clear" ? "cleared" : "waived";
    c.events.push({ type: decision === "clear" ? "cleared_by_underwriter" : "waived_by_underwriter", actorId: who.actorId, actorRole: who.actorRole, approvalId: who.approvalId, at: now(), rationale: String(req.body.rationale) });
  }
  logActivity(st, who.actorId, `conditions_${decision === "clear" ? "cleared" : "waived"}`, targets.map((c) => c.conditionId).join(", "));
  res.json(envelope({ loanId: l.loanId, decided: targets.map((c) => ({ conditionId: c.conditionId, code: c.code, status: c.status })) }));
});

router.post("/clear-to-close", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const who = humanActor(req.body ?? {}, res, UNDERWRITER_ROLES); if (!who) return;
  const gaps: string[] = [];
  if (!st.underwriterReview) gaps.push("The underwriter has not reviewed the file and set conditions.");
  const all = [...st.conditions.values()];
  const pending = all.filter((c) => c.status === "proposed");
  if (pending.length) gaps.push(`Proposed conditions not yet decided: ${pending.map((c) => c.conditionId).join(", ")}.`);
  const openPtd = all.filter((c) => c.timing === "prior_to_doc" && ["open", "routed_to_underwriter"].includes(c.status));
  if (openPtd.length) gaps.push(`Prior-to-doc conditions still open: ${openPtd.map((c) => `${c.conditionId} ${c.code} (${c.status})`).join(", ")}.`);
  if (gaps.length) return res.status(422).json(envelope({ error: "Not clear to close.", gaps }));
  const openPtf = all.filter((c) => c.timing === "prior_to_funding" && ["open", "routed_to_underwriter"].includes(c.status)).map((c) => c.conditionId);
  st.clearToClose = { at: now(), underwriter: who.actorId, approvalId: who.approvalId, openPriorToFunding: openPtf };
  st.status = "clear_to_close";
  logActivity(st, who.actorId, "clear_to_close_issued", openPtf.length ? `open prior-to-funding: ${openPtf.join(", ")}` : "no open conditions");
  res.json(envelope({ loanId: l.loanId, status: st.status, clearToClose: st.clearToClose }));
});

// ── Disclosures and HMDA ─────────────────────────────────────────────────────

router.get("/disclosures", (req, res) => {
  const x = loanOr404(req.query.loanId, res); if (!x) return;
  res.json(envelope({ loanId: x.l.loanId, owningBank: BANKS[x.l.bankId].name, events: x.l.disclosureEvents, alerts: x.st.disclosureAlerts, today: now().slice(0, 10), calendarSource: "get_business_day_calendar in the guidelines library" }));
});

router.post("/disclosure-alert", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const { l, st } = x;
  const severity = String(req.body?.severity ?? "").trim();
  const deadline = String(req.body?.deadline ?? "").trim();
  if (!["info", "warning", "critical"].includes(severity)) return res.status(422).json(envelope({ error: "severity must be info, warning or critical." }));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return res.status(422).json(envelope({ error: "deadline must be YYYY-MM-DD." }));
  if (!String(req.body?.summary ?? "").trim() || !String(req.body?.basis ?? "").trim()) return res.status(422).json(envelope({ error: "summary and basis (the rule and the business-day count) are required." }));
  const alertId = nextId("DAL");
  st.disclosureAlerts.push({ alertId, at: now(), severity, deadline, summary: String(req.body.summary), basis: String(req.body.basis) });
  logActivity(st, "agent", "disclosure_alert", `${alertId} ${severity} ${deadline}`);
  res.json(envelope({ loanId: l.loanId, alertId, note: "Alert recorded for the loan officer and processor. No disclosure was sent or changed." }));
});

router.get("/hmda", (req, res) => {
  const x = loanOr404(req.query.loanId, res); if (!x) return;
  const { l } = x;
  res.json(envelope({
    loanId: l.loanId, hmdaRecord: l.hmda,
    demographicInformation: Object.fromEntries(Object.keys(l.gmi).map((bid) => [bid, { race: { collected: true, codeValid: true }, ethnicity: { collected: true, codeValid: true }, sex: { collected: true, codeValid: true } }])),
    masking: "Demographic values are masked from every agent. The edit checks here need only whether each field was collected with a valid code.",
  }));
});

router.post("/hmda/proposed-fixes", (req, res) => {
  const x = loanOr404(req.body?.loanId, res); if (!x) return;
  const fixes = Array.isArray(req.body?.fixes) ? req.body.fixes : [];
  const bad = fixes.filter((f: any) => !f?.field || f?.proposedValue === undefined || !String(f?.basis ?? "").trim());
  if (!fixes.length || bad.length) return res.status(422).json(envelope({ error: "Each fix needs field, proposedValue and basis.", invalid: bad }));
  const proposalId = nextId("HMF");
  x.st.hmdaFixProposals.push({ proposalId, at: now(), fixes });
  logActivity(x.st, "agent", "hmda_fixes_proposed", `${proposalId}: ${fixes.map((f: any) => f.field).join(", ")}`);
  res.json(envelope({ loanId: x.l.loanId, proposalId, status: "proposed", note: "The HMDA record is unchanged. A person applies the fix." }));
});

router.get("/activity", (req, res) => {
  const x = loanOr404(req.query.loanId, res); if (!x) return;
  res.json(envelope({ loanId: x.l.loanId, activity: x.st.activity, incomeProposals: x.st.incomeProposals, extractedFieldCount: x.st.extractedFields.length, reconciliationConflicts: x.st.reconciliationConflicts, hmdaFixProposals: x.st.hmdaFixProposals, borrowerRequests: x.st.borrowerRequests, clearToClose: x.st.clearToClose }));
});

router.post("/reset", (_req, res) => { resetMortgageState(); res.json({ reset: true, scope: "all three Mutual Bancorp mortgage fixture systems", resetAt: now(), mode: MODE }); });

export default router;
