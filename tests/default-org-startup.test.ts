/**
 * The default organization is resolved at startup with retries: a transient
 * lookup failure (a connection-pool timeout while a deploy runs two processes)
 * must not leave it unset for the life of the process. The startup block in
 * server/index.ts uses the retry and sets the id unconditionally once it
 * resolves, before readiness.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveWithRetry } from "../server/default-org-startup";

describe("resolveWithRetry", () => {
  it("returns the first success after transient failures, with doubling, capped waits", async () => {
    let calls = 0;
    const waits: number[] = [];
    const retries: number[] = [];
    const org = await resolveWithRetry(
      async () => { calls++; if (calls < 5) throw new Error("timeout exceeded when trying to connect"); return { id: "org-default" }; },
      { initialDelayMs: 1000, maxDelayMs: 4000, sleep: async (ms) => { waits.push(ms); }, onRetry: (a) => retries.push(a) },
    );
    expect(org).toEqual({ id: "org-default" });
    expect(calls).toBe(5);
    expect(waits).toEqual([1000, 2000, 4000, 4000]);
    expect(retries).toEqual([1, 2, 3, 4]);
  });

  it("does not wait when the first lookup succeeds", async () => {
    const waits: number[] = [];
    expect(await resolveWithRetry(async () => 7, { sleep: async (ms) => { waits.push(ms); } })).toBe(7);
    expect(waits).toEqual([]);
  });
});

describe("startup wiring", () => {
  const src = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
  it("resolves the default org through the retry and no longer swallows the failure", () => {
    expect(src).toMatch(/resolveWithRetry\(\(\) => storage\.ensureDefaultOrganization\(\)/);
    expect(src).not.toMatch(/ensureDefaultOrganization\(\)\.catch\(/);
  });
  it("sets the default org before readiness", () => {
    const set = src.indexOf("setDefaultOrgId(defaultOrg.id)");
    const ready = src.indexOf("appReady = true;", set);
    expect(set).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(set);
  });
});
