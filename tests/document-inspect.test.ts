/**
 * Inspecting a .pptx without a sandbox: describing a template, and checking a
 * filled deck against it.
 *
 * Synthetic fixtures only, built here: the capability is generic, so the test
 * must not lean on any real customer template.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { describePptx, inspectPptx } from "../server/document-inspect";
import { fillPptxTemplate } from "../server/document-template-fill";
import { FIT_TOLERANCE, fitRatio } from "../server/document-text-fit";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SLIDE_CT = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const rels = (body: string) =>
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;

/** A text shape with its own frame (points) and one run at `pt` size. */
function box(name: string, text: string, w: number, h: number, opts: { pt?: number; ph?: string; x?: number } = {}) {
  const ph = opts.ph ? `<p:ph type="${opts.ph}"/>` : "";
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="${name}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${opts.x ?? 0}" y="0"/><a:ext cx="${w * 12700}" cy="${h * 12700}"/></a:xfrm></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${(opts.pt ?? 18) * 100}"/>` +
    `<a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`
  );
}

const TABLE =
  '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="Table 7"/></p:nvGraphicFramePr>' +
  "<a:graphic><a:graphicData><a:tbl><a:tblGrid><a:gridCol w=\"1\"/><a:gridCol w=\"1\"/></a:tblGrid>" +
  '<a:tr h="1"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>H1</a:t></a:r></a:p></a:txBody></a:tc>' +
  '<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>H2</a:t></a:r></a:p></a:txBody></a:tc></a:tr>' +
  '<a:tr h="1"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>a</a:t></a:r></a:p></a:txBody></a:tc>' +
  '<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>b</a:t></a:r></a:p></a:txBody></a:tc></a:tr>' +
  "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>";

const slideXml = (body: string) => `${XML}<p:sld ${NS}><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;

/** A package with one layout ("Title and body") and the given slide bodies. */
async function deck(bodies: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      bodies.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${SLIDE_CT}"/>`).join("") +
      "</Types>",
  );
  zip.file(
    "ppt/presentation.xml",
    `${XML}<p:presentation ${NS}><p:sldIdLst>` +
      bodies.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("") +
      "</p:sldIdLst></p:presentation>",
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    rels(bodies.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join("")),
  );
  zip.file("ppt/slideLayouts/slideLayout1.xml", `${XML}<p:sldLayout ${NS}><p:cSld name="Title and body"><p:spTree/></p:cSld></p:sldLayout>`);
  bodies.forEach((body, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(body));
    zip.file(
      `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      rels(`<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`),
    );
  });
  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}

const template = () =>
  deck([
    box("Title 1", "Quarterly plan review", 600, 60, { ph: "title" }) +
      box("Body 2", "Short text", 300, 80, { x: 100 }) +
      box("Footer 3", "old footer", 300, 20, { ph: "ftr", x: 200 }),
    box("Title 1", "Results", 600, 60, { ph: "title" }) + TABLE,
  ]);

describe("fitRatio", () => {
  it("measures new text against the room the template's own text had", () => {
    const before = box("B", "Short", 200, 40);
    expect(fitRatio(before, box("B", "Tiny", 200, 40))!).toBeLessThanOrEqual(FIT_TOLERANCE);
    expect(fitRatio(before, box("B", "word ".repeat(60).trim(), 200, 40))!).toBeGreaterThan(2);
  });
});

describe("inherited placeholder frames", () => {
  it("measures a frameless title in the frame and size its layout gives it", async () => {
    // The slide's title has no frame or size of its own, like most real titles.
    const title = (text: string) =>
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
      `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
    const withLayout = await JSZip.loadAsync(await deck([title("Agenda")]));
    withLayout.file(
      "ppt/slideLayouts/slideLayout1.xml",
      `${XML}<p:sldLayout ${NS}><p:cSld name="Title and body"><p:spTree>` +
        '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
        `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${800 * 12700}" cy="${60 * 12700}"/></a:xfrm></p:spPr>` +
        '<p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></a:lstStyle><a:p/></p:txBody></p:sp>' +
        "</p:spTree></p:cSld></p:sldLayout>",
    );
    const tpl = (await withLayout.generateAsync({ type: "nodebuffer" })) as Buffer;

    // An 800 pt wide title line holds far more than the six characters of "Agenda".
    const budget = (await describePptx(tpl)).slides[0].shapes[0].maxChars!;
    expect(budget).toBeGreaterThan(30);

    // So a longer title that still fits that line is not shrunk...
    const fits = await fillPptxTemplate(tpl, { outputTitle: "x", slides: [{ slide: 1, shapes: [{ name: "Title 1", text: "Campaign agenda and next steps" }] }] });
    expect(fits.report.overflow).toEqual([]);
    // ...while one that needs several lines of a one-line box is.
    const tooLong = await fillPptxTemplate(tpl, { outputTitle: "x", slides: [{ slide: 1, shapes: [{ name: "Title 1", text: "word ".repeat(40).trim() }] }] });
    expect(tooLong.report.overflow.map((o) => o.name)).toEqual(["Title 1"]);
  });
});

describe("describePptx", () => {
  it("lists every text shape with its text and a character budget, and each table's shape", async () => {
    const profile = await describePptx(await template());
    expect(profile.slideCount).toBe(2);

    const [s1, s2] = profile.slides;
    expect(s1.layout).toBe("Title and body");
    // Footer furniture is not something an author writes, so it is left out.
    expect(s1.shapes.map((s) => s.name)).toEqual(["Title 1", "Body 2"]);
    const body = s1.shapes[1];
    expect(body).toMatchObject({ kind: "shape", text: "Short text", paragraphs: 1, chars: 10 });
    // The box has spare room, so the budget is larger than the text it holds now.
    expect(body.maxChars!).toBeGreaterThan(10);
    expect(s1.shapes[0].kind).toBe("title");

    expect(s2.tables).toEqual([{ name: "Table 7", rows: 2, columns: 2, firstRow: ["H1", "H2"] }]);
  });
});

describe("inspectPptx", () => {
  it("checks a filled deck against its template", async () => {
    const tpl = await template();
    const { content } = await fillPptxTemplate(tpl, {
      outputTitle: "Filled",
      footer: "New footer",
      slides: [
        // Title 1 left as the template has it; Body 2 given far more text than fits.
        { slide: 1, shapes: [{ name: "Body 2", text: "word ".repeat(200).trim() }] },
        { slide: 2, drop: true },
      ],
    });

    const report = await inspectPptx(content, tpl);
    expect(report.summary).toMatchObject({
      wellFormed: true,
      slides: 1,
      templateSlides: 2,
      droppedTemplateSlides: [2],
      slidesNotMatchingTemplate: [],
      packageProblems: 0,
      footers: ["New footer"],
    });

    const s1 = report.slides[0];
    expect(s1).toMatchObject({ slide: 1, fromTemplateSlide: 1, layout: "Title and body", matchesTemplateStructure: true });
    expect(s1.unchangedFromTemplate).toEqual(["Title 1: Quarterly plan review"]);
    expect(s1.shrunkToFit.map((s) => s.name)).toEqual(["Body 2"]);
    expect(s1.overflow.map((o) => o.name)).toEqual(["Body 2"]);
    expect(s1.overflow[0].roomNeeded).toBeGreaterThan(FIT_TOLERANCE);
    // The fixture has no notes master, so it has no notes to report either.
    expect(report.summary.slidesWithoutNotes).toEqual([1]);
  });

  it("flags a placeholder left empty where the template had text, and prompt text", async () => {
    const tpl = await template();
    const { content } = await fillPptxTemplate(tpl, {
      outputTitle: "Filled",
      slides: [{ slide: 1, shapes: [{ name: "Title 1", text: "" }, { name: "Body 2", text: "Click to add text" }] }],
    });
    const s1 = (await inspectPptx(content, tpl)).slides[0];
    expect(s1.emptyPlaceholders).toEqual(["Title 1"]);
    expect(s1.placeholderPrompts).toEqual(["Body 2: Click to add text"]);
  });

  it("reports a malformed part and a notes slide PowerPoint could not place", async () => {
    const broken = await JSZip.loadAsync(await template());
    broken.file("ppt/slides/slide2.xml", slideXml("<p:sp><p:txBody><a:p><a:r><a:rPr><a:t>x</a:t></a:r></a:p></p:txBody></p:sp>"));
    broken.file(
      "ppt/slides/_rels/slide1.xml.rels",
      rels(
        `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
          `<Relationship Id="rId2" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide1.xml"/>`,
      ),
    );
    broken.file("ppt/notesSlides/notesSlide1.xml", `${XML}<p:notes ${NS}><p:cSld><p:spTree/></p:cSld></p:notes>`);
    const report = await inspectPptx((await broken.generateAsync({ type: "nodebuffer" })) as Buffer);

    expect(report.summary.wellFormed).toBe(false);
    expect(report.malformedParts.map((p) => p.part)).toEqual(["ppt/slides/slide2.xml"]);
    expect(report.packageProblems).toEqual(
      expect.arrayContaining([expect.stringMatching(/slide 1: its notes slide has no notes-master relationship/)]),
    );
    // Without a template the comparisons are skipped, and say so.
    expect(report.summary.templateSlides).toBeNull();
    expect(report.slides[0].matchesTemplateStructure).toBeNull();
  });

  it("rejects a package that is not a presentation", async () => {
    const notPptx = (await new JSZip().file("hello.txt", "hi").generateAsync({ type: "nodebuffer" })) as Buffer;
    await expect(inspectPptx(notPptx)).rejects.toThrow(/not a powerpoint package/i);
  });
});
