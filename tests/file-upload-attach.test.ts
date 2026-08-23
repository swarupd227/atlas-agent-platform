import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

/**
 * Covers server/attachment-context.ts — the step that turns uploaded rows into
 * the text an agent actually sees. The extraction itself is covered by
 * tests/file-extract.test.ts; this is about ordering, scoping and honesty.
 *
 * These call the real functions. An earlier version of this file re-implemented
 * the builder locally and asserted against the copy, which can pass while the
 * shipped code is broken.
 */

/** Rows the mocked DB will return, regardless of the where-clause — org
 *  scoping is expressed by what the test puts in here. */
let rows: any[] = [];
vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: (_w: any) => Promise.resolve(rows) }) }),
  },
}));

import { extractTextFromFile } from "../server/file-extract";
import { buildAttachmentContext, buildSourceDocuments, readAttachedFiles } from "../server/attachment-context";

const file = (over: any = {}) => ({
  id: "f1", filename: "a.txt", extractedText: "hello", extractMeta: {}, ...over,
});

beforeEach(() => { rows = []; });

describe("attachment context (workspace chat framing)", () => {
  it("is empty when nothing is attached", async () => {
    expect((await buildAttachmentContext([], "org")).context).toBe("");
  });

  it("preserves the order the user attached them in, not DB order", async () => {
    rows = [
      file({ id: "b", filename: "second.txt", extractedText: "SECOND" }),
      file({ id: "a", filename: "first.txt", extractedText: "FIRST" }),
    ];
    const { context, names } = await buildAttachmentContext(["a", "b"], "org");
    expect(names).toEqual(["first.txt", "second.txt"]);
    expect(context.indexOf("FIRST")).toBeLessThan(context.indexOf("SECOND"));
  });

  it("drops ids that resolved to nothing rather than inventing a placeholder", async () => {
    // Org-scoped lookup means another tenant's id simply isn't returned.
    rows = [file({ id: "mine", filename: "mine.txt" })];
    const { context, names } = await buildAttachmentContext(["mine", "someone-elses"], "org");
    expect(names).toEqual(["mine.txt"]);
    expect(context).not.toContain("someone-elses");
  });

  it("labels a spreadsheet with its sheet names", async () => {
    rows = [file({ filename: "q3.xlsx", extractMeta: { sheets: ["Revenue", "Costs"] }, extractedText: "| a |" })];
    const { context } = await buildAttachmentContext(["f1"], "org");
    expect(context).toContain("q3.xlsx (sheets: Revenue, Costs)");
  });

  it("says a file was truncated, so the agent can flag partial data", async () => {
    rows = [file({ extractMeta: { truncated: true } })];
    expect((await buildAttachmentContext(["f1"], "org")).context).toContain("TRUNCATED");
  });

  it("marks an unreadable file explicitly instead of attaching an empty block", async () => {
    // A scanned PDF extracts to nothing; silence would read as the agent
    // ignoring the upload.
    rows = [file({ filename: "scan.pdf", extractedText: "   " })];
    expect((await buildAttachmentContext(["f1"], "org")).context).toContain("(no readable text in this file)");
  });

  it("tells the agent not to guess at content it cannot see", async () => {
    rows = [file()];
    expect((await buildAttachmentContext(["f1"], "org")).context).toContain("rather than guessing");
  });
});

describe("source documents (authoring framing)", () => {
  it("frames the file as a specification to build from, not a question to answer", async () => {
    // The wizard drafts an agent FROM an SOP. Chat framing would tell the
    // drafter to answer the SOP instead of building from it.
    rows = [file({ filename: "sop.docx", extractedText: "Step 1. Receive claim." })];
    const { text } = await buildSourceDocuments(["f1"], "org");
    expect(text).toContain("the source for this request");
    expect(text).not.toContain("Base your answer on them");
  });

  it("splits the budget across files so one long document cannot starve the rest", async () => {
    rows = [
      file({ id: "a", filename: "long.txt", extractedText: "A".repeat(50_000) }),
      file({ id: "b", filename: "short.txt", extractedText: "KEEPME" }),
    ];
    const { text, truncated } = await buildSourceDocuments(["a", "b"], "org", 10_000);
    expect(truncated).toEqual(["long.txt"]);
    // The short file survives intact even though the first one blew the budget.
    expect(text).toContain("KEEPME");
  });

  it("declares a truncation in-band so the drafter can admit the gap", async () => {
    rows = [file({ filename: "big.txt", extractedText: "B".repeat(9_000) })];
    const { text, truncated } = await buildSourceDocuments(["f1"], "org", 2_000);
    expect(truncated).toEqual(["big.txt"]);
    expect(text).toContain("truncated at 2000 characters of 9000");
  });

  it("leaves a document that fits completely alone", async () => {
    rows = [file({ filename: "small.txt", extractedText: "short and complete" })];
    const { text, truncated } = await buildSourceDocuments(["f1"], "org");
    expect(truncated).toEqual([]);
    expect(text).not.toContain("truncated at");
  });

  it("returns nothing when every id is unreadable, so callers can refuse", async () => {
    // Drafting from silence would produce a confident agent built on no source.
    rows = [];
    const { text, names } = await buildSourceDocuments(["gone"], "org");
    expect(names).toEqual([]);
    expect(text).toBe("");
  });
});

describe("readAttachedFiles", () => {
  it("returns rows in the caller's order", async () => {
    rows = [file({ id: "z", filename: "z.txt" }), file({ id: "y", filename: "y.txt" })];
    expect((await readAttachedFiles(["y", "z"])).map(r => r.filename)).toEqual(["y.txt", "z.txt"]);
  });

  it("does not query at all for an empty list", async () => {
    rows = [file()];
    expect(await readAttachedFiles([], "org")).toEqual([]);
  });
});

describe("real files flow through extraction into context", () => {
  it("renders an uploaded workbook as a table the agent can read", async () => {
    const zip = new JSZip();
    zip.file("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns:r="http://x"><sheets><sheet name="Orders" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
    zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><sst><si><t>SKU</t></si><si><t>Qty</t></si><si><t>A-1</t></si></sst>`);
    zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>7</v></c></row>
    </sheetData></worksheet>`);

    const extracted = await extractTextFromFile(await zip.generateAsync({ type: "nodebuffer" }), undefined, "orders.xlsx");
    rows = [file({ filename: "orders.xlsx", kind: extracted.kind, extractedText: extracted.text, extractMeta: extracted.meta })];

    const { context } = await buildAttachmentContext(["f1"], "org");
    expect(context).toContain("orders.xlsx (sheets: Orders)");
    expect(context).toContain("| SKU | Qty |");
    expect(context).toContain("| A-1 | 7 |");
  });
});
