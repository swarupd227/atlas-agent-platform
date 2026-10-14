/**
 * A large chat attachment: shown in part, with the rest reachable.
 *
 * MOCKED: the database (the uploaded_files rows are given here, as in
 * tests/file-upload-attach.test.ts). REAL: the readers, re-reading the
 * generated files' bytes, the section selection, and the search/read tools.
 *
 * Before this, a Workspace or Cowork attachment was inlined whole after the
 * reader had already kept only its first 500,000 characters: a 120-page PDF
 * became a prompt the model could not take, and the last pages were not in
 * it anyway.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let rows: any[] = [];
const whereCalls: unknown[] = [];
vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: (w: unknown) => { whereCalls.push(w); return Promise.resolve(rows); } }) }),
  },
}));

import { extractTextFromFile } from "../server/file-extract";
import { buildAttachmentContext } from "../server/attachment-context";
import { clearSectionCache, readAttachmentSections, searchAttachments, selectSections, scoreSections } from "../server/attachment-sections";
import { attachmentToolsFor, executeBuiltinAttachmentTool, isBuiltinAttachmentTool } from "../server/builtin-attachment-tools";
import { BUILTIN_ATTACHMENT_SERVER_ID } from "../server/attachment-tool-defs";
import { largePdf, largeText, largeXlsx } from "./support/large-documents";
import { readFileSync } from "fs";
import { join } from "path";

async function uploaded(id: string, filename: string, bytes: Buffer, mimeType?: string) {
  const extracted = await extractTextFromFile(bytes, mimeType, filename, { acceptImages: true, acceptVideos: true });
  return { id, filename, mimeType: mimeType ?? null, extractedText: extracted.text, extractMeta: extracted.meta, content: bytes };
}

beforeEach(() => {
  rows = [];
  whereCalls.length = 0;
  clearSectionCache();
});

describe("a file that fits is inlined exactly as before", () => {
  it("whole text, original framing, nothing added", async () => {
    rows = [{ id: "f1", filename: "memo.txt", extractedText: "The budget is 40k.", extractMeta: {}, content: Buffer.from("The budget is 40k.") }];
    const { context, partial } = await buildAttachmentContext(["f1"], "org", undefined, undefined, { query: "what is the budget", toolsAvailable: true });
    expect(partial).toEqual([]);
    expect(context).toBe([
      "The user attached the following file(s). Their contents are reproduced below.",
      "Base your answer on them; if a file appears truncated or unreadable, say so rather than guessing at what it might contain.",
      "",
      "--- Attached file: memo.txt ---",
      "The budget is 40k.",
      "--- end of memo.txt ---",
    ].join("\n"));
  });
});

describe("a large text file", () => {
  it("is shown as its map, opening and the sections matching the question, within the budget", async () => {
    const marker = "TAILNOTE-5530";
    rows = [await uploaded("t1", "notes.txt", largeText({ chars: 700_000, marker }), "text/plain")];
    const { context, partial } = await buildAttachmentContext(["t1"], "org", undefined, undefined, {
      query: `what does ${marker} refer to?`,
      toolsAvailable: true,
      budgetChars: 60_000,
    });
    expect(partial).toEqual(["notes.txt"]);
    expect(context.length).toBeLessThan(70_000);
    expect(context).toContain(marker);
    expect(context).toContain("Large file, shown in part");
    expect(context).toContain("Document map:");
    expect(context).toContain("search_attachment");
    expect(context).toMatch(/\[… sections \d+–\d+ not shown …\]/);
  });

  it("says plainly what was not shown when the model has no tools to reach it", async () => {
    rows = [await uploaded("t1", "notes.txt", largeText({ chars: 300_000, marker: "X-1" }), "text/plain")];
    const { context } = await buildAttachmentContext(["t1"], "org", undefined, undefined, { query: "summarise", budgetChars: 20_000 });
    expect(context).toContain("were not given to you");
    expect(context).not.toContain("search_attachment");
  });
});

describe("a large workbook", () => {
  it("puts the row a question names into the prompt, though it is past row 5,000", async () => {
    const lateId = "QX-7781-B";
    rows = [await uploaded("x1", "parts.xlsx", await largeXlsx({ rows: 6_200, idHeader: "Part Number", lateId, lateText: "marine grade hinge", descriptionChars: 110, sheetName: "Parts" }))];
    const { context } = await buildAttachmentContext(["x1"], "org", undefined, undefined, { query: `price of ${lateId}?`, toolsAvailable: true });
    expect(context).toContain("Part Number: QX-7781-B");
    expect(context).toContain("sheet Parts, row 6201");
    expect(context).toContain("one per data row");
  });
});

describe("search_attachment and read_attachment_section", () => {
  it("find and read the last page of a 120-page PDF", async () => {
    const marker = "LATEPAGE-MARK-4417";
    const file = await uploaded("p1", "manual.pdf", await largePdf({ pages: 120, charsPerPage: 4_600, marker }), "application/pdf");

    const found = await searchAttachments([file], { query: marker });
    expect(found.ok).toBe(true);
    const top = (found.results as any[])[0];
    expect(top.section).toBe(120);
    expect(top.location).toBe("page 120");
    expect(top.text).toContain(marker);

    const read = await readAttachmentSections([file], { page: 120 });
    expect((read.sections as any[])[0].text).toContain(marker);
    expect(read.next).toBeNull();

    const range = await readAttachmentSections([file], { section: 10, count: 3 });
    expect((range.sections as any[]).map((s) => s.section)).toEqual([10, 11, 12]);
    expect(range.next).toBe(13);
  });

  it("read a spreadsheet row by sheet and row number", async () => {
    const file = await uploaded("x1", "parts.xlsx", await largeXlsx({ rows: 6_200, idHeader: "Part Number", lateId: "LAST-1", lateText: "end", descriptionChars: 50, sheetName: "Parts" }));
    const read = await readAttachmentSections([file], { sheet: "Parts", row: 6_201 });
    expect((read.sections as any[])[0].text).toContain("Part Number: LAST-1");
  });

  it("refuse an ambiguous or unknown file instead of guessing", async () => {
    const a = { id: "a", filename: "a.txt", extractedText: "one", content: null };
    const b = { id: "b", filename: "b.txt", extractedText: "two", content: null };
    expect((await readAttachmentSections([a, b], {})).error).toContain('"a.txt"');
    expect((await searchAttachments([a, b], { query: "one", file: "c.txt" })).error).toContain("No attached file named");
  });

  it("score an exact identifier above common words", () => {
    const sections = [
      { text: "general notes about hinges and prices", locator: { lineStart: 1 } },
      { text: "Part Number: AB-12-Z\nprice 40", locator: { sheet: "S", rowNumber: 2, key: "AB-12-Z" } },
    ];
    const scores = scoreSections(sections, "price of AB-12-Z hinges");
    expect(scores[1]).toBeGreaterThan(scores[0]);
    const sel = selectSections(sections, "AB-12-Z", 60);
    expect(sel.shown).toContain(1);
  });
});

describe("the Workspace tools read only their run's files", () => {
  it("carry the run's file ids on the tool the server built, and ask the database for those", async () => {
    const tools = attachmentToolsFor(["f1", "f2"], ["a.txt", "b.txt"]);
    expect(tools.map((t) => t.toolName)).toEqual(["search_attachment", "read_attachment_section"]);
    expect(tools.every(isBuiltinAttachmentTool)).toBe(true);
    expect(tools[0].attachedFileIds).toEqual(["f1", "f2"]);
    expect(attachmentToolsFor([])).toEqual([]);

    rows = [{ id: "f1", filename: "a.txt", extractedText: "alpha ZZ-9 beta", extractMeta: {}, content: null }];
    const res = await executeBuiltinAttachmentTool(tools[0], { query: "ZZ-9" }, { orgId: "org" });
    expect(res.ok).toBe(true);
    expect(res.results[0].file).toBe("a.txt");
    expect(whereCalls).toHaveLength(1);

    const none = await executeBuiltinAttachmentTool({ ...tools[0], attachedFileIds: [] }, { query: "x" }, { orgId: "org" });
    expect(none.ok).toBe(false);
  });

  it("are exempt from the allow-lists like read_skill, and offered after it", () => {
    const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
    expect(read("server", "tool-dispatcher.ts")).toContain("const skillRead = tool.serverId === BUILTIN_SKILL_SERVER_ID || tool.serverId === BUILTIN_ATTACHMENT_SERVER_ID;");
    const run = read("server", "workspace-run.ts");
    expect(run.indexOf("availableTools.push(...attachmentToolsFor(")).toBeGreaterThan(run.indexOf("availableTools.push(...skillToolsFor("));
    expect(BUILTIN_ATTACHMENT_SERVER_ID).toBe("builtin:attachments");
  });
});
