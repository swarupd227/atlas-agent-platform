import { Router, type Request, type Response } from "express";
import { getGlSyncScenario } from "../gl-sync-demo-store";

const router = Router();
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const INTACCT_ACCOUNTS = [
  { intacct_id: "GL-1010-CASH",      core_account: "1010", title: "Cash and Cash Equivalents",     account_type: "bank",    normal_balance: "debit"  },
  { intacct_id: "GL-1100-INVEST",    core_account: "1100", title: "Investment Securities",          account_type: "asset",   normal_balance: "debit"  },
  { intacct_id: "GL-1310-LOAN-CNS",  core_account: "1310", title: "Consumer Loans Receivable",      account_type: "asset",   normal_balance: "debit"  },
  { intacct_id: "GL-1320-LOAN-MTG",  core_account: "1320", title: "Mortgage Loans Receivable",      account_type: "asset",   normal_balance: "debit"  },
  { intacct_id: "GL-1330-LOAN-COM",  core_account: "1330", title: "Commercial Loans Receivable",    account_type: "asset",   normal_balance: "debit"  },
  { intacct_id: "GL-1400-ACCRINT",   core_account: "1400", title: "Accrued Interest Receivable",    account_type: "asset",   normal_balance: "debit"  },
  { intacct_id: "GL-1510-PREMISES",  core_account: "1510", title: "Premises and Equipment",         account_type: "asset",   normal_balance: "debit"  },
  { intacct_id: "GL-1610-OTHAST",    core_account: "1610", title: "Other Assets",                   account_type: "asset",   normal_balance: "debit"  },
  { intacct_id: "GL-2010-SHARE-DFT", core_account: "2010", title: "Member Share Draft Accounts",   account_type: "liability", normal_balance: "credit" },
  { intacct_id: "GL-2020-SHARE-SAV", core_account: "2020", title: "Member Share Savings",           account_type: "liability", normal_balance: "credit" },
  { intacct_id: "GL-2030-MMKT",      core_account: "2030", title: "Money Market Accounts",          account_type: "liability", normal_balance: "credit" },
  { intacct_id: "GL-2040-TDA",       core_account: "2040", title: "Term Share Certificates",        account_type: "liability", normal_balance: "credit" },
  { intacct_id: "GL-2110-FHLB",      core_account: "2110", title: "FHLB Borrowings",                account_type: "liability", normal_balance: "credit" },
  { intacct_id: "GL-2210-OTHLIAB",   core_account: "2210", title: "Other Liabilities",              account_type: "liability", normal_balance: "credit" },
  { intacct_id: "GL-3010-RES",       core_account: "3010", title: "Regular Reserve",                account_type: "equity",  normal_balance: "credit" },
  { intacct_id: "GL-3020-UNDIV",     core_account: "3020", title: "Undivided Earnings",             account_type: "equity",  normal_balance: "credit" },
  { intacct_id: "GL-4010-LOANINC",   core_account: "4010", title: "Loan Interest Income",           account_type: "revenue", normal_balance: "credit" },
  { intacct_id: "GL-4020-INVESTINC", core_account: "4020", title: "Investment Income",              account_type: "revenue", normal_balance: "credit" },
  { intacct_id: "GL-4030-FEEINC",    core_account: "4030", title: "Fee Income",                     account_type: "revenue", normal_balance: "credit" },
  { intacct_id: "GL-5010-DIV-EXP",   core_account: "5010", title: "Dividend Expense — Shares",      account_type: "expense", normal_balance: "debit"  },
  { intacct_id: "GL-5020-INT-EXP",   core_account: "5020", title: "Interest Expense — Borrowings",  account_type: "expense", normal_balance: "debit"  },
  { intacct_id: "GL-6010-COMP",      core_account: "6010", title: "Compensation and Benefits",      account_type: "expense", normal_balance: "debit"  },
  { intacct_id: "GL-6020-OCC",       core_account: "6020", title: "Occupancy Expense",              account_type: "expense", normal_balance: "debit"  },
  { intacct_id: "GL-6030-TECH",      core_account: "6030", title: "Technology and Systems",         account_type: "expense", normal_balance: "debit"  },
  { intacct_id: "GL-6040-PLL",       core_account: "6040", title: "Provision for Loan Losses",      account_type: "expense", normal_balance: "debit"  },
];

const postedJEs: Map<string, any> = new Map();

router.get("/list-gl-accounts", async (_req: Request, res: Response) => {
  await delay(800);
  res.json({
    system: "Sage Intacct",
    entity: "Cascade Ridge Credit Union",
    total_accounts: INTACCT_ACCOUNTS.length,
    accounts: INTACCT_ACCOUNTS,
    last_sync: new Date().toISOString(),
    status: "active",
  });
});

router.get("/list-dimensions", async (_req: Request, res: Response) => {
  await delay(700);
  const scenario = getGlSyncScenario();

  const branches = [
    { id: "BR-01", name: "Maple Valley Main Branch",  city: "Maple Valley",  active: true  },
    { id: "BR-02", name: "Auburn Branch",             city: "Auburn",        active: true  },
    { id: "BR-03", name: "Renton Branch",             city: "Renton",        active: true  },
    { id: "BR-04", name: "Kent Branch",               city: "Kent",          active: true  },
    { id: "BR-05", name: "Covington Branch",          city: "Covington",     active: true  },
    { id: "BR-06", name: "Black Diamond Branch",      city: "Black Diamond", active: true  },
    { id: "BR-07", name: "Enumclaw Branch",           city: "Enumclaw",      active: true  },
    { id: "BR-08", name: "Bonney Lake Branch",        city: "Bonney Lake",   active: true  },
    { id: "BR-09", name: "Buckley Branch",            city: "Buckley",       active: true  },
    { id: "BR-10", name: "Sumner Branch",             city: "Sumner",        active: true  },
    { id: "BR-11", name: "Puyallup Branch",           city: "Puyallup",      active: true  },
    { id: "BR-12", name: "Federal Way Branch",        city: "Federal Way",   active: true  },
    { id: "BR-13", name: "SeaTac Branch",             city: "SeaTac",        active: true  },
    {
      id: "BR-14",
      name: "Kirkland Branch",
      city: "Kirkland",
      active: true,
      note: scenario === "dimension_mismatch"
        ? "Branch opened 6 days ago — dimension mapping NOT YET propagated to Symitar core GL feed. 47 commercial loan entries carry null branch code."
        : "Branch opened 6 days ago — dimension mapping complete.",
    },
  ];

  res.json({
    system: "Sage Intacct",
    entity: "Cascade Ridge Credit Union",
    dimensions: {
      branch: branches,
      department: [
        { id: "DEPT-OPS",  name: "Operations",        active: true },
        { id: "DEPT-LEND", name: "Lending",            active: true },
        { id: "DEPT-DEPO", name: "Deposits",           active: true },
        { id: "DEPT-COMP", name: "Compliance",         active: true },
        { id: "DEPT-IT",   name: "Information Technology", active: true },
        { id: "DEPT-FIN",  name: "Finance",            active: true },
      ],
      cost_center: [
        { id: "CC-RETAIL",  name: "Retail Banking",   active: true },
        { id: "CC-COMM",    name: "Commercial Banking", active: true },
        { id: "CC-MORTG",   name: "Mortgage",         active: true },
        { id: "CC-INVEST",  name: "Investments",      active: true },
        { id: "CC-SHARED",  name: "Shared Services",  active: true },
      ],
    },
    total_branches: branches.length,
    dimension_validation_required: scenario === "dimension_mismatch",
  });
});

router.post("/post-journal-entry", async (req: Request, res: Response) => {
  await delay(2200);
  const scenario = getGlSyncScenario();
  const body = req.body || {};
  const jeId = body.journal_entry_id || `JE-${new Date().toISOString().slice(0, 10)}-GL-001`;
  const entryCount = body.entry_count || 1742;

  let accepted = entryCount;
  let rejected = 0;
  let total = 47382156.29;

  if (scenario === "dimension_mismatch") {
    accepted = 1695;
    rejected = 47;
    total = 47382156.29 - 1247388.41;
  } else if (scenario === "control_total_variance") {
    accepted = entryCount;
    rejected = 0;
    total = 47381156.29;
  }

  const record = {
    journal_entry_id: jeId,
    status: rejected > 0 ? "PARTIAL" : "ACCEPTED",
    entries_accepted: accepted,
    entries_rejected: rejected,
    total_amount: total,
    intacct_batch_id: `BATCH-INTACCT-${Date.now()}`,
    posted_at: new Date().toISOString(),
    rejection_detail: rejected > 0 ? {
      reason: "MISSING_DIMENSION",
      affected_accounts: ["GL-1330-LOAN-COM"],
      missing_dimension: "branch",
      affected_entries: 47,
      message: "47 commercial loan entries reference branch code BR-14 (Kirkland — new branch). Dimension mapping not yet propagated to Intacct. Entries moved to exception queue EXC-BR14-001.",
    } : null,
    note: scenario === "control_total_variance"
      ? "FX entry TRX-FX-0047 booked at settlement rate $1.2706 (vs T-1 mid-rate $1.2714). Intacct total will differ from Symitar control total by $1,000.00."
      : null,
  };
  postedJEs.set(jeId, record);
  res.json(record);
});

router.get("/get-journal-entry-status", async (req: Request, res: Response) => {
  await delay(500);
  const jeId = (req.query.journal_entry_id as string) || "";
  const scenario = getGlSyncScenario();

  if (postedJEs.has(jeId)) {
    res.json(postedJEs.get(jeId));
    return;
  }

  const defaultStatus: any = {
    journal_entry_id: jeId || "JE-UNKNOWN",
    status: "NOT_FOUND",
    message: "Journal entry not found. Verify the ID and retry.",
  };

  if (scenario === "control_total_variance" && jeId) {
    defaultStatus.status = "ACCEPTED";
    defaultStatus.intacct_total = 47381156.29;
    defaultStatus.symitar_control_total = 47382156.29;
    defaultStatus.variance = -1000.00;
    defaultStatus.variance_pct = 0.0021;
    defaultStatus.variance_detail = "FX conversion TRX-FX-0047: GBP 787.42 × $1.2706 (settlement) vs $1.2714 (T-1 mid). Difference: $1,000.00.";
  }

  res.json(defaultStatus);
});

export default router;
