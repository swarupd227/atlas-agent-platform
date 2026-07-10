/**
 * Shared formatting vocabulary — the single place user-facing values are shaped.
 *
 * UX-audit remediation (F-3, F-6, F-9): raw enums (`pending_review`), four
 * competing date formats, and per-page money formatting all leak into the UI.
 * Every new render site should go through these helpers.
 */

/** "pending_review" → "Pending Review"; "awaiting_agent_plan" → "Awaiting Agent Plan". */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Canonical date rendering: "Jan 5, 2026". Accepts Date | string | number | null. */
export function formatDate(value: Date | string | number | null | undefined): string {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Canonical timestamp rendering: "Jan 5, 2026, 3:42 PM". */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/** Canonical money rendering: "$1,234.56"; sub-cent values keep precision ("$0.0027"). */
export function formatMoney(value: number | null | undefined, currency = "USD"): string {
  if (value == null || isNaN(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency,
    minimumFractionDigits: digits === 4 ? 4 : 2,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * No-data grammar for metrics (audit F-1): a metric with no underlying runs
 * must render as absent — never as 0%, never with a trend.
 * `hasData` should reflect the presence of source data (e.g. totalRuns > 0),
 * not merely that the aggregate is non-null.
 */
export function formatMetric(
  value: number | null | undefined,
  opts: { hasData: boolean; unit?: string; decimals?: number },
): string {
  if (!opts.hasData || value == null || isNaN(value)) return "—";
  const decimals = opts.decimals ?? (Number.isInteger(value) ? 0 : 1);
  return `${value.toFixed(decimals)}${opts.unit ?? ""}`;
}
