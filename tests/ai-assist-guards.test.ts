/**
 * /api/ai/* assist routes: the outcome-authoring helpers need
 * create_modify_outcomes, every assist call shares one per-user rate limit,
 * and a meeting transcript can only be polled by the organization (and
 * person) that uploaded the recording.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("outcome-authoring helpers", () => {
  const src = read("server", "routes", "improvements.ts");
  it.each(["outcome-discover", "enhance-outcome", "generate-kpis", "regulatory-constraints"])("%s needs create_modify_outcomes", (name) => {
    expect(src).toContain(`router.post("/api/ai/${name}", checkPermission("create_modify_outcomes")`);
  });
});

describe("meeting transcription jobs", () => {
  const src = read("server", "routes", "improvements.ts");
  it("records who uploaded the recording", () => {
    expect(src).toContain("ownerOrgId: resolveRequestOrgId(req) ?? null,");
    expect(src).toContain("ownerUserId: req.authUser?.userId ?? null,");
  });

  it("answers not found for another organization's, another person's or a non-transcription job", () => {
    const route = src.slice(src.indexOf('router.get("/api/ai/transcribe-meeting/:jobId"'));
    const check = route.slice(0, route.indexOf("res.json("));
    expect(check).toContain('job.type !== "meeting_transcription"');
    expect(check).toContain("owner.ownerOrgId !== resolveRequestOrgId(req)");
    expect(check).toContain("owner.ownerUserId !== callerUserId");
  });
});

describe("AI assist rate limit", () => {
  it("is mounted on every /api/ai route", () => {
    expect(read("server", "routes.ts")).toContain('app.use("/api/ai", aiAssistRateLimiter);');
  });

  it("limits POSTs per signed-in user and lets job polls through", async () => {
    vi.resetModules();
    const { aiAssistRateLimiter } = await import("../server/rate-limits");
    const call = (method: string, userId: string) =>
      new Promise<number>((resolve) => {
        const req: any = { method, ip: "10.0.0.1", headers: {}, authUser: { userId }, app: { get: () => false } };
        const res: any = {
          statusCode: 200,
          setHeader() {}, getHeader() {}, append() {},
          status(c: number) { this.statusCode = c; return this; },
          send() { resolve(this.statusCode); return this; },
          json() { resolve(this.statusCode); return this; },
          end() { resolve(this.statusCode); return this; },
        };
        aiAssistRateLimiter(req, res, () => resolve(200));
      });
    const statuses: number[] = [];
    for (let i = 0; i < 201; i++) statuses.push(await call("POST", "user-a"));
    expect(statuses.slice(0, 200).every((s) => s === 200)).toBe(true);
    expect(statuses[200]).toBe(429);
    expect(await call("GET", "user-a")).toBe(200);
    expect(await call("POST", "user-b")).toBe(200);
  });
});
