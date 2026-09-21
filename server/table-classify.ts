// Exact, code-computed grouping of the rows of a delimited table (CSV / TSV).
//
// Why this exists: asking a language model to sort a few hundred rows into groups and list the ids in
// each makes it drift and invent ids and counts. Here the model only supplies the RULES (which words in
// which column put a row in which group); this code applies them, so every count and id it reports
// really is in the file.

export interface ClassifyRule {
  theme: string;
  /** Column whose text is searched. Omit to search every column of the row. */
  column?: string;
  /** A row matches when the searched text contains any of these (case-insensitive). */
  any_of: string[];
}

export interface ClassifyInput {
  text: string;
  idColumn: string;
  rules: ClassifyRule[];
  /** Name of the group for rows no rule matched. */
  otherTheme?: string;
  /** Columns to count within each group (for example Platform, Category). */
  breakdownColumns?: string[];
  delimiter?: "," | "\t";
}

export interface ClassifiedTheme {
  theme: string;
  count: number;
  ids: string[];
  breakdown: Record<string, Record<string, number>>;
}

export interface ClassifyResult {
  totalRows: number;
  columns: string[];
  themes: ClassifiedTheme[];
  unmatched: ClassifiedTheme;
}

export const MAX_ROWS = 50_000;
export const MAX_IDS_PER_THEME = 500;

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, embedded delimiters and newlines. */
export function parseDelimited(text: string, delimiter: "," | "\t" = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(c => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(c => c.trim() !== "")) rows.push(row);
  return rows;
}

function emptyTheme(theme: string): ClassifiedTheme {
  return { theme, count: 0, ids: [], breakdown: {} };
}

export function classifyTable(input: ClassifyInput): ClassifyResult {
  const rows = parseDelimited(input.text, input.delimiter ?? ",");
  if (rows.length < 2) throw new Error("The table has no data rows.");
  if (rows.length - 1 > MAX_ROWS) throw new Error(`The table has more than ${MAX_ROWS} rows.`);
  const columns = rows[0].map(c => c.trim());
  const colIndex = (name: string): number => {
    const i = columns.findIndex(c => c.toLowerCase() === name.trim().toLowerCase());
    if (i < 0) throw new Error(`Column "${name}" not found. Columns are: ${columns.join(", ")}`);
    return i;
  };
  const idIdx = colIndex(input.idColumn);
  if (!Array.isArray(input.rules) || input.rules.length === 0) throw new Error("Provide at least one rule.");
  const rules = input.rules.map(r => {
    const terms = (r.any_of ?? []).map(t => String(t).trim().toLowerCase()).filter(Boolean);
    if (!r.theme || terms.length === 0) throw new Error(`Rule "${r.theme ?? ""}" needs a theme name and at least one term in any_of.`);
    return { theme: r.theme, idx: r.column ? colIndex(r.column) : -1, terms };
  });
  const breakdownIdx = (input.breakdownColumns ?? []).map(name => ({ name: columns[colIndex(name)], idx: colIndex(name) }));

  const themes = rules.map(r => emptyTheme(r.theme));
  const unmatched = emptyTheme(input.otherTheme?.trim() || "Unclassified");
  const bucketFor = new Map(rules.map((r, i) => [i, themes[i]]));

  for (const row of rows.slice(1)) {
    const id = (row[idIdx] ?? "").trim();
    if (!id) continue;
    let target = unmatched;
    for (let i = 0; i < rules.length; i++) {
      const hay = (rules[i].idx >= 0 ? (row[rules[i].idx] ?? "") : row.join(" ")).toLowerCase();
      if (rules[i].terms.some(t => hay.includes(t))) { target = bucketFor.get(i)!; break; }
    }
    target.count++;
    if (target.ids.length < MAX_IDS_PER_THEME) target.ids.push(id);
    for (const b of breakdownIdx) {
      const v = (row[b.idx] ?? "").trim() || "(blank)";
      target.breakdown[b.name] ??= {};
      target.breakdown[b.name][v] = (target.breakdown[b.name][v] ?? 0) + 1;
    }
  }
  const totalRows = themes.reduce((n, t) => n + t.count, 0) + unmatched.count;
  return { totalRows, columns, themes, unmatched };
}
