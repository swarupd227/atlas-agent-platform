/**
 * Large documents built in memory, each with a unique marker near its end:
 * past the 500,000 characters, 5,000 rows or first pages the old readers kept.
 * Real files (pdfkit for the PDF, OOXML zipped with jszip), so the extractors
 * under test read them exactly as they would an upload.
 *
 * Nothing here is specific to one customer's document: column names, ids and
 * text are generated.
 */
import JSZip from "jszip";
import PDFDocument from "pdfkit";

const filler = (seed: number, chars: number): string => {
  const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"];
  let out = "";
  let i = seed;
  while (out.length < chars) out += `${words[i++ % words.length]} `;
  return out.slice(0, chars).trim();
};

/** `pages` pages of ~`charsPerPage` characters; `marker` alone on a line of the last page. */
export async function largePdf(opts: { pages: number; charsPerPage: number; marker: string }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 36, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const lineChars = 110;
  const lines = Math.ceil(opts.charsPerPage / lineChars);
  doc.font("Helvetica").fontSize(5.5);
  for (let p = 1; p <= opts.pages; p++) {
    doc.addPage();
    let y = 36;
    doc.text(`Page heading ${p}`, 36, y, { lineBreak: false });
    y += 7;
    for (let l = 0; l < lines; l++) {
      doc.text(filler(p * 31 + l, lineChars), 36, y, { lineBreak: false });
      y += 7;
    }
    if (p === opts.pages) doc.text(opts.marker, 36, y + 7, { lineBreak: false });
  }
  doc.end();
  return done;
}

/** A DOCX with `sections` Heading 1 sections of ~`charsPerSection`; the last one is `lastHeading` and holds `marker`. */
export async function largeDocx(opts: { sections: number; charsPerSection: number; lastHeading: string; marker: string }): Promise<Buffer> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const para = (t: string, style?: string) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  const body: string[] = [];
  for (let s = 1; s <= opts.sections; s++) {
    const last = s === opts.sections;
    body.push(para(last ? opts.lastHeading : `Chapter ${s}`, "Heading1"));
    let written = 0;
    let k = 0;
    while (written < opts.charsPerSection) {
      const t = filler(s * 17 + k++, 900);
      body.push(para(t));
      written += t.length;
    }
    if (last) body.push(para(`The closing clause is ${opts.marker}.`));
  }
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `</Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`);
  zip.file("word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`);
  zip.file("word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`);
  zip.file("word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * A workbook of `rows` data rows under the header row, the identifier in a
 * column named `idHeader`; the last row's identifier is `lateId`.
 */
export async function largeXlsx(opts: { rows: number; idHeader: string; lateId: string; lateText: string; descriptionChars: number; sheetName?: string }): Promise<Buffer> {
  const cell = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
  const parts: string[] = [`<row r="1">${cell("A1", opts.idHeader)}${cell("B1", "Description")}${cell("C1", "Category")}</row>`];
  for (let i = 1; i <= opts.rows; i++) {
    const r = i + 1;
    const last = i === opts.rows;
    const id = last ? opts.lateId : `ITEM-${String(i).padStart(6, "0")}`;
    const desc = last ? opts.lateText : filler(i, opts.descriptionChars);
    parts.push(`<row r="${r}">${cell(`A${r}`, id)}${cell(`B${r}`, desc)}${cell(`C${r}`, `cat-${i % 7}`)}</row>`);
  }
  const zip = new JSZip();
  zip.file("xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns:r="http://x"><sheets><sheet name="${opts.sheetName ?? "Items"}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet><sheetData>${parts.join("")}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

/** A CSV of `rows` data rows (~`rowChars` each); the last row's first field is `lateId`. Quoted fields with commas included. */
export function largeCsv(opts: { rows: number; rowChars: number; lateId: string; lateText: string }): Buffer {
  const lines = ["record_ref,notes,amount"];
  for (let i = 1; i <= opts.rows; i++) {
    const last = i === opts.rows;
    lines.push(`${last ? opts.lateId : `R${i}`},"${last ? opts.lateText : filler(i, opts.rowChars).replace(/ /g, ", ")}",${i * 3}`);
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

/** A plain text file of ~`chars` characters in paragraphs; `marker` in the last paragraph. */
export function largeText(opts: { chars: number; marker: string }): Buffer {
  const paras: string[] = [];
  let n = 0;
  let total = 0;
  while (total < opts.chars) {
    const p = filler(n++, 600);
    paras.push(p);
    total += p.length + 2;
  }
  paras.push(`Final note: ${opts.marker} is the answer.`);
  return Buffer.from(paras.join("\n\n"), "utf8");
}
