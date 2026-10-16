/**
 * When a skill was last put in front of a model.
 *
 * skills.activationCount only counts on-demand read_skill loads; a skill inlined
 * into every run of an agent never bumps it, so counting alone would call the
 * most-used skills idle. lastUsedAt is set when a run loads a skill either way,
 * at most once a day per skill: the library curator (server/agent-curator.ts) asks
 * about weeks, so a day is fine, and a run costs one cheap UPDATE however many
 * skills it loads. Fire-and-forget: telemetry must never fail or slow a run.
 *
 * The database is imported when first needed, so the modules that call this
 * (the prompt builder, the skill reader) load without it.
 */

import { sql } from "drizzle-orm";

export async function touchSkillUse(ids: Array<string | null | undefined>): Promise<void> {
  const unique = Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
  if (unique.length === 0) return;
  try {
    const { db } = await import("./db");
    // An explicit list: drizzle renders a JS array parameter as a row, which ANY() rejects.
    const list = sql.join(unique.map((id) => sql`${id}`), sql`, `);
    await db.execute(sql`
      UPDATE skills SET last_used_at = NOW()
      WHERE id IN (${list}) AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '1 day')`);
  } catch {
    // Telemetry: a failure here means "idle" is judged on slightly older data, nothing else.
  }
}
