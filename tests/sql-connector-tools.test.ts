/**
 * Generic MCP tool handlers shared by every SQL connector
 * (server/integrations/sql/tools.ts) -- these are pure wrappers around a
 * SqlConnector, exercised here against a hand-rolled mock so the same
 * tests cover Postgres/MySQL/SQL Server without needing a real database.
 */
import { describe, it, expect, vi } from "vitest";
import {
  sql_execute_query,
  sql_list_schemas,
  sql_list_tables,
  sql_describe_table,
  sql_search_tables,
  sql_get_column_stats,
  sql_preview_table,
} from "../server/integrations/sql/tools";
import type { SqlConnector, SqlResult } from "../server/integrations/sql/types";

function emptyResult(overrides: Partial<SqlResult> = {}): SqlResult {
  return { rows: [], columns: [], row_count: 0, truncated: false, elapsed_ms: 1, ...overrides };
}

function mockConnector(overrides: Partial<SqlConnector> = {}): SqlConnector {
  return {
    dialect: "mock",
    executeQuery: vi.fn().mockResolvedValue(emptyResult()),
    listSchemas: vi.fn().mockResolvedValue(emptyResult()),
    listTables: vi.fn().mockResolvedValue(emptyResult()),
    describeTable: vi.fn().mockResolvedValue(emptyResult()),
    searchTables: vi.fn().mockResolvedValue(emptyResult()),
    getColumnStats: vi.fn().mockResolvedValue(emptyResult()),
    previewTable: vi.fn().mockResolvedValue(emptyResult()),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function textOf(result: { content: Array<{ text: string }> }): any {
  return JSON.parse(result.content[0].text);
}

describe("sql_execute_query", () => {
  it("rejects a missing sql arg without calling the connector", async () => {
    const client = mockConnector();
    const result = await sql_execute_query(client, {});
    expect(result.isError).toBe(true);
    expect(client.executeQuery).not.toHaveBeenCalled();
  });

  it("clamps max_rows to 1000", async () => {
    const client = mockConnector();
    await sql_execute_query(client, { sql: "SELECT 1", max_rows: 50_000 });
    expect(client.executeQuery).toHaveBeenCalledWith("SELECT 1", 1000);
  });

  it("surfaces a truncation note when the result was truncated", async () => {
    const client = mockConnector({ executeQuery: vi.fn().mockResolvedValue(emptyResult({ truncated: true })) });
    const result = await sql_execute_query(client, { sql: "SELECT 1" });
    // Wording strengthened in Phase 4 to push the agent toward a complete
    // aggregate instead of narrating the visible rows as the whole answer --
    // see tests/sql-tools-quality.test.ts for the full behavioral coverage.
    expect(textOf(result).note).toMatch(/incomplete/i);
  });

  it("turns a connector error into an isError result instead of throwing", async () => {
    const client = mockConnector({ executeQuery: vi.fn().mockRejectedValue(new Error("connection refused")) });
    const result = await sql_execute_query(client, { sql: "SELECT 1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/connection refused/);
  });
});

describe("sql_list_schemas", () => {
  it("calls the connector with no args", async () => {
    const client = mockConnector();
    await sql_list_schemas(client);
    expect(client.listSchemas).toHaveBeenCalledWith();
  });
});

describe("sql_list_tables", () => {
  it("passes an explicit schema through", async () => {
    const client = mockConnector();
    await sql_list_tables(client, { schema: "sales" });
    expect(client.listTables).toHaveBeenCalledWith("sales");
  });

  it("passes undefined (not a hardcoded default) when schema is omitted, so each dialect applies its own default", async () => {
    const client = mockConnector();
    await sql_list_tables(client, {});
    expect(client.listTables).toHaveBeenCalledWith(undefined);
  });
});

describe("sql_describe_table", () => {
  it("requires table", async () => {
    const client = mockConnector();
    const result = await sql_describe_table(client, {});
    expect(result.isError).toBe(true);
    expect(client.describeTable).not.toHaveBeenCalled();
  });

  it("merges column schema and a sample preview into one result", async () => {
    const client = mockConnector({
      describeTable: vi.fn().mockResolvedValue(emptyResult({ rows: [{ column_name: "id", data_type: "int" }] })),
      previewTable: vi.fn().mockResolvedValue(emptyResult({ rows: [{ id: 1 }], row_count: 1 })),
    });
    const result = await sql_describe_table(client, { table: "orders" });
    const body = textOf(result);
    expect(body.columns).toEqual([{ column_name: "id", data_type: "int" }]);
    expect(body.sample_rows).toEqual([{ id: 1 }]);
  });

  it("still returns partial data when the sample preview fails (schema succeeded)", async () => {
    const client = mockConnector({
      describeTable: vi.fn().mockResolvedValue(emptyResult({ rows: [{ column_name: "id" }] })),
      previewTable: vi.fn().mockRejectedValue(new Error("permission denied")),
    });
    const result = await sql_describe_table(client, { table: "orders" });
    const body = textOf(result);
    expect(body.columns).toEqual([{ column_name: "id" }]);
    expect(body.sample_error).toMatch(/permission denied/);
  });
});

describe("sql_search_tables", () => {
  it("requires keyword", async () => {
    const result = await sql_search_tables(mockConnector(), {});
    expect(result.isError).toBe(true);
  });
});

describe("sql_get_column_stats", () => {
  it("requires table and column", async () => {
    const client = mockConnector();
    const result = await sql_get_column_stats(client, { table: "orders" });
    expect(result.isError).toBe(true);
    expect(client.getColumnStats).not.toHaveBeenCalled();
  });

  it("passes schema/table/column through", async () => {
    const client = mockConnector();
    await sql_get_column_stats(client, { schema: "sales", table: "orders", column: "total" });
    expect(client.getColumnStats).toHaveBeenCalledWith("sales", "orders", "total");
  });
});

describe("sql_preview_table", () => {
  it("clamps limit to 50", async () => {
    const client = mockConnector();
    await sql_preview_table(client, { table: "orders", limit: 500 });
    expect(client.previewTable).toHaveBeenCalledWith(undefined, "orders", 50);
  });

  it("requires table", async () => {
    const result = await sql_preview_table(mockConnector(), {});
    expect(result.isError).toBe(true);
  });
});
