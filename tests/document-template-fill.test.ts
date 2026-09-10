/**
 * Filling an existing .pptx template from a structured map.
 *
 * The fixture is a synthetic package built here rather than any real customer
 * template: the capability is generic, so the test must be too. It exercises
 * the parts of a package the filler actually touches -- presentation.xml, its
 * relationships, the slide parts, slide rels and [Content_Types].xml.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { fillPptxTemplate, xmlBalanceProblem } from "../server/document-template-fill";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Formatting elements WITH children, the way real templates write them. */
const RICH = {
  bodyPr: '<a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr>',
  lstStyle: '<a:lstStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle>',
  pPr: '<a:pPr lvl="0"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:buNone/></a:pPr>',
  rPr: '<a:rPr lang="de-DE" b="1"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:latin typeface="Arial"/></a:rPr>',
};

/** A shape with a name, optional placeholder type, and one styled run. */
function sp(name: string, text: string, opts: { ph?: string; bold?: boolean; rich?: boolean } = {}) {
  const ph = opts.ph ? `<p:ph type="${opts.ph}"/>` : "";
  const rPr = opts.rich ? RICH.rPr : opts.bold ? '<a:rPr lang="en-US" b="1"/>' : '<a:rPr lang="en-US"/>';
  const bodyPr = opts.rich ? RICH.bodyPr : "<a:bodyPr/>";
  const lstStyle = opts.rich ? RICH.lstStyle : "<a:lstStyle/>";
  const pPr = opts.rich ? RICH.pPr : '<a:pPr lvl="0"/>';
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="${name}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr/><p:txBody>${bodyPr}${lstStyle}` +
    `<a:p>${pPr}<a:r>${rPr}<a:t>${text}</a:t></a:r></a:p>` +
    `</p:txBody></p:sp>`
  );
}

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const rels = (body: string) =>
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;

const PICTURE = '<p:pic><p:nvPicPr><p:cNvPr id="9" name="Picture 9"/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>';

const TABLE =
  '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="Table 7"/></p:nvGraphicFramePr>' +
  '<a:graphic><a:graphicData><a:tbl>' +
  '<a:tr h="1"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>H1</a:t></a:r></a:p></a:txBody></a:tc>' +
  '<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>H2</a:t></a:r></a:p></a:txBody></a:tc></a:tr>' +
  '<a:tr h="1"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>old a</a:t></a:r></a:p></a:txBody></a:tc>' +
  '<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>old b</a:t></a:r></a:p></a:txBody></a:tc></a:tr>' +
  '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';

function slideXml(body: string) {
  return (
    `${XML}<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`
  );
}

/** Three slides: text + picture, duplicate shape names, a table. Plus the
 *  package furniture a real deck carries -- a notes master, speaker notes on
 *  slide 2 and a section list -- so a dropped slide has references to clean up. */
async function buildTemplate(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      '<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      '<Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>' +
      '<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>' +
      "</Types>",
  );
  zip.file(
    "ppt/presentation.xml",
    `${XML}<p:presentation xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>' +
      '<p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/>' +
      "</p:sldIdLst>" +
      '<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}">' +
      '<p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">' +
      '<p14:section name="Main" id="{00000000-0000-0000-0000-000000000001}"><p14:sldIdLst>' +
      '<p14:sldId id="256"/><p14:sldId id="257"/><p14:sldId id="258"/>' +
      "</p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst></p:presentation>",
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>' +
      "</Relationships>",
  );

  zip.file(
    "ppt/slides/slide1.xml",
    slideXml(
      sp("Title 1", "Original Title", { bold: true }) +
        sp("Footer Placeholder 3", "old footer", { ph: "ftr" }) +
        PICTURE,
    ),
  );
  // Two shapes sharing a name: only the `was` probe can tell them apart.
  zip.file("ppt/slides/slide2.xml", slideXml(sp("TextBox 6", "alpha start") + sp("TextBox 6", "beta start")));
  zip.file("ppt/slides/slide3.xml", slideXml(sp("Title 1", "Table slide") + TABLE));

  zip.file("ppt/notesMasters/notesMaster1.xml", `${XML}<p:notesMaster ${NS}><p:cSld><p:spTree/></p:cSld></p:notesMaster>`);
  zip.file(
    "ppt/notesSlides/notesSlide1.xml",
    `${XML}<p:notes ${NS}><p:cSld><p:spTree>${sp("Notes Placeholder 2", "slide two notes", { ph: "body" })}</p:spTree></p:cSld></p:notes>`,
  );
  zip.file(
    "ppt/notesSlides/_rels/notesSlide1.xml.rels",
    rels(
      `<Relationship Id="rId1" Type="${REL}/notesMaster" Target="../notesMasters/notesMaster1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/slide" Target="../slides/slide2.xml"/>`,
    ),
  );
  zip.file(
    "ppt/slides/_rels/slide2.xml.rels",
    rels(`<Relationship Id="rId9" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide1.xml"/>`),
  );

  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}

async function readSlides(content: Buffer) {
  const zip = await JSZip.loadAsync(content);
  const pres = await zip.file("ppt/presentation.xml")!.async("string");
  const out: Record<string, string> = {};
  for (const path of Object.keys(zip.files)) {
    if (/^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(path)) out[path] = await zip.file(path)!.async("string");
  }
  return { zip, pres, parts: out };
}

const textIn = (xml: string) => (xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? []).map((t) => t.replace(/<\/?a:t>/g, ""));

describe("fillPptxTemplate", () => {
  it("replaces a named shape's text, keeps its run formatting, and leaves pictures alone", async () => {
    const template = await buildTemplate();
    const { content, report } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [{ slide: 1, shapes: [{ name: "Title 1", text: "New Title" }] }],
    });

    const { parts } = await readSlides(content);
    const s1 = parts["ppt/slides/slide1.xml"];
    expect(textIn(s1)).toContain("New Title");
    expect(textIn(s1)).not.toContain("Original Title");
    // The template's own styling and non-text content survive untouched.
    expect(s1).toContain('b="1"');
    expect(s1).toContain("<p:pic>");
    expect(report.shapesFilled).toBe(1);
    expect(report.unmatched).toEqual([]);
  });

  it("reports shapes the template does not have instead of failing silently", async () => {
    const template = await buildTemplate();
    const { report } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [{ slide: 1, shapes: [{ name: "No Such Shape", text: "x" }] }],
    });
    expect(report.shapesFilled).toBe(0);
    expect(report.unmatched).toEqual([{ slide: 1, name: "No Such Shape", was: undefined }]);
  });

  it("uses the `was` probe to pick between shapes that share a name", async () => {
    const template = await buildTemplate();
    const { content } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [{ slide: 2, shapes: [{ name: "TextBox 6", was: "beta start", text: "beta replaced" }] }],
    });
    const { parts } = await readSlides(content);
    const t = textIn(parts["ppt/slides/slide2.xml"]);
    expect(t).toContain("alpha start");
    expect(t).toContain("beta replaced");
    expect(t).not.toContain("beta start");
  });

  it("splits text on newlines into separate paragraphs", async () => {
    const template = await buildTemplate();
    const { content } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [{ slide: 1, shapes: [{ name: "Title 1", text: "one\ntwo\nthree" }] }],
    });
    const { parts } = await readSlides(content);
    const s1 = parts["ppt/slides/slide1.xml"];
    const title = s1.match(/<p:sp>[\s\S]*?<\/p:sp>/)![0];
    expect((title.match(/<a:p>/g) ?? []).length).toBe(3);
    expect(textIn(title)).toEqual(["one", "two", "three"]);
  });

  it("escapes XML-significant characters in replacement text", async () => {
    const template = await buildTemplate();
    const { content } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [{ slide: 1, shapes: [{ name: "Title 1", text: "Tools & <Parts>" }] }],
    });
    const { parts } = await readSlides(content);
    expect(parts["ppt/slides/slide1.xml"]).toContain("Tools &amp; &lt;Parts&gt;");
  });

  it("writes the footer into footer placeholders only", async () => {
    const template = await buildTemplate();
    const { content } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      footer: "Campaign | 2026",
      slides: [{ slide: 1, shapes: [] }],
    });
    const { parts } = await readSlides(content);
    const t = textIn(parts["ppt/slides/slide1.xml"]);
    expect(t).toContain("Campaign | 2026");
    expect(t).not.toContain("old footer");
    expect(t).toContain("Original Title"); // untouched: not a footer
  });

  it("fills table cells without changing the table's shape", async () => {
    const template = await buildTemplate();
    const { content, report } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [{ slide: 3, table: { rows: [["Metric", "Result"], ["ROAS", "9.9x"]] } }],
    });
    const { parts } = await readSlides(content);
    const s3 = parts["ppt/slides/slide3.xml"];
    expect(textIn(s3)).toEqual(expect.arrayContaining(["Metric", "Result", "ROAS", "9.9x"]));
    expect((s3.match(/<a:tr/g) ?? []).length).toBe(2);
    expect((s3.match(/<a:tc>/g) ?? []).length).toBe(4);
    expect(report.tablesFilled).toBe(1);
  });

  it("drops a slide and leaves the others addressable by their original numbers", async () => {
    const template = await buildTemplate();
    const { content, report } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [
        { slide: 2, drop: true },
        { slide: 3, shapes: [{ name: "Title 1", text: "Still slide three" }] },
      ],
    });
    const { zip, pres, parts } = await readSlides(content);
    expect(report.slidesDropped).toEqual([2]);
    expect(report.slidesInOutput).toBe(2);
    expect(pres).not.toContain('r:id="rId2"');
    expect(zip.file("ppt/slides/slide2.xml")).toBeNull();
    // Slide 3 was addressed by its ORIGINAL number even though slide 2 went away.
    expect(textIn(parts["ppt/slides/slide3.xml"])).toContain("Still slide three");
    // Nothing is left pointing at the removed slide: not the section list, not
    // its notes slide (part, rels, content type).
    expect(pres).not.toContain('<p14:sldId id="257"/>');
    expect(pres).toContain('<p14:sldId id="258"/>');
    expect(zip.file("ppt/notesSlides/notesSlide1.xml")).toBeNull();
    expect(zip.file("ppt/notesSlides/_rels/notesSlide1.xml.rels")).toBeNull();
    expect(await zip.file("[Content_Types].xml")!.async("string")).not.toContain("notesSlide1.xml");
  });

  it("creates a notes slide, its relationship and its content type when the template has none", async () => {
    const template = await buildTemplate();
    const { content, report } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [{ slide: 1, notes: "Say this out loud." }],
    });
    const zip = await JSZip.loadAsync(content);
    const notesName = (await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async("string")).match(
      /Target="\.\.\/notesSlides\/([^"]+)"/,
    )?.[1];
    expect(notesName).toBeTruthy();
    expect(await zip.file(`ppt/notesSlides/${notesName}`)!.async("string")).toContain("Say this out loud.");
    expect(await zip.file("[Content_Types].xml")!.async("string")).toContain(`/ppt/notesSlides/${notesName}"`);
    // The notes slide's own relationships: without the notes master and the
    // slide it belongs to, PowerPoint offers to repair the file.
    const notesRels = await zip.file(`ppt/notesSlides/_rels/${notesName}.rels`)!.async("string");
    expect(notesRels).toContain('Target="../notesMasters/notesMaster1.xml"');
    expect(notesRels).toContain('Target="../slides/slide1.xml"');
    expect(report.notesWritten).toBe(1);
  });

  it("reports notes it cannot place rather than writing a part PowerPoint would repair", async () => {
    const withoutMaster = await JSZip.loadAsync(await buildTemplate());
    withoutMaster.remove("ppt/notesMasters/notesMaster1.xml");
    const template = (await withoutMaster.generateAsync({ type: "nodebuffer" })) as Buffer;
    const { content, report } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [{ slide: 1, notes: "Nowhere to go." }],
    });
    const zip = await JSZip.loadAsync(content);
    expect(report.notesWritten).toBe(0);
    expect(report.unmatched).toEqual([{ slide: 1, name: expect.stringMatching(/notes master/) }]);
    expect(Object.keys(zip.files).some((p) => p.includes("notesSlideFill"))).toBe(false);
  });

  it("carries formatting that has children over whole, so every part stays well-formed", async () => {
    // Regression: the style carriers used to be cut at their first "/>", which
    // left <a:rPr><a:solidFill> unclosed and made PowerPoint refuse the file.
    const withRich = await JSZip.loadAsync(await buildTemplate());
    withRich.file("ppt/slides/slide1.xml", slideXml(sp("Rich 1", "Old rich text", { rich: true })));
    withRich.file(
      "ppt/notesSlides/notesSlide1.xml",
      `${XML}<p:notes ${NS}><p:cSld><p:spTree>${sp("Notes Placeholder 2", "old notes", { ph: "body", rich: true })}</p:spTree></p:cSld></p:notes>`,
    );
    const template = (await withRich.generateAsync({ type: "nodebuffer" })) as Buffer;

    const { content, report } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [
        { slide: 1, shapes: [{ name: "Rich 1", text: "First\nSecond" }] },
        { slide: 2, notes: "New notes" },
      ],
    });
    const { parts } = await readSlides(content);
    const para = (text: string) => `<a:p>${RICH.pPr}<a:r>${RICH.rPr}<a:t>${text}</a:t></a:r></a:p>`;

    expect(report.shapesFilled).toBe(1);
    expect(report.notesWritten).toBe(1);
    expect(parts["ppt/slides/slide1.xml"]).toContain(`${RICH.bodyPr}${RICH.lstStyle}${para("First")}${para("Second")}`);
    expect(parts["ppt/notesSlides/notesSlide1.xml"]).toContain(para("New notes"));
    for (const [path, xml] of Object.entries(parts)) expect([path, xmlBalanceProblem(xml)]).toEqual([path, null]);
  });

  it("detects an element cut in half", () => {
    expect(xmlBalanceProblem('<a:r><a:rPr b="1"/><a:t>x</a:t></a:r>')).toBeNull();
    expect(xmlBalanceProblem(`<a:r>${RICH.rPr}<a:t>x</a:t></a:r>`)).toBeNull();
    expect(xmlBalanceProblem('<a:r><a:rPr b="1"><a:solidFill><a:schemeClr val="bg1"/><a:t>x</a:t></a:r>')).toMatch(/closes/);
    expect(xmlBalanceProblem("<a:p><a:r>")).toMatch(/never closed/);
  });

  it("gives each new paragraph the formatting of the template paragraph in the same position", async () => {
    const withList = await JSZip.loadAsync(await buildTemplate());
    const heading = '<a:p><a:pPr lvl="0"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="2000" b="1"/><a:t>Heading</a:t></a:r></a:p>';
    const item = '<a:p><a:pPr lvl="1"/><a:r><a:rPr lang="en-US" sz="1400"/><a:t>item</a:t></a:r></a:p>';
    withList.file(
      "ppt/slides/slide1.xml",
      slideXml(
        '<p:sp><p:nvSpPr><p:cNvPr id="2" name="List 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>' +
          `<p:txBody><a:bodyPr/><a:lstStyle/>${heading}${item}</p:txBody></p:sp>`,
      ),
    );
    const template = (await withList.generateAsync({ type: "nodebuffer" })) as Buffer;
    const { content } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [{ slide: 1, shapes: [{ name: "List 1", text: "New heading\nOne\nTwo" }] }],
    });
    const paras = (await readSlides(content)).parts["ppt/slides/slide1.xml"].match(/<a:p>[\s\S]*?<\/a:p>/g)!;
    expect(paras).toHaveLength(3);
    expect(paras[0]).toContain("<a:buNone/>");
    expect(paras[0]).toContain('sz="2000" b="1"');
    for (const p of paras.slice(1)) {
      expect(p).toContain('<a:pPr lvl="1"/>');
      expect(p).toContain('sz="1400"');
      expect(p).not.toContain('b="1"');
    }
  });

  it("keeps a bold label bold and the rest plain, and honours **bold** markup", async () => {
    const withRuns = await JSZip.loadAsync(await buildTemplate());
    const labelled =
      '<a:p><a:r><a:rPr lang="en-US" b="1"/><a:t>Owner:</a:t></a:r><a:r><a:rPr lang="en-US"/><a:t> Marketing</a:t></a:r></a:p>';
    withRuns.file(
      "ppt/slides/slide1.xml",
      slideXml(
        '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Label 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>' +
          `<p:txBody><a:bodyPr/><a:lstStyle/>${labelled}</p:txBody></p:sp>` +
          sp("Plain 2", "plain words here"),
      ),
    );
    const template = (await withRuns.generateAsync({ type: "nodebuffer" })) as Buffer;
    const { content } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [
        {
          slide: 1,
          shapes: [
            { name: "Label 1", text: "Channel: Paid social" },
            { name: "Plain 2", text: "Use **bold** here" },
          ],
        },
      ],
    });
    const s1 = (await readSlides(content)).parts["ppt/slides/slide1.xml"];
    expect(s1).toContain(
      '<a:r><a:rPr lang="en-US" b="1"/><a:t>Channel:</a:t></a:r><a:r><a:rPr lang="en-US"/><a:t> Paid social</a:t></a:r>',
    );
    expect(s1).toContain(
      '<a:r><a:rPr b="0" lang="en-US"/><a:t>Use </a:t></a:r>' +
        '<a:r><a:rPr b="1" lang="en-US"/><a:t>bold</a:t></a:r>' +
        '<a:r><a:rPr b="0" lang="en-US"/><a:t> here</a:t></a:r>',
    );
  });

  it("shrinks text that needs more room than the template's, and reports what shrinking cannot save", async () => {
    // A 200 x 40 pt box, 18 pt text, set to grow with its text.
    const boxed = (name: string, text: string) =>
      `<p:sp><p:nvSpPr><p:cNvPr id="2" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${200 * 12700}" cy="${40 * 12700}"/></a:xfrm></p:spPr>` +
      `<p:txBody><a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr><a:lstStyle/>` +
      `<a:p><a:r><a:rPr lang="en-US" sz="1800"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
    const withBoxes = await JSZip.loadAsync(await buildTemplate());
    withBoxes.file("ppt/slides/slide1.xml", slideXml(boxed("Fits 1", "Short") + boxed("Longer 2", "Short") + boxed("Far too long 3", "Short")));
    const template = (await withBoxes.generateAsync({ type: "nodebuffer" })) as Buffer;

    const { content, report } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [
        {
          slide: 1,
          shapes: [
            { name: "Fits 1", text: "Tiny" },
            { name: "Longer 2", text: "Twenty-eight characters here and a bit more" },
            { name: "Far too long 3", text: "word ".repeat(60).trim() },
          ],
        },
      ],
    });

    const byName = Object.fromEntries(report.overflow.map((o) => [o.name, o]));
    expect(byName["Fits 1"]).toBeUndefined();
    expect(byName["Longer 2"]).toMatchObject({ slide: 1, resolved: true });
    expect(byName["Longer 2"].fontScale).toBeLessThan(1);
    expect(byName["Far too long 3"]).toMatchObject({ resolved: false });

    const s1 = (await readSlides(content)).parts["ppt/slides/slide1.xml"];
    const shape = (n: string) => s1.match(new RegExp(`<p:sp>(?:(?!</p:sp>)[\\s\\S])*?name="${n}"[\\s\\S]*?</p:sp>`))![0];
    expect(shape("Fits 1")).toContain("<a:spAutoFit/>");
    expect(shape("Longer 2")).toMatch(/<a:bodyPr wrap="square"><a:normAutofit fontScale="\d+" lnSpcReduction="10000"\/><\/a:bodyPr>/);
    expect(xmlBalanceProblem(s1)).toBeNull();
  });

  it("rejects a package that is not a presentation", async () => {
    const notPptx = (await new JSZip().file("hello.txt", "hi").generateAsync({ type: "nodebuffer" })) as Buffer;
    await expect(fillPptxTemplate(notPptx, { outputTitle: "x", slides: [{ slide: 1 }] })).rejects.toThrow(
      /not a powerpoint package/i,
    );
  });
});
