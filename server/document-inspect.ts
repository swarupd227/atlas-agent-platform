/**
 * Reading a .pptx the way a reviewer would -- without a sandbox.
 *
 * A reviewer agent used to open the deck in a code-execution container and
 * check it one command at a time: one model round trip per check, which on a
 * 30-slide deck ran past fifteen minutes. Everything it checked is
 * deterministic, so it is computed here in one pass and handed over as facts;
 * the agent's job becomes judging them. Two uses:
 *
 *  - describePptx: a template's text shapes, with their current text and a
 *    character budget, so an author can write text that fits.
 *  - inspectPptx: a produced deck, optionally against the template it was
 *    filled from -- well-formedness, package references, per-slide structure,
 *    text still equal to the template's, text needing more room than the
 *    template's own text had, empty placeholders, prompt text, notes, footers.
 *
 * Generic by construction: it knows nothing about any template, brand or deck,
 * and compares an output only with the template it is given.
 */

import JSZipImport from "jszip";
import { xmlBalanceProblem } from "./document-template-fill";
import { FIT_TOLERANCE, charBudget, fitRatio, inheritedText, paragraphTexts, textBodyOf } from "./document-text-fit";

// Same CJS/ESM dance as document-template-fill.ts.
const JSZip: typeof JSZipImport = (JSZipImport as any)?.default ?? JSZipImport;

function allMatches(s: string, pattern: RegExp): RegExpExecArray[] {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

const SHAPE = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;
const FRAME = /<p:graphicFrame\b[^>]*>[\s\S]*?<\/p:graphicFrame>/g;
/** Header/footer furniture, filled from the deck's settings rather than by an author. */
const CHROME_PLACEHOLDER = /^(?:ftr|sldNum|dt|hdr)$/;
const TEXT_PLACEHOLDER = /^(?:title|ctrTitle|subTitle|body)$/;
const PROMPT_TEXT = /click to (?:add|edit)|lorem ipsum|\bTBD\b|\bx{3,}\b/i;
const OPEN_MARKER = /\[(?:TO CONFIRM|TBC|TBD|TODO)\b[^\]]*\]/gi;
const BAD_AMPERSAND = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;
const AUTOFIT_SCALE = /<a:normAutofit\b[^>]*\sfontScale="(\d+)"/;

const round2 = (n: number) => Math.round(n * 100) / 100;
const normalise = (s: string) => s.replace(/\s+/g, " ").trim();
const decodeAttr = (s: string) =>
  s.replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

interface SlidePart {
  number: number;
  path: string;
  id?: string;
  xml: string;
  rels: string;
  layout: string;
  /** The layout and master behind this slide, for what its placeholders inherit. */
  layoutXml: string | null;
  masterXml: string | null;
  missing: boolean;
}

async function readDeck(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  const read = async (path: string) => (await zip.file(path)?.async("string")) ?? null;
  const pres = await read("ppt/presentation.xml");
  if (!pres) throw new Error("Not a PowerPoint package: ppt/presentation.xml is missing.");

  const presRels = (await read("ppt/_rels/presentation.xml.rels")) ?? "";
  const target = new Map<string, string>();
  for (const m of allMatches(presRels, /<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\sId="([^"]+)"/)?.[1];
    const to = m[0].match(/\sTarget="([^"]+)"/)?.[1];
    if (id && to) target.set(id, to.replace(/^\/?ppt\//, "").replace(/^\.\.\//, ""));
  }

  const slides: SlidePart[] = [];
  const tags = allMatches(pres, /<p:sldId\b[^>]*\/>/g);
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i][0];
    const path = `ppt/${target.get(tag.match(/\sr:id="([^"]+)"/)?.[1] ?? "") ?? ""}`;
    const id = tag.match(/\sid="(\d+)"/)?.[1];
    const xml = await read(path);
    if (xml === null) {
      slides.push({ number: i + 1, path, id, xml: "", rels: "", layout: "", layoutXml: null, masterXml: null, missing: true });
      continue;
    }
    const rels = (await read(path.replace(/\/([^/]+)$/, "/_rels/$1.rels"))) ?? "";
    const layoutFile = rels.match(/Target="\.\.\/slideLayouts\/([^"]+)"/)?.[1];
    const layoutXml = layoutFile ? await read(`ppt/slideLayouts/${layoutFile}`) : null;
    const layout = decodeAttr(layoutXml?.match(/<p:cSld\b[^>]*\sname="([^"]*)"/)?.[1] ?? "");
    const layoutRels = layoutFile ? ((await read(`ppt/slideLayouts/_rels/${layoutFile}.rels`)) ?? "") : "";
    const masterFile = layoutRels.match(/Target="\.\.\/slideMasters\/([^"]+)"/)?.[1];
    const masterXml = masterFile ? await read(`ppt/slideMasters/${masterFile}`) : null;
    slides.push({ number: i + 1, path, id, xml, rels, layout, layoutXml, masterXml, missing: false });
  }
  return { zip, read, pres, slides };
}

interface ShapeInfo {
  xml: string;
  name: string;
  /** Placeholder type ("title", "body", ...), or null for a free shape. */
  placeholder: string | null;
  position: string;
  body?: string;
}

function shapesOf(slideXml: string): ShapeInfo[] {
  return allMatches(slideXml, SHAPE).map((m) => {
    const xml = m[0];
    const ph = xml.match(/<p:ph\b[^>]*>/)?.[0];
    const off = xml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
    return {
      xml,
      name: decodeAttr(xml.match(/<p:cNvPr\b[^>]*\sname="([^"]*)"/)?.[1] ?? ""),
      placeholder: ph ? (ph.match(/\stype="([^"]+)"/)?.[1] ?? "body") : null,
      position: off ? `${off[1]},${off[2]}` : "",
      body: textBodyOf(xml),
    };
  });
}

const kindOf = (placeholder: string | null) =>
  placeholder === null
    ? "shape"
    : /^(?:title|ctrTitle)$/.test(placeholder)
      ? "title"
      : placeholder === "subTitle"
        ? "subtitle"
        : placeholder;

function tableFrames(slideXml: string): Array<{ name: string; xml: string }> {
  return allMatches(slideXml, FRAME)
    .map((m) => m[0])
    .filter((f) => f.includes("<a:tbl>"))
    .map((xml) => ({ name: decodeAttr(xml.match(/<p:cNvPr\b[^>]*\sname="([^"]*)"/)?.[1] ?? ""), xml }));
}

const structureOf = (xml: string) => ({
  pictures: (xml.match(/<p:pic\b/g) ?? []).length,
  shapes: (xml.match(/<p:sp\b/g) ?? []).length,
  groups: (xml.match(/<p:grpSp\b/g) ?? []).length,
  frames: (xml.match(/<p:graphicFrame\b/g) ?? []).length,
  tables: (xml.match(/<a:tbl\b/g) ?? []).length,
});

// ── Describe ────────────────────────────────────────────────────────────────

export interface DescribedShape {
  name: string;
  kind: string;
  /** Current text, paragraphs separated by " // ". */
  text: string;
  paragraphs: number;
  chars: number;
  /** Estimated characters that fit where this text is now; null if unknown. */
  maxChars: number | null;
}

export interface DescribedSlide {
  slide: number;
  layout: string;
  pictures: number;
  shapes: DescribedShape[];
  tables: Array<{ name: string; rows: number; columns: number; firstRow: string[] }>;
  notes: boolean;
}

export async function describePptx(bytes: Buffer): Promise<{ slideCount: number; slides: DescribedSlide[]; note: string }> {
  const deck = await readDeck(bytes);
  const slides: DescribedSlide[] = [];
  for (const s of deck.slides) {
    if (s.missing) continue;
    const shapes: DescribedShape[] = [];
    for (const sh of shapesOf(s.xml)) {
      if (!sh.body || (sh.placeholder && CHROME_PLACEHOLDER.test(sh.placeholder))) continue;
      const paras = paragraphTexts(sh.body).map(normalise).filter(Boolean);
      shapes.push({
        name: sh.name,
        kind: kindOf(sh.placeholder),
        text: paras.join(" // "),
        paragraphs: paras.length,
        chars: paras.join("").length,
        maxChars: charBudget(sh.xml, inheritedText(sh.xml, s.layoutXml, s.masterXml)),
      });
    }
    const tables = tableFrames(s.xml).map(({ name, xml }) => {
      const rows = allMatches(xml, /<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g).map((r) => r[0]);
      const firstRow = rows[0]
        ? allMatches(rows[0], /<a:tc\b[^>]*>[\s\S]*?<\/a:tc>/g).map((c) => normalise(paragraphTexts(c[0]).join(" ")))
        : [];
      return { name, rows: rows.length, columns: (xml.match(/<a:gridCol\b/g) ?? []).length, firstRow };
    });
    slides.push({
      slide: s.number,
      layout: s.layout,
      pictures: structureOf(s.xml).pictures,
      shapes,
      tables,
      notes: /notesSlides\//.test(s.rels),
    });
  }
  return {
    slideCount: slides.length,
    slides,
    note:
      "Text shapes per slide with their current text (' // ' separates paragraphs). maxChars estimates how much " +
      "text fits where that text is now: stay within it, or the text will overflow its box.",
  };
}

// ── Inspect ─────────────────────────────────────────────────────────────────

export interface SlideInspection {
  slide: number;
  /** The template slide this one was filled from, when a template was given. */
  fromTemplateSlide: number | null;
  layout: string;
  pictures: number;
  shapes: number;
  groups: number;
  frames: number;
  tables: number;
  /** Same layout and the same picture/shape/group/frame/table counts as its template slide. */
  matchesTemplateStructure: boolean | null;
  notes: boolean;
  /** Title/subtitle/body placeholders left empty where the template had text. */
  emptyPlaceholders: string[];
  /** Text needing clearly more room than the template's own text had, after any shrink. */
  overflow: Array<{ name: string; roomNeeded: number; text: string }>;
  /** Shapes whose text was shrunk to fit (fontScale = fraction of the template size). */
  shrunkToFit: Array<{ name: string; fontScale: number }>;
  /** Paragraphs identical to text on the template's slide -- intended or not. */
  unchangedFromTemplate: string[];
  placeholderPrompts: string[];
  /** Open markers such as [TO CONFIRM: ...] or [TBD]. */
  openMarkers: number;
}

export interface InspectionReport {
  summary: {
    wellFormed: boolean;
    slides: number;
    templateSlides: number | null;
    droppedTemplateSlides: number[];
    slidesNotMatchingTemplate: number[] | null;
    shapesStillOverflowing: number;
    shapesShrunkToFit: number;
    emptyPlaceholders: number;
    paragraphsUnchangedFromTemplate: number;
    placeholderPrompts: number;
    openMarkers: number;
    slidesWithoutNotes: number[];
    packageProblems: number;
    footers: string[];
  };
  malformedParts: Array<{ part: string; problem: string }>;
  packageProblems: string[];
  slides: SlideInspection[];
  note: string;
}

export async function inspectPptx(documentBytes: Buffer, templateBytes?: Buffer): Promise<InspectionReport> {
  const deck = await readDeck(documentBytes);
  const template = templateBytes ? await readDeck(templateBytes) : null;

  // Every XML part must be well-formed: one bad part and PowerPoint refuses the file.
  const malformedParts: Array<{ part: string; problem: string }> = [];
  for (const path of Object.keys(deck.zip.files)) {
    if (!/\.(?:xml|rels)$/i.test(path)) continue;
    const xml = (await deck.read(path)) ?? "";
    const problem = xmlBalanceProblem(xml) ?? (BAD_AMPERSAND.test(xml) ? "an unescaped '&'" : null);
    if (problem) malformedParts.push({ part: path, problem });
  }

  // Every reference PowerPoint follows must land somewhere.
  const packageProblems: string[] = [];
  const contentTypes = (await deck.read("[Content_Types].xml")) ?? "";
  for (const s of deck.slides) {
    if (s.missing) {
      packageProblems.push(`slide ${s.number}: its part ${s.path} is missing`);
      continue;
    }
    if (!contentTypes.includes(`PartName="/${s.path}"`)) packageProblems.push(`slide ${s.number}: no content type for ${s.path}`);
    const notes = s.rels.match(/Target="\.\.\/notesSlides\/([^"]+)"/)?.[1];
    if (!notes) continue;
    const notesPath = `ppt/notesSlides/${notes}`;
    if (!deck.zip.file(notesPath)) {
      packageProblems.push(`slide ${s.number}: its notes part ${notesPath} is missing`);
      continue;
    }
    const notesRels = await deck.read(`ppt/notesSlides/_rels/${notes}.rels`);
    if (!notesRels || !/relationships\/notesMaster"/.test(notesRels)) {
      packageProblems.push(`slide ${s.number}: its notes slide has no notes-master relationship`);
    }
    if (!contentTypes.includes(`PartName="/${notesPath}"`)) packageProblems.push(`slide ${s.number}: no content type for ${notesPath}`);
  }
  const liveIds = new Set(deck.slides.map((s) => s.id ?? ""));
  const sections = deck.pres.match(/<p14:sectionLst\b[\s\S]*?<\/p14:sectionLst>/)?.[0] ?? "";
  for (const m of allMatches(sections, /<p14:sldId\s+id="(\d+)"/g)) {
    if (!liveIds.has(m[1])) packageProblems.push(`the section list names slide id ${m[1]}, which is not in the deck`);
  }

  // Slide by slide, against the template slide each one was filled from.
  const templateByPath = new Map<string, SlidePart>();
  for (const t of template?.slides ?? []) if (!t.missing) templateByPath.set(t.path, t);
  const footers: string[] = [];
  const slides: SlideInspection[] = [];

  for (const s of deck.slides) {
    if (s.missing) continue;
    const t = templateByPath.get(s.path) ?? null;
    const structure = structureOf(s.xml);
    const templateShapes = t ? shapesOf(t.xml) : [];
    const templateText = new Set(t ? paragraphTexts(t.xml).map(normalise) : []);
    const templateShapeFor = (sh: ShapeInfo) =>
      templateShapes.find((x) => x.name === sh.name && x.position === sh.position) ??
      templateShapes.find((x) => x.name === sh.name);

    const emptyPlaceholders: string[] = [];
    const overflow: SlideInspection["overflow"] = [];
    const shrunkToFit: SlideInspection["shrunkToFit"] = [];
    const unchanged: string[] = [];
    const prompts: string[] = [];
    let openMarkers = 0;

    const checkText = (owner: string, paras: string[]) => {
      for (const p of paras) {
        if (!p) continue;
        openMarkers += (p.match(OPEN_MARKER) ?? []).length;
        if (PROMPT_TEXT.test(p)) prompts.push(`${owner}: ${p.slice(0, 80)}`);
        if (p.length > 12 && templateText.has(p)) unchanged.push(`${owner}: ${p.slice(0, 100)}`);
      }
    };

    for (const sh of shapesOf(s.xml)) {
      if (!sh.body) continue;
      const paras = paragraphTexts(sh.body).map(normalise);
      const text = paras.filter(Boolean).join(" ");
      if (sh.placeholder && CHROME_PLACEHOLDER.test(sh.placeholder)) {
        if (sh.placeholder === "ftr" && text && !footers.includes(text)) footers.push(text);
        continue;
      }
      const tSh = t ? templateShapeFor(sh) : undefined;
      if (!text && sh.placeholder && TEXT_PLACEHOLDER.test(sh.placeholder)) {
        const templateHadText = tSh?.body ? paragraphTexts(tSh.body).some((p) => p.trim()) : !t;
        if (templateHadText) emptyPlaceholders.push(sh.name);
      }
      checkText(sh.name, paras);
      if (tSh) {
        const scale = sh.xml.match(AUTOFIT_SCALE)?.[1];
        if (scale && scale !== tSh.xml.match(AUTOFIT_SCALE)?.[1]) {
          shrunkToFit.push({ name: sh.name, fontScale: round2(Number(scale) / 100000) });
        }
        const ratio = fitRatio(tSh.xml, sh.xml, inheritedText(tSh.xml, t!.layoutXml, t!.masterXml));
        if (ratio !== null && ratio > FIT_TOLERANCE) overflow.push({ name: sh.name, roomNeeded: round2(ratio), text: text.slice(0, 80) });
      }
    }
    for (const table of tableFrames(s.xml)) checkText(table.name, paragraphTexts(table.xml).map(normalise));

    const matches = t
      ? s.layout === t.layout && JSON.stringify(structure) === JSON.stringify(structureOf(t.xml))
      : null;
    slides.push({
      slide: s.number,
      fromTemplateSlide: t?.number ?? null,
      layout: s.layout,
      ...structure,
      matchesTemplateStructure: matches,
      notes: /notesSlides\//.test(s.rels),
      emptyPlaceholders,
      overflow,
      shrunkToFit,
      unchangedFromTemplate: unchanged,
      placeholderPrompts: prompts,
      openMarkers,
    });
  }

  const total = (f: (s: SlideInspection) => number) => slides.reduce((n, s) => n + f(s), 0);
  const droppedTemplateSlides = template
    ? template.slides.filter((t) => !t.missing && !deck.slides.some((s) => s.path === t.path)).map((t) => t.number)
    : [];

  return {
    summary: {
      wellFormed: malformedParts.length === 0,
      slides: slides.length,
      templateSlides: template ? template.slides.length : null,
      droppedTemplateSlides,
      slidesNotMatchingTemplate: template ? slides.filter((s) => s.matchesTemplateStructure === false).map((s) => s.slide) : null,
      shapesStillOverflowing: total((s) => s.overflow.length),
      shapesShrunkToFit: total((s) => s.shrunkToFit.length),
      emptyPlaceholders: total((s) => s.emptyPlaceholders.length),
      paragraphsUnchangedFromTemplate: total((s) => s.unchangedFromTemplate.length),
      placeholderPrompts: total((s) => s.placeholderPrompts.length),
      openMarkers: total((s) => s.openMarkers),
      slidesWithoutNotes: slides.filter((s) => !s.notes).map((s) => s.slide),
      packageProblems: packageProblems.length,
      footers,
    },
    malformedParts,
    packageProblems,
    slides,
    note: template
      ? "roomNeeded compares a shape's text with the room the template's own text needed in the same box (1 = the " +
        "same); overflow lists what still exceeds it after any shrink-to-fit. unchangedFromTemplate is text identical " +
        "to the template slide's own text, which may or may not be intended."
      : "No template was given, so structure, overflow and unchanged-text comparisons were skipped.",
  };
}
