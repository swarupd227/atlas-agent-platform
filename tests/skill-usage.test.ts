/**
 * server/skill-usage.ts stamps when a run last put a skill in front of a model. It is
 * telemetry for the library curator, so it must be cheap (one statement however many
 * skills), throttled to once a day per skill, and unable to fail or slow a run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const dbExecute = vi.hoisted(() => vi.fn());
vi.mock("../server/db", () => ({ db: { execute: dbExecute } }));

import { touchSkillUse } from "../server/skill-usage";

beforeEach(() => { dbExecute.mockReset().mockResolvedValue({ rows: [] }); });

describe("touchSkillUse", () => {
  it("is one statement for any number of skills, with each id once", async () => {
    await touchSkillUse(["a", "b", "a", "c", "b"]);
    expect(dbExecute).toHaveBeenCalledTimes(1);
    const q = new PgDialect().sqlToQuery(dbExecute.mock.calls[0][0]);
    expect(q.params).toEqual(["a", "b", "c"]);
    expect(q.sql).toMatch(/id IN \(\$1, \$2, \$3\)/);
    expect(q.sql).not.toMatch(/ANY\(/);
  });

  it("only moves the stamp when it is empty or older than a day, so a busy skill costs no write per run", async () => {
    await touchSkillUse(["a"]);
    const q = new PgDialect().sqlToQuery(dbExecute.mock.calls[0][0]);
    expect(q.sql).toMatch(/UPDATE skills SET last_used_at = NOW\(\)/);
    expect(q.sql).toMatch(/last_used_at IS NULL OR last_used_at < NOW\(\) - INTERVAL '1 day'/);
    expect(q.sql).toMatch(/WHERE id IN \(\$1\)/);
  });

  it("does nothing for no ids, and ignores empty and missing ones", async () => {
    await touchSkillUse([]);
    await touchSkillUse([null, undefined, ""]);
    expect(dbExecute).not.toHaveBeenCalled();
  });

  it("never fails a run: a database error is swallowed", async () => {
    dbExecute.mockRejectedValue(new Error("db down"));
    await expect(touchSkillUse(["a"])).resolves.toBeUndefined();
  });
});
