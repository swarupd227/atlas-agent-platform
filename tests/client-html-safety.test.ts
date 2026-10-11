/**
 * Text that came from a model or from stored data must reach the page as text.
 *
 * Found on 2026-10-11: the outcome report turned **x** into <strong>x</strong> and wrote the whole line into the page as HTML
 * (so a report containing markup ran it), and the evaluation report's print window was built by pasting report fields into an
 * HTML string. Both are fixed at the root (the text is never turned into markup / every string is escaped), and a ratchet keeps
 * new raw-HTML writes out of the client.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { buildReportHtml, escapeHtml, type ReportHtmlInput } from "../client/src/lib/report-html";
import { splitBold } from "../client/src/lib/inline-bold";

const PAYLOAD = `<img src=x onerror=alert(1)>"'</title><script>alert(2)</script>`;

describe("escapeHtml", () => {
  it("turns the five characters that matter into entities, and nothing else", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    expect(escapeHtml("plain text 123")).toBe("plain text 123");
  });

  it("treats a missing value as empty and a number as its digits", () => {
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });
});

describe("buildReportHtml", () => {
  const report: ReportHtmlInput = {
    templateName: PAYLOAD, generatedAt: "2026-10-11T00:00:00Z", timeWindowDays: 30, dateFrom: PAYLOAD, dateTo: PAYLOAD,
    agentIds: ["a"], executiveSummary: PAYLOAD, overallScore: 91,
    sections: [{ title: PAYLOAD, score: 80, status: PAYLOAD, content: PAYLOAD, evidence: [PAYLOAD, "second"] }],
    gaps: [PAYLOAD], recommendations: [PAYLOAD],
  };

  it("writes no element or attribute the report supplied", () => {
    const html = buildReportHtml(report);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror=alert(1)>");
    expect(html).not.toContain("</title><script");
    // The text is all still there, as text.
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("keeps the page's own structure and the values that are not text", () => {
    const html = buildReportHtml({ ...report, templateName: "Fair Lending", dateFrom: null, dateTo: null, sections: [{ title: "Controls", score: 95, status: "pass", content: "ok", evidence: ["e1"] }], gaps: [], recommendations: [] });
    expect(html).toContain("<title>Fair Lending</title>");
    expect(html).toContain(">95%</span>");
    expect(html).toContain(">91</div>");
    expect(html).toContain("30-day window");
    expect(html).toContain("<li>e1</li>");
    expect(html).not.toContain("Identified Gaps");
  });

  it("shows a dash for a report with no overall score", () => {
    expect(buildReportHtml({ ...report, overallScore: null })).toContain(">—</div>");
  });

  it("does not let a status choose its own colour value", () => {
    const html = buildReportHtml({ ...report, sections: [{ ...report.sections[0], status: `x;background:url(javascript:alert(1))` }] });
    expect(html).not.toContain("javascript:alert(1))\"");
    expect(html).toContain("color:#374151");
  });
});

describe("splitBold", () => {
  it("separates plain and bold runs", () => {
    expect(splitBold("a **b** c **d**")).toEqual([
      { text: "a ", bold: false }, { text: "b", bold: true }, { text: " c ", bold: false }, { text: "d", bold: true },
    ]);
  });

  it("leaves an unmatched marker, an empty line and plain text alone", () => {
    expect(splitBold("a ** b")).toEqual([{ text: "a ** b", bold: false }]);
    expect(splitBold("")).toEqual([]);
    expect(splitBold("plain")).toEqual([{ text: "plain", bold: false }]);
  });

  it("returns markup-looking text as text: it is the renderer's job to show it as such, and it never becomes an element", () => {
    const runs = splitBold(`**<img src=x onerror=alert(1)>** and <script>x</script>`);
    expect(runs.map((r) => r.text).join("")).toBe(`<img src=x onerror=alert(1)> and <script>x</script>`);
    expect(runs[0]).toEqual({ text: "<img src=x onerror=alert(1)>", bold: true });
  });
});

// ── the ratchet ──────────────────────────────────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, "..", "client", "src");
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(n)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");
const files = walk(ROOT).map((p) => ({ file: rel(p), text: readFileSync(p, "utf8").replace(/\r\n/g, "\n") }));

describe("raw HTML in the client", () => {
  // Each is allowed because what it writes is sanitized or is not data.
  const ALLOWED_INNER_HTML: Record<string, RegExp> = {
    "components/markdown.tsx": /DOMPurify\.sanitize\(/,
    "pages/eval-trace-inspector.tsx": /DOMPurify\.sanitize\(/,
    "components/ui/chart.tsx": /THEMES|ChartStyle/, // style rules built from the chart's own config
  };

  it("dangerouslySetInnerHTML appears only where the HTML is sanitized (or is the chart's own style)", () => {
    const used = files.filter((f) => /dangerouslySetInnerHTML\s*=/.test(f.text.replace(/\/\/.*$/gm, "")));
    const stray = used.filter((f) => !(f.file in ALLOWED_INNER_HTML)).map((f) => f.file);
    expect(stray, `new raw HTML writes: ${stray.join(", ")}`).toEqual([]);
    for (const f of used) expect(ALLOWED_INNER_HTML[f.file].test(f.text), `${f.file} no longer sanitizes what it writes`).toBe(true);
  });

  it("the outcome report no longer writes HTML at all", () => {
    expect(files.find((f) => f.file === "pages/outcome-detail.tsx")!.text).not.toMatch(/dangerouslySetInnerHTML\s*=/);
  });

  it("document.write appears only in the report window, fed by the escaping builder", () => {
    const writers = files.filter((f) => /document\.write\(/.test(f.text)).map((f) => f.file);
    expect(writers).toEqual(["pages/eval-reports.tsx"]);
    const t = files.find((f) => f.file === "pages/eval-reports.tsx")!.text;
    expect(t).toContain('import { buildReportHtml } from "@/lib/report-html";');
    expect(t).not.toMatch(/function buildReportHtml/);
  });
});
