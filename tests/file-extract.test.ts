import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  extractTextFromFile,
  filenameForLog,
  isSupportedFile,
  isImageFile,
  isVideoFile,
  UnsupportedFileTypeError,
  LegacyOfficeFormatError,
  ZipLimitError,
} from "../server/file-extract";
import { deflateRawSync } from "zlib";

// Real OOXML files, built in-memory. Fixtures on disk would be opaque binaries
// nobody can review in a diff; this way the exact XML each assertion depends on
// is visible right here.
async function buildXlsx(opts?: { sparse?: boolean }): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns:r="http://x"><sheets>
      <sheet name="Q3 Revenue" sheetId="1" r:id="rId1"/>
      <sheet name="Notes" sheetId="2" r:id="rId2"/>
    </sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships>
      <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Target="worksheets/sheet2.xml"/>
    </Relationships>`);
  zip.file("xl/sharedStrings.xml",
    `<?xml version="1.0"?><sst><si><t>Region</t></si><si><t>Revenue</t></si><si><t>EMEA</t></si></sst>`);
  // Row 2 deliberately skips column B to exercise sparse-cell alignment.
  zip.file("xl/worksheets/sheet1.xml", opts?.sparse
    ? `<?xml version="1.0"?><worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Margin</t></is></c></row>
        <row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>0.42</v></c></row>
      </sheetData></worksheet>`
    : `<?xml version="1.0"?><worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1250</v></c></row>
      </sheetData></worksheet>`);
  zip.file("xl/worksheets/sheet2.xml", `<?xml version="1.0"?><worksheet><sheetData/></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildPptx(): Promise<Buffer> {
  const zip = new JSZip();
  const slide = (paras: string[]) =>
    `<?xml version="1.0"?><p:sld xmlns:p="http://p" xmlns:a="http://a"><p:cSld><p:spTree>
      ${paras.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}
    </p:spTree></p:cSld></p:sld>`;
  zip.file("ppt/slides/slide1.xml", slide(["Migration Plan", "Phase 1: discovery"]));
  zip.file("ppt/slides/slide2.xml", slide(["Risks"]));
  // Numbered past 9 to prove ordering is numeric, not lexicographic.
  zip.file("ppt/slides/slide10.xml", slide(["Appendix"]));
  zip.file("ppt/notesSlides/notesSlide1.xml",
    `<?xml version="1.0"?><p:notes xmlns:p="http://p" xmlns:a="http://a">
      <a:p><a:r><a:t>Budget is the real blocker here.</a:t></a:r></a:p></p:notes>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("isSupportedFile", () => {
  it("accepts the office and text formats users actually upload", () => {
    for (const f of ["a.pdf", "a.docx", "a.xlsx", "a.xlsm", "a.pptx", "a.csv", "a.txt", "a.md", "a.json"]) {
      expect(isSupportedFile(f), f).toBe(true);
    }
  });

  it("rejects types we cannot read", () => {
    for (const f of ["a.zip", "a.png", "a.exe", "a.mp4", "noextension"]) {
      expect(isSupportedFile(f), f).toBe(false);
    }
  });
});

describe("xlsx", () => {
  it("renders each sheet as a markdown table with its real name", async () => {
    const r = await extractTextFromFile(await buildXlsx(), undefined, "revenue.xlsx");
    expect(r.kind).toBe("xlsx");
    expect(r.meta.sheets).toEqual(["Q3 Revenue", "Notes"]);
    // Sheet names come from workbook.xml via the rels mapping, not from the
    // sheetN.xml filenames.
    expect(r.text).toContain("## Sheet: Q3 Revenue");
    expect(r.text).toContain("| Region | Revenue |");
    expect(r.text).toContain("| EMEA | 1250 |");
  });

  it("keeps sparse rows aligned to their real columns", async () => {
    const r = await extractTextFromFile(await buildXlsx({ sparse: true }), undefined, "s.xlsx");
    // B2 is absent; 0.42 is a C-column value and must not slide into B.
    expect(r.text).toContain("| EMEA |  | 0.42 |");
  });

  it("reads inline strings as well as shared strings", async () => {
    const r = await extractTextFromFile(await buildXlsx({ sparse: true }), undefined, "s.xlsx");
    expect(r.text).toContain("Margin");
  });

  it("marks an empty sheet rather than dropping it", async () => {
    const r = await extractTextFromFile(await buildXlsx(), undefined, "revenue.xlsx");
    expect(r.text).toContain("## Sheet: Notes");
    expect(r.text).toContain("(empty)");
  });

  it("keeps rows past the old 5000-row cap when the safety ceiling is not hit", async () => {
    // This sheet used to stop at 5,000 non-empty rows and then tell the reader
    // only those were shown. A later catalog row has to survive that cut.
    // Truncation is reserved for the safety ceiling, which this sheet does not reach.
    const zip = new JSZip();
    zip.file("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns:r="http://x"><sheets><sheet name="Big" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
    const rows = Array.from({ length: 5_200 }, (_, i) =>
      `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join("");
    zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`);

    const r = await extractTextFromFile(await zip.generateAsync({ type: "nodebuffer" }), undefined, "big.xlsx");
    expect(r.meta.truncated).toBe(false);
    expect(r.text).toContain("| 5100 |");
    expect(r.records?.some((row) => row.productId === "5100")).toBe(true);
  });

  it("does not claim truncation for a sheet that fits", async () => {
    const r = await extractTextFromFile(await buildXlsx(), undefined, "revenue.xlsx");
    expect(r.meta.truncated).toBe(false);
  });
});

describe("pptx", () => {
  it("extracts slides in numeric order, not lexicographic", async () => {
    const r = await extractTextFromFile(await buildPptx(), undefined, "deck.pptx");
    expect(r.kind).toBe("pptx");
    expect(r.meta.slides).toBe(3);
    const order = ["Migration Plan", "Risks", "Appendix"].map((s) => r.text.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("keeps each paragraph on its own line", async () => {
    const r = await extractTextFromFile(await buildPptx(), undefined, "deck.pptx");
    expect(r.text).toContain("Migration Plan\nPhase 1: discovery");
  });

  it("includes speaker notes, which often carry the real content", async () => {
    const r = await extractTextFromFile(await buildPptx(), undefined, "deck.pptx");
    expect(r.text).toContain("Budget is the real blocker here.");
  });
});

describe("refusing what it cannot read", () => {
  it("throws on an unknown binary instead of storing mojibake", async () => {
    // The old behaviour was `buffer.toString("utf-8")` for anything
    // unrecognised, which ingested binary as 'text' and embedded it.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    await expect(extractTextFromFile(png, "image/png", "logo.png"))
      .rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it("rejects a binary masquerading as .txt", async () => {
    const bin = Buffer.concat([Buffer.from("hello"), Buffer.from([0x00, 0x01, 0x02])]);
    await expect(extractTextFromFile(bin, "text/plain", "notes.txt"))
      .rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it("names the legacy Office formats specifically, with the fix", async () => {
    for (const [f, ext] of [["old.xls", "xlsx"], ["old.ppt", "pptx"], ["old.doc", "docx"]] as const) {
      const err = await extractTextFromFile(Buffer.from([0xd0, 0xcf]), undefined, f).catch((e) => e);
      expect(err).toBeInstanceOf(LegacyOfficeFormatError);
      expect(err.message).toContain(ext);
    }
  });
});

describe("image attachments (acceptImages)", () => {
  // 8-byte PNG signature + IHDR length/type + 1920×1080 big-endian.
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from("IHDR"),
    Buffer.from([0x00, 0x00, 0x07, 0x80]), // 1920
    Buffer.from([0x00, 0x00, 0x04, 0x38]), // 1080
  ]);

  it("still rejects images by default — Knowledge Base ingestion relies on this", async () => {
    await expect(extractTextFromFile(png, "image/png", "hero.png"))
      .rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it("returns a self-describing stub with dimensions when opted in", async () => {
    const r = await extractTextFromFile(png, "image/png", "hero.png", { acceptImages: true });
    expect(r.kind).toBe("image");
    expect(r.meta.width).toBe(1920);
    expect(r.meta.height).toBe(1080);
    // The stub is the model's only view of the file: it must name the file,
    // say the pixels aren't readable here, and point at container placement.
    expect(r.text).toContain("hero.png");
    expect(r.text).toContain("1920×1080");
    expect(r.text).toContain("add_picture");
  });

  it("opting in does not admit non-image binaries", async () => {
    await expect(extractTextFromFile(Buffer.from([0x00, 0x01]), undefined, "installer.exe", { acceptImages: true }))
      .rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it("isImageFile matches exactly the admitted extensions", () => {
    for (const f of ["a.png", "a.jpg", "a.jpeg", "a.gif", "a.webp"]) expect(isImageFile(f), f).toBe(true);
    for (const f of ["a.svg", "a.heic", "a.mp4", "a.pptx", "noext"]) expect(isImageFile(f), f).toBe(false);
  });
});

describe("video attachments (acceptVideos)", () => {
  // A fabricated buffer carrying just the boxes the sniffer reads: mvhd v0
  // (timescale 1000, duration 12000 => 12s) and tkhd v0 (1280×720 as 16.16
  // fixed-point at the box-relative offset the parser uses).
  const mp4 = (() => {
    const mvhd = Buffer.alloc(4 + 4 + 16);
    mvhd.write("mvhd", 0);
    mvhd.writeUInt32BE(1000, 4 + 12);   // timescale at fourcc+16
    mvhd.writeUInt32BE(12000, 4 + 16);  // duration at fourcc+20
    const tkhd = Buffer.alloc(4 + 4 + 76 + 8);
    tkhd.write("tkhd", 0);
    tkhd.writeUInt32BE(1280 << 16, 4 + 76);
    tkhd.writeUInt32BE(720 << 16, 4 + 80);
    return Buffer.concat([Buffer.from("....ftypisom"), mvhd, tkhd]);
  })();

  it("still rejects video by default — Knowledge Base ingestion relies on this", async () => {
    await expect(extractTextFromFile(mp4, "video/mp4", "promo.mp4"))
      .rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it("returns a stub with duration, dimensions, and embedding guidance when opted in", async () => {
    const r = await extractTextFromFile(mp4, "video/mp4", "promo.mp4", { acceptVideos: true });
    expect(r.kind).toBe("video");
    expect(r.meta.durationSeconds).toBe(12);
    expect(r.meta.width).toBe(1280);
    expect(r.meta.height).toBe(720);
    expect(r.text).toContain("promo.mp4");
    expect(r.text).toContain("promo-poster.png");
    expect(r.text).toContain("add_movie");
  });

  it("isVideoFile admits mp4 only", () => {
    expect(isVideoFile("a.mp4")).toBe(true);
    for (const f of ["a.mov", "a.avi", "a.webm", "a.png", "a.pptx"]) expect(isVideoFile(f), f).toBe(false);
  });
});

describe("text formats", () => {
  it("pretty-prints JSON", async () => {
    const r = await extractTextFromFile(Buffer.from(`{"b":2,"a":1}`), undefined, "d.json");
    expect(r.kind).toBe("json");
    expect(r.text).toContain('"b": 2');
  });

  it("falls back to raw text for malformed JSON rather than failing", async () => {
    const r = await extractTextFromFile(Buffer.from(`{not json`), undefined, "d.json");
    expect(r.kind).toBe("text");
    expect(r.text).toContain("not json");
  });

  it("passes CSV through intact", async () => {
    const r = await extractTextFromFile(Buffer.from("a,b\n1,2"), "text/csv", "d.csv");
    expect(r.kind).toBe("csv");
    expect(r.text).toBe("a,b\n1,2");
  });
});

describe("uploaded names in logs", () => {
  it("strips control characters and keeps one short line", () => {
    expect(filenameForLog("report\r\nFAKE ERROR admin")).toBe("report FAKE ERROR admin");
    expect(filenameForLog("a\u0000b\u007Fc")).toBe("a b c");
    expect(filenameForLog("x".repeat(500))).toHaveLength(120);
    expect(filenameForLog("\n\n")).toBe("(unnamed)");
  });
});

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

/** One deflated entry whose central directory understates how large it inflates. */
function lyingOfficeZip(actual: Buffer, declaredUncompressed: number): Buffer {
  const name = Buffer.from("xl/sharedStrings.xml");
  const compressed = deflateRawSync(actual);
  const crc = crc32(actual);
  const local = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0),
    u32(crc), u32(compressed.length), u32(declaredUncompressed),
    u16(name.length), u16(0), name, compressed,
  ]);
  const central = Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0),
    u32(crc), u32(compressed.length), u32(declaredUncompressed),
    u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(0),
    name,
  ]);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(1), u16(1),
    u32(central.length), u32(local.length), u16(0),
  ]);
  return Buffer.concat([local, central, eocd]);
}

describe("Office archives cannot expand without a limit", () => {
  const tight = { maxEntries: 100, maxEntryBytes: 10, maxExpandedBytes: 20 };

  it("rejects an archive with too many entries before reading them", async () => {
    await expect(extractTextFromFile(await buildXlsx(), undefined, "a.xlsx", { zipLimits: { maxEntries: 1, maxEntryBytes: 10_000_000, maxExpandedBytes: 10_000_000 } }))
      .rejects.toBeInstanceOf(ZipLimitError);
  });

  it("rejects an entry whose declared size is over the per-entry limit", async () => {
    await expect(extractTextFromFile(await buildXlsx(), undefined, "a.xlsx", { zipLimits: { ...tight, maxExpandedBytes: 10_000_000 } }))
      .rejects.toThrow(/larger than the 10 byte limit/);
  });

  it("rejects an archive whose declared expansion is over the total", async () => {
    await expect(extractTextFromFile(await buildXlsx(), undefined, "a.xlsx", { zipLimits: { maxEntries: 100, maxEntryBytes: 10_000_000, maxExpandedBytes: 20 } }))
      .rejects.toThrow(/expands past the 20 byte limit/);
  });

  it("reads the document when an embedded part is also present", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from the document</w:t></w:r></w:p></w:body></w:document>`);
    zip.file("word/media/blob.bin", Buffer.alloc(8_000, 0x41));
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const extracted = await extractTextFromFile(buf, undefined, "note.docx");
    expect(extracted.text).toContain("Hello from the document");
  });

  it.each(["bomb.xlsx", "bomb.pptx", "bomb.docx"])("stops inflating %s once a limit is crossed", async (name) => {
    const bomb = lyingOfficeZip(Buffer.alloc(8_000, 0x41), 16);
    await expect(extractTextFromFile(bomb, undefined, name, { zipLimits: { maxEntries: 10, maxEntryBytes: 100, maxExpandedBytes: 50_000 } }))
      .rejects.toBeInstanceOf(ZipLimitError);
  });
});
