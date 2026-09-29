/**
 * Which build is serving?
 *
 * On 2026-09-29 four commits were queued behind one deployment and the question
 * "did it cover all?" could only be answered by comparing live response wording
 * against the source, one commit at a time — two of the four had no passive
 * marker at all. A build that cannot name itself makes every deploy check a
 * forensic exercise.
 *
 * These assert the two halves that make the answer possible: the bundle is
 * stamped at build time, and the route that reports it is reachable without
 * credentials (a deploy check runs before anyone signs in).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("the build stamps its own commit", () => {
  const build = read("script", "build.ts");

  it("defines the commit and build time into the bundle", () => {
    expect(build).toContain('"process.env.BUILD_COMMIT": JSON.stringify(buildCommit())');
    expect(build).toContain('"process.env.BUILD_TIME": JSON.stringify(new Date().toISOString())');
  });

  it("prefers an environment stamp, so a CI build names the commit CI built", () => {
    expect(build).toContain("process.env.BUILD_COMMIT || process.env.GITHUB_SHA");
  });

  it("never fails the build over it — an unstamped deploy beats a broken one", () => {
    expect(build).toMatch(/try \{[\s\S]*rev-parse[\s\S]*\} catch \{[\s\S]*return "unknown";/);
  });
});

describe("the route that reports it", () => {
  const routes = read("server", "routes.ts");

  it("is mounted outside /api, so it answers before anyone signs in", () => {
    expect(routes).toContain('app.get("/version"');
    // Everything under /api goes through authMiddleware; a deploy check that
    // needs a session is a deploy check nobody runs.
    const versionAt = routes.indexOf('app.get("/version"');
    expect(routes.slice(versionAt, versionAt + 400)).not.toContain("/api/version");
  });

  it("says plainly when it is running from source rather than guessing a commit", () => {
    expect(routes).toContain('"unknown (running from source)"');
  });

  it("reports when the process started, which is what a restart actually changes", () => {
    expect(routes).toContain("process.uptime()");
  });
});
