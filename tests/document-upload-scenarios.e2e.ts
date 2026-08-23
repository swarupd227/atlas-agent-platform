/**
 * Document upload — six business scenarios across every surface that takes a
 * file, driven through the real UI (permanent regression).
 *
 *   DOC-1. Workspace      .xlsx  — reconcile a disputed invoice batch
 *   DOC-2. Agent Wizard   .docx  — draft an agent from an SOP, no typed prose
 *   DOC-3. Process Flow   .pdf   — build a flow from a regulator's procedure
 *   DOC-4. Knowledge Base .pptx  — ingest a deck (KB has its OWN reader)
 *   DOC-5. Eval Datasets  .csv   — import labelled goldens
 *   DOC-6. Workspace      .md + .xlsx — two files, cross-document reasoning
 *
 * Each document carries facts that exist nowhere else in the platform, so a
 * surface that echoes them back has genuinely read the file. A generic but
 * plausible answer fails these tests; that is the point of them.
 *
 * Fixtures are built in-memory rather than committed. Binary fixtures are
 * opaque in a diff, and the exact bytes each assertion depends on should be
 * readable right here.
 *
 * Target: E2E_BASE_URL (production-mode targets also need E2E_ADMIN_PASSWORD).
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import JSZip from "jszip";
import PDFDocument from "pdfkit";

/**
 * playwright.config.ts sets a global `extraHTTPHeaders: { "Content-Type":
 * "application/json" }`, which is right for the API-only specs but fatal here:
 * it overrides the browser's own Content-Type on a multipart upload, so the
 * boundary is lost and express.json() tries to parse "------WebKitFormBoundary"
 * as JSON. The upload then 400s with "Unexpected token '-'" and no chip ever
 * renders. Clearing it for this file is the narrow fix; every spec in here
 * uploads a file.
 */
test.use({ extraHTTPHeaders: {} });

let DIR: string;
const p = (name: string) => path.join(DIR, name);

async function primePage(page: Page) {
  await page.addInitScript(() => {
    // The first-run industry overlay re-renders over everything until this is set.
    localStorage.setItem("almp-industry", "cross_industry");
    localStorage.setItem("almp-role", "admin");
  });
}

// ─── fixtures ────────────────────────────────────────────────────────────────

async function buildXlsx(): Promise<Buffer> {
  const rows: (string | number)[][] = [
    ["InvoiceId", "Vendor", "Billed", "Contracted", "Variance"],
    ["INV-4471", "Northwind Logistics", 18250, 16000, 2250],
    ["INV-4472", "Fabrikam Freight", 9400, 9400, 0],
    ["INV-4473", "Contoso Haulage", 47820, 31500, 16320],
    ["INV-4474", "Tailspin Transit", 3100, 3100, 0],
    ["INV-4475", "Northwind Logistics", 22600, 21000, 1600],
  ];
  const strings: string[] = [];
  const sidx = (s: string) => { const i = strings.indexOf(s); if (i >= 0) return i; strings.push(s); return strings.length - 1; };
  const sheet = rows.map((row, r) =>
    `<row r="${r + 1}">${row.map((v, c) => {
      const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
      return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${sidx(v)}</v></c>`;
    }).join("")}</row>`).join("");

  const zip = new JSZip();
  zip.file("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns:r="http://x"><sheets><sheet name="Disputed Invoices" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><sst>${strings.map(s => `<si><t>${s}</t></si>`).join("")}</sst>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet><sheetData>${sheet}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildDocx(): Promise<Buffer> {
  const paras = [
    "Vendor Onboarding — Standard Operating Procedure",
    "Reference: VOP-208. Owner: Procurement Operations.",
    "1. Vendor submits the onboarding pack, including form VOP-208 and a current W-9.",
    "2. Procurement analyst verifies the vendor's tax identification against the registry.",
    "3. If the vendor is not registered, reject the pack and notify the requester with reason code R-14.",
    "4. Run a sanctions screening against the vendor's legal entity name.",
    "5. If the sanctions screening returns any hit, escalate to Compliance and halt onboarding.",
    "6. Assess the annual contract value declared on form VOP-208.",
    "7. If annual contract value is 250000 dollars or less, the procurement analyst approves the vendor directly.",
    "8. If annual contract value exceeds 250000 dollars, the Head of Procurement must approve before activation.",
    "9. On approval, create the vendor master record and issue a vendor number.",
    "10. Notify the requester and the vendor that onboarding is complete.",
    "Constraint: never activate a vendor with an open sanctions hit, regardless of contract value.",
  ];
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${
    paras.map(t => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

function buildPdf(): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(16).text("Customer Complaint Handling Procedure");
    doc.moveDown().fontSize(11);
    [
      "Reference: CHP-31. Applies to all regulated retail complaints.",
      "1. A complaint is received through any channel and logged within one business day.",
      "2. Acknowledge receipt to the customer within three business days.",
      "3. Classify the complaint as either service, billing, or advice.",
      "4. An advice complaint must be routed to the Advice Review Officer without exception.",
      "5. Investigate the complaint and gather the account history.",
      "6. Determine whether the complaint is upheld or not upheld.",
      "7. If upheld and the redress amount is 750 pounds or less, the case handler issues redress directly.",
      "8. If upheld and the redress amount is more than 750 pounds, the Complaints Manager must authorise the payment.",
      "9. If not upheld, issue a final response letter setting out the reasoning and referral rights.",
      "10. Send the final response within eight weeks of receipt.",
      "11. Record the outcome in the complaints register and close the case.",
    ].forEach(l => doc.text(l));
    doc.end();
  });
}

async function buildPptx(): Promise<Buffer> {
  const slides = [
    ["Aurora Payments Platform — Enablement", "Release train 2026.3"],
    ["What changed in 2026.3", "Settlement window shortened to T+1", "Chargeback SLA now 12 business days", "New dispute reason code DR-88"],
    ["Pricing tiers", "Standard: 1.4 percent plus 20p", "Enterprise: negotiated, minimum 10 million annual"],
    ["Known limitations", "DR-88 disputes cannot be auto-accepted", "Sandbox does not simulate T+1 settlement"],
  ];
  const zip = new JSZip();
  slides.forEach((lines, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0"?><p:sld xmlns:p="http://p" xmlns:a="http://a"><p:cSld><p:spTree>${
        lines.map(t => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:spTree></p:cSld></p:sld>`);
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * A workbook deliberately larger than the extractor's 5,000-row ceiling, with a
 * unique marker past the cutoff.
 *
 * Written as a COMPLETE OOXML package -- [Content_Types].xml and the package
 * rels included -- unlike the minimal fixtures elsewhere in these tests. Our own
 * reader is lenient enough to skip them; openpyxl inside the container is not,
 * and calls such a file corrupt. The point of this fixture is a file of the kind
 * a person actually exports from Excel.
 */
async function buildBigLedgerXlsx(marker: number, markerRow: number): Promise<Buffer> {
  const NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    + `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`
    + `</Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${MAIN}" xmlns:r="${NS}">`
    + `<sheets><sheet name="Ledger" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${NS}/worksheet" Target="worksheets/sheet1.xml"/>`
    + `<Relationship Id="rId2" Type="${NS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
  zip.file("xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${MAIN}" count="2" uniqueCount="2"><si><t>RowId</t></si><si><t>Amount</t></si></sst>`);

  const rows = [`<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>`];
  for (let i = 2; i <= 5201; i++) {
    rows.push(`<row r="${i}"><c r="A${i}"><v>${i}</v></c><c r="B${i}"><v>${i === markerRow ? marker : (i % 97) + 1}</v></c></row>`);
  }
  zip.file("xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${MAIN}"><sheetData>${rows.join("")}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

const POLICY_MD = `# Freight Billing Policy — FBP-12

## Variance tolerance
- A billed amount may exceed the contracted amount by up to 10 percent without review.
- A variance above 10 percent must be queried with the vendor before payment.
- A variance above 15000 must additionally be escalated to the Finance Controller.

## Vendor standing
- Northwind Logistics is on a negotiated tolerance of 15 percent until the end of Q4.
- All other vendors are held to the standard 10 percent.
`;

/**
 * The goldens importer requires an `input` column (and optionally
 * `expectedOutput`) -- see the Import Goldens dialog. A ticket export shaped
 * ticket_id,channel,summary,... parses to records with no `input`, the preview
 * stays empty, and the Import button never enables. So this fixture is a real
 * ticket set expressed in the importer's own contract.
 */
const TICKETS_CSV = [
  "input,expectedOutput",
  '"TK-9001: Card declined at checkout despite sufficient funds","billing / high"',
  '"TK-9002: How do I export my monthly statement","self_service / low"',
  '"TK-9003: Unauthorised transaction of 1240 on my account","fraud / critical"',
  '"TK-9004: Settlement arrived a day later than expected","settlement / medium"',
  '"TK-9005: Requesting refund for duplicate charge DR-88","dispute / high"',
].join("\n");

test.beforeAll(async () => {
  DIR = mkdtempSync(path.join(tmpdir(), "doc-scenarios-"));
  writeFileSync(p("disputed-invoices-q3.xlsx"), await buildXlsx());
  writeFileSync(p("vendor-onboarding-sop.docx"), await buildDocx());
  writeFileSync(p("complaint-handling-procedure.pdf"), await buildPdf());
  writeFileSync(p("aurora-enablement.pptx"), await buildPptx());
  writeFileSync(p("freight-billing-policy.md"), POLICY_MD);
  writeFileSync(p("support-tickets-eval.csv"), TICKETS_CSV);
});

/** The Workspace agent picker is a Radix Select; options carry the agent id. */
async function pickFirstAgent(page: Page, request: APIRequestContext): Promise<any> {
  const list = await (await request.get("/api/workspace/agents")).json();
  const agent = Array.isArray(list) ? list[0] : null;
  test.skip(!agent, "no runnable agent in this environment");
  await page.getByTestId("select-workspace-agent").click();
  await page.getByTestId(`option-agent-${agent.id}`).click();
  return agent;
}

// ─── DOC-1 — Workspace, .xlsx ────────────────────────────────────────────────
test("DOC-1. Workspace: a spreadsheet attachment answers a question only the file can answer", async ({ page, request }) => {
  test.setTimeout(180_000);
  await primePage(page);
  await page.goto("/workspace");
  await expect(page.getByTestId("page-workspace")).toBeVisible({ timeout: 20_000 });

  await pickFirstAgent(page, request);

  // Upload happens on CHOOSE, not on send -- the chip proves the server read it.
  await page.getByTestId("input-file-attach-workspace").setInputFiles(p("disputed-invoices-q3.xlsx"));
  const chip = page.locator('[data-testid^="chip-file-"]').first();
  await expect(chip, "the chip renders as soon as the file is read").toBeVisible({ timeout: 60_000 });
  await expect(chip, "the chip carries the server's own summary of the workbook").toContainText("Disputed Invoices");

  await page.getByTestId("input-workspace-ask").fill(
    "From the attached spreadsheet, which invoice has the largest variance between Billed and Contracted? Give the InvoiceId, the vendor, and the variance amount.");
  await page.getByTestId("button-workspace-send").click();

  const answer = page.getByTestId("workspace-answer").first();
  await expect(answer).toBeVisible({ timeout: 150_000 });
  // Facts that exist only inside the workbook.
  await expect(answer).toContainText("INV-4473");
  await expect(answer).toContainText("Contoso");
  await expect(answer).toContainText(/16[,.]?320/);
  console.log("  ✓ DOC-1: xlsx → agent answered INV-4473 / Contoso / 16,320");
});

// ─── DOC-2 — Agent Wizard, .docx ─────────────────────────────────────────────
test("DOC-2. Agent Wizard: an SOP alone drafts an agent, with no typed description", async ({ page }) => {
  test.setTimeout(240_000);
  await primePage(page);
  await page.goto("/agents/wizard");

  // The AI Assistant panel only exists from step 1 onward, so advance one step.
  await page.getByPlaceholder("e.g., Customer Support Agent").fill("Vendor Onboarding Agent");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "AI Assistant" }).click();

  await page.getByTestId("input-file-attach-wizard").setInputFiles(p("vendor-onboarding-sop.docx"));
  await expect(page.locator('[data-testid^="chip-file-"]').first()).toBeVisible({ timeout: 60_000 });

  // Deliberately leave the description empty: the document IS the request.
  await expect(page.getByTestId("button-draft-agent"), "a document alone must enable drafting").toBeEnabled();
  await page.getByTestId("button-draft-agent").click();

  // Wait for the DRAFT to land, not merely for the page to mention the agent
  // name -- "Vendor Onboarding Agent" was typed in by this test two steps ago,
  // so any assertion matching it passes instantly and proves nothing.
  // .first() because the toast renders twice in the accessibility tree: the
  // visible title node and a role="status" aria-live announcer.
  await expect(
    page.getByText(/Draft ready|Draft failed/i).first(),
    "drafting should finish and report an outcome",
  ).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText(/Draft failed/i), "drafting must not fail").toHaveCount(0);

  // Drafting must land on Review & Create, where the drafted fields live and
  // where the Create button is. This is a real regression guard: inserting
  // "Autonomous Agent Mode" at step 8 pushed Review from 8 to 9 while the
  // drafter still called setCurrentStep(8), so a successful draft appeared to
  // vanish -- the user landed on the autonomy step with an empty form.
  await expect(
    page.getByRole("heading", { name: /Review & Create/i }),
    "drafting should land on Review & Create, not the autonomy step",
  ).toBeVisible({ timeout: 20_000 });

  // The draft populates FORM FIELDS, and input/textarea values are not part of
  // innerText -- asserting on page text alone would miss the entire draft.
  const drafted = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea")]
      .map((el) => (el as HTMLInputElement | HTMLTextAreaElement).value).join("\n"));
  const shown = await page.locator("body").innerText();

  // Terms only the SOP could have supplied. "vendor"/"onboarding" are
  // deliberately excluded: this test typed "Vendor Onboarding Agent" as the
  // name two steps ago, so matching those would prove nothing.
  expect(`${drafted}\n${shown}`, "the draft must reflect the SOP, not a generic agent")
    .toMatch(/sanction|VOP-208|250000|250,000|W-9|R-14|Head of Procurement/i);
  console.log("  ✓ DOC-2: docx SOP alone → agent draft grounded in the document");
});

// ─── DOC-3 — Process Flow, .pdf ──────────────────────────────────────────────
test("DOC-3. Process Flow: a procedure PDF becomes a flow that keeps its branch", async ({ page }) => {
  test.setTimeout(240_000);
  await primePage(page);
  await page.goto("/process-flows");
  await page.getByRole("button", { name: /describe workflow/i }).click();

  await page.getByTestId("input-file-attach-process_flow").setInputFiles(p("complaint-handling-procedure.pdf"));
  await expect(page.locator('[data-testid^="chip-file-"]').first()).toBeVisible({ timeout: 60_000 });

  await expect(page.getByTestId("button-ai-generate"), "a document alone must enable generation").toBeEnabled();
  await page.getByTestId("button-ai-generate").click();

  // A documented process must not be squashed into the 5-10 node shape that
  // suits a one-line description.
  const nodes = page.locator(".react-flow__node");
  await expect(nodes.first()).toBeVisible({ timeout: 200_000 });
  await expect
    .poll(async () => nodes.count(), { timeout: 60_000, message: "an 11-step procedure should not compress to under 10 nodes" })
    .toBeGreaterThan(9);

  const canvas = await page.locator(".react-flow").innerText();
  expect(canvas, "the flow must reflect the PDF, not a generic complaint flow").toMatch(/complaint|redress|advice|uphold|upheld/i);
  console.log(`  ✓ DOC-3: pdf → ${await nodes.count()} nodes, grounded in CHP-31`);
});

// ─── DOC-4 — Knowledge Base, .pptx (the KB's OWN reader) ─────────────────────
test("DOC-4. Knowledge Base: a deck ingests as readable text, not zip binary", async ({ page, request }) => {
  test.setTimeout(180_000);
  const kbs = await (await request.get("/api/knowledge-bases")).json();
  const kb = Array.isArray(kbs) ? kbs[0] : null;
  test.skip(!kb, "no knowledge base available in this environment");

  await primePage(page);
  await page.goto(`/knowledge-bases/${kb.id}`);
  await page.getByTestId("tab-sources").click();

  // The KB input is hidden behind its own button and has no testid of its own.
  await page.locator('input[type="file"]').first().setInputFiles(p("aurora-enablement.pptx"));

  // Regression guard: before the shared extractor landed, a .pptx fell through
  // to buffer.toString("utf-8") and the KB silently ingested zip binary.
  await expect
    .poll(async () => {
      const sources = await (await request.get(`/api/knowledge-bases/${kb.id}/sources`)).json();
      const mine = (Array.isArray(sources) ? sources : []).find((s: any) => /aurora-enablement/.test(s.name ?? s.filename ?? ""));
      return mine?.status ?? "absent";
    }, { timeout: 150_000, message: "the uploaded deck should reach a terminal ingest state" })
    .toMatch(/embedded|ready|complete|processed|active/i);
  console.log("  ✓ DOC-4: pptx ingested by the KB reader");
});

// ─── DOC-5 — Eval Datasets, .csv ─────────────────────────────────────────────
test("DOC-5. Eval Datasets: labelled goldens import from a CSV", async ({ page }) => {
  test.setTimeout(120_000);
  await primePage(page);
  await page.goto("/evals/datasets");
  // 60s, not 20s: these specs are normally run straight after a deploy, and an
  // App Service cold start makes the first lazy route load several times slower
  // than steady state (a whole suite run took 7.4m warming up vs 3.5m warm).
  await expect(page.getByTestId("heading-eval-datasets")).toBeVisible({ timeout: 60_000 });

  // Import lives in the goldens toolbar INSIDE a dataset, not on the list page.
  // isVisible() does NOT auto-wait -- calling it straight after navigation
  // reports false while the list is still loading and silently skips the test.
  // waitFor() retries, so an absent dataset is a real skip and a slow one is not.
  const firstDataset = page.locator('[data-testid^="button-dataset-"]').first();
  const haveDataset = await firstDataset.waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true).catch(() => false);
  test.skip(!haveDataset, "no eval dataset exists in this environment");
  await firstDataset.click();

  const importBtn = page.getByTestId("button-import").or(page.getByTestId("button-empty-import")).first();
  await expect(importBtn, "the goldens toolbar should offer Import").toBeVisible({ timeout: 20_000 });
  await importBtn.click();

  // The dialog's own hidden input, not the page's first file input.
  await page.locator('[role="dialog"] input[type="file"]').setInputFiles(p("support-tickets-eval.csv"));

  // The dialog previews parsed records before committing, and only enables
  // Import once parsing produced some -- both are the real proof it read the CSV.
  await expect(page.getByText(/Preview · first 5 of 5 records/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[role="dialog"]')).toContainText("TK-9001");
  await expect(page.getByTestId("button-import-goldens")).toBeEnabled();
  await expect(page.getByTestId("button-import-goldens")).toContainText("Import 5 Goldens");
  console.log("  ✓ DOC-5: csv goldens imported");
});

// ─── DOC-8 — code execution container, .xlsx ─────────────────────────────────
/**
 * The one scenario the extracted text CANNOT pass.
 *
 * The workbook holds 5,200 data rows against a 5,000-row extraction cap, and
 * the marker value sits at row 5,150 -- past the cutoff, so it is physically
 * absent from the text in the prompt. Only an agent that received the real file
 * in its code execution container can report it.
 *
 * Needs an agent with an APPROVED code-execution skill on a Claude model;
 * skips loudly rather than passing vacuously when the environment has none.
 */
test("DOC-8. Code execution: the real file reaches the container, not just the extract", async ({ request }) => {
  test.setTimeout(300_000);

  const agents = await (await request.get("/api/agents")).json();
  const candidates = (Array.isArray(agents) ? agents : []).filter(
    (a: any) => a.modelProvider === "anthropic"
      && typeof a.modelName === "string" && a.modelName.startsWith("claude")
      && Array.isArray(a.preloadedSkills) && a.preloadedSkills.length > 0
      && a.status === "active");

  let agent: any = null;
  for (const c of candidates) {
    const skills = await (await request.get(`/api/skills`)).json();
    const ids = new Set((c.preloadedSkills as any[]).map((p) => p.skillId));
    const hasCodeExec = (Array.isArray(skills) ? skills : []).some(
      (s: any) => ids.has(s.id) && s.skillKind === "code_execution" && s.codeExecutionApproved);
    if (hasCodeExec) { agent = c; break; }
  }
  test.skip(!agent, "no agent with an approved code-execution skill on a Claude model");

  const MARKER = 987654, MARKER_ROW = 5150;
  const buf = await buildBigLedgerXlsx(MARKER, MARKER_ROW);
  const bigPath = p("ledger-big.xlsx");
  writeFileSync(bigPath, buf);

  const upload = await request.post("/api/files/upload", {
    multipart: { files: { name: "ledger-big.xlsx", mimeType: XLSX_MIME, buffer: buf }, context: "workspace" },
  });
  expect(upload.status()).toBe(201);
  const fileId = (await upload.json()).files[0].id;

  // The premise: the text genuinely cannot answer this.
  const meta = await (await request.get(`/api/files/${fileId}`)).json();
  expect(meta.meta?.truncated, "a sheet past the row cap must declare truncation").toBe(true);
  expect(String(meta.preview ?? ""), "the marker must be absent from the extract").not.toContain(String(MARKER));

  const run = await request.post("/api/workspace/runs", {
    data: {
      agentId: agent.id,
      input: `The attached workbook has 5200 data rows. Using code execution, load it with pandas and report the SINGLE LARGEST value in the Amount column and the RowId it is on. The answer is past row 5000, so read the actual file rather than any truncated preview.`,
      fileIds: [fileId],
    },
  });
  const runId = (await run.json()).id;

  let final: any = null;
  for (let i = 0; i < 55; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const body = await (await request.get(`/api/workspace/runs/${runId}`)).json();
    if (["completed", "completed_with_skips", "failed", "error", "cancelled"].includes(body.status)) { final = body; break; }
  }
  expect(final, "the run should reach a terminal state").toBeTruthy();

  const answer = String(final.outputSummary ?? "").replace(/(\d),(?=\d{3}\b)/g, "$1");
  expect(answer, "only a container that got the real file can see past the cutoff").toContain(String(MARKER));
  expect(answer).toContain(String(MARKER_ROW));
  console.log("  ✓ DOC-8: container computed a value the extract could not contain");
});

// ─── DOC-7 — Playground, .xlsx ───────────────────────────────────────────────
test("DOC-7. Playground: an attachment reaches the agent mid-conversation", async ({ page, request }) => {
  test.setTimeout(180_000);
  const list = await (await request.get("/api/workspace/agents")).json();
  const agent = Array.isArray(list) ? list[0] : null;
  test.skip(!agent, "no agent available in this environment");

  await primePage(page);
  await page.goto(`/agents/${agent.id}/playground`);

  // A session must exist before the composer will send anything.
  await page.getByTestId("button-new-session").click();
  const composer = page.getByTestId("input-chat-message").first();
  await expect(composer).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("input-file-attach-playground").first().setInputFiles(p("disputed-invoices-q3.xlsx"));
  await expect(page.locator('[data-testid^="chip-file-"]').first()).toBeVisible({ timeout: 60_000 });

  await composer.fill("Which invoice in the attached spreadsheet has the largest variance? Give the InvoiceId and the amount.");
  await page.getByTestId("button-send-message").first().click();

  await expect(page.locator("body")).toContainText("INV-4473", { timeout: 150_000 });
  await expect(page.locator("body")).toContainText(/16[,.]?320/);
  console.log("  ✓ DOC-7: playground attachment answered from the file");
});

// ─── DOC-6 — Workspace, two files ────────────────────────────────────────────
test("DOC-6. Workspace: two attachments, and the answer needs both", async ({ page, request }) => {
  test.setTimeout(180_000);
  await primePage(page);
  await page.goto("/workspace");
  await expect(page.getByTestId("page-workspace")).toBeVisible({ timeout: 20_000 });
  await pickFirstAgent(page, request);

  await page.getByTestId("input-file-attach-workspace")
    .setInputFiles([p("freight-billing-policy.md"), p("disputed-invoices-q3.xlsx")]);
  await expect(page.locator('[data-testid^="chip-file-"]')).toHaveCount(2, { timeout: 60_000 });

  await page.getByTestId("input-workspace-ask").fill(
    "Using the attached policy and the attached invoice spreadsheet, list every invoice that must be QUERIED with the vendor before payment. Apply each vendor's own tolerance. For each one say why.");
  await page.getByTestId("button-workspace-send").click();

  const answer = page.getByTestId("workspace-answer").first();
  await expect(answer).toBeVisible({ timeout: 150_000 });
  const text = await answer.innerText();

  // INV-4473 is 51.8% over — a query under any reading.
  expect(text, "the clear breach must be flagged").toContain("INV-4473");

  // The real test. INV-4471 is 14.06% over, which breaches the STANDARD 10%
  // tolerance but sits inside Northwind's negotiated 15%. An agent that read
  // only the spreadsheet, or only skimmed the policy, flags it. Both documents
  // together say it must not be queried.
  expect(text, "INV-4471 is inside Northwind's negotiated 15% and must not be queried")
    .not.toMatch(/INV-4471[^.]{0,80}(query|queried|must be raised)/i);
  console.log("  ✓ DOC-6: two attachments, vendor-specific tolerance applied correctly");
});
