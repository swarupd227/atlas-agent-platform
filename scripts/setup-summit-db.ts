/**
 * Builds the Summit Equipment Group dataset: schema, roles, seed data, and the
 * remittance PDFs the cash-application journey genuinely extracts from.
 *
 *   DATABASE_URL=postgres://admin:...@host:5432/db npx tsx scripts/setup-summit-db.ts
 *
 * Flags:
 *   --reset      drop and rebuild the schema (destructive; asks for confirmation
 *                unless --yes is also given)
 *   --docs-only  regenerate the PDFs without touching the database
 *   --yes        skip the destructive-action confirmation
 *
 * Creates two database roles with different privileges on purpose:
 *   summit_reader  SELECT only  — the connection agents explore with
 *   summit_writer  SELECT/INSERT/UPDATE — used only by the dealer action tools
 * so any ledger mutation is attributable to a deliberate action-tool call
 * rather than a stray analytical query.
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import pg from "pg";
import PDFDocument from "pdfkit";
import { CREATE_SCHEMA_SQL, DDL_SQL, DROP_SCHEMA_SQL, grantsSql, writeGrantsSql, SUMMIT_SCHEMA } from "../server/vitaledge-data/ddl";
import { validateSeedConsistency } from "../server/vitaledge-data/consistency";
import {
  BRANCHES, ACCOUNTS, OEM_PROGRAMS, LABOUR_STANDARDS, FLEET_ASSETS,
  INVOICES, INVOICE_LINES, PAYMENTS, REMITTANCE_ADVICES, DISPUTES,
  WORK_ORDERS, WORK_ORDER_LINES, RENTAL_CONTRACTS, TELEMATICS_READINGS,
  CONDITION_REPORTS, REBATE_PROGRAMS, AUCTION_COMPARABLES, DEALS, TRADE_INS,
  seedInventory,
} from "../server/vitaledge-data/seed";

const DOCS_DIR = path.resolve(process.cwd(), "server/vitaledge-data/documents");
const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const DOCS_ONLY = args.has("--docs-only");
const YES = args.has("--yes");

function log(m: string) { console.log(m); }
function step(m: string) { console.log("\n▸ " + m); }

async function confirm(question: string): Promise<boolean> {
  if (YES) return true;
  if (!process.stdin.isTTY) {
    console.log(`Refusing a destructive action in a non-interactive shell. Re-run with --yes if you are sure.\n  (${question})`);
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((res) => rl.question(`${question} [y/N] `, res));
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

// ── Remittance PDFs ──────────────────────────────────────────────────────────

/**
 * Generates the remittance advice as a real PDF. The agent extracts from this
 * file at call time with pdf-parse — there is no pre-parsed text column for the
 * scanned formats, so extraction quality is genuinely being exercised.
 */
function writeRemittancePdf(file: string, opts: {
  payer: string; paymentRef: string; total: number;
  lines: Array<{ invoice_id: string; amount_usd: number }>;
  note?: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    const out = fs.createWriteStream(file);
    out.on("finish", () => resolve());
    out.on("error", reject);
    doc.pipe(out);

    doc.fontSize(16).text(opts.payer, { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(10).text("REMITTANCE ADVICE", { align: "left" });
    doc.moveDown(0.2);
    doc.fontSize(9).text(`Payment reference: ${opts.paymentRef}`);
    doc.text(`Total remitted: $${opts.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    doc.moveDown(0.8);

    doc.fontSize(9).text("Invoice", 54, doc.y, { continued: true, width: 200 });
    doc.text("Amount", { align: "right" });
    doc.moveTo(54, doc.y + 2).lineTo(558, doc.y + 2).stroke();
    doc.moveDown(0.5);

    // Break every 14 lines so a long remittance is genuinely multi-page, the
    // way a scanned advice from a real customer arrives.
    let onPage = 0;
    for (const l of opts.lines) {
      if (doc.y > 690 || (onPage >= 14 && opts.lines.length > 16)) { doc.addPage(); onPage = 0; }
      onPage++;
      const y = doc.y;
      doc.fontSize(9).text(l.invoice_id, 54, y, { width: 200 });
      doc.text(`$${l.amount_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 350, y, { width: 208, align: "right" });
      doc.moveDown(0.15);
    }

    if (opts.note) { doc.moveDown(1); doc.fontSize(8).text(opts.note, { width: 500 }); }
    doc.end();
  });
}

async function generateDocuments(): Promise<Map<string, string>> {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const refs = new Map<string, string>();

  for (const adv of REMITTANCE_ADVICES) {
    if (adv.format !== "pdf_scan") continue;
    const pay = PAYMENTS.find((p) => p.payment_id === adv.payment_id)!;
    const acct = ACCOUNTS.find((a) => a.known_payer_names.includes(pay.payer_string));
    // Which invoices this payer is actually settling — read from the seed, so
    // the PDF and the database cannot disagree.
    const lines = INVOICES
      .filter((i) => acct && i.account_id === acct.account_id && i.status === "open")
      .map((i) => ({ invoice_id: i.invoice_id, amount_usd: i.balance_usd }));

    const total = lines.reduce((s, l) => s + l.amount_usd, 0);
    const use = Math.abs(total - pay.amount_usd) < 0.01
      ? lines
      : lines.slice(0, Math.max(1, Math.round(lines.length * (pay.amount_usd / (total || 1)))));

    const file = `${adv.advice_id}.pdf`;
    await writeRemittancePdf(path.join(DOCS_DIR, file), {
      payer: pay.payer_string,
      paymentRef: pay.bank_reference ?? adv.payment_id,
      total: pay.amount_usd,
      lines: use,
      note: "Please apply as itemised above. Queries to accounts payable.",
    });
    refs.set(adv.advice_id, file);
    log(`  ✓ ${file} — ${use.length} invoice line(s)`);
  }
  return refs;
}

// ── Seeding ──────────────────────────────────────────────────────────────────

async function insertRows(client: pg.PoolClient, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  for (const r of rows) {
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
    await client.query(
      `INSERT INTO ${SUMMIT_SCHEMA}.${table} (${cols.join(",")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      cols.map((c) => (r as Record<string, unknown>)[c])
    );
  }
  return rows.length;
}

async function main() {
  log("═══════════════════════════════════════════════════════════════");
  log("  Summit Equipment Group — dataset setup");
  log("═══════════════════════════════════════════════════════════════");

  // Refuse to build a dataset that contradicts the eval cases.
  const consistency = validateSeedConsistency();
  if (!consistency.ok) {
    log(`\nRefusing to load — ${consistency.errors.length} seed inconsistenc(ies). Run:`);
    log("  npx tsx scripts/validate-summit-data.ts");
    process.exit(1);
  }
  log(`\n✓ Seed passes ${consistency.checks} consistency checks against the eval cases.`);

  step("Generating remittance documents");
  const docRefs = await generateDocuments();

  if (DOCS_ONLY) {
    log("\n--docs-only: database untouched.");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    log("\nDATABASE_URL is not set. Provide an admin connection string:");
    log("  DATABASE_URL=postgres://user:pass@host:5432/db npx tsx scripts/setup-summit-db.ts");
    process.exit(1);
  }

  const readerPw = process.env.SUMMIT_READER_PASSWORD;
  const writerPw = process.env.SUMMIT_WRITER_PASSWORD;
  if (!readerPw || !writerPw) {
    log("\nSet SUMMIT_READER_PASSWORD and SUMMIT_WRITER_PASSWORD before running.");
    log("Generate them with:  openssl rand -base64 24");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2 });
  const client = await pool.connect();

  try {
    if (RESET) {
      const okToDrop = await confirm(`DROP SCHEMA ${SUMMIT_SCHEMA} CASCADE — this permanently deletes all Summit data. Continue?`);
      if (!okToDrop) { log("Aborted; nothing was changed."); return; }
      step(`Dropping schema ${SUMMIT_SCHEMA}`);
      await client.query(DROP_SCHEMA_SQL);
    }

    step("Creating schema and tables");
    await client.query(CREATE_SCHEMA_SQL);
    await client.query(DDL_SQL);
    log("  ✓ 24 tables");

    step("Creating scoped roles");
    for (const [role, pw] of [["summit_reader", readerPw], ["summit_writer", writerPw]] as const) {
      const exists = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [role]);
      if (exists.rowCount) {
        await client.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD $1`, [pw]);
        log(`  · ${role} — password rotated`);
      } else {
        await client.query(`CREATE ROLE ${role} WITH LOGIN PASSWORD $1`, [pw]);
        log(`  ✓ ${role} created`);
      }
    }
    await client.query(grantsSql("summit_reader"));
    await client.query(writeGrantsSql("summit_writer"));
    log("  ✓ grants applied (reader: SELECT only; writer: SELECT/INSERT/UPDATE)");

    step("Seeding");
    const advices = REMITTANCE_ADVICES.map((a) => {
      const ref = a.format === "pdf_scan" ? (docRefs.get(a.advice_id) ?? a.file_ref) : a.file_ref;
      const onDisk = a.format === "pdf_scan" && ref ? path.join(DOCS_DIR, ref) : null;
      return {
        ...a,
        file_ref: ref,
        // The PDF travels with the data, not the filesystem.
        file_bytes: onDisk && fs.existsSync(onDisk) ? fs.readFileSync(onDisk) : null,
      };
    });

    const plan: Array<[string, Record<string, unknown>[]]> = [
      ["branches", BRANCHES as never],
      ["customer_accounts", ACCOUNTS as never],
      ["oem_programs", OEM_PROGRAMS as never],
      ["labour_standards", LABOUR_STANDARDS as never],
      ["fleet_assets", FLEET_ASSETS as never],
      ["invoices", INVOICES as never],
      ["invoice_lines", INVOICE_LINES as never],
      ["payments", PAYMENTS as never],
      ["remittance_advices", advices as never],
      ["disputes", DISPUTES as never],
      ["work_orders", WORK_ORDERS as never],
      ["work_order_lines", WORK_ORDER_LINES as never],
      ["rental_contracts", RENTAL_CONTRACTS as never],
      ["telematics_readings", TELEMATICS_READINGS as never],
      ["condition_reports", CONDITION_REPORTS as never],
      ["rebate_programs", REBATE_PROGRAMS as never],
      ["auction_comparables", AUCTION_COMPARABLES as never],
      ["deals", DEALS as never],
      ["trade_ins", TRADE_INS as never],
    ];

    await client.query("BEGIN");
    let total = 0;
    for (const [table, rows] of plan) {
      const n = await insertRows(client, table, rows);
      total += n;
      log(`  ✓ ${table.padEnd(22)} ${String(n).padStart(4)} rows`);
    }
    await client.query("COMMIT");
    log(`  ─────────────────────────────────────\n  ✓ ${total} rows loaded`);

    step("Verifying against the database");
    const checks: Array<[string, string, number]> = [
      ["Ridgeline total", `SELECT COALESCE(SUM(balance_usd),0) v FROM ${SUMMIT_SCHEMA}.invoices WHERE account_id='ACC-4417' AND status='open'`, 284000],
      ["Marchetti open", `SELECT COALESCE(SUM(balance_usd),0) v FROM ${SUMMIT_SCHEMA}.invoices WHERE account_id='ACC-4310' AND status='open'`, 206000],
      ["Vantage open", `SELECT COALESCE(SUM(balance_usd),0) v FROM ${SUMMIT_SCHEMA}.invoices WHERE account_id='ACC-4501' AND status='open'`, 412000],
      ["Serial collision", `SELECT COUNT(*) v FROM ${SUMMIT_SCHEMA}.fleet_assets WHERE serial_number='A1J02931'`, 2],
      ["Remittance PDFs stored", `SELECT COUNT(*) v FROM ${SUMMIT_SCHEMA}.remittance_advices WHERE file_bytes IS NOT NULL`, 2],
    ];
    let failed = 0;
    for (const [label, sql, expected] of checks) {
      const { rows } = await client.query(sql);
      const got = Math.round(parseFloat(rows[0].v) * 100) / 100;
      const pass = Math.abs(got - expected) < 0.01;
      if (!pass) failed++;
      log(`  ${pass ? "✓" : "✗"} ${label.padEnd(20)} expected ${expected}, got ${got}`);
    }
    if (failed) { log(`\n${failed} post-load check(s) failed.`); process.exit(1); }

    const host = new URL(url).hostname;
    const database = new URL(url).pathname.replace(/^\//, "");
    log("\n═══════════════════════════════════════════════════════════════");
    log("  Loaded. Configure the two connections with:");
    log("═══════════════════════════════════════════════════════════════");
    log(`\n  Read-only analyst connection (integration: postgres, createNew: true)`);
    log(`    host=${host}  database=${database}  user=summit_reader  ssl=require`);
    log(`    allowedTables=${Object.keys(seedInventory()).join(",")}`);
    log(`\n  Dealer action connection (integration: vitaledge-dealer)`);
    log(`    host=${host}  database=${database}  user=summit_writer  schema=${SUMMIT_SCHEMA}  ssl=require`);
    log(`\n  Then: npx tsx scripts/provision-vitaledge.ts`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
