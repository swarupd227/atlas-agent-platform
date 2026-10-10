/**
 * The column-aware stand-in database (tests/support/fake-drizzle.ts) is only worth trusting if it tells one row from
 * its sibling the way Postgres would. These pin that, so a test that depends on it is not passing by accident.
 */
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { integrationConnections as conns } from "../shared/schema";
import { makeFakeDb } from "./support/fake-drizzle";

const seed = async (f: ReturnType<typeof makeFakeDb>) => {
  for (const [org, integ, name, def, blob] of [
    ["o1", "msgraph", "A", true, "blob-a"], ["o1", "msgraph", "B", false, null], ["o2", "msgraph", "C", true, "blob-c"], ["o1", "slack", "D", true, null],
  ] as const) {
    await f.db.insert(conns).values({ organizationId: org, integrationId: integ, name, isDefault: def, credentialBlob: blob });
  }
};

describe("fake drizzle database", () => {
  it("eq and and pick the right rows, and an org's rows never come back for another org", async () => {
    const f = makeFakeDb(); await seed(f);
    const rows = await f.db.select().from(conns).where(and(eq(conns.organizationId, "o1"), eq(conns.integrationId, "msgraph")));
    expect(rows.map((r: any) => r.name).sort()).toEqual(["A", "B"]);
  });

  it("ne, isNull and isNotNull", async () => {
    const f = makeFakeDb(); await seed(f);
    expect((await f.db.select().from(conns).where(and(eq(conns.organizationId, "o1"), ne(conns.integrationId, "msgraph")))).map((r: any) => r.name)).toEqual(["D"]);
    expect((await f.db.select().from(conns).where(isNull(conns.credentialBlob))).map((r: any) => r.name).sort()).toEqual(["B", "D"]);
    expect((await f.db.select().from(conns).where(isNotNull(conns.credentialBlob))).map((r: any) => r.name).sort()).toEqual(["A", "C"]);
  });

  it("lt and gte compare dates, and a row with no date is neither before nor after anything", async () => {
    const f = makeFakeDb(); await seed(f);
    const now = Date.now();
    f.rows("integration_connections").find((r: any) => r.name === "A").tokenExpiresAt = new Date(now + 60_000);
    f.rows("integration_connections").find((r: any) => r.name === "B").tokenExpiresAt = new Date(now + 3_600_000);
    const soon = new Date(now + 300_000);
    expect((await f.db.select().from(conns).where(lt(conns.tokenExpiresAt, soon))).map((r: any) => r.name)).toEqual(["A"]);
    expect((await f.db.select().from(conns).where(gte(conns.tokenExpiresAt, soon))).map((r: any) => r.name)).toEqual(["B"]);
  });

  it("orderBy with desc on a boolean then a column, and limit", async () => {
    const f = makeFakeDb(); await seed(f);
    const rows = await f.db.select().from(conns).where(and(eq(conns.organizationId, "o1"), eq(conns.integrationId, "msgraph"))).orderBy(desc(conns.isDefault), conns.createdAt).limit(1);
    expect(rows.map((r: any) => r.name)).toEqual(["A"]);
    const asc1 = await f.db.select().from(conns).where(eq(conns.organizationId, "o1")).orderBy(asc(conns.name));
    expect(asc1.map((r: any) => r.name)).toEqual(["A", "B", "D"]);
  });

  it("update changes only the rows the condition names, and returns them", async () => {
    const f = makeFakeDb(); await seed(f);
    const got = await f.db.update(conns).set({ credentialBlob: null, status: "changed" }).where(and(eq(conns.organizationId, "o1"), eq(conns.integrationId, "msgraph"))).returning();
    expect(got.length).toBe(2);
    expect(f.rows("integration_connections").find((r: any) => r.name === "C").credentialBlob).toBe("blob-c");
    expect(f.rows("integration_connections").find((r: any) => r.name === "D").status).not.toBe("changed");
  });

  it("delete removes only what the condition names and can return the ids", async () => {
    const f = makeFakeDb(); await seed(f);
    const gone = await f.db.delete(conns).where(and(eq(conns.organizationId, "o1"), eq(conns.name, "B"))).returning({ id: conns.id });
    expect(gone.length).toBe(1);
    expect(f.rows("integration_connections").map((r: any) => r.name).sort()).toEqual(["A", "C", "D"]);
  });

  it("insert applies the table's defaults (id, isDefault, status, timestamps)", async () => {
    const f = makeFakeDb();
    const [row] = await f.db.insert(conns).values({ organizationId: "o1", integrationId: "x" }).returning();
    expect(typeof row.id).toBe("string"); expect(row.id.length).toBeGreaterThan(8);
    expect(row.isDefault).toBe(true); expect(row.status).toBe("disconnected"); expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("refuses a column or operator it does not model instead of matching everything", async () => {
    const f = makeFakeDb(); await seed(f);
    const { sql } = await import("drizzle-orm");
    expect(() => f.db.select().from(conns).where(sql`${conns.name} like 'A%'`)).toThrow(/does not model/);
  });

  it("a table outside `strict` lets an unmodelled condition through, so unrelated queries do not break a test", async () => {
    const f = makeFakeDb({ strict: ["integration_connections"] });
    const { sql } = await import("drizzle-orm");
    const { agentIntegrationCredentials: ag } = await import("../shared/schema");
    await f.db.insert(ag).values({ agentId: "a", integrationId: "i" });
    expect((await f.db.select().from(ag).where(sql`${ag.agentId} like 'a%'`)).length).toBe(1);
  });

  it("a raw statement is recorded with its parameters, not run", async () => {
    const f = makeFakeDb();
    const { sql } = await import("drizzle-orm");
    await f.db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"a:b"}))`);
    expect(f.ops).toEqual(["execute SELECT pg_advisory_xact_lock(hashtext(?)) [a:b]"]);
  });

  it("a transaction runs its callback against the same data", async () => {
    const f = makeFakeDb(); await seed(f);
    const n = await f.db.transaction(async (tx: any) => (await tx.select().from(conns).where(eq(conns.organizationId, "o2"))).length);
    expect(n).toBe(1);
  });
});
