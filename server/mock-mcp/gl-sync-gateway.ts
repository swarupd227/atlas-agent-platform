import { Router, type Request, type Response } from "express";
import { getGlSyncScenario } from "../gl-sync-demo-store";

const router = Router();
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const BUSINESS_DATE = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const GL_ACCOUNTS = [
  { core_account: "1010", description: "Cash and Cash Equivalents",       account_type: "ASSET",     normal_balance: "DEBIT"  },
  { core_account: "1100", description: "Investment Securities",           account_type: "ASSET",     normal_balance: "DEBIT"  },
  { core_account: "1310", description: "Consumer Loans Receivable",       account_type: "ASSET",     normal_balance: "DEBIT"  },
  { core_account: "1320", description: "Mortgage Loans Receivable",       account_type: "ASSET",     normal_balance: "DEBIT"  },
  { core_account: "1330", description: "Commercial Loans Receivable",     account_type: "ASSET",     normal_balance: "DEBIT"  },
  { core_account: "1400", description: "Accrued Interest Receivable",     account_type: "ASSET",     normal_balance: "DEBIT"  },
  { core_account: "1510", description: "Premises and Equipment",          account_type: "ASSET",     normal_balance: "DEBIT"  },
  { core_account: "1610", description: "Other Assets",                    account_type: "ASSET",     normal_balance: "DEBIT"  },
  { core_account: "2010", description: "Member Share Draft Accounts",     account_type: "LIABILITY", normal_balance: "CREDIT" },
  { core_account: "2020", description: "Member Share Savings",            account_type: "LIABILITY", normal_balance: "CREDIT" },
  { core_account: "2030", description: "Money Market Accounts",           account_type: "LIABILITY", normal_balance: "CREDIT" },
  { core_account: "2040", description: "Term Share Certificates",         account_type: "LIABILITY", normal_balance: "CREDIT" },
  { core_account: "2110", description: "FHLB Borrowings",                 account_type: "LIABILITY", normal_balance: "CREDIT" },
  { core_account: "2210", description: "Other Liabilities",               account_type: "LIABILITY", normal_balance: "CREDIT" },
  { core_account: "3010", description: "Regular Reserve",                 account_type: "EQUITY",    normal_balance: "CREDIT" },
  { core_account: "3020", description: "Undivided Earnings",              account_type: "EQUITY",    normal_balance: "CREDIT" },
  { core_account: "4010", description: "Loan Interest Income",            account_type: "REVENUE",   normal_balance: "CREDIT" },
  { core_account: "4020", description: "Investment Income",               account_type: "REVENUE",   normal_balance: "CREDIT" },
  { core_account: "4030", description: "Fee Income",                      account_type: "REVENUE",   normal_balance: "CREDIT" },
  { core_account: "5010", description: "Dividend Expense — Shares",       account_type: "EXPENSE",   normal_balance: "DEBIT"  },
  { core_account: "5020", description: "Interest Expense — Borrowings",   account_type: "EXPENSE",   normal_balance: "DEBIT"  },
  { core_account: "6010", description: "Compensation and Benefits",       account_type: "EXPENSE",   normal_balance: "DEBIT"  },
  { core_account: "6020", description: "Occupancy Expense",               account_type: "EXPENSE",   normal_balance: "DEBIT"  },
  { core_account: "6030", description: "Technology and Systems",          account_type: "EXPENSE",   normal_balance: "DEBIT"  },
  { core_account: "6040", description: "Provision for Loan Losses",       account_type: "EXPENSE",   normal_balance: "DEBIT"  },
];

router.get("/get-gl-account-catalog", async (_req: Request, res: Response) => {
  await delay(900);
  res.json({
    institution: "Cascade Ridge Credit Union",
    core_system: "Symitar (Episys)",
    as_of_date: BUSINESS_DATE(),
    total_accounts: GL_ACCOUNTS.length,
    accounts: GL_ACCOUNTS,
    last_catalog_refresh: new Date().toISOString(),
  });
});

router.get("/get-prior-day-gl-entries", async (_req: Request, res: Response) => {
  await delay(1800);
  const scenario = getGlSyncScenario();
  const bDate = BUSINESS_DATE();

  const summary_by_account = GL_ACCOUNTS.map(acc => {
    const entryCount = acc.core_account === "1010" ? 247
      : acc.core_account === "2010" ? 312
      : acc.core_account === "2020" ? 198
      : acc.core_account === "1310" ? 143
      : acc.core_account === "1320" ? 89
      : acc.core_account === "1330" ? 47
      : acc.core_account === "4010" ? 61
      : acc.core_account === "5010" ? 38
      : Math.floor(20 + Math.random() * 60);
    return { core_account: acc.core_account, description: acc.description, entry_count: entryCount };
  });

  const totalEntries = summary_by_account.reduce((s, a) => s + a.entry_count, 0);

  res.json({
    institution: "Cascade Ridge Credit Union",
    core_system: "Symitar (Episys)",
    business_date: bDate,
    extraction_timestamp: new Date().toISOString(),
    total_entries: totalEntries,
    debit_total: 47382156.29,
    credit_total: 47382156.29,
    control_hash: "SHA256-7f4e2a1b9c3d5e8f",
    entries_by_account: summary_by_account,
    extraction_status: "COMPLETE",
    source_node: "EPROD01-SYMITAR",
    powerOn_job_id: `POJ-${bDate}-GL-EXTRACT-001`,
    note: scenario === "control_total_variance"
      ? "One FX conversion entry (GBP→USD, TRX-FX-0047) uses mid-rate from T-1; Intacct will book at settlement rate."
      : undefined,
  });
});

router.get("/get-control-total", async (_req: Request, res: Response) => {
  await delay(600);
  const scenario = getGlSyncScenario();
  const bDate = BUSINESS_DATE();

  res.json({
    institution: "Cascade Ridge Credit Union",
    business_date: bDate,
    core_system: "Symitar (Episys)",
    control_total: 47382156.29,
    debit_total: 47382156.29,
    credit_total: 47382156.29,
    entry_count: 1742,
    control_hash: "SHA256-7f4e2a1b9c3d5e8f",
    generated_at: new Date().toISOString(),
    verification_status: "BALANCED",
    note: scenario === "control_total_variance"
      ? "FX entry TRX-FX-0047 uses T-1 mid-rate $1.2714; settlement rate will differ by ~$1,000."
      : undefined,
  });
});

export default router;
