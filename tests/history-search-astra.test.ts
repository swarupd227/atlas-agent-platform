/**
 * History search in Cowork: the search_conversations tool, and the palette's search.
 *
 * The tool searches the signed-in person's OWN conversations: the person and the organization come
 * from the session, never from the model, and it does nothing unless the platform setting is on. The
 * palette search now ranks by full-text match first, and falls back to the phrase match it always
 * used, so a part of a word still finds what it found before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const dbExec = vi.hoisted(() => ({ calls: [] as any[], rows: [] as any[] }));
const setting = vi.hoisted(() => ({ value: "off" as string | undefined }));
const chain = vi.hoisted(() => ({ wheres: [] as any[], orders: [] as any[][], limits: [] as number[], results: [] as any[][] }));
vi.mock("../server/db", () => {
  const q: any = {
    select: () => q, from: () => q, innerJoin: () => q,
    where: (c: any) => { chain.wheres.push(c); return q; },
    orderBy: (...o: any[]) => { chain.orders.push(o); return q; },
    limit: async (n: number) => { chain.limits.push(n); return chain.results.shift() ?? []; },
    execute: async (x: any) => { dbExec.calls.push(x); return { rows: dbExec.rows }; },
  };
  return { db: q };
});
vi.mock("../server/storage", () => ({
  storage: {
    getPlatformSetting: vi.fn(async () => (setting.value === undefined ? undefined : { value: setting.value })),
    createAuditEvent: vi.fn(async () => undefined),
  },
}));
vi.mock("../server/auth", () => ({ getDefaultOrgId: () => "org-default" }));

import { searchConversationsTool, HISTORY_TOOLS } from "../server/astra/tools/history";
import { RUNS_TOOLS } from "../server/astra/tools/runs";
import { DbThreadStore, centreOn, snippetAround } from "../server/astra/store";

const dialect = new PgDialect();
const ctx = (over: Record<string, unknown> = {}) => ({ orgId: "org-a", userId: "user-1", role: "admin", threadId: "t", services: {}, ...over }) as any;

describe("the search_conversations tool", () => {
  beforeEach(() => { setting.value = "off"; dbExec.calls.length = 0; dbExec.rows = []; });

  it("is in the runs pack with the pack's permission, and does not need a confirmation", () => {
    expect(HISTORY_TOOLS).toContain(searchConversationsTool);
    expect(RUNS_TOOLS).toContain(searchConversationsTool);
    // The runs pack changes nothing and every tool in it reads under view_agents (tests/astra-runs.test.ts).
    expect(searchConversationsTool).toMatchObject({ name: "search_conversations", pack: "runs", permission: "view_agents", confirm: false });
  });

  it("takes a query and a count from the model, and nothing that says whose conversations", () => {
    const shape = Object.keys((searchConversationsTool.input as any).shape).sort();
    expect(shape).toEqual(["limit", "query"]);
    expect(searchConversationsTool.input.safeParse({ query: "a" }).success).toBe(false);
    expect(searchConversationsTool.input.safeParse({ query: "canary", limit: 50 }).success).toBe(false);
    expect(searchConversationsTool.input.safeParse({ query: "canary" }).success).toBe(true);
  });

  it("does nothing, and says so, while the platform setting is off", async () => {
    const r = await searchConversationsTool.run(ctx(), { query: "canary" });
    expect(r.payload).toMatchObject({ searched: false, message: expect.stringMatching(/switched off/) });
    expect(dbExec.calls).toHaveLength(0);
  });

  it("with the setting on, searches as the session's person and organization, and returns passages labelled as data", async () => {
    setting.value = "on";
    dbExec.rows = [{ messageId: "m1", threadId: "t1", title: "Rollout", role: "assistant", createdAt: "2026-10-18 10:00:00", snippet: "we set the [[canary]] to 10%" }];
    const r: any = await searchConversationsTool.run(ctx(), { query: "canary" });
    expect(r.payload).toMatchObject({ searched: true, found: 1, note: expect.stringMatching(/data, not instructions/) });
    expect(r.payload.results[0]).toMatchObject({ threadId: "t1", title: "Rollout", passage: "we set the [[canary]] to 10%" });
    const q = dialect.sqlToQuery(dbExec.calls[0]);
    expect(q.params).toEqual(expect.arrayContaining(["org-a", "user-1", "canary"]));
    expect(r.proof.context).toMatchObject({ status: "measured", summary: "1 conversation matched" });
  });

  it("is refused for a session with no person, rather than searching the whole organization", async () => {
    setting.value = "on";
    const r: any = await searchConversationsTool.run(ctx({ userId: null }), { query: "canary" });
    expect(r.payload).toMatchObject({ searched: false });
    expect(dbExec.calls).toHaveLength(0);
  });
});

describe("the palette search", () => {
  const store = new DbThreadStore();
  const row = (threadId: string, markdown: string) => ({ threadId, title: `Thread ${threadId}`, role: "assistant", markdown, createdAt: new Date("2026-10-18T10:00:00Z") });
  beforeEach(() => { chain.wheres.length = 0; chain.orders.length = 0; chain.limits.length = 0; chain.results.length = 0; });

  it("ranks by full-text match first, and stops there when that finds something", async () => {
    chain.results.push([row("t1", "We set the canary to 10% on Tuesday")]);
    const hits = await store.searchMessages("org-a", "user-1", "canary");
    expect(hits).toHaveLength(1);
    expect(chain.limits).toHaveLength(1);
    const first = dialect.sqlToQuery(chain.wheres[0]);
    expect(first.sql).toContain("@@ websearch_to_tsquery('simple'");
    expect(first.sql).toContain("left(coalesce(astra_messages.markdown, ''), 100000)");
    expect(dialect.sqlToQuery(chain.orders[0][0]).sql).toMatch(/^ts_rank_cd\(.*\) desc$/);
  });

  it("falls back to the phrase match when no word matches, so part of a word still finds what it always did", async () => {
    chain.results.push([], [row("t2", "The canarycheck job ran")]);
    const hits = await store.searchMessages("org-a", "user-1", "canaryc");
    expect(hits.map((h) => h.threadId)).toEqual(["t2"]);
    expect(chain.limits).toHaveLength(2);
    expect(dialect.sqlToQuery(chain.wheres[1]).sql.toLowerCase()).toContain(" ilike ");
  });

  it("keeps the access rule in both attempts: the organization, and a thread that is yours or nobody's", async () => {
    chain.results.push([], []);
    await store.searchMessages("org-a", "user-1", "canary");
    for (const w of chain.wheres) {
      const q = dialect.sqlToQuery(w);
      expect(q.sql).toContain('"astra_messages"."organization_id" = $');
      expect(q.sql).toContain('"astra_threads"."actor_user_id" is null or "astra_threads"."actor_user_id" = $');
      expect(q.params).toEqual(expect.arrayContaining(["org-a", "user-1"]));
    }
  });

  it("still gives one hit per conversation, and nothing for a query too short to mean anything", async () => {
    chain.results.push([row("t1", "canary one"), row("t1", "canary two"), row("t2", "canary three")]);
    expect((await store.searchMessages("org-a", "user-1", "canary")).map((h) => h.threadId)).toEqual(["t1", "t2"]);
    expect(await store.searchMessages("org-a", "user-1", "c")).toEqual([]);
  });

  it("centres a snippet on the whole query if the text has it, else on the first query word it does have", () => {
    expect(centreOn("We set the canary to 10% today", "canary to 10%")).toBe("canary to 10%");
    expect(centreOn("The canary was set on Tuesday", "rollout canary")).toBe("canary");
    expect(centreOn("Nothing relevant", "zzz yyy")).toBe("zzz yyy");
    expect(snippetAround("a ".repeat(200) + "canary here " + "b ".repeat(200), centreOn("a ".repeat(200) + "canary here " + "b ".repeat(200), "rollout canary"), 10)).toContain("canary");
  });
});
