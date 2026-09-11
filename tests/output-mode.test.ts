/**
 * An agent's output mode (runtimeConfig.outputMode): whether a run returns the
 * platform's structured analysis of its tool results, or the model's own final
 * answer in the format its instructions define. And the brand-asset list a
 * document agent without a sandbox gets, so it can name a template to the
 * document tools.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {} }));

import { continuationMaxTokens, ownFinalAnswer, resolveOutputMode } from "../server/output-mode";
import { formatBrandAssetList } from "../server/brand-assets";

describe("resolveOutputMode", () => {
  it("keeps every existing agent on the structured analysis unless it opts in", () => {
    expect(resolveOutputMode(undefined)).toBe("analysis");
    expect(resolveOutputMode(null)).toBe("analysis");
    expect(resolveOutputMode({})).toBe("analysis");
    expect(resolveOutputMode({ outputMode: "something else" })).toBe("analysis");
    expect(resolveOutputMode({ outputMode: "answer" })).toBe("answer");
  });
});

describe("ownFinalAnswer", () => {
  it("returns the model's own answer only in answer mode, once the tool loop has ended", () => {
    expect(ownFinalAnswer("answer", [], "## QA Result: FAIL\n1. Slide 13 ...")).toBe("## QA Result: FAIL\n1. Slide 13 ...");
    // Analysis mode keeps the summarising call.
    expect(ownFinalAnswer("analysis", [], "an answer")).toBeUndefined();
    // Tool calls still pending (the loop hit its limit): there is no final answer yet.
    expect(ownFinalAnswer("answer", [{ name: "inspect_document" }], "calling a tool")).toBeUndefined();
    // Nothing said: fall back to the analysis call rather than return an empty result.
    expect(ownFinalAnswer("answer", [], "   ")).toBeUndefined();
    expect(ownFinalAnswer("answer", [], null)).toBeUndefined();
  });
});

describe("continuationMaxTokens", () => {
  it("gives the call that writes an agent's deliverable room to write it", () => {
    expect(continuationMaxTokens("answer")).toBe(16384);
    expect(continuationMaxTokens("analysis")).toBe(4096);
  });
});

describe("formatBrandAssetList", () => {
  it("lists templates by the exact filename the document tools take", () => {
    const text = formatBrandAssetList([
      { filename: "Quarterly Review.pptx", kind: "pptx", sizeBytes: 3_145_728, extractMeta: { slides: 18 } },
      { filename: "logo.png", kind: "image", sizeBytes: null, extractMeta: null },
    ]);
    expect(text).toContain("## BRAND ASSETS");
    expect(text).toContain("- Quarterly Review.pptx (pptx, 18 slides, 3.0 MB)");
    expect(text).toContain("- logo.png (image)");
    expect(text).toContain("templateFilename");
  });

  it("says nothing when the organisation has no brand assets", () => {
    expect(formatBrandAssetList([])).toBe("");
  });
});
