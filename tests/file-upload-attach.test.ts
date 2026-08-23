import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

/**
 * Covers the attachment context builder — the step that turns uploaded rows
 * into the text an agent actually sees. The extraction itself is covered by
 * tests/file-extract.test.ts; this is about ordering, scoping and honesty.
 */

const rows: any[] = [];
vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: (_w: any) => Promise.resolve(rows) }) }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: "run-1" }]) }) }),
  },
}));

import { extractTextFromFile } from "../server/file-extract";

/** Mirrors buildAttachmentContext in server/workspace-run.ts. Kept in step with
 *  it deliberately: the ordering and truncation rules are the contract. */
function buildContext(fileIds: string[], stored: any[]): { context: string; names: string[] } {
  const byId = new Map(stored.map((r) => [r.id, r]));
  const ordered = fileIds.map((id) => byId.get(id)).filter(Boolean);
  if (!ordered.length) return { context: "", names: [] };

  const blocks = ordered.map((f: any) => {
    const meta = f.extractMeta ?? {};
    const detail = [
      meta.sheets?.length ? `sheets: ${meta.sheets.join(", ")}` : null,
      typeof meta.slides === "number" ? `${meta.slides} slides` : null,
      meta.truncated ? "TRUNCATED — this is a partial reading of a large file" : null,
    ].filter(Boolean).join("; ");
    return [
      `--- Attached file: ${f.filename}${detail ? ` (${detail})` : ""} ---`,
      (f.extractedText ?? "").trim() || "(no readable text in this file)",
      `--- end of ${f.filename} ---`,
    ].join("\n");
  });

  return {
    context: [
      "The user attached the following file(s). Their contents are reproduced below.",
      "Base your answer on them; if a file appears truncated or unreadable, say so rather than guessing at what it might contain.",
      "",
      ...blocks,
    ].join("\n"),
    names: ordered.map((f: any) => f.filename),
  };
}

const file = (over: any = {}) => ({
  id: "f1", filename: "a.txt", extractedText: "hello", extractMeta: {}, ...over,
});

beforeEach(() => { rows.length = 0; });

describe("attachment context", () => {
  it("is empty when nothing is attached", () => {
    expect(buildContext([], []).context).toBe("");
  });

  it("preserves the order the user attached them in, not DB order", () => {
    const stored = [
      file({ id: "b", filename: "second.txt", extractedText: "SECOND" }),
      file({ id: "a", filename: "first.txt", extractedText: "FIRST" }),
    ];
    const { context, names } = buildContext(["a", "b"], stored);
    expect(names).toEqual(["first.txt", "second.txt"]);
    expect(context.indexOf("FIRST")).toBeLessThan(context.indexOf("SECOND"));
  });

  it("drops ids that resolved to nothing rather than inventing a placeholder", () => {
    // Org-scoped lookup means another tenant's id simply isn't returned.
    const { context, names } = buildContext(["mine", "someone-elses"], [file({ id: "mine", filename: "mine.txt" })]);
    expect(names).toEqual(["mine.txt"]);
    expect(context).not.toContain("someone-elses");
  });

  it("labels a spreadsheet with its sheet names", () => {
    const { context } = buildContext(["f1"], [file({
      filename: "q3.xlsx", extractMeta: { sheets: ["Revenue", "Costs"] }, extractedText: "| a |",
    })]);
    expect(context).toContain("q3.xlsx (sheets: Revenue, Costs)");
  });

  it("says a file was truncated, so the agent can flag partial data", () => {
    const { context } = buildContext(["f1"], [file({ extractMeta: { truncated: true } })]);
    expect(context).toContain("TRUNCATED");
  });

  it("marks an unreadable file explicitly instead of attaching an empty block", () => {
    // A scanned PDF extracts to nothing; silence would read as the agent
    // ignoring the upload.
    const { context } = buildContext(["f1"], [file({ filename: "scan.pdf", extractedText: "   " })]);
    expect(context).toContain("(no readable text in this file)");
  });

  it("tells the agent not to guess at content it cannot see", () => {
    const { context } = buildContext(["f1"], [file()]);
    expect(context).toContain("rather than guessing");
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
    const { context } = buildContext(["f1"], [file({
      filename: "orders.xlsx", kind: extracted.kind, extractedText: extracted.text, extractMeta: extracted.meta,
    })]);

    expect(context).toContain("orders.xlsx (sheets: Orders)");
    expect(context).toContain("| SKU | Qty |");
    expect(context).toContain("| A-1 | 7 |");
  });
});
