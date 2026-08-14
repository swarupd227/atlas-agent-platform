import { describe, it, expect, vi } from "vitest";
import { ScopedSqlConnector, parseAllowedTables } from "../server/integrations/sql/scoped-connector";
import type { SqlConnector, SqlResult } from "../server/integrations/sql/types";

function emptyResult(rows: Record<string, unknown>[] = []): SqlResult {
  return { rows, columns: [], row_count: rows.length, truncated: false, elapsed_ms: 1 };
}

function makeMockConnector(): SqlConnector {
  return {
    dialect: "postgres",
    executeQuery: vi.fn(async () => emptyResult([{ ok: 1 }])),
    listSchemas: vi.fn(async () => emptyResult()),
    listTables: vi.fn(async () => emptyResult([
      { table_name: "agents" }, { table_name: "admin_users" }, { table_name: "organizations" },
    ])),
    describeTable: vi.fn(async () => emptyResult([{ column_name: "id" }])),
    searchTables: vi.fn(async () => emptyResult([
      { table_name: "agents" }, { table_name: "admin_users" },
    ])),
    getColumnStats: vi.fn(async () => emptyResult()),
    previewTable: vi.fn(async () => emptyResult([{ id: 1 }])),
    sampleDistinctValues: vi.fn(async () => ["a", "b"]),
    close: vi.fn(async () => {}),
  };
}

describe("parseAllowedTables", () => {
  it("returns null for unset/blank input (no restriction)", () => {
    expect(parseAllowedTables(undefined)).toBeNull();
    expect(parseAllowedTables("")).toBeNull();
    expect(parseAllowedTables("   ")).toBeNull();
  });

  it("parses a comma-separated list, trimmed and lowercased", () => {
    const set = parseAllowedTables(" Agents, Organizations ,workspace_runs");
    expect(set).toEqual(new Set(["agents", "organizations", "workspace_runs"]));
  });
});

describe("ScopedSqlConnector — table allowlist enforcement", () => {
  it("passes everything through unrestricted when allowedTables is null", async () => {
    const inner = makeMockConnector();
    const scoped = new ScopedSqlConnector(inner, null);
    await expect(scoped.describeTable(undefined, "admin_users")).resolves.toBeDefined();
    await expect(scoped.executeQuery("SELECT * FROM admin_users", 10)).resolves.toBeDefined();
  });

  it("blocks describeTable/getColumnStats/previewTable on a table outside the allowlist", async () => {
    const inner = makeMockConnector();
    const scoped = new ScopedSqlConnector(inner, new Set(["agents"]));
    await expect(scoped.describeTable(undefined, "admin_users")).rejects.toThrow(/not in this connection's allowed-tables/i);
    await expect(scoped.getColumnStats(undefined, "admin_users", "password")).rejects.toThrow(/allowed-tables/i);
    await expect(scoped.previewTable(undefined, "admin_users")).rejects.toThrow(/allowed-tables/i);
    expect(inner.describeTable).not.toHaveBeenCalled();
  });

  it("allows a table that IS on the allowlist", async () => {
    const inner = makeMockConnector();
    const scoped = new ScopedSqlConnector(inner, new Set(["agents"]));
    await expect(scoped.describeTable(undefined, "agents")).resolves.toBeDefined();
    expect(inner.describeTable).toHaveBeenCalledWith(undefined, "agents");
  });

  it("blocks sql_execute_query-style raw SQL referencing a disallowed table", async () => {
    const inner = makeMockConnector();
    const scoped = new ScopedSqlConnector(inner, new Set(["agents"]));
    await expect(scoped.executeQuery("SELECT * FROM admin_users", 10)).rejects.toThrow(/admin_users/);
    expect(inner.executeQuery).not.toHaveBeenCalled();
  });

  it("blocks a JOIN that pulls in a disallowed table even when the primary table is allowed", async () => {
    const inner = makeMockConnector();
    const scoped = new ScopedSqlConnector(inner, new Set(["agents"]));
    await expect(
      scoped.executeQuery("SELECT a.id, u.password FROM agents a JOIN admin_users u ON a.id = u.agent_id", 10)
    ).rejects.toThrow(/admin_users/);
  });

  it("allows raw SQL when every referenced table is on the allowlist", async () => {
    const inner = makeMockConnector();
    const scoped = new ScopedSqlConnector(inner, new Set(["agents", "organizations"]));
    await expect(
      scoped.executeQuery("SELECT a.id FROM agents a JOIN organizations o ON a.organization_id = o.id", 10)
    ).resolves.toBeDefined();
    expect(inner.executeQuery).toHaveBeenCalled();
  });

  it("fails closed when the SQL can't be parsed and an allowlist is configured", async () => {
    const inner = makeMockConnector();
    const scoped = new ScopedSqlConnector(inner, new Set(["agents"]));
    await expect(scoped.executeQuery("not valid sql at all !!!", 10)).rejects.toThrow(/couldn't be parsed/i);
    expect(inner.executeQuery).not.toHaveBeenCalled();
  });

  it("filters listTables/searchTables results to only allowed tables", async () => {
    const inner = makeMockConnector();
    const scoped = new ScopedSqlConnector(inner, new Set(["agents"]));
    const listed = await scoped.listTables();
    expect(listed.rows).toEqual([{ table_name: "agents" }]);
    expect(listed.row_count).toBe(1);
    const searched = await scoped.searchTables("a");
    expect(searched.rows).toEqual([{ table_name: "agents" }]);
  });
});

describe("ScopedSqlConnector — explored-table tracking", () => {
  it("starts with no explored tables", () => {
    const scoped = new ScopedSqlConnector(makeMockConnector(), null);
    expect(scoped.getExploredTables().size).toBe(0);
  });

  it("marks a table explored after describeTable", async () => {
    const scoped = new ScopedSqlConnector(makeMockConnector(), null);
    await scoped.describeTable(undefined, "agents");
    expect(scoped.getExploredTables().has("agents")).toBe(true);
  });

  it("marks a table explored after previewTable", async () => {
    const scoped = new ScopedSqlConnector(makeMockConnector(), null);
    await scoped.previewTable(undefined, "agents");
    expect(scoped.getExploredTables().has("agents")).toBe(true);
  });

  it("does NOT mark tables explored just from executeQuery", async () => {
    const scoped = new ScopedSqlConnector(makeMockConnector(), null);
    await scoped.executeQuery("SELECT * FROM agents", 10);
    expect(scoped.getExploredTables().size).toBe(0);
  });
});
