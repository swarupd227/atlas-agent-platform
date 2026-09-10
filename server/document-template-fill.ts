/**
 * Filling an EXISTING document template from a structured map.
 *
 * server/document-renderer.ts builds a document from nothing: the model
 * supplies content and the server lays it out. That is the right tool when the
 * look is ours to choose. It is the wrong tool when an organisation has its own
 * template -- a master with their fonts, colours, imagery, diagrams and slide
 * furniture -- and wants THAT deck said in new words. Rebuilding such a deck
 * from a spec throws away everything that made it theirs.
 *
 * So this module does the other half: take the template's own bytes, replace
 * only TEXT, and leave every picture, group, chart, connector, layout and theme
 * exactly where it was. It is deliberately generic -- it knows nothing about
 * any particular template, brand or deck. The caller supplies which shapes to
 * fill, by the shape names the template itself uses, and what to put in them.
 * Everything specific lives in that map (data), never here (code).
 *
 * Why the server and not an agent with a sandbox: applying N known replacements
 * is deterministic work with no judgement in it. Done by an agent it costs one
 * model round trip per edit -- measured at ~12s each, and a 190-edit deck did
 * not finish inside 40 minutes. Done here it is a single pass over the package.
 *
 * Formatting is preserved by reusing the run properties already on each
 * paragraph: the first run of the first paragraph is the style carrier, and new
 * paragraphs are clones of it with new text. A placeholder that was empty has
 * no run to copy, so its text inherits from the layout, which is what the
 * template author intended anyway.
 */

import { z } from "zod";
import JSZipImport from "jszip";

// jszip ships CJS; the server bundles to CJS where the module object itself is
// the constructor, while ESM tooling wraps it in `.default`. Same dance as
// document-renderer.ts does for pptxgenjs/pdfkit.
const JSZip: typeof JSZipImport = (JSZipImport as any)?.default ?? JSZipImport;

const shapeFillSchema = z.object({
  name: z.string().min(1).describe("Shape name exactly as it appears in the template."),
  was: z.string().optional().describe(
    "Start of the shape's CURRENT text. Only needed to disambiguate when several shapes on one slide share a name.",
  ),
  text: z.string().describe("Replacement text. Use a newline to separate paragraphs."),
});

const tableFillSchema = z.object({
  name: z.string().optional().describe("Table shape name; omit to fill the slide's first table."),
  rows: z.array(z.array(z.string())).describe(
    "Cell text, row by row. The template's row and column counts are kept; cells the map does not cover are blanked.",
  ),
});

const slideFillSchema = z.object({
  slide: z.number().int().positive().describe("1-based slide number in the template, in presentation order."),
  drop: z.boolean().optional().describe("Remove this slide from the output."),
  shapes: z.array(shapeFillSchema).optional(),
  table: tableFillSchema.optional(),
  notes: z.string().optional().describe("Speaker notes for this slide."),
});

export const templateFillSpecSchema = z.object({
  templateFileId: z.string().optional().describe("Id of the uploaded template file."),
  templateFilename: z.string().optional().describe("Filename of the template, when its id is not known."),
  outputTitle: z.string().min(1).describe("Title for the produced file; becomes its filename."),
  footer: z.string().optional().describe("Text for every slide's footer placeholder."),
  slides: z.array(slideFillSchema).min(1),
});

export type TemplateFillSpec = z.infer<typeof templateFillSpecSchema>;

export interface TemplateFillReport {
  slidesInTemplate: number;
  slidesInOutput: number;
  slidesDropped: number[];
  shapesFilled: number;
  tablesFilled: number;
  notesWritten: number;
  /** Every shape the map asked for that the template does not have. Callers are
   *  expected to surface these: a silent miss looks like a successful fill. */
  unmatched: Array<{ slide: number; name: string; was?: string }>;
}

/** Collect every match. An exec loop rather than matchAll: the server's TS
 *  target does not allow spreading the iterator matchAll returns. */
function matchAll(xml: string, pattern: RegExp): RegExpExecArray[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const re = new RegExp(pattern.source, flags);
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Visible text of an XML fragment, with entities resolved. */
function textOf(xml: string): string {
  return matchAll(xml, /<a:t>([\s\S]*?)<\/a:t>/g)
    .map((m) => m[1])
    .join("")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * The first `<qname>` element in `xml`, whole: either self-closing, or running
 * to its own closing tag. Matching "up to the first `/>`" instead stops inside
 * any element that has children -- `<a:rPr><a:solidFill><a:schemeClr/>` -- and
 * leaves it unclosed, which corrupts the part. None of the elements this module
 * lifts (bodyPr, lstStyle, p, pPr, r, rPr) can contain another of its own name.
 */
function firstElement(xml: string, qname: string): string | undefined {
  const open = new RegExp(`<${escapeRe(qname)}(?=[\\s/>])[^>]*>`).exec(xml);
  if (!open) return undefined;
  if (open[0].endsWith("/>")) return open[0];
  const closeTag = `</${qname}>`;
  const close = xml.indexOf(closeTag, open.index + open[0].length);
  return close === -1 ? undefined : xml.slice(open.index, close + closeTag.length);
}

/**
 * Why `xml` is not well-formed by tag balance, or null. Not a full parser, but
 * it catches exactly what a text rewrite can break: an element cut in half.
 */
export function xmlBalanceProblem(xml: string): string | null {
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)\b[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml)) !== null) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (!closing) {
      stack.push(name);
      continue;
    }
    const open = stack.pop();
    if (open !== name) return `</${name}> closes <${open ?? "nothing"}>`;
  }
  return stack.length ? `<${stack[stack.length - 1]}> is never closed` : null;
}

/**
 * Rebuild a text body's paragraphs around new text, keeping the first
 * paragraph's properties and its first run's properties as the style.
 */
function rewriteTextBody(txBody: string, text: string, tag: "p" | "a"): string {
  const paragraphs = text.split("\n").map((p) => p.trim()).filter((p) => p.length > 0);
  const bodyPr = firstElement(txBody, "a:bodyPr") ?? "<a:bodyPr/>";
  const lstStyle = firstElement(txBody, "a:lstStyle") ?? "";
  const firstPara = firstElement(txBody, "a:p") ?? "";
  const pPr = firstElement(firstPara, "a:pPr") ?? "";
  const firstRun = firstElement(firstPara, "a:r") ?? "";
  const rPr = firstElement(firstRun, "a:rPr") ?? "";

  const rendered = (paragraphs.length > 0 ? paragraphs : [""])
    .map((p) => `<a:p>${pPr}<a:r>${rPr}<a:t>${xmlEscape(p)}</a:t></a:r></a:p>`)
    .join("");

  return `<${tag}:txBody>${bodyPr}${lstStyle}${rendered}</${tag}:txBody>`;
}

const shapeName = (sp: string) => sp.match(/<p:cNvPr[^>]*\sname="([^"]*)"/)?.[1] ?? "";

const SHAPE_RE = /<p:sp>[\s\S]*?<\/p:sp>/g;

/**
 * Replace text in the shape whose name -- and, when `was` is given, whose
 * current text -- matches. Returns null when nothing matched, so the caller can
 * report the miss rather than assume success.
 */
function fillShape(slideXml: string, target: { name: string; was?: string; text: string }): string | null {
  const candidates = matchAll(slideXml, SHAPE_RE).map((m) => m[0]).filter((b) => shapeName(b) === target.name);
  if (candidates.length === 0) return null;

  const probe = target.was?.trim().slice(0, 25);
  const chosen = probe ? candidates.find((b) => textOf(b).startsWith(probe)) ?? candidates[0] : candidates[0];

  const txBody = chosen.match(/<p:txBody>[\s\S]*?<\/p:txBody>/)?.[0];
  if (!txBody) return null;
  return slideXml.replace(chosen, chosen.replace(txBody, rewriteTextBody(txBody, target.text, "p")));
}

/** Footer placeholders carry a "ftr" placeholder type; slide numbers are left alone. */
function fillFooters(slideXml: string, footer: string): string {
  let out = slideXml;
  for (const sp of matchAll(slideXml, SHAPE_RE).map((m) => m[0])) {
    if (!/<p:ph[^>]*type="ftr"/.test(sp)) continue;
    const txBody = sp.match(/<p:txBody>[\s\S]*?<\/p:txBody>/)?.[0];
    if (!txBody) continue;
    out = out.replace(sp, sp.replace(txBody, rewriteTextBody(txBody, footer, "p")));
  }
  return out;
}

function fillTable(slideXml: string, table: { name?: string; rows: string[][] }): string | null {
  const tbl = slideXml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)?.[0];
  if (!tbl) return null;

  let updatedTbl = tbl;
  const rows = matchAll(tbl, /<a:tr[\s\S]*?<\/a:tr>/g).map((m) => m[0]);
  rows.forEach((tr, rowIdx) => {
    let updatedTr = tr;
    const cells = matchAll(tr, /<a:tc[\s\S]*?<\/a:tc>/g).map((m) => m[0]);
    cells.forEach((tc, colIdx) => {
      const cellBody = tc.match(/<a:txBody>[\s\S]*?<\/a:txBody>/)?.[0];
      if (!cellBody) return;
      const text = table.rows[rowIdx]?.[colIdx] ?? "";
      updatedTr = updatedTr.replace(tc, tc.replace(cellBody, rewriteTextBody(cellBody, text, "a")));
    });
    updatedTbl = updatedTbl.replace(tr, updatedTr);
  });
  return slideXml.replace(tbl, updatedTbl);
}

const NOTES_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml";
const NOTES_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";
const NOTES_MASTER_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster";
const SLIDE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const RELS_OPEN =
  "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
  "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">";

const notesSlideXml = (text: string) =>
  "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
  "<p:notes xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" " +
  "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" " +
  "xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">" +
  "<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>" +
  "<p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Notes Placeholder\"/>" +
  "<p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" idx=\"1\"/></p:nvPr></p:nvSpPr>" +
  "<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>" +
  xmlEscape(text) +
  "</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>";

/**
 * Fill an existing .pptx template. The template's design is untouched: only the
 * text of the shapes the spec names changes.
 */
export async function fillPptxTemplate(
  templateBytes: Buffer,
  spec: TemplateFillSpec,
): Promise<{ content: Buffer; report: TemplateFillReport }> {
  const zip = await JSZip.loadAsync(templateBytes);

  const presPath = "ppt/presentation.xml";
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const presFile = zip.file(presPath);
  const relsFile = zip.file(relsPath);
  if (!presFile || !relsFile) throw new Error("Not a PowerPoint package: ppt/presentation.xml is missing.");

  let presXml = await presFile.async("string");
  let relsXml = await relsFile.async("string");
  let contentTypes = (await zip.file("[Content_Types].xml")?.async("string")) ?? "";
  const notesMasterPath = Object.keys(zip.files).find((p) => /^ppt\/notesMasters\/[^/]+\.xml$/.test(p));

  const relTarget = new Map<string, string>();
  for (const m of matchAll(relsXml, /<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const target = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && target) relTarget.set(id, target.replace(/^\/?ppt\//, "").replace(/^\.\.\//, ""));
  }

  const slideSlots = matchAll(presXml, /<p:sldId\b[^>]*r:id="([^"]+)"[^>]*\/>/g).map((m) => ({
    tag: m[0],
    rId: m[1],
    path: `ppt/${relTarget.get(m[1]) ?? ""}`,
  }));

  const report: TemplateFillReport = {
    slidesInTemplate: slideSlots.length,
    slidesInOutput: slideSlots.length,
    slidesDropped: [],
    shapesFilled: 0,
    tablesFilled: 0,
    notesWritten: 0,
    unmatched: [],
  };

  const dropped: number[] = [];

  for (const entry of spec.slides) {
    const slot = slideSlots[entry.slide - 1];
    const slideFile = slot ? zip.file(slot.path) : null;
    if (!slot || !slideFile) {
      report.unmatched.push({ slide: entry.slide, name: "(no such slide in template)" });
      continue;
    }
    if (entry.drop) {
      dropped.push(entry.slide);
      continue;
    }

    let slideXml = await slideFile.async("string");

    for (const shape of entry.shapes ?? []) {
      const next = fillShape(slideXml, shape);
      if (next === null) {
        report.unmatched.push({ slide: entry.slide, name: shape.name, was: shape.was });
      } else {
        slideXml = next;
        report.shapesFilled++;
      }
    }

    if (entry.table) {
      const next = fillTable(slideXml, entry.table);
      if (next === null) report.unmatched.push({ slide: entry.slide, name: entry.table.name ?? "(table)" });
      else {
        slideXml = next;
        report.tablesFilled++;
      }
    }

    if (spec.footer) slideXml = fillFooters(slideXml, spec.footer);
    zip.file(slot.path, slideXml);

    if (entry.notes) {
      const slideRelsPath = slot.path.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
      let slideRels = (await zip.file(slideRelsPath)?.async("string")) ?? "";
      const existingNotes = slideRels.match(/Target="\.\.\/notesSlides\/([^"]+)"/)?.[1];

      if (existingNotes) {
        const notesPath = `ppt/notesSlides/${existingNotes}`;
        const notesXml = await zip.file(notesPath)?.async("string");
        const body = notesXml
          ? matchAll(notesXml, SHAPE_RE).map((m) => m[0]).find((sp) => /<p:ph[^>]*type="body"/.test(sp))
          : undefined;
        const txBody = body?.match(/<p:txBody>[\s\S]*?<\/p:txBody>/)?.[0];
        if (notesXml && body && txBody) {
          zip.file(notesPath, notesXml.replace(body, body.replace(txBody, rewriteTextBody(txBody, entry.notes, "p"))));
          report.notesWritten++;
        }
      } else if (!notesMasterPath) {
        // A notes slide has to hang off a notes master. Writing one without it
        // yields a package PowerPoint offers to "repair", so report it instead.
        report.unmatched.push({ slide: entry.slide, name: "(speaker notes: the template has no notes master)" });
      } else {
        // No notes slide yet: add the part, its own relationships (the notes
        // master and the slide it belongs to), its content type and the slide's
        // relationship to it. PowerPoint needs every one of them to open the
        // file without a repair prompt.
        const notesName = `notesSlideFill${entry.slide}.xml`;
        const notesPath = `ppt/notesSlides/${notesName}`;
        const relId = `rIdNotesFill${entry.slide}`;
        zip.file(notesPath, notesSlideXml(entry.notes));
        zip.file(
          `ppt/notesSlides/_rels/${notesName}.rels`,
          RELS_OPEN +
            `<Relationship Id="rId1" Type="${NOTES_MASTER_REL_TYPE}" Target="../notesMasters/${notesMasterPath.split("/").pop()}"/>` +
            `<Relationship Id="rId2" Type="${SLIDE_REL_TYPE}" Target="../slides/${slot.path.split("/").pop()}"/>` +
            "</Relationships>",
        );
        const relTag = `<Relationship Id="${relId}" Type="${NOTES_REL_TYPE}" Target="../notesSlides/${notesName}"/>`;
        slideRels = slideRels
          ? slideRels.replace(/<\/Relationships>/, `${relTag}</Relationships>`)
          : RELS_OPEN + relTag + "</Relationships>";
        zip.file(slideRelsPath, slideRels);
        if (contentTypes && !contentTypes.includes(notesPath)) {
          contentTypes = contentTypes.replace(
            /<\/Types>/,
            `<Override PartName="/${notesPath}" ContentType="${NOTES_CONTENT_TYPE}"/></Types>`,
          );
        }
        report.notesWritten++;
      }
    }
  }

  // Slides are removed last so every fill above could address slides by their
  // ORIGINAL number, which is what the caller's map is written against.
  for (const slideNo of dropped) {
    const slot = slideSlots[slideNo - 1];
    if (!slot) continue;
    const slideRelsPath = slot.path.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const slideRels = (await zip.file(slideRelsPath)?.async("string")) ?? "";
    const slideId = slot.tag.match(/\sid="(\d+)"/)?.[1];

    presXml = presXml.replace(slot.tag, "");
    // Everything else that names the slide goes with it: a section list or a
    // custom show still pointing at a removed slide is a package PowerPoint
    // offers to repair.
    if (slideId) presXml = presXml.replace(new RegExp(`<\\w+:sldId\\s+id="${slideId}"\\s*/>`, "g"), "");
    presXml = presXml.replace(new RegExp(`<p:sld\\s+r:id="${escapeRe(slot.rId)}"\\s*/>`, "g"), "");
    relsXml = relsXml.replace(new RegExp(`<Relationship\\b[^>]*Id="${slot.rId}"[^>]*/>`), "");
    zip.remove(slot.path);
    zip.remove(slideRelsPath);
    if (contentTypes) contentTypes = contentTypes.replace(new RegExp(`<Override PartName="/${slot.path}"[^>]*/>`), "");

    // Its notes slide belongs to it alone and would otherwise point at nothing.
    const notesName = slideRels.match(/Target="\.\.\/notesSlides\/([^"]+)"/)?.[1];
    if (notesName) {
      zip.remove(`ppt/notesSlides/${notesName}`);
      zip.remove(`ppt/notesSlides/_rels/${notesName}.rels`);
      if (contentTypes) {
        contentTypes = contentTypes.replace(
          new RegExp(`<Override PartName="/ppt/notesSlides/${escapeRe(notesName)}"[^>]*/>`),
          "",
        );
      }
    }
    report.slidesDropped.push(slideNo);
  }
  report.slidesInOutput = slideSlots.length - report.slidesDropped.length;

  zip.file(presPath, presXml);
  zip.file(relsPath, relsXml);
  if (contentTypes) zip.file("[Content_Types].xml", contentTypes);

  // Last line of defence. A package with one malformed part will not open, and
  // nothing downstream can tell that from a good fill -- so never return one.
  const touchable = /^(ppt\/(slides|notesSlides)\/(_rels\/)?[^/]+\.(xml|rels)|ppt\/presentation\.xml|ppt\/_rels\/presentation\.xml\.rels|\[Content_Types\]\.xml)$/;
  for (const path of Object.keys(zip.files)) {
    if (!touchable.test(path)) continue;
    const problem = xmlBalanceProblem(await zip.file(path)!.async("string"));
    if (problem) throw new Error(`Template fill produced malformed XML in ${path} (${problem}); no file was produced.`);
  }

  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { content, report };
}
