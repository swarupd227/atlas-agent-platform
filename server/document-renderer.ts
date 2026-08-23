/**
 * Provider-agnostic document generation.
 *
 * The vendor route to a .pptx/.pdf is "the model writes Python in the vendor's
 * sandbox" (see server/anthropic-code-execution.ts), which only exists on the
 * Anthropic provider -- a GPT agent with the document skill attached produced
 * nothing at all. Here the model instead emits a DocumentSpec as ordinary tool
 * arguments and the SERVER renders the bytes, so every model gets the same
 * capability and the same output for the same input.
 *
 * One spec renders to either format on purpose: an agent decides what the
 * document SAYS, never how it is laid out, so switching a deck to a PDF is a
 * different tool name and nothing else.
 */

import { z } from "zod";
import PptxGenJSImport from "pptxgenjs";
import PDFDocumentImport from "pdfkit";

// Both ship CJS. The server bundles to CJS (dist/index.cjs) where the module
// namespace IS the constructor, but under ESM it arrives as { default }. Resolve
// once here so neither entry point depends on which interop it got.
const PptxGenJS: typeof PptxGenJSImport = (PptxGenJSImport as any)?.default ?? PptxGenJSImport;
const PDFDocument: typeof PDFDocumentImport = (PDFDocumentImport as any)?.default ?? PDFDocumentImport;

/** Caps: a spec is model-authored, so every unbounded dimension is bounded here. */
const MAX_SECTIONS = 60;
const MAX_BULLETS = 20;
const MAX_TEXT = 4000;

export const documentSectionSchema = z.object({
  heading: z.string().min(1).max(300),
  body: z.string().max(MAX_TEXT).optional(),
  bullets: z.array(z.string().min(1).max(MAX_TEXT)).max(MAX_BULLETS).optional(),
  notes: z.string().max(MAX_TEXT).optional(),
});

export const documentSpecSchema = z.object({
  title: z.string().min(1).max(300),
  subtitle: z.string().max(300).optional(),
  author: z.string().max(200).optional(),
  sections: z.array(documentSectionSchema).min(1).max(MAX_SECTIONS),
});

export type DocumentSection = z.infer<typeof documentSectionSchema>;
export type DocumentSpec = z.infer<typeof documentSpecSchema>;

/** Shared palette. Deliberately neutral -- swap here to brand every document at once. */
const THEME = {
  navy: "0A1628",
  blue: "1A56DB",
  slate: "64748B",
  light: "F1F5F9",
  white: "FFFFFF",
};

/** Filesystem-safe, extension-less stem derived from the document title. */
export function slugifyFilename(title: string, fallback: string): string {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return stem || fallback;
}

export async function renderPptx(spec: DocumentSpec): Promise<Buffer> {
  const prs = new PptxGenJS();
  prs.layout = "LAYOUT_WIDE";
  if (spec.author) prs.author = spec.author;
  prs.title = spec.title;

  const title = prs.addSlide();
  title.background = { color: THEME.navy };
  title.addText(spec.title, {
    x: 0.6, y: 2.1, w: 11.8, h: 1.4,
    fontSize: 40, bold: true, color: THEME.white, align: "left", valign: "middle",
  });
  if (spec.subtitle) {
    title.addText(spec.subtitle, {
      x: 0.6, y: 3.5, w: 11.8, h: 0.8,
      fontSize: 20, color: THEME.light, align: "left", valign: "middle",
    });
  }

  for (const section of spec.sections) {
    const slide = prs.addSlide();
    slide.addText(section.heading, {
      x: 0.6, y: 0.45, w: 11.8, h: 0.9,
      fontSize: 28, bold: true, color: THEME.navy, valign: "middle",
    });
    // Accent rule under the heading, so a bullet-less slide still reads as designed.
    slide.addShape("rect", { x: 0.6, y: 1.32, w: 1.6, h: 0.06, fill: { color: THEME.blue } });

    let cursorY = 1.7;
    if (section.body) {
      slide.addText(section.body, {
        x: 0.6, y: cursorY, w: 11.8, h: 1.0,
        fontSize: 16, color: THEME.slate, valign: "top",
      });
      cursorY += 1.2;
    }
    if (section.bullets?.length) {
      slide.addText(
        section.bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
        {
          x: 0.6, y: cursorY, w: 11.8, h: 5.4 - cursorY,
          fontSize: 16, color: THEME.navy, lineSpacingMultiple: 1.3, valign: "top",
        },
      );
    }
    if (section.notes) slide.addNotes(section.notes);
  }

  // `write` returns the raw file as the requested type; typings surface a union
  // across output types, so narrow to the nodebuffer we asked for.
  const out = (await prs.write({ outputType: "nodebuffer" })) as unknown as Buffer;
  return Buffer.from(out);
}

export async function renderPdf(spec: DocumentSpec): Promise<Buffer> {
  // Only defined keys: PDFSecurity.generateFileID calls .valueOf() on every
  // info value, so a single undefined entry (an author-less spec) throws.
  const info: Record<string, string> = { Title: spec.title };
  if (spec.author) info.Author = spec.author;
  const doc = new PDFDocument({ size: "LETTER", margin: 64, info });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fillColor(`#${THEME.navy}`).fontSize(30).font("Helvetica-Bold").text(spec.title, { align: "left" });
  if (spec.subtitle) {
    doc.moveDown(0.4).fillColor(`#${THEME.slate}`).fontSize(15).font("Helvetica").text(spec.subtitle);
  }
  if (spec.author) {
    doc.moveDown(0.3).fillColor(`#${THEME.slate}`).fontSize(10).font("Helvetica").text(spec.author);
  }
  doc.moveDown(1.2);

  for (let i = 0; i < spec.sections.length; i++) {
    const section = spec.sections[i];
    // Start each section on a fresh page once past the first, so headings never
    // strand at the foot of a page.
    if (i > 0) doc.addPage();

    doc.fillColor(`#${THEME.navy}`).fontSize(18).font("Helvetica-Bold").text(section.heading);
    doc.moveDown(0.5);

    if (section.body) {
      doc.fillColor("#1F2937").fontSize(11).font("Helvetica").text(section.body, { align: "left", lineGap: 3 });
      doc.moveDown(0.6);
    }
    for (const bullet of section.bullets ?? []) {
      doc.fillColor("#1F2937").fontSize(11).font("Helvetica").text(`•  ${bullet}`, {
        indent: 12,
        align: "left",
        lineGap: 3,
      });
      doc.moveDown(0.25);
    }
  }

  doc.end();
  return done;
}

export const DOCUMENT_FORMATS = {
  pptx: {
    render: renderPptx,
    extension: "pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  pdf: {
    render: renderPdf,
    extension: "pdf",
    mimeType: "application/pdf",
  },
} as const;

export type DocumentFormat = keyof typeof DOCUMENT_FORMATS;
