/**
 * Operational limits for extraction, search and original-file storage live in
 * server/config.ts. Environment may lower one. It cannot raise one past the
 * ceiling, and a skipped startup check still leaves the runtime value clamped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ENV = [
  "KNOWLEDGE_ATTACHMENT_BUDGET_CHARS",
  "KNOWLEDGE_ZIP_MAX_ENTRIES",
  "KNOWLEDGE_ORG_STORED_BYTES",
  "KNOWLEDGE_RETRIEVAL_MAX_TOP_K",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV) saved[key] = process.env[key];
  for (const key of ENV) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.resetModules();
});

describe("knowledgeLimits", () => {
  it("uses the code defaults when the environment is silent", async () => {
    vi.resetModules();
    const { knowledgeLimits } = await import("../server/config");
    expect(knowledgeLimits.attachmentBudgetChars).toBe(120_000);
    expect(knowledgeLimits.attachmentReadChars).toBe(40_000);
    expect(knowledgeLimits.attachmentCacheChars).toBe(60_000_000);
    expect(knowledgeLimits.attachmentSearchResults).toBe(25);
    expect(knowledgeLimits.attachmentSearchSections).toBe(100_000);
    expect(knowledgeLimits.zipMaxEntries).toBe(4_096);
    expect(knowledgeLimits.zipMaxEntryBytes).toBe(256 * 1024 * 1024);
    expect(knowledgeLimits.zipMaxExpandedBytes).toBe(512 * 1024 * 1024);
    expect(knowledgeLimits.retrievalMaxTopK).toBe(50);
    expect(knowledgeLimits.retrievalMaxQueryChars).toBe(8_000);
    expect(knowledgeLimits.orgStoredBytes).toBe(1024 * 1024 * 1024);
  });

  it("rejects a value above the ceiling and still clamps the runtime object", async () => {
    process.env.KNOWLEDGE_ZIP_MAX_ENTRIES = "999999";
    process.env.KNOWLEDGE_ORG_STORED_BYTES = "50";
    vi.resetModules();
    const { knowledgeLimits, validateKnowledgeLimitsEnv } = await import("../server/config");
    const errors = validateKnowledgeLimitsEnv();
    expect(errors.join("\n")).toContain("KNOWLEDGE_ZIP_MAX_ENTRIES");
    expect(knowledgeLimits.zipMaxEntries).toBe(10_000);
    expect(knowledgeLimits.orgStoredBytes).toBe(50);
  });

  it("rejects a value that is not an integer", async () => {
    process.env.KNOWLEDGE_ATTACHMENT_BUDGET_CHARS = "lots";
    vi.resetModules();
    const { knowledgeLimits, validateKnowledgeLimitsEnv } = await import("../server/config");
    expect(validateKnowledgeLimitsEnv().join("\n")).toContain("KNOWLEDGE_ATTACHMENT_BUDGET_CHARS");
    expect(knowledgeLimits.attachmentBudgetChars).toBe(120_000);
  });

  it("accepts a lower value inside the ceiling", async () => {
    process.env.KNOWLEDGE_RETRIEVAL_MAX_TOP_K = "10";
    vi.resetModules();
    const { knowledgeLimits, validateKnowledgeLimitsEnv } = await import("../server/config");
    expect(validateKnowledgeLimitsEnv()).toEqual([]);
    expect(knowledgeLimits.retrievalMaxTopK).toBe(10);
  });
});

describe("original file quota", () => {
  it("compares used bytes plus the upload against the quota", async () => {
    const { orgStorageWouldExceed } = await import("../server/kb-routes");
    expect(orgStorageWouldExceed(100, 50, 140)).toBe(true);
    expect(orgStorageWouldExceed(100, 40, 140)).toBe(false);
  });

  it("refuses the upload with 413 before the source is created", () => {
    const src = readFileSync(join(__dirname, "..", "server", "kb-routes.ts"), "utf8").replace(/\r\n/g, "\n");
    const start = src.indexOf('file="${filenameForLog(file.originalname)}"');
    expect(start).toBeGreaterThan(0);
    const slice = src.slice(start, start + 1800);
    expect(slice.indexOf("assertOrgFileQuota")).toBeGreaterThanOrEqual(0);
    expect(slice.indexOf("assertOrgFileQuota")).toBeLessThan(slice.indexOf("createKnowledgeSource"));
    expect(slice).toContain("status(413)");
  });

  it("answers an over-large Office archive with 400 and the reader's own message", () => {
    const src = readFileSync(join(__dirname, "..", "server", "kb-routes.ts"), "utf8").replace(/\r\n/g, "\n");
    const start = src.indexOf('app.post("/api/knowledge-bases/:id/sources/upload"');
    const end = src.indexOf('app.post("/api/knowledge-bases/:id/sources/url"');
    const slice = src.slice(start, end);
    expect(slice).toContain("error instanceof ZipLimitError");
    const guard = slice.indexOf("error instanceof ZipLimitError");
    expect(slice.indexOf("status(400)", guard)).toBeGreaterThan(guard);
    expect(slice.indexOf("status(500)", guard)).toBeGreaterThan(slice.indexOf("status(400)", guard));
  });
});
