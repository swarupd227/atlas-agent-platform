/**
 * The HTML of a generated evaluation report, for the print/PDF window.
 *
 * Every string that comes from the report is escaped. The window is opened from this application, so what is written into it runs
 * with this application's rights: a report is built from evaluation data and model-written text, and text that contains markup
 * must come out as text.
 */

export interface ReportHtmlSection {
  title: string;
  score: number | null;
  status: string;
  content: string;
  evidence: string[];
}

export interface ReportHtmlInput {
  templateName: string;
  generatedAt: string;
  timeWindowDays: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  agentIds: string[];
  executiveSummary: string;
  overallScore: number | null;
  sections: ReportHtmlSection[];
  gaps: string[];
  recommendations: string[];
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text safe to put in HTML, inside an element or inside a quoted attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const scoreColor = (n: number) => (n >= 90 ? "#16a34a" : n >= 70 ? "#ca8a04" : "#dc2626");
const STATUS_COLOR: Record<string, string> = { pass: "#16a34a", fail: "#dc2626", warning: "#ca8a04", info: "#2563eb" };

export function buildReportHtml(report: ReportHtmlInput): string {
  const sectionsHtml = report.sections.map((s) => `
    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="color:${STATUS_COLOR[s.status] ?? "#374151"};font-weight:700;font-size:11px;text-transform:uppercase;">${escapeHtml(s.status)}</span>
        <span style="font-weight:600;font-size:14px;">${escapeHtml(s.title)}</span>
        ${s.score !== null ? `<span style="margin-left:auto;font-weight:700;color:${scoreColor(Number(s.score))};">${escapeHtml(Number(s.score))}%</span>` : ""}
      </div>
      <p style="color:#6b7280;font-size:12px;margin:6px 0 4px;">${escapeHtml(s.content)}</p>
      <ul style="margin:0;padding-left:16px;color:#374151;font-size:11px;">
        ${s.evidence.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}
      </ul>
    </div>
  `).join("");
  const gapsHtml = report.gaps.length > 0
    ? `<h3 style="font-size:14px;font-weight:600;margin:20px 0 8px;">Identified Gaps</h3>
       <ul style="color:#dc2626;font-size:12px;padding-left:16px;">${report.gaps.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul>`
    : "";
  const recsHtml = report.recommendations.length > 0
    ? `<h3 style="font-size:14px;font-weight:600;margin:20px 0 8px;">Recommendations</h3>
       <ul style="color:#2563eb;font-size:12px;padding-left:16px;">${report.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
    : "";
  const window = report.dateFrom && report.dateTo ? `${escapeHtml(report.dateFrom)} – ${escapeHtml(report.dateTo)}` : `${escapeHtml(Number(report.timeWindowDays))}-day window`;
  const overall = report.overallScore;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(report.templateName)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:40px auto;color:#111827;}
@media print{body{margin:0;}}</style></head><body>
<div style="border-bottom:2px solid #111827;padding-bottom:16px;margin-bottom:24px;">
  <h1 style="font-size:22px;font-weight:700;margin:0 0 4px;">${escapeHtml(report.templateName)}</h1>
  <p style="color:#6b7280;font-size:12px;margin:0;">Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())} · ${window} · ${report.agentIds.length || "All"} agent(s)</p>
</div>
<div style="display:flex;gap:24px;margin-bottom:24px;">
  <div style="text-align:center;border:1px solid #e5e7eb;border-radius:8px;padding:16px 24px;">
    <div style="font-size:36px;font-weight:700;color:${scoreColor(overall ?? 0)};">${overall === null || overall === undefined ? "—" : escapeHtml(overall)}</div>
    <div style="font-size:11px;color:#6b7280;">Overall Score</div>
  </div>
  <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
    <p style="font-size:13px;line-height:1.6;margin:0;">${escapeHtml(report.executiveSummary)}</p>
  </div>
</div>
<h3 style="font-size:14px;font-weight:600;margin:0 0 10px;">Controls &amp; Findings</h3>
${sectionsHtml}${gapsHtml}${recsHtml}
</body></html>`;
}
