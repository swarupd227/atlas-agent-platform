import { describe as vdescribe, it, expect } from "vitest";
import { describe as describeFileSummary } from "../server/routes/files";

/**
 * server/routes/agent-files.ts's POST /:id/attach reuses this exact helper
 * (imported as describeFileSummary) so a re-attached generated file gets the
 * same "4 slides" / "3 sheets: Q3, Notes" chip text a fresh upload would --
 * pinning its export and behaviour here catches an accidental signature
 * change or removal before it silently breaks that summary.
 */
vdescribe("files.ts describe() re-export used by agent-files' /attach", () => {
  it("summarises a pptx by slide count", () => {
    expect(describeFileSummary("pptx", { slides: 4 })).toBe("4 slides");
    expect(describeFileSummary("pptx", { slides: 1 })).toBe("1 slide");
  });

  it("summarises an xlsx by sheet names", () => {
    expect(describeFileSummary("xlsx", { sheets: ["Q3", "Notes"] })).toBe("2 sheets: Q3, Notes");
  });

  it("falls back to the file kind when there is nothing more specific", () => {
    expect(describeFileSummary("pdf", {})).toBe("pdf");
    expect(describeFileSummary("pdf", null)).toBe("pdf");
  });

  it("reports empty documents plainly", () => {
    expect(describeFileSummary("pptx", { empty: true })).toBe("no readable text");
  });
});
