/**
 * Content near the end of a large document reaches the Knowledge Base.
 *
 * REAL, no mocks: generated files run through the real readers
 * (server/file-extract.ts) and the real chunker (server/kb-indexing.ts).
 *
 * Before this, every format but xlsx was cut after its first 500,000
 * characters, and xlsx after 5,000 rows per sheet, before chunking ever saw
 * it. Each fixture puts a unique marker past those points and checks that the
 * marker comes out of the reader, survives chunking with its position (page,
 * heading, sheet and row, lines), and that every section with text produced
 * a chunk.
 */
import { describe, expect, it } from "vitest";
import { extractTextFromFile, keepSections, splitTextSections, MAX_DOCUMENT_CHARS } from "../server/file-extract";
import { chunkSections, describeIndexing } from "../server/kb-indexing";
import { largeCsv, largeDocx, largePdf, largeText, largeXlsx } from "./support/large-documents";

const OLD_CHAR_CUT = 500_000;
const OLD_ROW_CUT = 5_000;

function chunked(extracted: Awaited<ReturnType<typeof extractTextFromFile>>) {
  const { chunks, audit } = chunkSections(extracted.sections ?? [], 512, 50);
  expect(audit.unaccounted).toEqual([]);
  expect(audit.sectionsChunked + audit.emptySections).toBe(audit.sections);
  return chunks;
}

describe("PDF: the last page of a long document", () => {
  it("is read, chunked and located by page", async () => {
    const marker = "LATEPAGE-MARK-4417";
    const pdf = await largePdf({ pages: 120, charsPerPage: 4_600, marker });
    const extracted = await extractTextFromFile(pdf, "application/pdf", "manual.pdf");

    expect(extracted.text.length).toBeGreaterThan(OLD_CHAR_CUT);
    expect(extracted.text.indexOf(marker)).toBeGreaterThan(OLD_CHAR_CUT);
    expect(extracted.meta.pages).toBe(120);
    expect(extracted.meta.coverage).toMatchObject({ unit: "page", unitsTotal: 120, unitsKept: 120, complete: true });
    expect(extracted.meta.truncated).toBeFalsy();
    expect(extracted.sections).toHaveLength(120);
    expect(extracted.sections![119].locator.page).toBe(120);
    expect(extracted.sections![119].text).toContain(marker);

    const hit = chunked(extracted).filter((c) => c.content.includes(marker));
    expect(hit).toHaveLength(1);
    expect(hit[0].metadata.page).toBe(120);
  });
});

describe("DOCX: the last heading of a long document", () => {
  it("is read, chunked and located by heading", async () => {
    const marker = "CLAUSE-END-9083";
    const docx = await largeDocx({ sections: 70, charsPerSection: 9_000, lastHeading: "Schedule Z Termination", marker });
    const extracted = await extractTextFromFile(docx, undefined, "contract.docx");

    expect(extracted.text.length).toBeGreaterThan(OLD_CHAR_CUT);
    expect(extracted.text.indexOf(marker)).toBeGreaterThan(OLD_CHAR_CUT);
    expect(extracted.meta.coverage?.complete).toBe(true);
    const last = extracted.sections!.filter((s) => s.locator.heading === "Schedule Z Termination");
    expect(last.length).toBeGreaterThan(0);
    expect(last.some((s) => s.text.includes(marker))).toBe(true);

    const hit = chunked(extracted).find((c) => c.content.includes(marker));
    expect(hit?.metadata.heading).toBe("Schedule Z Termination");
  });
});

describe("XLSX: a row past 5,000 rows and 500,000 characters, under a generic identifier column", () => {
  it("is one chunk carrying its row, sheet and identifier", async () => {
    const rows = 6_200;
    const lateId = "QX-7781-B";
    const xlsx = await largeXlsx({ rows, idHeader: "Part Number", lateId, lateText: "Corrosion resistant hinge, marine grade", descriptionChars: 110, sheetName: "Parts" });
    const extracted = await extractTextFromFile(xlsx, undefined, "parts.xlsx");

    expect(extracted.text.length).toBeGreaterThan(OLD_CHAR_CUT);
    expect(extracted.records).toHaveLength(rows);
    expect(extracted.meta.coverage).toMatchObject({ unit: "row", unitsKept: rows, complete: true });
    const record = extracted.records!.find((r) => r.productId === lateId);
    expect(record?.rowNumber).toBe(rows + 1);

    const chunks = chunked(extracted);
    expect(chunks).toHaveLength(rows);
    const hit = chunks.filter((c) => c.content.includes(lateId));
    expect(hit).toHaveLength(1);
    expect(hit[0].content).toContain("Part Number: QX-7781-B");
    expect(hit[0].content).toContain("marine grade");
    expect(hit[0].metadata).toMatchObject({ key: lateId, productId: lateId, sheet: "Parts", rowNumber: rows + 1 });
    expect(rows).toBeGreaterThan(OLD_ROW_CUT);
  });
});

describe("CSV: the last row of a large file", () => {
  it("is a row record with its row number, quoted commas intact", async () => {
    const lateId = "REF-LAST-0042";
    const csv = largeCsv({ rows: 9_000, rowChars: 70, lateId, lateText: "Overdue, escalate to finance" });
    expect(csv.length).toBeGreaterThan(OLD_CHAR_CUT);
    const extracted = await extractTextFromFile(csv, "text/csv", "ledger.csv");

    expect(extracted.kind).toBe("csv");
    expect(extracted.text.indexOf(lateId)).toBeGreaterThan(OLD_CHAR_CUT);
    expect(extracted.meta.coverage).toMatchObject({ unit: "row", unitsKept: 9_000, complete: true });
    const hit = chunked(extracted).find((c) => c.content.includes(lateId));
    expect(hit?.content).toContain("notes: Overdue, escalate to finance");
    expect(hit?.metadata).toMatchObject({ key: lateId, rowNumber: 9_001 });
  });
});

describe("TXT: the last paragraph of a large file", () => {
  it("is read whole and located by line", async () => {
    const marker = "TAILNOTE-5530";
    const txt = largeText({ chars: 700_000, marker });
    const extracted = await extractTextFromFile(txt, "text/plain", "notes.txt");

    expect(extracted.text.length).toBe(txt.length);
    expect(extracted.meta.coverage?.complete).toBe(true);
    const hit = chunked(extracted).find((c) => c.content.includes(marker));
    expect(hit).toBeDefined();
    expect(Number(hit!.metadata.lineStart)).toBeGreaterThan(1_000);
  });
});

describe("small files are unchanged", () => {
  it("a short text keeps its exact text and is one section", async () => {
    const extracted = await extractTextFromFile(Buffer.from("Hello.\nSecond line."), "text/plain", "hi.txt");
    expect(extracted.text).toBe("Hello.\nSecond line.");
    expect(extracted.sections).toHaveLength(1);
    expect(extracted.meta.truncated).toBeFalsy();
  });
});

describe("the hard ceiling still exists, and says so", () => {
  it("keeps whole sections up to the ceiling and names what was not read", () => {
    const sections = splitTextSections(Array.from({ length: 200 }, (_, i) => `para ${i} ${"x".repeat(990)}`).join("\n\n"), 4_000);
    const { kept, coverage } = keepSections(sections, "section", 50_000);
    expect(kept.length).toBeLessThan(sections.length);
    expect(coverage.complete).toBe(false);
    expect(coverage.omitted).toMatch(/not read/);

    const outcome = describeIndexing({
      extraction: coverage,
      report: { chunks: 10, chunksStored: 10, embedded: 10, embeddingFailed: 0, failedBatches: 0, embeddingComplete: true },
      from: "original_file",
    });
    expect(outcome.status).toBe("partial");
    expect(outcome.errorMessage).toContain(coverage.omitted!);
    expect(MAX_DOCUMENT_CHARS).toBeGreaterThanOrEqual(20_000_000);
  });
});
