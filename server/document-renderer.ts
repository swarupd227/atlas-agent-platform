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

/** A bullet whose model-written text leads with a short all-caps tag ("HIGH: ...", "LOW: ...",
 *  "MEDIUM: ...") -- a convention several agents already use for severity/status. Split it out so
 *  it renders as a coloured badge instead of buried plain text; anything else renders unchanged.
 *  Matched on the tag's FIRST word only, not the whole phrase: live output varies the rest
 *  ("HIGH:" one run, "HIGH SEVERITY:" the next, same agent) -- confirmed live, a run that wrote
 *  "HIGH SEVERITY:" fell all the way through to plain grey text because the old lookup required
 *  the entire tag to match a known key exactly. */
const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "B91C1C", HIGH: "DC2626", MEDIUM: "D97706", MODERATE: "D97706",
  LOW: "059669", INFO: "2563EB", STRONG: "059669", WEAK: "D97706",
};
function splitBulletTag(bullet: string): { tag: string | null; color: string; rest: string } {
  const m = bullet.match(/^([A-Z]+)(?:[A-Z ]{0,14}):\s*(.*)$/s);
  if (m && SEVERITY_COLOR[m[1]]) return { tag: m[1], color: SEVERITY_COLOR[m[1]], rest: m[2] };
  return { tag: null, color: THEME.slate, rest: bullet };
}

export async function renderPdf(spec: DocumentSpec): Promise<Buffer> {
  // Only defined keys: PDFSecurity.generateFileID calls .valueOf() on every
  // info value, so a single undefined entry (an author-less spec) throws.
  const info: Record<string, string> = { Title: spec.title };
  if (spec.author) info.Author = spec.author;
  const M = 60;
  const doc = new PDFDocument({ size: "LETTER", margin: M, info, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const pageW = doc.page.width, pageBottom = doc.page.height - M;

  // Cover banner: a full-width navy band carries the title, the way a real report's cover does,
  // instead of plain text floating at the page's own top margin.
  const bannerH = 132;
  doc.rect(0, 0, pageW, bannerH).fill(`#${THEME.navy}`);
  doc.fillColor(`#${THEME.white}`).fontSize(26).font("Helvetica-Bold")
    .text(spec.title, M, 38, { width: pageW - M * 2, align: "left" });
  if (spec.subtitle) {
    doc.fillColor("#C7D2E8").fontSize(13).font("Helvetica")
      .text(spec.subtitle, M, doc.y + 6, { width: pageW - M * 2, align: "left" });
  }
  doc.y = bannerH + 34;
  if (spec.author) {
    doc.fillColor(`#${THEME.slate}`).fontSize(9).font("Helvetica")
      .text(`${spec.author}  ·  ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, M, doc.y);
    doc.moveDown(1.4);
  }

  // A short answer doesn't need a stats strip or a table of contents -- both exist to orient a
  // reader through something long enough to need orienting. Reserve the vertical space for them
  // now (their real content, including page numbers, isn't known until the sections below are
  // actually laid out) so the cover page has a fixed, known hole to write back into afterwards --
  // the same deferred-write trick the footer below uses, just within the margin box instead of
  // below it, so it needs none of the footer's margin-zeroing workaround.
  const elaborate = spec.sections.length >= 3;
  const tocTop = doc.y;
  const tocLineH = 20;
  const statsBarH = 46;
  if (elaborate) {
    doc.y = tocTop + statsBarH + 16 + spec.sections.length * tocLineH + 20;
    doc.moveTo(M, doc.y).lineTo(pageW - M, doc.y).lineWidth(0.75).strokeColor("#E2E8F0").stroke();
    doc.y += 20;
  }

  // Ensure enough room is left for a heading (plus a first line of body) before starting a new
  // section -- a heading stranded alone at the foot of a page is worse than a slightly short one,
  // but forcing every section onto its own fresh page (the previous behaviour) left most pages
  // mostly blank, which is what read as "simplistic": real reports flow continuously.
  const ensureRoom = (need: number) => { if (doc.y + need > pageBottom) { doc.addPage(); pageIndex++; } };
  let pageIndex = 0;
  const tocEntries: { heading: string; page: number }[] = [];
  const tagCounts: Record<string, number> = {};

  for (const section of spec.sections) {
    ensureRoom(70);
    tocEntries.push({ heading: section.heading, page: pageIndex });
    doc.fillColor(`#${THEME.navy}`).fontSize(16).font("Helvetica-Bold").text(section.heading, M, doc.y, { width: pageW - M * 2 });
    const ruleY = doc.y + 6;
    doc.moveTo(M, ruleY).lineTo(M + 34, ruleY).lineWidth(2.5).strokeColor(`#${THEME.blue}`).stroke();
    doc.y = ruleY + 14;

    if (section.body) {
      doc.fillColor("#1F2937").fontSize(11).font("Helvetica").text(section.body, M, doc.y, { width: pageW - M * 2, align: "left", lineGap: 4 });
      doc.moveDown(0.7);
    }
    for (const bullet of section.bullets ?? []) {
      ensureRoom(30);
      const { tag, color, rest } = splitBulletTag(bullet);
      if (tag) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      const startY = doc.y;
      doc.circle(M + 5, startY + 6, 2.3).fill(`#${THEME.blue}`);
      const textX = M + 16, textW = pageW - M * 2 - 16;
      if (tag) {
        doc.font("Helvetica-Bold").fontSize(9);
        const tagW = doc.widthOfString(tag) + 14;
        doc.roundedRect(textX, startY - 2, tagW, 15, 3).fill(`#${color}`);
        doc.fillColor(`#${THEME.white}`).text(tag, textX + 7, startY + 1);
        doc.fillColor("#1F2937").font("Helvetica").fontSize(11).text(rest, textX + tagW + 8, startY, { width: textW - tagW - 8, lineGap: 3 });
      } else {
        doc.fillColor("#1F2937").font("Helvetica").fontSize(11).text(rest, textX, startY, { width: textW, lineGap: 3 });
      }
      doc.y = Math.max(doc.y, startY + 15) + 6;
    }
    if (section.notes) {
      ensureRoom(24);
      doc.fillColor(`#${THEME.slate}`).fontSize(9).font("Helvetica-Oblique").text(section.notes, M, doc.y, { width: pageW - M * 2 });
    }
    doc.moveDown(1.1);
  }

  // Now that every section's real starting page and every bullet's severity tag are known, go
  // back and fill the space reserved for them on the cover: a stats strip (counts per tag, only
  // when the spec actually used the tag convention) and a table of contents with real page
  // numbers and dot leaders. Both are what turn "a document with headings" into something a
  // reader can actually navigate -- worth doing only once there's enough content to navigate.
  if (elaborate) {
    doc.switchToPage(0);
    let statY = tocTop;
    const tagList = Object.entries(tagCounts);
    if (tagList.length) {
      const chipGap = 10;
      let x = M;
      doc.fontSize(9).font("Helvetica-Bold");
      for (const [tag, count] of tagList) {
        const label = `${count} ${tag}`;
        const w = doc.widthOfString(label) + 18;
        doc.roundedRect(x, statY, w, 24, 4).fill(`#${SEVERITY_COLOR[tag] ?? THEME.slate}`);
        doc.fillColor(`#${THEME.white}`).text(label, x + 9, statY + 7);
        x += w + chipGap;
      }
      const totalLabel = `${spec.sections.length} sections`;
      doc.fillColor(`#${THEME.slate}`).font("Helvetica").fontSize(9).text(totalLabel, x + 4, statY + 8);
      statY += statsBarH;
    }
    doc.fillColor(`#${THEME.slate}`).fontSize(9).font("Helvetica-Bold").text("CONTENTS", M, statY);
    statY += 16;
    doc.font("Helvetica").fontSize(10.5);
    for (const entry of tocEntries) {
      const pageLabel = String(entry.page + 1);
      const headW = doc.widthOfString(entry.heading);
      const pageW2 = doc.widthOfString(pageLabel);
      const dotsW = pageW - M * 2 - headW - pageW2 - 12;
      doc.fillColor("#1F2937").text(entry.heading, M, statY, { lineBreak: false });
      if (dotsW > 10) {
        const dot = " . ".repeat(Math.max(1, Math.floor(dotsW / doc.widthOfString(" . "))));
        doc.fillColor("#CBD5E1").text(dot, M + headW + 4, statY, { width: dotsW, lineBreak: false });
      }
      doc.fillColor(`#${THEME.slate}`).text(pageLabel, pageW - M - pageW2, statY, { lineBreak: false });
      statY += tocLineH;
    }
  }

  // Footer on every page -- total page count is only known once content is done, hence the
  // buffered-pages pass rather than writing it inline as each page is produced. The footer sits
  // BELOW the page's own bottom margin by design (it's chrome, not content), but PDFKit treats
  // any text placed outside the margin box as overflow and silently starts a new page to hold it
  // -- confirmed live, it turned a real 2-page report into 6 (4 blank pages, each holding nothing
  // but a stray footer line). Zeroing the bottom margin for the duration of the footer write is
  // the standard PDFKit fix: it stops that page treating the footer as content that doesn't fit.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - M + 14;
    doc.moveTo(M, y - 8).lineTo(pageW - M, y - 8).lineWidth(0.5).strokeColor("#E2E8F0").stroke();
    doc.fillColor("#94A3B8").fontSize(8).font("Helvetica")
      .text(spec.author ? `${spec.author} · Generated ${new Date().toLocaleDateString("en-US")}` : "", M, y, { width: pageW - M * 2 - 60, lineBreak: false })
      .text(`Page ${i - range.start + 1} of ${range.count}`, pageW - M - 100, y, { width: 100, align: "right", lineBreak: false });
    doc.page.margins.bottom = savedBottom;
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
