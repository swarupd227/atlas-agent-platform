/**
 * A product row that sits far down a large workbook must be indexed whole.
 *
 * extractXlsx used to stop each sheet at 5,000 non-empty rows, and
 * extractTextFromFile then kept only the first 500,000 characters of the
 * joined sheet. Either cut dropped later product rows before search ever
 * saw them. These tests build that workbook in memory and read the records
 * the knowledge base actually indexes.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  extractTextFromFile,
  MAX_XLSX_DATA_ROWS,
  MAX_XLSX_RECORD_CHARS,
  spreadsheetRowExceedsCeiling,
} from "../server/file-extract";
import { chunkSections, chunksForSourceContent, describeIndexing, SPREADSHEET_INDEXING } from "../server/kb-indexing";

/** What the knowledge base indexes from an upload: one chunk per row section. */
function indexed(extracted: Awaited<ReturnType<typeof extractTextFromFile>>) {
  return chunkSections(extracted.sections ?? [], 512, 50).chunks;
}

const LATE_ROW_ID = "SKU-PAST-5000";
const LATE_CHAR_ID = "SKU-PAST-CHARS";

async function workbook(sheetXml: string, sheetName = "Catalog"): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns:r="http://x"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet><sheetData>${sheetXml}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

function inlineRow(row: number, values: string[]): string {
  const cells = values.map((value, col) => {
    const letter = String.fromCharCode(65 + col);
    return `<c r="${letter}${row}" t="inlineStr"><is><t>${value}</t></is></c>`;
  }).join("");
  return `<row r="${row}">${cells}</row>`;
}

describe("large workbook product rows are indexed whole", () => {
  it("keeps a product id past row 5000 in the record text and metadata", async () => {
    const dataRows = 5_200;
    const rows = [inlineRow(1, ["Product ID", "Name"])];
    for (let i = 1; i <= dataRows; i++) {
      const id = i === dataRows ? LATE_ROW_ID : `SKU-${i}`;
      const name = i === dataRows ? "Far Catalog Item" : `Item ${i}`;
      rows.push(inlineRow(i + 1, [id, name]));
    }
    const extracted = await extractTextFromFile(await workbook(rows.join("")), undefined, "catalog.xlsx");
    const chunks = indexed(extracted);
    const hit = chunks.find((chunk) => chunk.metadata.productId === LATE_ROW_ID);

    expect(extracted.meta.truncated).toBe(false);
    expect(hit).toBeDefined();
    expect(hit!.content).toContain(LATE_ROW_ID);
    expect(hit!.content).toContain("Far Catalog Item");
    expect(hit!.content).toContain("Product ID:");
    expect(hit!.metadata.productId).toBe(LATE_ROW_ID);
    expect(hit!.metadata.key).toBe(LATE_ROW_ID);
    expect(hit!.metadata.sheet).toBe("Catalog");
    expect(hit!.metadata.rowNumber).toBe(dataRows + 1);
    expect(chunks).toHaveLength(dataRows);
    expect(chunks.filter((chunk) => chunk.content.includes(LATE_ROW_ID))).toHaveLength(1);
  });

  it("keeps a product id that would fall past the first 500000 characters of a joined sheet", async () => {
    const description = "X".repeat(800);
    const dataRows = 800;
    const rows = [inlineRow(1, ["Product ID", "Description"])];
    for (let i = 1; i <= dataRows; i++) {
      const id = i === dataRows ? LATE_CHAR_ID : `SKU-${String(i).padStart(6, "0")}`;
      rows.push(inlineRow(i + 1, [id, description]));
    }
    const extracted = await extractTextFromFile(await workbook(rows.join("")), undefined, "wide.xlsx");
    const records = extracted.records ?? [];
    let charsBefore = 0;
    for (const record of records) {
      if (record.productId === LATE_CHAR_ID) break;
      charsBefore += record.text.length;
    }
    const chunks = indexed(extracted);
    const hits = chunks.filter((chunk) => chunk.metadata.productId === LATE_CHAR_ID);

    expect(charsBefore).toBeGreaterThan(500_000);
    expect(extracted.text.length).toBeGreaterThan(500_000);
    expect(extracted.meta.truncated).toBe(false);
    expect(hits).toHaveLength(1);
    expect(hits[0].content).toContain(LATE_CHAR_ID);
    expect(hits[0].content).toContain(description);
    expect(hits[0].metadata.productId).toBe(LATE_CHAR_ID);
  });

  it("uses the first column when no product-id header is named", async () => {
    const extracted = await extractTextFromFile(
      await workbook(inlineRow(1, ["Name", "Color"]) + inlineRow(2, ["WIDGET-1", "Blue"])),
      undefined,
      "names.xlsx",
    );
    expect(extracted.records?.map((record) => record.productId)).toEqual(["WIDGET-1"]);
    expect(extracted.records?.[0].text).toContain("Name: WIDGET-1");
    expect(extracted.records?.[0].text).toContain("Color: Blue");
  });
});

describe("a safety ceiling still says the workbook was truncated", () => {
  it("does not treat 5000 rows or 500000 characters as the ceiling", () => {
    expect(spreadsheetRowExceedsCeiling(5_000, 0, 100)).toBe(false);
    expect(spreadsheetRowExceedsCeiling(1, 500_000, 100)).toBe(false);
    expect(spreadsheetRowExceedsCeiling(MAX_XLSX_DATA_ROWS, 0, 10)).toBe(true);
    expect(spreadsheetRowExceedsCeiling(2, MAX_XLSX_RECORD_CHARS - 5, 10)).toBe(true);
  });

  it("marks the source partial, naming the rows not read, instead of presenting a partial extract as the full workbook", () => {
    const outcome = describeIndexing({
      extraction: { unit: "row", unitsTotal: 140, unitsKept: 100, charsKept: 9_000, complete: false, omitted: "40 rows after sheet Catalog row 101 were not read." },
      report: { chunks: 100, chunksStored: 100, embedded: 100, embeddingFailed: 0, failedBatches: 0, embeddingComplete: true },
      from: "original_file",
    });
    expect(outcome.status).toBe("partial");
    expect(outcome.errorMessage).toContain("40 rows after sheet Catalog row 101");
    expect(outcome.record.summary).toBe("Read 100 rows of 140 · 100 passages · 100 embedded");
    expect(outcome.record.readComplete).toBe(false);
  });

  it("still indexes a source stored with per-row records by the earlier ingestion", () => {
    const chunks = chunksForSourceContent("ignored when records exist", {
      indexing: SPREADSHEET_INDEXING,
      records: [{ text: "Sheet: Catalog\nProduct ID: SKU-1\nName: Kept", productId: "SKU-1", sheet: "Catalog", rowNumber: 2 }],
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.productId).toBe("SKU-1");
    expect(chunks[0].metadata.rowNumber).toBe(2);
  });
});
