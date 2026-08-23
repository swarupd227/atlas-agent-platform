import { describe, it, expect } from "vitest";
import { renderPptx, renderPdf, documentSpecSchema, slugifyFilename } from "../server/document-renderer";

/**
 * The renderer is the whole point of the provider-agnostic path: if it emits
 * bytes that PowerPoint or a PDF reader rejects, an agent "succeeds" and the
 * user gets an unopenable file. These assert real container structure, not just
 * that a Buffer came back.
 */

const SPEC = {
  title: "Q3 Marketing Campaign",
  subtitle: "Performance summary and next steps",
  author: "Astra Agents",
  sections: [
    { heading: "Results", body: "Revenue grew 18% QoQ.", bullets: ["Pipeline +22%", "CAC -8%"], notes: "Lead with revenue." },
    { heading: "Key Learnings", bullets: ["Paid social outperformed search"] },
    { heading: "Next Steps", body: "Shift 20% of budget to paid social." },
  ],
};

describe("document renderer", () => {
  it("renders a .pptx that is a valid OOXML package", async () => {
    const buf = await renderPptx(documentSpecSchema.parse(SPEC));
    // PPTX is a zip: "PK\x03\x04".
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    // The presentation part every reader looks for.
    expect(buf.toString("latin1")).toContain("ppt/presentation.xml");
    expect(buf.length).toBeGreaterThan(5000);
  });

  it("renders one slide per section plus a title slide", async () => {
    const buf = await renderPptx(documentSpecSchema.parse(SPEC));
    const slideParts = buf.toString("latin1").match(/ppt\/slides\/slide\d+\.xml(?!\.rels)/g) ?? [];
    expect(new Set(slideParts).size).toBe(SPEC.sections.length + 1);
  });

  it("renders a .pdf with a valid header and EOF marker", async () => {
    const buf = await renderPdf(documentSpecSchema.parse(SPEC));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.subarray(-16).toString()).toContain("%%EOF");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("renders a .pdf when the spec has no author", async () => {
    // pdfkit calls .valueOf() on every info value, so an undefined Author threw.
    const buf = await renderPdf(documentSpecSchema.parse({ title: "No Author", sections: [{ heading: "One" }] }));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("rejects a spec with no sections rather than emitting an empty document", () => {
    expect(() => documentSpecSchema.parse({ title: "x", sections: [] })).toThrow();
  });

  it("bounds model-authored input", () => {
    const tooMany = { title: "x", sections: Array.from({ length: 61 }, () => ({ heading: "h" })) };
    expect(() => documentSpecSchema.parse(tooMany)).toThrow();
  });

  it("derives a safe filename stem, falling back when the title has no usable characters", () => {
    expect(slugifyFilename("Q3 Marketing Campaign!", "doc")).toBe("q3-marketing-campaign");
    expect(slugifyFilename("///", "doc")).toBe("doc");
  });
});
