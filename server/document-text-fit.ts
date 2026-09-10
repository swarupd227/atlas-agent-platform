/**
 * How much room a shape's text needs, estimated from the slide XML alone.
 *
 * There is no renderer on the server, so this is an estimate: average glyph
 * widths for a proportional sans, 1.2 line height, the shape's frame minus its
 * insets. Taken absolutely it is too rough to act on -- on a real 30-slide
 * master, text that fits by design scored anywhere between 0.5 and 1.5 -- so
 * what callers use is the RELATIVE figure: the room new text needs compared
 * with the room the template's own text needed in the same frame, at the same
 * fonts. The template's text fits (the slide was laid out around it), so the
 * estimator's bias largely cancels, and a ratio well above 1 means the new
 * text will spill out of its box or push into its neighbours.
 *
 * A placeholder often carries no frame or font size of its own and takes both
 * from its slide layout (and that from the slide master), exactly as PowerPoint
 * renders it; inheritedText() resolves those so titles are measured in the box
 * they are actually drawn in.
 */

const EMU_PER_PT = 12700;
const DEFAULT_SIDE_INSET_EMU = 91440;
const DEFAULT_TOP_INSET_EMU = 45720;
const DEFAULT_FONT_PT = 18;

/** Ratios up to this are estimator noise and count as fitting. */
export const FIT_TOLERANCE = 1.1;

/** Collect every match (an exec loop: the server's TS target cannot spread matchAll). */
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

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

/** A paragraph, empty or not. `\b` keeps it from matching <a:pPr>. */
const PARAGRAPH = /<a:p\b[^>]*?(?:\/>|>[\s\S]*?<\/a:p>)/g;
const TEXT_RUN = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;
const SHAPE = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;
const LIST_STYLE = /<a:lstStyle\s*\/>|<a:lstStyle\b[^>]*>[\s\S]*?<\/a:lstStyle>/;

/** A shape's text body (slide shapes use p:txBody, table cells a:txBody). */
export function textBodyOf(shapeXml: string): string | undefined {
  return shapeXml.match(/<(p|a):txBody>[\s\S]*?<\/\1:txBody>/)?.[0];
}

/** The visible text of each paragraph in `xml`, entities resolved. */
export function paragraphTexts(xml: string): string[] {
  return allMatches(xml, PARAGRAPH).map((p) => decode(allMatches(p[0], TEXT_RUN).map((t) => t[1]).join("")));
}

export interface TextFrame {
  widthPt: number;
  heightPt: number;
}

/**
 * The area text can occupy in a shape that carries its own frame, in points.
 * Null for a placeholder that inherits its frame from the layout.
 */
export function textFrame(shapeXml: string): TextFrame | null {
  const ext = shapeXml.match(/<a:xfrm\b[^>]*>(?:(?!<\/a:xfrm>)[\s\S])*?<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
  if (!ext) return null;
  const bodyPr = shapeXml.match(/<a:bodyPr\b[^>]*>/)?.[0] ?? "";
  const inset = (attr: string, fallback: number) =>
    Number(bodyPr.match(new RegExp(`\\s${attr}="(\\d+)"`))?.[1] ?? fallback);
  let widthPt = (Number(ext[1]) - inset("lIns", DEFAULT_SIDE_INSET_EMU) - inset("rIns", DEFAULT_SIDE_INSET_EMU)) / EMU_PER_PT;
  let heightPt = (Number(ext[2]) - inset("tIns", DEFAULT_TOP_INSET_EMU) - inset("bIns", DEFAULT_TOP_INSET_EMU)) / EMU_PER_PT;
  if (/\svert="(?:vert|vert270|eaVert|wordArtVert|mongolianVert)"/.test(bodyPr)) [widthPt, heightPt] = [heightPt, widthPt];
  return { widthPt: Math.max(widthPt, 1), heightPt: Math.max(heightPt, 1) };
}

/** What a placeholder takes from its layout and master: its frame and level-1 text size. */
export interface InheritedText {
  frame: TextFrame | null;
  sizePt: number | null;
}

const placeholderOf = (shapeXml: string) => {
  const ph = shapeXml.match(/<p:ph\b[^>]*>/)?.[0];
  if (!ph) return null;
  return { type: ph.match(/\stype="([^"]+)"/)?.[1] ?? "body", idx: ph.match(/\sidx="(\d+)"/)?.[1] };
};
const titleFamily = (type: string) => type === "title" || type === "ctrTitle";

function levelOneSize(xml: string | undefined): number | null {
  if (!xml) return null;
  const m = xml.match(/<a:lvl1pPr\b[^>]*>(?:(?!<\/a:lvl1pPr>)[\s\S])*?<a:defRPr\b[^>]*\ssz="(\d+)"/);
  return m ? Number(m[1]) / 100 : null;
}

/**
 * Resolve what a placeholder inherits, the way PowerPoint does: the layout
 * placeholder with the same index (or, failing that, the same type), then the
 * master's title or body placeholder, then the master's title/body text style.
 * Undefined for a shape that is not a placeholder.
 */
export function inheritedText(shapeXml: string, layoutXml?: string | null, masterXml?: string | null): InheritedText | undefined {
  const ph = placeholderOf(shapeXml);
  if (!ph) return undefined;
  const sameFamily = (type: string) => titleFamily(type) === titleFamily(ph.type) && (titleFamily(type) || type === ph.type);

  const layoutShapes = layoutXml ? allMatches(layoutXml, SHAPE).map((m) => m[0]) : [];
  const layoutShape =
    (ph.idx !== undefined ? layoutShapes.find((sp) => placeholderOf(sp)?.idx === ph.idx) : undefined) ??
    layoutShapes.find((sp) => {
      const p = placeholderOf(sp);
      return !!p && sameFamily(p.type);
    });

  const wantsTitle = titleFamily(ph.type);
  const masterShape = masterXml
    ? allMatches(masterXml, SHAPE)
        .map((m) => m[0])
        .find((sp) => {
          const p = placeholderOf(sp);
          return !!p && (wantsTitle ? titleFamily(p.type) : p.type === "body");
        })
    : undefined;
  const masterStyle = masterXml?.match(wantsTitle ? /<p:titleStyle>[\s\S]*?<\/p:titleStyle>/ : /<p:bodyStyle>[\s\S]*?<\/p:bodyStyle>/)?.[0];

  return {
    frame: (layoutShape ? textFrame(layoutShape) : null) ?? (masterShape ? textFrame(masterShape) : null),
    sizePt:
      levelOneSize(layoutShape?.match(LIST_STYLE)?.[0]) ??
      levelOneSize(masterShape?.match(LIST_STYLE)?.[0]) ??
      levelOneSize(masterStyle),
  };
}

interface ParagraphMetric {
  chars: number;
  capsShare: number;
  sizePt: number;
  lineSpacing: number;
}

/**
 * Per paragraph: how many characters, at what size and line spacing. Sizes come
 * from the paragraph's own runs, else its end-of-paragraph properties, else the
 * body's list style for its level, else what the placeholder inherits, else a
 * default -- and any shrink-to-fit the body already carries is applied, so a
 * shrunk shape measures as shrunk.
 */
function paragraphMetrics(txBody: string, fallbackSizePt: number): ParagraphMetric[] {
  const autofit = txBody.match(/<a:normAutofit\b[^>]*>/)?.[0] ?? "";
  const fontScale = Number(autofit.match(/\sfontScale="(\d+)"/)?.[1] ?? 100000) / 100000;
  const lineReduction = Number(autofit.match(/\slnSpcReduction="(\d+)"/)?.[1] ?? 0) / 100000;
  const lstStyle = txBody.match(LIST_STYLE)?.[0] ?? "";
  const levelSize = (level: number) => {
    const tag = `a:lvl${level + 1}pPr`;
    const lvl = lstStyle.match(new RegExp(`<${tag}\\b[^>]*>(?:(?!</${tag}>)[\\s\\S])*?<a:defRPr\\b[^>]*\\ssz="(\\d+)"`));
    return lvl ? Number(lvl[1]) / 100 : 0;
  };

  return allMatches(txBody, PARAGRAPH).map((m) => {
    const p = m[0];
    const text = decode(allMatches(p, TEXT_RUN).map((t) => t[1]).join(""));
    const level = Number(p.match(/<a:pPr\b[^>]*\slvl="(\d+)"/)?.[1] ?? 0);
    const explicit = p.match(/<a:rPr\b[^>]*\ssz="(\d+)"/) ?? p.match(/<a:endParaRPr\b[^>]*\ssz="(\d+)"/);
    const sizePt = (explicit ? Number(explicit[1]) / 100 : levelSize(level) || fallbackSizePt) * fontScale;
    const pct = p.match(/<a:lnSpc>\s*<a:spcPct\s+val="(\d+)"/);
    const lineSpacing = (pct ? Number(pct[1]) / 100000 : 1) * (1 - lineReduction);
    const caps = (text.match(/[A-Z]/g) ?? []).length;
    return { chars: text.length, capsShare: text.length ? caps / text.length : 0, sizePt, lineSpacing };
  });
}

const glyphWidth = (p: { sizePt: number; capsShare: number }) => p.sizePt * (0.5 + 0.2 * p.capsShare);

/** Estimated height, in points, a text body needs at the given line width. */
export function neededHeightPt(txBody: string, widthPt: number, fallbackSizePt: number = DEFAULT_FONT_PT): number {
  let total = 0;
  for (const p of paragraphMetrics(txBody, fallbackSizePt)) {
    const perLine = Math.max(1, Math.floor(widthPt / glyphWidth(p)));
    const lines = Math.max(1, Math.ceil(p.chars / perLine));
    total += lines * p.sizePt * 1.2 * p.lineSpacing;
  }
  return total;
}

/** Text volume for a placeholder whose frame is unknown: characters weighted by glyph area. */
const volume = (txBody: string, fallbackSizePt: number) =>
  paragraphMetrics(txBody, fallbackSizePt).reduce((v, p) => v + Math.max(p.chars, 1) * p.sizePt * p.sizePt, 0);

/**
 * Room the text in `after` needs, relative to the room the template gave the
 * text in `before` -- the same shape before and after its text changed. 1 is
 * "as much as the template's own text"; null when there is nothing to compare.
 * `inherited` supplies the frame and size a placeholder takes from its layout.
 */
export function fitRatio(before: string, after: string, inherited?: InheritedText): number | null {
  const beforeBody = textBodyOf(before);
  const afterBody = textBodyOf(after);
  if (!beforeBody || !afterBody) return null;
  const fallbackSize = inherited?.sizePt ?? DEFAULT_FONT_PT;

  const frame = textFrame(before) ?? inherited?.frame ?? null;
  if (frame) {
    const room = Math.max(neededHeightPt(beforeBody, frame.widthPt, fallbackSize), frame.heightPt);
    return neededHeightPt(afterBody, frame.widthPt, fallbackSize) / room;
  }
  // No frame anywhere in the chain: compare how much text there is instead.
  const had = paragraphTexts(beforeBody).join("").length > 0 ? volume(beforeBody, fallbackSize) : 0;
  return had > 0 ? volume(afterBody, fallbackSize) / had : null;
}

/**
 * Roughly how many characters fit where the template has this shape's text, so
 * an author can write to size: the lines the box holds (at least as many as the
 * template's text uses) times the characters per line, with a little slack.
 * Null when neither the shape nor its layout gives it a frame and it is empty.
 */
export function charBudget(shapeXml: string, inherited?: InheritedText): number | null {
  const body = textBodyOf(shapeXml);
  if (!body) return null;
  const fallbackSize = inherited?.sizePt ?? DEFAULT_FONT_PT;
  const metrics = paragraphMetrics(body, fallbackSize);
  const chars = metrics.reduce((n, p) => n + p.chars, 0);
  const frame = textFrame(shapeXml) ?? inherited?.frame ?? null;
  if (!frame) return chars > 0 ? chars : null;

  const lead = metrics.find((p) => p.chars > 0) ?? metrics[0] ?? { sizePt: fallbackSize, capsShare: 0, lineSpacing: 1, chars: 0 };
  const room = Math.max(neededHeightPt(body, frame.widthPt, fallbackSize), frame.heightPt);
  const perLine = Math.max(1, Math.floor(frame.widthPt / glyphWidth(lead)));
  const lines = Math.max(1, Math.floor(room / (lead.sizePt * 1.2 * lead.lineSpacing)));
  return Math.max(chars, Math.floor(perLine * lines * 0.9));
}
