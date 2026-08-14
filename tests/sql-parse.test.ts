import { describe, it, expect } from "vitest";
import { extractReferencedTables } from "../server/integrations/sql/sql-parse";

describe("extractReferencedTables", () => {
  it("extracts a single table from a plain SELECT", () => {
    const r = extractReferencedTables("SELECT * FROM agents WHERE status = 'active'", "postgres");
    expect(r.parsedOk).toBe(true);
    expect(r.tables).toEqual(["agents"]);
  });

  it("extracts every table across JOINs", () => {
    const r = extractReferencedTables(
      "SELECT a.id, b.name FROM agents a JOIN organizations b ON a.organization_id = b.id",
      "postgres"
    );
    expect(r.tables.sort()).toEqual(["agents", "organizations"]);
  });

  it("excludes CTE aliases from the table list", () => {
    const r = extractReferencedTables(
      "WITH recent AS (SELECT * FROM workspace_runs) SELECT * FROM recent JOIN agents ON recent.agent_id = agents.id",
      "postgres"
    );
    expect(r.parsedOk).toBe(true);
    expect(r.tables.sort()).toEqual(["agents", "workspace_runs"]);
    expect(r.tables).not.toContain("recent");
  });

  it("handles nested CTEs referencing earlier CTEs", () => {
    const r = extractReferencedTables(
      "WITH a AS (SELECT * FROM agents), b AS (SELECT * FROM a) SELECT * FROM b",
      "postgres"
    );
    expect(r.tables).toEqual(["agents"]);
  });

  it("parses MySQL-dialect SQL", () => {
    const r = extractReferencedTables("SELECT * FROM `agents` WHERE `status` = 'active'", "mysql");
    expect(r.parsedOk).toBe(true);
    expect(r.tables).toEqual(["agents"]);
  });

  it("parses SQL Server TOP/bracket syntax", () => {
    const r = extractReferencedTables("SELECT TOP 10 * FROM [dbo].[Orders]", "sqlserver");
    expect(r.parsedOk).toBe(true);
    expect(r.tables).toEqual(["orders"]);
  });

  it("fails closed (parsedOk: false) on unparseable SQL rather than throwing", () => {
    const r = extractReferencedTables("this is not sql at all !!!", "postgres");
    expect(r.parsedOk).toBe(false);
    expect(r.tables).toEqual([]);
  });

  it("dedupes a table referenced more than once", () => {
    const r = extractReferencedTables(
      "SELECT * FROM agents a1 WHERE a1.id IN (SELECT id FROM agents a2 WHERE a2.status = 'active')",
      "postgres"
    );
    expect(r.tables).toEqual(["agents"]);
  });
});
