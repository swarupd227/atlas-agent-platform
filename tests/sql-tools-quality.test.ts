import { describe, it, expect, vi } from "vitest";
import { sql_execute_query, sql_describe_table } from "../server/integrations/sql/tools";
import type { SqlConnector, SqlResult } from "../server/integrations/sql/types";

function emptyResult(rows: Record<string, unknown>[] = [], overrides: Partial<SqlResult> = {}): SqlResult {
  return { rows, columns: [], row_count: rows.length, truncated: false, elapsed_ms: 1, ...overrides };
}

function baseConnector(overrides: Partial<SqlConnector> = {}): SqlConnector {
  return {
    dialect: "postgres",
    executeQuery: vi.fn(async () => emptyResult([{ ok: 1 }])),
    listSchemas: vi.fn(async () => emptyResult()),
    listTables: vi.fn(async () => emptyResult()),
    describeTable: vi.fn(async () => emptyResult([
      { column_name: "id", data_type: "integer" },
      { column_name: "risk_tier", data_type: "character varying" },
    ])),
    searchTables: vi.fn(async () => emptyResult()),
    getColumnStats: vi.fn(async () => emptyResult()),
    previewTable: vi.fn(async () => emptyResult([{ id: 1, risk_tier: "MEDIUM" }])),
    sampleDistinctValues: vi.fn(async () => []),
    close: vi.fn(async () => {}),
    ...overrides,
  };
}

function parseOkResult(result: { content: { text: string }[] }): any {
  return JSON.parse(result.content[0].text);
}

describe("sql_execute_query — truncation messaging", () => {
  it("adds no note when results aren't truncated", async () => {
    const client = baseConnector({ executeQuery: vi.fn(async () => emptyResult([{ n: 1 }], { truncated: false })) });
    const result = await sql_execute_query(client, { sql: "SELECT 1" });
    expect(parseOkResult(result).note).toBeUndefined();
  });

  it("emits an emphatic, actionable note when results ARE truncated", async () => {
    const client = baseConnector({ executeQuery: vi.fn(async () => emptyResult(Array(5).fill({ n: 1 }), { truncated: true })) });
    const result = await sql_execute_query(client, { sql: "SELECT * FROM agents", max_rows: 5 });
    const note = parseOkResult(result).note;
    expect(note).toMatch(/INCOMPLETE/);
    expect(note).toMatch(/WHERE|COUNT|SUM|AVG/);
  });
});

describe("sql_execute_query — unexplored-table advisory nudge", () => {
  it("says nothing when the connector doesn't track exploration (plain dialect client)", async () => {
    const client = baseConnector(); // no getExploredTables
    const result = await sql_execute_query(client, { sql: "SELECT * FROM agents" });
    expect(parseOkResult(result).note).toBeUndefined();
  });

  it("warns when the query references a table never described/previewed this session", async () => {
    const client = baseConnector({ getExploredTables: () => new Set<string>() });
    const result = await sql_execute_query(client, { sql: "SELECT * FROM agents" });
    expect(parseOkResult(result).note).toMatch(/agents/);
    expect(parseOkResult(result).note).toMatch(/haven't inspected/i);
  });

  it("says nothing when every referenced table has already been explored", async () => {
    const client = baseConnector({ getExploredTables: () => new Set<string>(["agents"]) });
    const result = await sql_execute_query(client, { sql: "SELECT * FROM agents" });
    expect(parseOkResult(result).note).toBeUndefined();
  });

  it("combines the truncation note and the unexplored-table note when both apply", async () => {
    const client = baseConnector({
      executeQuery: vi.fn(async () => emptyResult(Array(3).fill({ n: 1 }), { truncated: true })),
      getExploredTables: () => new Set<string>(),
    });
    const result = await sql_execute_query(client, { sql: "SELECT * FROM agents", max_rows: 3 });
    const note = parseOkResult(result).note;
    expect(note).toMatch(/INCOMPLETE/);
    expect(note).toMatch(/haven't inspected/i);
  });
});

describe("sql_describe_table — data-quality profiling", () => {
  it("profiles text-like columns and flags case-variant duplicates", async () => {
    const client = baseConnector({
      sampleDistinctValues: vi.fn(async (_s, _t, column) =>
        column === "risk_tier" ? ["MEDIUM", "medium", "HIGH", "LOW"] : []
      ),
    });
    const result = await sql_describe_table(client, { table: "agents" });
    const parsed = parseOkResult(result);
    expect(parsed.column_data_quality.risk_tier.case_variants_detected).toBe(true);
    expect(parsed.column_data_quality.risk_tier.distinct_values).toEqual(["MEDIUM", "medium", "HIGH", "LOW"]);
  });

  it("does not flag case variants when values are genuinely distinct", async () => {
    const client = baseConnector({
      sampleDistinctValues: vi.fn(async () => ["MEDIUM", "HIGH", "LOW"]),
    });
    const result = await sql_describe_table(client, { table: "agents" });
    expect(parseOkResult(result).column_data_quality.risk_tier.case_variants_detected).toBe(false);
  });

  it("marks a column high_cardinality instead of listing values when there are too many distinct values", async () => {
    const client = baseConnector({
      sampleDistinctValues: vi.fn(async () => Array.from({ length: 21 }, (_, i) => `val${i}`)),
    });
    const result = await sql_describe_table(client, { table: "agents" });
    const q = parseOkResult(result).column_data_quality.risk_tier;
    expect(q.high_cardinality).toBe(true);
    expect(q.distinct_values).toBeUndefined();
  });

  it("does not profile non-text columns (e.g. integer id)", async () => {
    const client = baseConnector({ sampleDistinctValues: vi.fn(async () => ["1", "2"]) });
    const result = await sql_describe_table(client, { table: "agents" });
    expect(parseOkResult(result).column_data_quality.id).toBeUndefined();
  });

  it("a profiling failure on one column doesn't fail the whole describe call", async () => {
    const client = baseConnector({
      sampleDistinctValues: vi.fn(async () => { throw new Error("boom"); }),
    });
    const result = await sql_describe_table(client, { table: "agents" });
    expect(result.isError).toBeFalsy();
    expect(parseOkResult(result).column_data_quality.risk_tier.profile_error).toMatch(/boom/);
  });
});
