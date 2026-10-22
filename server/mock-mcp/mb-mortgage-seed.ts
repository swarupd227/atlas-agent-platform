/**
 * One mortgage book, three systems.
 *
 * The Mutual Bancorp mortgage journey (loan file to clear-to-close) reads a
 * loan origination system, a loan document repository and an investor and
 * bank guidelines library. They have to agree with each other -- the deposit
 * on page 22 of the package is the deposit the asset rule is tested against,
 * and the bank that owns a loan in the LOS decides which overlays the library
 * will serve -- so all three are generated from this one file.
 *
 * What the seed holds is the RAW file only: the pages a processor would
 * receive and the records an LOS keeps. No qualifying income, no finding and
 * no condition is precomputed anywhere; the agents derive them.
 *
 * EVERYTHING HERE IS A FIXTURE. Borrowers, employers, figures and documents
 * are synthetic. Guideline excerpts are illustrative paraphrases keyed to
 * Selling Guide section numbers, not Fannie Mae text, and the bank overlays
 * are invented for the demo. Every response built from it says so
 * (`mode: "fixture"`).
 */

export const MODE = "fixture" as const;
export const TENANT_ID = "tenant-mutual-bancorp-demo";
export const FIXTURE_NOTICE =
  "Fixture mode: synthetic loan files and illustrative guideline paraphrases for design validation. Not Fannie Mae, Freddie Mac, FHA or VA text, not a Mutual Bancorp policy, and no real borrower.";

export const now = () => new Date().toISOString();
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Banks ────────────────────────────────────────────────────────────────────

export type BankId = "CC5" | "FID";

export interface Bank { bankId: BankId; name: string; legalName: string; headquarters: string; officeDays: string }

export const BANKS: Record<BankId, Bank> = {
  CC5: { bankId: "CC5", name: "Cape Cod 5", legalName: "Cape Cod Five Cents Savings Bank", headquarters: "Hyannis, MA", officeDays: "Monday to Friday, closed on federal legal public holidays and Patriots' Day" },
  FID: { bankId: "FID", name: "Fidelity Bank", legalName: "Fidelity Co-operative Bank", headquarters: "Leominster, MA", officeDays: "Monday to Friday, closed on federal legal public holidays" },
};

// ── Condition vocabulary and each bank's clearing schedule ───────────────────

export type ConditionClass = "credit" | "documentary";

export interface ConditionCode { code: string; conditionClass: ConditionClass; description: string; satisfiedBy: string }

export const CONDITION_CATALOG: ConditionCode[] = [
  { code: "INCOME_VERIFICATION", conditionClass: "credit", description: "Verify or explain wage income that does not reconcile across pay stubs, W-2s and returns.", satisfiedBy: "Written verification of employment and the borrower's explanation" },
  { code: "INCOME_SELF_EMPLOYED", conditionClass: "credit", description: "Support self-employment income beyond the tax returns in file.", satisfiedBy: "Year-to-date profit and loss statement and a CPA or business verification" },
  { code: "ASSET_SOURCING", conditionClass: "credit", description: "Document the source of a large or unexplained deposit, or gift funds.", satisfiedBy: "Gift letter and donor transfer evidence, or the documented source of the deposit" },
  { code: "LIABILITY_EXPLANATION", conditionClass: "credit", description: "Explain or document a liability that is undisclosed or does not reconcile.", satisfiedBy: "Borrower explanation and supporting statement" },
  { code: "CREDIT_EXPLANATION", conditionClass: "credit", description: "Explain recent inquiries or derogatory credit.", satisfiedBy: "Borrower explanation letter" },
  { code: "APPRAISAL_REVIEW", conditionClass: "credit", description: "Underwriter review of an appraisal concern.", satisfiedBy: "Underwriter review; not a borrower document" },
  { code: "FLOOD_INS_EVIDENCE", conditionClass: "documentary", description: "Evidence of flood insurance for a property in a special flood hazard area.", satisfiedBy: "Flood insurance declarations page naming the property and the owning bank as mortgagee, with sufficient building coverage" },
  { code: "HAZARD_INS_EVIDENCE", conditionClass: "documentary", description: "Evidence of homeowner's (hazard) insurance.", satisfiedBy: "Homeowner's insurance declarations page naming the property and the owning bank as mortgagee, with sufficient dwelling coverage" },
  { code: "SIGNED_4506C", conditionClass: "documentary", description: "IRS Form 4506-C signed by every borrower.", satisfiedBy: "Signed Form 4506-C" },
  { code: "PURCHASE_CONTRACT_ADDENDUM", conditionClass: "documentary", description: "Fully executed addendum to the purchase and sale agreement.", satisfiedBy: "Executed addendum" },
];

export const conditionCode = (code: unknown) => CONDITION_CATALOG.find((c) => c.code === String(code ?? "").trim().toUpperCase());

/**
 * The condition codes an agent may clear on its own, per bank -- the bank-side
 * schedule behind the Autonomy Warrant. Only documentary codes can appear, and
 * the two banks deliberately differ.
 */
export const AGENT_CLEARABLE: Record<BankId, string[]> = {
  CC5: ["FLOOD_INS_EVIDENCE", "HAZARD_INS_EVIDENCE", "SIGNED_4506C", "PURCHASE_CONTRACT_ADDENDUM"],
  FID: ["FLOOD_INS_EVIDENCE", "HAZARD_INS_EVIDENCE", "SIGNED_4506C"],
};

// ── Guidelines ───────────────────────────────────────────────────────────────

export interface GuidelineRule {
  ruleId: string;
  source: "investor" | "bank_overlay";
  investor: "Fannie Mae" | null;
  bankId: BankId | null;
  section: string;
  title: string;
  topic: "income" | "self_employment" | "assets" | "credit" | "liabilities" | "dti" | "property" | "insurance" | "documentation" | "disclosure";
  text: string;
  effectiveDate: string;
  overlay: boolean;
}

const fnma = (section: string, title: string, topic: GuidelineRule["topic"], text: string): GuidelineRule => ({
  ruleId: `FNMA-${section}`, source: "investor", investor: "Fannie Mae", bankId: null, section, title, topic, text, effectiveDate: "2026-08-06", overlay: false,
});
const ovl = (bankId: BankId, n: string, title: string, topic: GuidelineRule["topic"], text: string): GuidelineRule => ({
  ruleId: `OVL-${bankId}-${n}`, source: "bank_overlay", investor: null, bankId, section: `${BANKS[bankId].name} Residential Credit Policy ${n}`, title, topic, text, effectiveDate: bankId === "CC5" ? "2026-03-01" : "2026-05-15", overlay: true,
});

export const GUIDELINES: GuidelineRule[] = [
  fnma("B3-3.1-01", "General Income Information", "income", "Income used to qualify must be stable, predictable and likely to continue. The lender must determine the history of receipt, the frequency of payment and the trend of the amount, and must document and explain any significant decline."),
  fnma("B3-3.1-02", "Standards for Employment Documentation", "income", "For salaried and hourly borrowers the lender needs a recent pay stub showing year-to-date earnings and W-2s for the most recent one or two years. Year-to-date earnings must be consistent with the stated pay rate and the W-2 history; where they are not, the lender must obtain an explanation and, as needed, a written verification of employment before relying on the income."),
  fnma("B3-3.2-01", "Underwriting Factors and Documentation for a Self-Employed Borrower", "self_employment", "A borrower with 25% or more ownership of a business is self-employed. Two years of signed individual tax returns with all schedules are required. Qualifying income is the cash flow analysis of the returns: Schedule C net profit plus non-cash deductions such as depreciation, depletion and business use of the home, averaged over 24 months when the trend is stable or increasing. A declining trend needs justification and the lower year may be used."),
  fnma("B3-4.2-02", "Depository Accounts", "assets", "Bank statements must cover the most recent two full months. When a statement shows a large deposit -- a single deposit that exceeds 50% of the total monthly qualifying income for the loan -- the lender must document the source of the funds. Unsourced large deposits must be subtracted from the verified assets."),
  fnma("B3-4.3-04", "Personal Gifts", "assets", "Gift funds may be used for a principal residence. A gift letter signed by the donor must state the amount, the donor's relationship to the borrower and that no repayment is expected, and the transfer of funds must be documented."),
  fnma("B3-4.1-01", "Minimum Reserve Requirements", "assets", "Verified assets must cover the funds required to close. Reserve requirements for a one-unit principal residence are set by the automated underwriting recommendation; none are required in this fixture case."),
  fnma("B3-5.1-01", "General Requirements for Credit Scores", "credit", "The representative credit score for each borrower is the middle of three scores (or the lower of two). The loan's representative score is the lowest of the borrowers' representative scores. The minimum for a fixed-rate purchase in this fixture is 620."),
  fnma("B3-6-02", "Debt-to-Income Ratios", "dti", "The total debt-to-income ratio is the total monthly obligations, including the proposed housing payment (principal, interest, taxes, insurance including flood, and association dues), divided by total monthly qualifying income. The maximum in this fixture is 45%, or 50% with an automated approval."),
  fnma("B7-3-01", "General Property Insurance Requirements", "insurance", "Property insurance must be in force at closing, name the lender as mortgagee with its successors and assigns, and provide dwelling coverage of at least the lesser of the replacement cost or the unpaid principal balance."),
  fnma("B7-3-06", "Flood Insurance Coverage Requirements", "insurance", "A property in a special flood hazard area (zones beginning with A or V) requires flood insurance. Building coverage must be at least the lesser of the unpaid principal balance, the maximum available under the NFIP ($250,000 for a one-to-four unit residence) or the insurable value. The lender must be named as mortgagee."),
  fnma("B2-1.1-01", "Occupancy Types", "property", "A principal residence is a property the borrower occupies as a primary home. Loan-to-value is calculated on the lesser of the sales price or the appraised value."),
  ovl("CC5", "4.2(a)", "Deposit sourcing below the investor threshold", "assets", "Any single non-payroll deposit of $5,000 or more in the statements used to verify assets must be sourced and documented, whether or not it meets the investor's large-deposit definition."),
  ovl("CC5", "3.1(c)", "Year-to-date income shortfall", "income", "Where year-to-date base earnings fall more than 10% below the stated base rate for the elapsed pay periods, a written verification of employment that explains the shortfall is required before income is confirmed."),
  ovl("CC5", "7.4", "Executed IRS Form 4506-C", "documentation", "A Form 4506-C signed by every borrower is required before the loan is cleared to close."),
  ovl("CC5", "6.2", "Debt-to-income ceiling on jumbo-conforming balances", "dti", "For loan amounts above $400,000 the total debt-to-income ratio may not exceed 45%, even with an automated approval."),
  ovl("FID", "2.5", "Minimum representative credit score", "credit", "The loan's representative credit score must be at least 680 for a conventional fixed-rate purchase."),
  ovl("FID", "5.1", "Flood premium escrow", "insurance", "Flood insurance premiums must be escrowed for every loan secured by a property in a special flood hazard area."),
  ovl("FID", "7.1", "Executed IRS Form 4506-C", "documentation", "A Form 4506-C signed by every borrower is required before the loan is cleared to close."),
];

export const ruleById = (id: unknown) => {
  const raw = String(id ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return GUIDELINES.find((r) => r.ruleId.toUpperCase() === raw)
    ?? GUIDELINES.find((r) => r.investor && r.section.toUpperCase() === raw);
};

// ── Business-day calendar ────────────────────────────────────────────────────

export const FEDERAL_HOLIDAYS_2026: Array<{ date: string; name: string; note?: string }> = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-19", name: "Birthday of Martin Luther King, Jr." },
  { date: "2026-02-16", name: "Washington's Birthday" },
  { date: "2026-05-25", name: "Memorial Day" },
  { date: "2026-06-19", name: "Juneteenth National Independence Day" },
  { date: "2026-07-04", name: "Independence Day", note: "Falls on a Saturday; federal offices observe Friday 2026-07-03." },
  { date: "2026-09-07", name: "Labor Day" },
  { date: "2026-10-12", name: "Columbus Day" },
  { date: "2026-11-11", name: "Veterans Day" },
  { date: "2026-11-26", name: "Thanksgiving Day" },
  { date: "2026-12-25", name: "Christmas Day" },
];

export const MASSACHUSETTS_HOLIDAYS_2026: Array<{ date: string; name: string; scope: string }> = [
  { date: "2026-03-17", name: "Evacuation Day", scope: "Suffolk County only" },
  { date: "2026-04-20", name: "Patriots' Day", scope: "Statewide" },
  { date: "2026-06-17", name: "Bunker Hill Day", scope: "Suffolk County only" },
];

export const BANK_CLOSURES_2026: Record<BankId, string[]> = {
  CC5: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-20", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"],
  FID: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"],
};

// ── Loans ────────────────────────────────────────────────────────────────────

export interface Borrower {
  borrowerId: string;
  name: string;
  role: "borrower" | "co_borrower";
  employment: { type: "salaried" | "self_employed"; employer: string; position: string; startDate: string; ownershipPercent?: number };
}

/** Government monitoring information. Held for the HMDA record only and never returned by any tool. */
interface Gmi { race: string; ethnicity: string; sex: string }

export interface DisclosureEvent { eventId: string; type: string; date: string; method?: string; receivedConfirmed?: string | null; changeReason?: string; note?: string }

export interface Page { page: number; document: string; text: string }

export interface LoanSeed {
  loanId: string;
  bankId: BankId;
  packageId: string;
  program: string;
  investor: "Fannie Mae";
  purpose: "purchase";
  loanAmount: number;
  purchasePrice: number;
  appraisedValue: number;
  noteRate: number;
  termMonths: number;
  applicationDate: string;
  lock: { lockDate: string; lockExpires: string };
  scheduledConsummation: string;
  borrowers: Borrower[];
  property: { address: string; city: string; state: "MA"; zip: string; county: string; occupancy: "principal_residence"; propertyType: string; floodZone: string; specialFloodHazardArea: boolean };
  housingExpense: { principalAndInterest: number; propertyTax: number; hazardInsurance: number; floodInsurance: number; association: number };
  liabilitiesFromApplication: Array<{ creditor: string; type: string; balance: number; monthlyPayment: number }>;
  cashToClose: { downPayment: number; closingCostsAndPrepaids: number; earnestMoneyCredited: number; estimatedCashToClose: number };
  disclosureEvents: DisclosureEvent[];
  hmda: Record<string, unknown>;
  gmi: Record<string, Gmi>;
  pages: Page[];
  /** Facts the borrower's fixture reply is built from. */
  replyFacts: Record<string, unknown>;
  loanOfficer: string;
}

interface Txn { date: string; description: string; amount: number }

function statementPages(doc: string, header: string, opening: number, txns: Txn[], perPage = 9): { pages: Array<{ document: string; text: string }>; closing: number } {
  let bal = opening;
  const lines = txns.map((t) => { bal = money(bal + t.amount); return `${t.date}  ${t.description.padEnd(44)} ${(t.amount < 0 ? "-" : "+") + fmt(Math.abs(t.amount))}  bal ${fmt(bal)}`; });
  const deposits = money(txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
  const withdrawals = money(-txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) chunks.push(lines.slice(i, i + perPage));
  const pages = chunks.map((c, i) => ({
    document: doc,
    text: `${header}\nPage ${i + 1} of ${chunks.length}\n${i === 0 ? `Beginning balance ${fmt(opening)}   Deposits and credits ${fmt(deposits)}   Withdrawals and debits ${fmt(withdrawals)}   Ending balance ${fmt(bal)}\n` : ""}DATE   DESCRIPTION                                          AMOUNT      BALANCE\n${c.join("\n")}${i === chunks.length - 1 ? `\nEnding balance ${fmt(bal)}` : ""}`,
  }));
  return { pages, closing: bal };
}

/** Pay stub figures for a biweekly salaried employee who was unpaid for `unpaidPeriods` periods this year. */
function stub(rate: number, periodNo: number, unpaidPeriods: number) {
  const gross = money(rate / 26);
  const paid = periodNo - unpaidPeriods;
  const k401 = money(gross * 0.06);
  return { gross, ytdGross: money(gross * paid), k401, ytd401k: money(k401 * paid), net: 2712.4, ytdNet: money(2712.4 * paid) };
}

function rourkeLoan(loanId: string, packageId: string, gmi: Record<string, Gmi>): LoanSeed {
  const n = packageId.slice(-5);
  const borrowers: Borrower[] = [
    { borrowerId: `${n}-B1`, name: "Daniel J. Rourke", role: "borrower", employment: { type: "salaried", employer: "Cape Harbor Marine Services, Inc.", position: "Operations Manager", startDate: "2019-03-11" } },
    { borrowerId: `${n}-B2`, name: "Erin M. Rourke", role: "co_borrower", employment: { type: "self_employed", employer: "Rourke Design Studio (sole proprietorship)", position: "Owner", startDate: "2017-05-01", ownershipPercent: 100 } },
  ];
  const p: Array<{ document: string; text: string }> = [];
  const add = (document: string, text: string) => p.push({ document, text });

  // Uniform Residential Loan Application
  add("URLA", `UNIFORM RESIDENTIAL LOAN APPLICATION (Form 1003)  Loan ${loanId}  Lender: ${BANKS.CC5.legalName}\nSection 1a Borrower: Daniel J. Rourke  SSN xxx-xx-4417  Marital status: married\nSection 1a Co-borrower: Erin M. Rourke  SSN xxx-xx-8830  Marital status: married\nCurrent address: 22 Sandwich Road, Apt 3, Falmouth MA 02540 -- rent $2,650.00/month, 3 years 2 months\nDependents: 1\nApplication taken: 2026-10-01 by loan officer Kevin Doherty (NMLS 884512)`);
  add("URLA", `URLA Section 1b/1c Employment and income\nDaniel J. Rourke -- Cape Harbor Marine Services, Inc., Operations Manager, since 03/11/2019. Base: $8,333.33/month. Overtime: none. Bonus: none.\nErin M. Rourke -- Self-employed, Rourke Design Studio, sole proprietor (100% ownership), since 05/01/2017. Monthly income (stated): $4,000.00.\nTotal stated monthly income: $12,333.33`);
  add("URLA", `URLA Section 2 Assets and liabilities (as stated by the borrowers)\nChecking, ${BANKS.CC5.name} ****2231: $45,400\nSavings, ${BANKS.CC5.name} ****2245: $52,300\nBrokerage, Harbor Point Securities ****7719: $31,000\nGifts or grants: none declared\nLiabilities: Cape Cod Auto Finance auto loan $412/mo; Nelnet student loan $286/mo; Cape Card Services revolving $45/mo; Harborline Visa revolving $50/mo`);
  add("URLA", `URLA Sections 4-8 Loan and property, declarations, demographic information\nLoan amount $468,000  Purpose: purchase  Property: 14 Bayview Lane, Falmouth MA 02540  Occupancy: primary residence\nDeclarations: no outstanding judgments, no bankruptcy, no foreclosure, not a party to a lawsuit, no undisclosed borrowed funds\nSection 8 Demographic information: [WITHHELD FROM THE DOCUMENT REPOSITORY -- government monitoring information is held only in the LOS HMDA record and is masked from every decisioning user and agent under ECOA / Regulation B]`);

  // Pay stubs, Daniel
  const s19 = stub(100000, 19, 4);
  const s20 = stub(100000, 20, 4);
  for (const [s, per, pay] of [[s19, "08/29/2026 - 09/11/2026", "09/11/2026"], [s20, "09/12/2026 - 09/25/2026", "09/25/2026"]] as const) {
    add("PAY_STUB", `CAPE HARBOR MARINE SERVICES, INC.  EARNINGS STATEMENT\nEmployee: Daniel J. Rourke   ID 0417   Position: Operations Manager   Hire date: 03/11/2019\nPay period: ${per}   Pay date: ${pay}   Pay frequency: biweekly   Annual salary: $100,000.00\nEARNINGS        HOURS   CURRENT      YEAR-TO-DATE\nRegular salary  80.00   ${fmt(s.gross)}     ${fmt(s.ytdGross)}\nGross pay               ${fmt(s.gross)}     ${fmt(s.ytdGross)}\nDEDUCTIONS: 401(k) 6% ${fmt(s.k401)} (YTD ${fmt(s.ytd401k)}); federal, state and FICA withholding\nNet pay: ${fmt(s.net)}   YTD net: ${fmt(s.ytdNet)}`);
  }

  // W-2s, Daniel
  add("W2", `2025 Form W-2 Wage and Tax Statement\nEmployer: Cape Harbor Marine Services, Inc., EIN 04-3318842, 400 Teaticket Hwy, East Falmouth MA\nEmployee: Daniel J. Rourke\nBox 1 Wages, tips, other compensation: 92,496.00\nBox 3 Social security wages: 98,400.00\nBox 5 Medicare wages and tips: 98,400.00\nBox 12a Code D (401(k) elective deferrals): 5,904.00`);
  add("W2", `2024 Form W-2 Wage and Tax Statement\nEmployer: Cape Harbor Marine Services, Inc., EIN 04-3318842\nEmployee: Daniel J. Rourke\nBox 1 Wages, tips, other compensation: 90,428.00\nBox 3 Social security wages: 96,200.00\nBox 5 Medicare wages and tips: 96,200.00\nBox 12a Code D (401(k) elective deferrals): 5,772.00`);

  // Tax returns
  const schC = (year: number, gross: number, e: Record<string, number>) => {
    const total = Object.values(e).reduce((s, v) => s + v, 0);
    return { gross, total, net: gross - total, e, year };
  };
  const c25 = schC(2025, 128400, { "8 Advertising": 2100, "9 Car and truck expenses (actual)": 3800, "13 Depreciation and section 179": 4100, "15 Insurance": 1900, "18 Office expense": 2600, "11 Contract labor": 38500, "22 Supplies": 6800, "24a Travel": 1400, "25 Utilities": 1800, "27a Other expenses (software subscriptions)": 18500 });
  const c24 = schC(2024, 112750, { "8 Advertising": 1800, "9 Car and truck expenses (actual)": 3600, "13 Depreciation and section 179": 3800, "15 Insurance": 1750, "18 Office expense": 2300, "11 Contract labor": 33000, "22 Supplies": 5900, "24a Travel": 1200, "25 Utilities": 1700, "27a Other expenses (software subscriptions)": 16500 });
  for (const [c, wages] of [[c25, 92496], [c24, 90428]] as const) {
    add("TAX_RETURN_1040", `${c.year} Form 1040 U.S. Individual Income Tax Return -- page 1\nFiling status: Married filing jointly   Daniel J. & Erin M. Rourke\nLine 1a Total wages (Forms W-2): ${fmt(wages)}\nLine 8 Additional income from Schedule 1: ${fmt(c.net)}\nLine 9 Total income: ${fmt(wages + c.net)}\nSigned by both taxpayers`);
    add("TAX_RETURN_1040", `${c.year} Form 1040 -- page 2\nStandard deduction, tax, credits and payments\nPrepared by: Nauset Tax & Accounting, PTIN P01992231\nSigned and dated by both taxpayers`);
    add("TAX_RETURN_1040", `${c.year} Schedule 1 (Form 1040) Additional Income and Adjustments\nLine 3 Business income or (loss) -- attach Schedule C: ${fmt(c.net)}\nLine 15 Deductible part of self-employment tax: ${fmt(money(c.net * 0.9235 * 0.153 / 2))}`);
    add("TAX_RETURN_1040", `${c.year} Schedule C (Form 1040) Profit or Loss From Business -- page 1\nProprietor: Erin M. Rourke   Business: Rourke Design Studio, graphic and brand design (code 541430)\nLine 1 Gross receipts: ${fmt(c.gross)}\nLine 4 Cost of goods sold: 0.00\nLine 7 Gross income: ${fmt(c.gross)}\nExpenses:\n${Object.entries(c.e).map(([k, v]) => `  Line ${k}: ${fmt(v)}`).join("\n")}\nLine 28 Total expenses: ${fmt(c.total)}\nLine 30 Business use of home: 0.00\nLine 31 Net profit: ${fmt(c.net)}`);
    add("TAX_RETURN_1040", `${c.year} Schedule C (Form 1040) -- page 2\nPart IV vehicle information: one vehicle, actual expense method\nPart V other expenses: software subscriptions ${fmt(c.e["27a Other expenses (software subscriptions)"])}\nNo meals expense claimed. No depletion.`);
  }

  // Bank statements
  const chkJul = statementPages("BANK_STATEMENT", `${BANKS.CC5.legalName} -- Statement of account\nPremier Checking ****2231   Daniel J. Rourke, Erin M. Rourke\nStatement period 07/01/2026 - 07/31/2026`, 21480.12, [
    { date: "07/01", description: "BAYSIDE PROPERTY MGMT RENT", amount: -2650 },
    { date: "07/02", description: "CAPE HARBOR MARINE PAYROLL DIR DEP", amount: 2712.4 },
    { date: "07/06", description: "ROURKE DESIGN STUDIO OWNER DRAW", amount: 3500 },
    { date: "07/09", description: "CAPE COD AUTO FINANCE PMT", amount: -412 },
    { date: "07/11", description: "STOP & SHOP FALMOUTH DEBIT", amount: -386.22 },
    { date: "07/12", description: "NELNET STUDENT LOAN", amount: -286 },
    { date: "07/15", description: "TRANSFER TO SAVINGS ****2245", amount: -200 },
    { date: "07/17", description: "CAPE HARBOR MARINE PAYROLL DIR DEP", amount: 2712.4 },
    { date: "07/18", description: "SHAW'S MARKET DEBIT", amount: -298.41 },
    { date: "07/20", description: "EVERSOURCE ELECTRIC", amount: -164.33 },
    { date: "07/22", description: "CAPE CARD SERVICES PMT", amount: -45 },
    { date: "07/24", description: "HARBORLINE VISA PMT", amount: -50 },
    { date: "07/26", description: "STOP & SHOP FALMOUTH DEBIT", amount: -315.06 },
    { date: "07/31", description: "CAPE HARBOR MARINE PAYROLL DIR DEP", amount: 2712.4 },
    { date: "07/31", description: "MOBIL STATION DEBIT", amount: -250.31 },
  ]);
  const chkAug = statementPages("BANK_STATEMENT", `${BANKS.CC5.legalName} -- Statement of account\nPremier Checking ****2231   Daniel J. Rourke, Erin M. Rourke\nStatement period 08/01/2026 - 08/31/2026`, chkJul.closing, [
    { date: "08/01", description: "BAYSIDE PROPERTY MGMT RENT", amount: -2650 },
    { date: "08/05", description: "ROURKE DESIGN STUDIO OWNER DRAW", amount: 3500 },
    { date: "08/08", description: "STOP & SHOP FALMOUTH DEBIT", amount: -402.17 },
    { date: "08/10", description: "CAPE COD AUTO FINANCE PMT", amount: -412 },
    { date: "08/12", description: "NELNET STUDENT LOAN", amount: -286 },
    { date: "08/14", description: "CAPE HARBOR MARINE PAYROLL DIR DEP", amount: 2712.4 },
    { date: "08/14", description: "MOBILE DEPOSIT CHECK #1047", amount: 18500 },
    { date: "08/15", description: "TRANSFER TO SAVINGS ****2245", amount: -200 },
    { date: "08/19", description: "SHAW'S MARKET DEBIT", amount: -333.9 },
    { date: "08/20", description: "EVERSOURCE ELECTRIC", amount: -171.2 },
    { date: "08/22", description: "CAPE CARD SERVICES PMT", amount: -45 },
    { date: "08/24", description: "HARBORLINE VISA PMT", amount: -50 },
    { date: "08/26", description: "CHECK #1052 COASTAL REALTY ESCROW", amount: -5000 },
    { date: "08/28", description: "CAPE HARBOR MARINE PAYROLL DIR DEP", amount: 2712.4 },
    { date: "08/29", description: "STOP & SHOP FALMOUTH DEBIT", amount: -573.93 },
  ]);
  for (const pg of [...chkJul.pages, ...chkAug.pages]) add(pg.document, pg.text);
  const savJul = statementPages("BANK_STATEMENT", `${BANKS.CC5.legalName} -- Statement of account\nStatement Savings ****2245   Daniel J. Rourke, Erin M. Rourke\nStatement period 07/01/2026 - 07/31/2026`, 51872.4, [
    { date: "07/15", description: "TRANSFER FROM CHECKING ****2231", amount: 200 },
    { date: "07/31", description: "INTEREST PAID", amount: 13.8 },
  ]);
  const savAug = statementPages("BANK_STATEMENT", `${BANKS.CC5.legalName} -- Statement of account\nStatement Savings ****2245   Daniel J. Rourke, Erin M. Rourke\nStatement period 08/01/2026 - 08/31/2026`, savJul.closing, [
    { date: "08/15", description: "TRANSFER FROM CHECKING ****2231", amount: 200 },
    { date: "08/31", description: "INTEREST PAID", amount: 13.8 },
  ]);
  for (const pg of [...savJul.pages, ...savAug.pages]) add(pg.document, pg.text);
  add("BROKERAGE_STATEMENT", `HARBOR POINT SECURITIES -- Quarterly account statement\nIndividual brokerage ****7719   Erin M. Rourke\nPeriod 07/01/2026 - 09/30/2026\nBeginning value 30,215.44   Contributions 0.00   Withdrawals 0.00   Change in value 784.56   Ending value 31,000.00`);
  add("BROKERAGE_STATEMENT", `HARBOR POINT SECURITIES -- Holdings at 09/30/2026, account ****7719\nVanguard Total Stock Market Index Admiral (VTSAX) 166.212 sh  22,400.00\niShares Core U.S. Aggregate Bond ETF (AGG) 87.000 sh  8,600.00\nCash sweep 0.00\nTotal 31,000.00   No margin balance, no loans against the account`);

  // Appraisal
  add("APPRAISAL", `UNIFORM RESIDENTIAL APPRAISAL REPORT (Form 1004) -- Subject\nProperty: 14 Bayview Lane, Falmouth MA 02540   County: Barnstable   Census tract 0147.00\nBorrower: Daniel J. & Erin M. Rourke   Lender/client: ${BANKS.CC5.legalName}\nOccupant: vacant (seller relocating); intended use primary residence\nContract price $585,000, contract date 09/24/2026, no seller concessions\nAssignment type: purchase transaction`);
  add("APPRAISAL", `Form 1004 -- Neighborhood and site\nSuburban, stable values, 3-6 months marketing time\nSite 0.34 acre, public water, private septic (Title 5 certificate passed 08/2026)\nFEMA special flood hazard area: YES   FEMA flood zone: AE   FEMA map 25001C0533J dated 07/16/2014`);
  add("APPRAISAL", `Form 1004 -- Improvements\nOne-unit detached Cape, built 1988, effective age 15 years, 1,968 sq ft GLA, 3 bedrooms, 2 baths, full basement unfinished\nCondition C3, quality Q4. No adverse conditions noted. Estimated replacement cost new: $498,000`);
  add("APPRAISAL", `Form 1004 -- Sales comparison approach\nComparable 1: 9 Gifford Street, Falmouth, sold 07/2026 $579,000, adjusted $588,500\nComparable 2: 61 Davis Straits, Falmouth, sold 06/2026 $602,000, adjusted $592,000\nComparable 3: 7 Clinton Ave, Falmouth, sold 08/2026 $570,000, adjusted $587,000\nIndicated value by sales comparison: $590,000`);
  add("APPRAISAL", `Form 1004 -- Reconciliation\nIndicated value by sales comparison $590,000; cost approach $596,000; income approach not developed\nThis appraisal is made "as is".  Opinion of market value: $590,000 as of 10/09/2026`);
  add("APPRAISAL", `Form 1004 -- Appraiser certification\nAppraiser: Linda Cabral, Certified Residential Real Estate Appraiser, MA license 103877, expires 06/30/2027\nSigned 10/12/2026`);

  // Credit report
  add("CREDIT_REPORT", `TRI-MERGE CREDIT REPORT   Ordered by ${BANKS.CC5.legalName}   Report date 10/01/2026   Ref CR-${n}\nDaniel J. Rourke -- Equifax 742  Experian 751  TransUnion 738\nErin M. Rourke  -- Equifax 768  Experian 774  TransUnion 760\nNo public records. No collections.`);
  add("CREDIT_REPORT", `Tradelines -- Daniel J. Rourke\nCape Cod Auto Finance  installment  opened 03/2023  balance 14,880  payment 412/mo  current, never late\nNelnet (Dept of Education)  student loan  opened 09/2012  balance 21,400  payment 286/mo  current\nCape Card Services  revolving  limit 6,000  balance 1,420  minimum 45/mo  current`);
  add("CREDIT_REPORT", `Tradelines -- Erin M. Rourke\nHarborline Visa  revolving  limit 9,500  balance 1,150  minimum 50/mo  current, never late\nNo other open accounts. Auto loan above is joint (Daniel primary).`);
  add("CREDIT_REPORT", `Inquiries in the last 120 days\n10/01/2026 ${BANKS.CC5.legalName} (this application)\nNo other inquiries. Fraud and OFAC alerts: none.`);

  // Flood determination
  add("FLOOD_CERTIFICATE", `STANDARD FLOOD HAZARD DETERMINATION FORM (FEMA 086-0-32)\nLender: ${BANKS.CC5.legalName}   Loan ${loanId}\nProperty: 14 Bayview Lane, Falmouth MA 02540\nNFIP community: Town of Falmouth 255211   Map panel 25001C0533J   Zone AE\nIs building in a Special Flood Hazard Area? YES -- federal flood insurance is required.\nNFIP community participation: regular program`);

  // Purchase and sale agreement
  add("PURCHASE_AGREEMENT", `PURCHASE AND SALE AGREEMENT -- page 1\nSeller: Thomas & Alice Whitcomb   Buyers: Daniel J. Rourke and Erin M. Rourke\nPremises: 14 Bayview Lane, Falmouth MA 02540\nPurchase price: $585,000.00   Deposit: $5,000.00 paid 08/26/2026 to Coastal Realty, escrow agent\nClosing date: 11/13/2026`);
  add("PURCHASE_AGREEMENT", `PURCHASE AND SALE AGREEMENT -- page 2\nMortgage contingency: $468,000 at prevailing rates, commitment by 11/02/2026\nInspection contingency waived after inspection 09/28/2026\nTitle: good and clear record and marketable title`);
  add("PURCHASE_AGREEMENT", `PURCHASE AND SALE AGREEMENT -- page 3\nSignatures: Thomas Whitcomb 09/24/2026, Alice Whitcomb 09/24/2026, Daniel J. Rourke 09/24/2026, Erin M. Rourke 09/24/2026\nNo addenda.`);

  // 4506-C, unsigned
  add("FORM_4506C", `IRS Form 4506-C IVES Request for Transcript of Tax Return\nTaxpayers: Daniel J. Rourke and Erin M. Rourke   Tax years 2024, 2025   Transcript type: return transcript\nIVES participant: ${BANKS.CC5.legalName}\nSignature of taxpayer: ______________________  Date: ________\nSignature of spouse:  ______________________  Date: ________\n(NOT SIGNED)`);

  const pages = p.map((x, i) => ({ page: i + 1, ...x }));
  const housing = { principalAndInterest: 2919.71, propertyTax: 512.5, hazardInsurance: 145, floodInsurance: 118, association: 0 };
  return {
    loanId, bankId: "CC5", packageId, program: "Conventional 30-year fixed", investor: "Fannie Mae", purpose: "purchase",
    loanAmount: 468000, purchasePrice: 585000, appraisedValue: 590000, noteRate: 6.375, termMonths: 360,
    applicationDate: "2026-10-01", lock: { lockDate: "2026-10-14", lockExpires: "2026-11-20" }, scheduledConsummation: "2026-11-13",
    borrowers,
    property: { address: "14 Bayview Lane", city: "Falmouth", state: "MA", zip: "02540", county: "Barnstable", occupancy: "principal_residence", propertyType: "single_family_detached", floodZone: "AE", specialFloodHazardArea: true },
    housingExpense: housing,
    liabilitiesFromApplication: [
      { creditor: "Cape Cod Auto Finance", type: "installment", balance: 14880, monthlyPayment: 412 },
      { creditor: "Nelnet", type: "student_loan", balance: 21400, monthlyPayment: 286 },
      { creditor: "Cape Card Services", type: "revolving", balance: 1420, monthlyPayment: 45 },
      { creditor: "Harborline Visa", type: "revolving", balance: 1150, monthlyPayment: 50 },
    ],
    cashToClose: { downPayment: 117000, closingCostsAndPrepaids: 14200, earnestMoneyCredited: 5000, estimatedCashToClose: 126200 },
    disclosureEvents: [
      { eventId: `DE-${n}-01`, type: "application", date: "2026-10-01" },
      { eventId: `DE-${n}-02`, type: "loan_estimate", date: "2026-10-05", method: "electronic", receivedConfirmed: "2026-10-05", note: "Initial Loan Estimate" },
      { eventId: `DE-${n}-03`, type: "intent_to_proceed", date: "2026-10-06" },
      { eventId: `DE-${n}-04`, type: "rate_lock", date: "2026-10-14", note: "Locked 6.375% through 2026-11-20" },
      { eventId: `DE-${n}-05`, type: "loan_estimate", date: "2026-10-16", method: "electronic", receivedConfirmed: "2026-10-16", changeReason: "interest rate locked (valid changed circumstance)" },
      { eventId: `DE-${n}-06`, type: "scheduled_consummation", date: "2026-11-13" },
      { eventId: `DE-${n}-07`, type: "closing_disclosure_planned", date: "", method: "electronic, receipt not confirmed (presumed received three business days after it is sent)", receivedConfirmed: null, note: "Closing Disclosure not yet issued" },
    ],
    hmda: { loanAmount: 486000, propertyValue: 590000, loanPurpose: "1 (home purchase)", loanType: "1 (conventional)", lienStatus: "1 (first lien)", occupancy: "1 (principal residence)", actionTaken: null, applicationDate: "2026-10-01", stateCode: "MA", countyCode: "25001", censusTract: "25001014700", grossAnnualIncome: 148000, combinedLoanToValue: 80, constructionMethod: "1 (site-built)", totalUnits: 1 },
    gmi,
    pages,
    replyFacts: { salaryText: "$100,000.00 annual salary, paid biweekly", giftAmount: 18500, giftDate: "08/13/2026", donor: "Margaret A. Rourke", donorRelationship: "mother of Daniel J. Rourke", unpaidLeave: "2026-04-06 to 2026-05-29", replacementCost: 498000, ytdPnlNet: 37900 },
    loanOfficer: "Kevin Doherty",
  };
}

function natarajanLoan(): LoanSeed {
  const loanId = "LN-FID-26-01162";
  const packageId = "PKG-01162";
  const p: Array<{ document: string; text: string }> = [];
  const add = (document: string, text: string) => p.push({ document, text });
  add("URLA", `UNIFORM RESIDENTIAL LOAN APPLICATION (Form 1003)  Loan ${loanId}  Lender: ${BANKS.FID.legalName}\nBorrower: Priya Natarajan  SSN xxx-xx-1162  Unmarried\nCurrent address: 80 Pleasant Street, Unit 2, Leominster MA 01453 -- rent $2,100/month, 4 years\nApplication taken: 2026-10-08 by loan officer Rachel Ouellette (NMLS 901377)`);
  add("URLA", `URLA Sections 1b-2 Employment, income, assets and liabilities\nNashoba Valley Medical Group, Practice Administrator, since 06/01/2018. Base: $15,000.00/month.\nChecking, ${BANKS.FID.name} ****6604: $101,500   Gifts: none\nLiabilities: Fidelity Bank auto loan $389/mo; Lowell Five Mastercard revolving $40/mo`);
  add("URLA", `URLA Sections 4-8 Loan and property, declarations, demographic information\nLoan amount $360,000  Purpose: purchase  Property: 31 Carter Street, Leominster MA 01453  Occupancy: primary residence\nDeclarations: all answered no\nSection 8 Demographic information: [WITHHELD FROM THE DOCUMENT REPOSITORY -- held only in the LOS HMDA record and masked from decisioning under ECOA / Regulation B]`);
  for (const [per, pay, k] of [["09/13/2026 - 09/26/2026", "10/02/2026", 20], ["09/27/2026 - 10/10/2026", "10/16/2026", 21]] as const) {
    const gross = money(180000 / 26);
    add("PAY_STUB", `NASHOBA VALLEY MEDICAL GROUP  EARNINGS STATEMENT\nEmployee: Priya Natarajan   Position: Practice Administrator   Hire date: 06/01/2018\nPay period: ${per}   Pay date: ${pay}   Biweekly   Annual salary: $180,000.00\nRegular salary  80.00  ${fmt(gross)}  YTD ${fmt(money(gross * k))}\nGross pay ${fmt(gross)}   YTD gross ${fmt(money(gross * k))}`);
  }
  add("W2", `2025 Form W-2  Employer: Nashoba Valley Medical Group, EIN 04-2299013  Employee: Priya Natarajan\nBox 1: 166,500.00   Box 5 Medicare wages: 176,000.00   Box 12a D: 9,500.00`);
  add("W2", `2024 Form W-2  Employer: Nashoba Valley Medical Group, EIN 04-2299013  Employee: Priya Natarajan\nBox 1: 160,800.00   Box 5 Medicare wages: 170,000.00   Box 12a D: 9,200.00`);
  const chkAug = statementPages("BANK_STATEMENT", `${BANKS.FID.legalName} -- Statement\nEveryday Checking ****6604   Priya Natarajan\nStatement period 08/01/2026 - 08/31/2026`, 92740.35, [
    { date: "08/01", description: "LEOMINSTER PROPERTIES RENT", amount: -2100 },
    { date: "08/07", description: "NASHOBA VALLEY MED PAYROLL", amount: 4880.12 },
    { date: "08/10", description: "FIDELITY BANK AUTO LOAN", amount: -389 },
    { date: "08/20", description: "ONLINE TRANSFER FROM XXXXXX8812", amount: 5600 },
    { date: "08/21", description: "NASHOBA VALLEY MED PAYROLL", amount: 4880.12 },
    { date: "08/24", description: "LOWELL FIVE MASTERCARD PMT", amount: -40 },
    { date: "08/27", description: "MARKET BASKET DEBIT", amount: -611.44 },
  ]);
  const chkSep = statementPages("BANK_STATEMENT", `${BANKS.FID.legalName} -- Statement\nEveryday Checking ****6604   Priya Natarajan\nStatement period 09/01/2026 - 09/30/2026`, chkAug.closing, [
    { date: "09/01", description: "LEOMINSTER PROPERTIES RENT", amount: -2100 },
    { date: "09/04", description: "NASHOBA VALLEY MED PAYROLL", amount: 4880.12 },
    { date: "09/10", description: "FIDELITY BANK AUTO LOAN", amount: -389 },
    { date: "09/18", description: "NASHOBA VALLEY MED PAYROLL", amount: 4880.12 },
    { date: "09/24", description: "LOWELL FIVE MASTERCARD PMT", amount: -40 },
    { date: "09/26", description: "CHECK #212 CENTRAL MASS REALTY ESCROW", amount: -10000 },
    { date: "09/28", description: "MARKET BASKET DEBIT", amount: -702.9 },
  ]);
  for (const pg of [...chkAug.pages, ...chkSep.pages]) add(pg.document, pg.text);
  add("APPRAISAL", `UNIFORM RESIDENTIAL APPRAISAL REPORT -- Subject, site and reconciliation\nProperty: 31 Carter Street, Leominster MA 01453, Worcester County   Lender/client: ${BANKS.FID.legalName}\nContract price $450,000, contract date 10/03/2026\nFEMA special flood hazard area: NO   Zone X   map 25027C0257E\nOpinion of market value: $455,000 as of 10/15/2026 "as is". Estimated replacement cost new $401,000`);
  add("APPRAISAL", `Form 1004 -- Appraiser certification\nAppraiser: Marc Thibodeau, Certified Residential, MA license 104112\nSigned 10/16/2026`);
  add("CREDIT_REPORT", `TRI-MERGE CREDIT REPORT  Ordered by ${BANKS.FID.legalName}  Report date 10/08/2026\nPriya Natarajan -- Equifax 701  Experian 712  TransUnion 694\nFidelity Bank auto loan balance 12,200 payment 389/mo current; Lowell Five Mastercard limit 7,000 balance 640 minimum 40/mo current\nInquiries: 10/08/2026 ${BANKS.FID.legalName} (this application)`);
  add("CREDIT_REPORT", `Public records: none. Collections: none. Fraud and OFAC alerts: none.`);
  add("FLOOD_CERTIFICATE", `STANDARD FLOOD HAZARD DETERMINATION FORM\nLender: ${BANKS.FID.legalName}  Loan ${loanId}\nProperty: 31 Carter Street, Leominster MA 01453   Zone X\nIs building in a Special Flood Hazard Area? NO`);
  add("PURCHASE_AGREEMENT", `PURCHASE AND SALE AGREEMENT\nSeller: Gary Lavoie   Buyer: Priya Natarajan   Premises: 31 Carter Street, Leominster MA 01453\nPrice $450,000.00   Deposit $10,000.00 paid 09/26/2026   Closing date 11/20/2026\nSigned by all parties 10/03/2026. No addenda.`);
  add("FORM_4506C", `IRS Form 4506-C  Taxpayer: Priya Natarajan  Tax years 2024, 2025  IVES participant: ${BANKS.FID.legalName}\nSignature of taxpayer: /s/ Priya Natarajan   Date: 10/08/2026  (SIGNED)`);
  return {
    loanId, bankId: "FID", packageId, program: "Conventional 30-year fixed", investor: "Fannie Mae", purpose: "purchase",
    loanAmount: 360000, purchasePrice: 450000, appraisedValue: 455000, noteRate: 6.5, termMonths: 360,
    applicationDate: "2026-10-08", lock: { lockDate: "2026-10-09", lockExpires: "2026-11-30" }, scheduledConsummation: "2026-11-20",
    borrowers: [{ borrowerId: "01162-B1", name: "Priya Natarajan", role: "borrower", employment: { type: "salaried", employer: "Nashoba Valley Medical Group", position: "Practice Administrator", startDate: "2018-06-01" } }],
    property: { address: "31 Carter Street", city: "Leominster", state: "MA", zip: "01453", county: "Worcester", occupancy: "principal_residence", propertyType: "single_family_detached", floodZone: "X", specialFloodHazardArea: false },
    housingExpense: { principalAndInterest: 2275.44, propertyTax: 468.75, hazardInsurance: 121, floodInsurance: 0, association: 0 },
    liabilitiesFromApplication: [
      { creditor: "Fidelity Bank auto loan", type: "installment", balance: 12200, monthlyPayment: 389 },
      { creditor: "Lowell Five Mastercard", type: "revolving", balance: 640, monthlyPayment: 40 },
    ],
    cashToClose: { downPayment: 90000, closingCostsAndPrepaids: 11800, earnestMoneyCredited: 10000, estimatedCashToClose: 91800 },
    disclosureEvents: [
      { eventId: "DE-01162-01", type: "application", date: "2026-10-08" },
      { eventId: "DE-01162-02", type: "rate_lock", date: "2026-10-09", note: "Locked 6.5% through 2026-11-30" },
      { eventId: "DE-01162-03", type: "loan_estimate", date: "2026-10-14", method: "electronic", receivedConfirmed: "2026-10-14", note: "Initial Loan Estimate" },
      { eventId: "DE-01162-04", type: "scheduled_consummation", date: "2026-11-20" },
      { eventId: "DE-01162-05", type: "closing_disclosure_planned", date: "", method: "electronic, receipt not confirmed", receivedConfirmed: null, note: "Closing Disclosure not yet issued" },
    ],
    hmda: { loanAmount: 360000, propertyValue: 455000, loanPurpose: "1 (home purchase)", loanType: "1 (conventional)", lienStatus: "1 (first lien)", occupancy: "1 (principal residence)", actionTaken: null, applicationDate: "2026-10-08", stateCode: "MA", countyCode: "25027", censusTract: "25027709400", grossAnnualIncome: 180000, combinedLoanToValue: 80, constructionMethod: "1 (site-built)", totalUnits: 1 },
    gmi: { "01162-B1": { race: "2 (Asian)", ethnicity: "2 (Not Hispanic or Latino)", sex: "2 (Female)" } },
    pages: p.map((x, i) => ({ page: i + 1, ...x })),
    replyFacts: { salaryText: "$180,000.00 annual salary, paid biweekly", replacementCost: 401000 },
    loanOfficer: "Rachel Ouellette",
  };
}

/**
 * LN-CC5-26-04417 is the demo file: a large unexplained deposit and a pay stub
 * whose year-to-date figure does not match the W-2 trend. LN-FID-26-01162 is a
 * Fidelity loan that a Cape Cod 5 overlay would flag and the Fidelity policy
 * does not. The 05101/05102 pair is the demo file twice, differing ONLY in the
 * government monitoring information that no tool ever returns.
 */
export const LOANS: Record<string, LoanSeed> = Object.fromEntries([
  rourkeLoan("LN-CC5-26-04417", "PKG-04417", { "04417-B1": { race: "5 (White)", ethnicity: "2 (Not Hispanic or Latino)", sex: "1 (Male)" }, "04417-B2": { race: "5 (White)", ethnicity: "2 (Not Hispanic or Latino)", sex: "2 (Female)" } }),
  natarajanLoan(),
  rourkeLoan("LN-CC5-26-05101", "PKG-05101", { "05101-B1": { race: "5 (White)", ethnicity: "2 (Not Hispanic or Latino)", sex: "1 (Male)" }, "05101-B2": { race: "5 (White)", ethnicity: "2 (Not Hispanic or Latino)", sex: "2 (Female)" } }),
  rourkeLoan("LN-CC5-26-05102", "PKG-05102", { "05102-B1": { race: "3 (Black or African American)", ethnicity: "1 (Hispanic or Latino)", sex: "1 (Male)" }, "05102-B2": { race: "3 (Black or African American)", ethnicity: "1 (Hispanic or Latino)", sex: "2 (Female)" } }),
].map((l) => [l.loanId, l]));

export const getLoan = (loanId: unknown): LoanSeed | undefined =>
  typeof loanId === "string" ? LOANS[loanId.trim().toUpperCase()] : undefined;

export const loanByPackage = (packageId: unknown): LoanSeed | undefined =>
  Object.values(LOANS).find((l) => l.packageId === String(packageId ?? "").trim().toUpperCase());

/** The loan's own view of itself: everything the LOS records, never the government monitoring information. */
export function publicLoan(l: LoanSeed) {
  const { gmi: _gmi, pages: _pages, replyFacts: _facts, hmda: _hmda, ...rest } = l;
  const bank = BANKS[l.bankId];
  return { ...rest, owningBank: { bankId: bank.bankId, name: bank.name, legalName: bank.legalName }, packagePageCount: l.pages.length };
}
