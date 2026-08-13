/**
 * Dialect-independent safety helpers shared by every SQL connector client
 * (server/integrations/sql/shared.ts) -- the read-only DDL/DML guard and
 * the identifier allowlist that stands in for parameterization on
 * schema/table/column names (which can't be bound as SQL values).
 */
import { describe, it, expect } from "vitest";
import { guardReadOnly, assertSafeIdentifier, truncate } from "../server/integrations/sql/shared";

describe("guardReadOnly", () => {
  it("allows a plain SELECT", () => {
    expect(() => guardReadOnly("SELECT * FROM users")).not.toThrow();
  });

  it.each(["INSERT INTO users VALUES (1)", "UPDATE users SET x=1", "DELETE FROM users", "DROP TABLE users", "TRUNCATE users", "ALTER TABLE users ADD COLUMN x INT", "GRANT SELECT ON users TO bob", "EXEC sp_who"])
  ("blocks %s", (sql) => {
    expect(() => guardReadOnly(sql)).toThrow(/read-only enforcement/i);
  });

  it("is case-insensitive", () => {
    expect(() => guardReadOnly("insert into users values (1)")).toThrow(/INSERT/i);
  });

  it("doesn't false-positive on a blocked keyword as a substring of a longer identifier", () => {
    // The \b...\b word-boundary regex requires INSERT to be a whole word --
    // "insertion_date" has no boundary between "insert" and "ion_date"
    // (both are word characters), so this must NOT be blocked.
    expect(() => guardReadOnly("SELECT insertion_date FROM events")).not.toThrow();
  });
});

describe("assertSafeIdentifier", () => {
  it("accepts a plain identifier", () => {
    expect(assertSafeIdentifier("customer_orders", "table")).toBe("customer_orders");
  });

  it("accepts an identifier with leading underscore and digits", () => {
    expect(assertSafeIdentifier("_temp2", "table")).toBe("_temp2");
  });

  it.each(['orders"; DROP TABLE users;--', "orders'; --", "orders OR 1=1", "orders table", "order-2024", "orders.public"])
  ("rejects %s", (name) => {
    expect(() => assertSafeIdentifier(name, "table")).toThrow(/invalid table name/i);
  });
});

describe("truncate", () => {
  it("passes rows through untouched when under the limit", () => {
    const result = truncate([1, 2, 3], 10);
    expect(result).toEqual({ rows: [1, 2, 3], truncated: false });
  });

  it("slices and flags truncated when over the limit", () => {
    const result = truncate([1, 2, 3, 4, 5], 3);
    expect(result).toEqual({ rows: [1, 2, 3], truncated: true });
  });

  it("is not truncated exactly at the limit", () => {
    const result = truncate([1, 2, 3], 3);
    expect(result.truncated).toBe(false);
  });
});
