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
import { fillPptxTemplate } from "../server/document-template-fill";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** A shape with a name, optional placeholder type, and one styled run. */
function sp(name: string, text: string, opts: { ph?: string; bold?: boolean } = {}) {
  const ph = opts.ph ? `<p:ph type="${opts.ph}"/>` : "";
  const rPr = opts.bold ? '<a:rPr lang="en-US" b="1"/>' : '<a:rPr lang="en-US"/>';
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="${name}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>` +
    `<a:p><a:pPr lvl="0"/><a:r>${rPr}<a:t>${text}</a:t></a:r></a:p>` +
    `</p:txBody></p:sp>`
  );
}

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

/** Three slides: text + picture, duplicate shape names, a table. */
async function buildTemplate(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      '<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      '<Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      "</Types>",
  );
  zip.file(
    "ppt/presentation.xml",
    `${XML}<p:presentation xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>' +
      '<p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/>' +
      "</p:sldIdLst></p:presentation>",
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
  });

  it("creates a notes slide, its relationship and its content type when the template has none", async () => {
    const template = await buildTemplate();
    const { content, report } = await fillPptxTemplate(template, {
      outputTitle: "Filled",
      slides: [{ slide: 1, notes: "Say this out loud." }],
    });
    const zip = await JSZip.loadAsync(content);
    const notesPath = Object.keys(zip.files).find((p) => /^ppt\/notesSlides\/.+\.xml$/.test(p));
    expect(notesPath).toBeTruthy();
    expect(await zip.file(notesPath!)!.async("string")).toContain("Say this out loud.");
    expect(await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async("string")).toContain("notesSlides/");
    expect(await zip.file("[Content_Types].xml")!.async("string")).toContain("notesSlide+xml");
    expect(report.notesWritten).toBe(1);
  });

  it("rejects a package that is not a presentation", async () => {
    const notPptx = (await new JSZip().file("hello.txt", "hi").generateAsync({ type: "nodebuffer" })) as Buffer;
    await expect(fillPptxTemplate(notPptx, { outputTitle: "x", slides: [{ slide: 1 }] })).rejects.toThrow(
      /not a powerpoint package/i,
    );
  });
});
