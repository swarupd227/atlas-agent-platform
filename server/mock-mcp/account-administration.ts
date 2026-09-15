import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";

/**
 * Simulated commercial account administration system -- the system of record
 * for client accounts that policies, quotes and clearance hang off.
 *
 * Without one, account journeys had nothing to search or write: agents
 * reported "no duplicates found" having searched nothing, and invented account
 * ids (and once an existing-account match) that no system ever issued. With
 * it, a search returns real candidates, a create returns a real id or refuses
 * a duplicate, and linking a quote reports what still blocks issuance.
 *
 * Vendor-neutral and deterministic: a small seeded book covers the cases that
 * matter (same name with different identifiers, a normalised-name match, an
 * account another producer is actively quoting, a business-reason block), and
 * created accounts get an id derived from the normalised name, so repeated
 * demo and eval runs see the same ids. State lives in memory and resets on
 * restart; that is fine for a simulator.
 */

const router = Router();

interface Account {
  accountId: string;
  legalName: string;
  address: string;
  identifiers: { fein?: string; duns?: string; registrationNumber?: string };
  agentOfRecord: { producerCode: string; producerName: string; activeQuote: boolean };
  clearance: { status: "cleared" | "pending" | "referred" | "blocked" | "not_screened"; decidedOn: string | null; screeningId: string | null };
  blocks: Array<{ type: "business_reason" | "legal"; reason: string; owner: string; setOn: string }>;
  linkedPolicies: Array<{ policyNumber: string; lineOfBusiness: string; status: "in_force" | "quoted" | "expired"; effectiveDate: string }>;
  insureds: string[];
  createdAt: string;
  createdBy: string;
  auditTrail: Array<{ auditId: string; action: string; actor: string; at: string; details: Record<string, unknown> }>;
}

const SEED: Account[] = [
  {
    accountId: "ACCT-100417",
    legalName: "Summit Logistics LLC",
    address: "400 Harbor Way, Oakland, CA 94607",
    identifiers: { fein: "94-2210987", duns: "08-443-1192" },
    agentOfRecord: { producerCode: "HCB-014", producerName: "Harbor Commercial Brokers", activeQuote: false },
    clearance: { status: "cleared", decidedOn: "2026-06-02", screeningId: "SCR-310442" },
    blocks: [],
    linkedPolicies: [
      { policyNumber: "CPP-2026-004417", lineOfBusiness: "Commercial Property", status: "in_force", effectiveDate: "2026-06-15" },
      { policyNumber: "GL-2026-004418", lineOfBusiness: "General Liability", status: "in_force", effectiveDate: "2026-06-15" },
    ],
    insureds: ["Summit Logistics LLC"],
    createdAt: "2021-03-09T15:12:00Z",
    createdBy: "system-migration",
    auditTrail: [],
  },
  {
    accountId: "ACCT-100522",
    legalName: "Summit Logistics Inc.",
    address: "77 Industrial Pkwy, Memphis, TN 38118",
    identifiers: { fein: "62-1188345", duns: "11-980-2214" },
    agentOfRecord: { producerCode: "MSB-201", producerName: "Mid-South Brokerage", activeQuote: false },
    clearance: { status: "cleared", decidedOn: "2026-02-19", screeningId: "SCR-288105" },
    blocks: [],
    linkedPolicies: [{ policyNumber: "CA-2026-002290", lineOfBusiness: "Commercial Auto", status: "in_force", effectiveDate: "2026-03-01" }],
    insureds: ["Summit Logistics Inc."],
    createdAt: "2022-08-22T10:40:00Z",
    createdBy: "system-migration",
    auditTrail: [],
  },
  {
    accountId: "ACCT-100733",
    legalName: "Brightwater Dairy Company",
    address: "88 Creamery Ln, Tulare, CA 93274",
    identifiers: { fein: "77-2093114", duns: "05-118-6620" },
    agentOfRecord: { producerCode: "HCB-014", producerName: "Harbor Commercial Brokers", activeQuote: false },
    clearance: { status: "cleared", decidedOn: "2026-07-11", screeningId: "SCR-402318" },
    blocks: [],
    linkedPolicies: [
      { policyNumber: "CPP-2026-007331", lineOfBusiness: "Commercial Property", status: "in_force", effectiveDate: "2026-08-01" },
      { policyNumber: "GL-2026-007332", lineOfBusiness: "General Liability", status: "in_force", effectiveDate: "2026-08-01" },
      { policyNumber: "WC-2026-007333", lineOfBusiness: "Workers Compensation", status: "in_force", effectiveDate: "2026-08-01" },
    ],
    insureds: ["Brightwater Dairy Company", "Brightwater Creamery Transport LLC", "Tulare Valley Feed Co"],
    createdAt: "2019-05-14T09:05:00Z",
    createdBy: "system-migration",
    auditTrail: [],
  },
  {
    accountId: "ACCT-100858",
    legalName: "Kestrel Foods Inc",
    address: "2250 Orchard Rd, Fresno, CA 93722",
    identifiers: { fein: "46-3371905" },
    agentOfRecord: { producerCode: "PSG-330", producerName: "Pacific Surety Group", activeQuote: true },
    clearance: { status: "cleared", decidedOn: "2026-08-21", screeningId: "SCR-418870" },
    blocks: [],
    linkedPolicies: [{ policyNumber: "Q-2026-118204", lineOfBusiness: "Commercial Package", status: "quoted", effectiveDate: "2026-10-01" }],
    insureds: ["Kestrel Foods Inc"],
    createdAt: "2026-08-20T16:30:00Z",
    createdBy: "PSG-330",
    auditTrail: [],
  },
  {
    accountId: "ACCT-101004",
    legalName: "Acme Corp",
    address: "12 Mill Rd, Dayton, OH 45402",
    identifiers: { fein: "31-0998211" },
    agentOfRecord: { producerCode: "HCB-014", producerName: "Harbor Commercial Brokers", activeQuote: false },
    clearance: { status: "cleared", decidedOn: "2026-04-03", screeningId: "SCR-352671" },
    blocks: [],
    linkedPolicies: [{ policyNumber: "GL-2026-010041", lineOfBusiness: "General Liability", status: "in_force", effectiveDate: "2026-04-10" }],
    insureds: ["Acme Corp"],
    createdAt: "2020-01-28T11:00:00Z",
    createdBy: "system-migration",
    auditTrail: [],
  },
  {
    accountId: "ACCT-101233",
    legalName: "Granite Ridge Contractors LLC",
    address: "915 Quarry Ave, Reno, NV 89502",
    identifiers: { fein: "88-4102276", duns: "07-332-9014" },
    agentOfRecord: { producerCode: "HCB-014", producerName: "Harbor Commercial Brokers", activeQuote: false },
    clearance: { status: "blocked", decidedOn: "2025-01-17", screeningId: "SCR-201553" },
    blocks: [{ type: "business_reason", reason: "Prior non-payment: two cancellations for non-payment in 2024", owner: "Credit & Collections", setOn: "2025-01-17" }],
    linkedPolicies: [{ policyNumber: "GL-2024-012330", lineOfBusiness: "General Liability", status: "expired", effectiveDate: "2024-02-01" }],
    insureds: ["Granite Ridge Contractors LLC"],
    createdAt: "2018-11-02T13:20:00Z",
    createdBy: "system-migration",
    auditTrail: [],
  },
];

const accounts = new Map<string, Account>(SEED.map((a) => [a.accountId, structuredClone(a)]));

function normaliseName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[.,'"()&]/g, " ")
    .replace(/\b(incorporated|inc|corporation|corp|company|co|limited|ltd|llc|llp|plc)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ADDRESS_WORDS: Record<string, string> = { street: "st", lane: "ln", road: "rd", avenue: "ave", parkway: "pkwy", drive: "dr", boulevard: "blvd", suite: "ste" };
function normaliseAddress(address: string): string {
  return String(address || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ADDRESS_WORDS[w] || w)
    .join(" ")
    .replace(/\b\d{5}(-\d{4})?\b/g, "")
    .trim();
}

const digits = (v?: string) => String(v || "").replace(/\D/g, "");

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach((t) => { if (tb.has(t)) shared++; });
  return shared / new Set([...Array.from(ta), ...Array.from(tb)]).size;
}

function now() { return new Date().toISOString(); }
function auditId(seed: string) { return `AUD-${createHash("sha256").update(seed + now()).digest("hex").slice(0, 10).toUpperCase()}`; }

/**
 * An account another producer is actively quoting is invisible to everyone
 * else: not in results, not in counts, not in errors. Knowing that it exists
 * is itself the leak.
 */
function visibleTo(account: Account, producerCode: string | undefined): boolean {
  if (!account.agentOfRecord.activeQuote) return true;
  return !!producerCode && producerCode === account.agentOfRecord.producerCode;
}

function summary(a: Account) {
  return {
    accountId: a.accountId,
    legalName: a.legalName,
    address: a.address,
    identifiers: a.identifiers,
    agentOfRecord: { producerCode: a.agentOfRecord.producerCode, producerName: a.agentOfRecord.producerName },
    clearanceStatus: a.clearance.status,
    clearanceDecidedOn: a.clearance.decidedOn,
    hasBlocks: a.blocks.length > 0,
  };
}

function scoreCandidate(a: Account, q: { name?: string; fein?: string; duns?: string; address?: string }) {
  const matchedOn: string[] = [];
  const conflicting: string[] = [];
  let score = 0;
  if (q.name) {
    const sim = tokenSimilarity(normaliseName(q.name), normaliseName(a.legalName));
    if (sim === 1) matchedOn.push("normalised_name");
    score += 0.4 * sim;
  }
  if (q.address) {
    const sim = tokenSimilarity(normaliseAddress(q.address), normaliseAddress(a.address));
    if (sim >= 0.8) matchedOn.push("standardised_address");
    else if (sim < 0.3) conflicting.push("address");
    score += 0.2 * sim;
  }
  for (const key of ["fein", "duns"] as const) {
    const given = digits(q[key]);
    const held = digits(a.identifiers[key]);
    if (!given || !held) continue;
    if (given === held) { matchedOn.push(key); score += key === "fein" ? 0.3 : 0.1; }
    else conflicting.push(key);
  }
  return { score: Math.round(Math.min(score, 1) * 100) / 100, matchedOn, conflictingIdentifiers: conflicting };
}

router.get("/accounts", (req: Request, res: Response) => {
  const q = {
    name: typeof req.query.name === "string" ? req.query.name : undefined,
    fein: typeof req.query.fein === "string" ? req.query.fein : undefined,
    duns: typeof req.query.duns === "string" ? req.query.duns : undefined,
    address: typeof req.query.address === "string" ? req.query.address : undefined,
  };
  const producerCode = typeof req.query.producerCode === "string" ? req.query.producerCode.trim() : undefined;
  if (!q.name && !q.fein && !q.duns) {
    res.status(400).json({ error: "Provide at least one of name, fein or duns." });
    return;
  }
  const results = Array.from(accounts.values())
    .filter((a) => visibleTo(a, producerCode))
    .map((a) => ({ ...summary(a), ...scoreCandidate(a, q) }))
    .filter((r) => r.score >= 0.25 || r.matchedOn.includes("fein") || r.matchedOn.includes("duns"))
    .sort((x, y) => y.score - x.score);
  res.json({
    query: { ...q, producerCode: producerCode ?? null },
    results,
    searchedAt: now(),
    guidance: "Treat a candidate as the same client only when identifiers agree. A near-identical name with a different FEIN or DUNS is a different client; a name and address match with no identifiers supplied is probable, not confirmed. Results exclude accounts this producer is not entitled to see.",
  });
});

router.get("/account", (req: Request, res: Response) => {
  const id = String(req.query.accountId || "").trim();
  const producerCode = typeof req.query.producerCode === "string" ? req.query.producerCode.trim() : undefined;
  const account = accounts.get(id);
  if (!account || !visibleTo(account, producerCode)) {
    res.status(404).json({ error: `No account "${id}" found.` });
    return;
  }
  res.json({ ...account, retrievedAt: now() });
});

router.post("/accounts", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const legalName = typeof b.legalName === "string" ? b.legalName.trim() : "";
  const address = typeof b.address === "string" ? b.address.trim() : "";
  if (!legalName || !address) {
    res.status(400).json({ error: "legalName and address are required." });
    return;
  }
  const identifiers = { fein: b.fein || undefined, duns: b.duns || undefined, registrationNumber: b.registrationNumber || undefined };
  const producerCode = typeof b.producerCode === "string" ? b.producerCode.trim() : "UNASSIGNED";

  // Duplicate prevention runs against every account, including ones this
  // producer cannot see -- but a hidden account is refused without naming it.
  const probe = { name: legalName, address, fein: identifiers.fein, duns: identifiers.duns };
  const duplicates = Array.from(accounts.values())
    .map((a) => ({ a, s: scoreCandidate(a, probe) }))
    .filter(({ s }) => s.matchedOn.includes("fein") || s.matchedOn.includes("duns") || (s.matchedOn.includes("normalised_name") && s.matchedOn.includes("standardised_address") && s.conflictingIdentifiers.length === 0));
  if (duplicates.length > 0) {
    const visible = duplicates.filter(({ a }) => visibleTo(a, producerCode));
    // A refused duplicate is a business outcome the agent must read, not a
    // transport error, so it is a 200 with created:false.
    res.json({
      created: false,
      reason: "duplicate",
      message: visible.length > 0
        ? "An existing account matches this client. Link to it instead of creating a duplicate."
        : "This account cannot be created. Contact account administration.",
      candidates: visible.map(({ a, s }) => ({ ...summary(a), ...s })),
    });
    return;
  }

  const accountId = `ACCT-${(parseInt(createHash("sha256").update(normaliseName(legalName)).digest("hex").slice(0, 8), 16) % 800000 + 200000)}`;
  const at = now();
  const account: Account = {
    accountId,
    legalName,
    address,
    identifiers,
    agentOfRecord: { producerCode, producerName: typeof b.producerName === "string" ? b.producerName : producerCode, activeQuote: true },
    clearance: { status: "not_screened", decidedOn: null, screeningId: null },
    blocks: [],
    linkedPolicies: [],
    insureds: [legalName],
    createdAt: at,
    createdBy: typeof b.actor === "string" ? b.actor : producerCode,
    auditTrail: [],
  };
  account.auditTrail.push({ auditId: auditId(accountId), action: "account_created", actor: account.createdBy, at, details: { legalName, address, identifiers, producerCode } });
  accounts.set(accountId, account);
  res.status(201).json({
    created: true,
    account,
    nextSteps: "Clearance status is not_screened: run account-level risk clearance and record the result before any quote is bound or policy issued.",
  });
});

router.post("/clearance", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const account = accounts.get(String(b.accountId || ""));
  if (!account) {
    res.status(404).json({ error: `No account "${b.accountId}" found.` });
    return;
  }
  const status = String(b.status || "");
  if (!["cleared", "pending", "referred", "blocked"].includes(status)) {
    res.status(400).json({ error: "status must be one of cleared, pending, referred, blocked." });
    return;
  }
  if (status === "cleared" && account.blocks.some((x) => x.type === "legal")) {
    res.json({ recorded: false, error: "A legal block is on this account. It can only be lifted by compliance, not recorded as cleared." });
    return;
  }
  const at = now();
  account.clearance = { status: status as Account["clearance"]["status"], decidedOn: at.slice(0, 10), screeningId: b.screeningId || null };
  if (status === "blocked" && b.legalBlock) {
    account.blocks.push({ type: "legal", reason: String(b.reason || "Sanctions or terrorism watchlist match"), owner: "Compliance", setOn: at.slice(0, 10) });
  }
  account.auditTrail.push({ auditId: auditId(account.accountId), action: "clearance_recorded", actor: String(b.actor || "unknown"), at, details: { status, screeningId: b.screeningId || null, listsChecked: b.listsChecked || null, reason: b.reason || null } });
  res.json({ recorded: true, accountId: account.accountId, clearance: account.clearance, blocks: account.blocks, auditId: account.auditTrail[account.auditTrail.length - 1].auditId });
});

router.post("/account-links", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const account = accounts.get(String(b.accountId || ""));
  const quoteNumber = typeof b.quoteNumber === "string" ? b.quoteNumber.trim() : "";
  if (!account || !quoteNumber) {
    res.status(account ? 400 : 404).json({ error: account ? "quoteNumber is required." : `No account "${b.accountId}" found.` });
    return;
  }
  const blockingReasons: string[] = [];
  if (account.clearance.status !== "cleared") blockingReasons.push(`Account clearance is ${account.clearance.status}, not cleared.`);
  for (const block of account.blocks) blockingReasons.push(`${block.type === "legal" ? "Legal" : "Business-reason"} block set by ${block.owner} on ${block.setOn}: ${block.reason}`);
  const at = now();
  if (!account.linkedPolicies.some((p) => p.policyNumber === quoteNumber)) {
    account.linkedPolicies.push({ policyNumber: quoteNumber, lineOfBusiness: String(b.lineOfBusiness || "Unspecified"), status: "quoted", effectiveDate: String(b.effectiveDate || "") });
  }
  account.auditTrail.push({ auditId: auditId(quoteNumber), action: "quote_linked", actor: String(b.actor || "unknown"), at, details: { quoteNumber, reason: b.reason || null } });
  res.json({
    linked: true,
    accountId: account.accountId,
    quoteNumber,
    issuanceAllowed: blockingReasons.length === 0,
    blockingReasons,
    auditId: account.auditTrail[account.auditTrail.length - 1].auditId,
  });
});

export default router;
