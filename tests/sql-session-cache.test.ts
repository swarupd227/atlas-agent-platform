import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getOrCreateSession, evictSession, _sessionCacheSizeForTests, _clearSessionCacheForTests,
} from "../server/integrations/sql/session-cache";
import type { SqlConnector } from "../server/integrations/sql/types";

function fakeConnector(): SqlConnector {
  return {
    dialect: "postgres",
    executeQuery: vi.fn(),
    listSchemas: vi.fn(),
    listTables: vi.fn(),
    describeTable: vi.fn(),
    searchTables: vi.fn(),
    getColumnStats: vi.fn(),
    previewTable: vi.fn(),
    sampleDistinctValues: vi.fn(),
    close: vi.fn(async () => {}),
  } as unknown as SqlConnector;
}

afterEach(() => {
  _clearSessionCacheForTests();
});

describe("SQL connector session cache", () => {
  it("builds a fresh connector on first use", () => {
    const build = vi.fn(() => fakeConnector());
    getOrCreateSession("postgres", "org-1", { host: "a" }, build);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("reuses the SAME connector instance for identical (integration, org, credentials)", () => {
    const build = vi.fn(() => fakeConnector());
    const first = getOrCreateSession("postgres", "org-1", { host: "a", port: "5432" }, build);
    const second = getOrCreateSession("postgres", "org-1", { host: "a", port: "5432" }, build);
    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("is insensitive to credential key insertion order (stable cache key)", () => {
    const build = vi.fn(() => fakeConnector());
    const first = getOrCreateSession("postgres", "org-1", { host: "a", port: "5432" }, build);
    const second = getOrCreateSession("postgres", "org-1", { port: "5432", host: "a" }, build);
    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("builds separate connectors for different orgs", () => {
    const build = vi.fn(() => fakeConnector());
    const a = getOrCreateSession("postgres", "org-1", { host: "a" }, build);
    const b = getOrCreateSession("postgres", "org-2", { host: "a" }, build);
    expect(a).not.toBe(b);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("builds separate connectors for different integration ids on the same org+credentials", () => {
    const build = vi.fn(() => fakeConnector());
    const a = getOrCreateSession("postgres", "org-1", { host: "a" }, build);
    const b = getOrCreateSession("mysql", "org-1", { host: "a" }, build);
    expect(a).not.toBe(b);
  });

  it("builds a fresh connector when credentials change (e.g. password rotated)", () => {
    const build = vi.fn(() => fakeConnector());
    const a = getOrCreateSession("postgres", "org-1", { host: "a", password: "old" }, build);
    const b = getOrCreateSession("postgres", "org-1", { host: "a", password: "new" }, build);
    expect(a).not.toBe(b);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("evictSession closes and removes the cached connector so the next call rebuilds", () => {
    const build = vi.fn(() => fakeConnector());
    const first = getOrCreateSession("postgres", "org-1", { host: "a" }, build);
    evictSession("postgres", "org-1", { host: "a" });
    expect(first.close).toHaveBeenCalledTimes(1);
    const second = getOrCreateSession("postgres", "org-1", { host: "a" }, build);
    expect(second).not.toBe(first);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("evicting a session that doesn't exist is a harmless no-op", () => {
    expect(() => evictSession("postgres", "org-nonexistent", { host: "a" })).not.toThrow();
  });

  it("_sessionCacheSizeForTests reflects the number of distinct cached sessions", () => {
    expect(_sessionCacheSizeForTests()).toBe(0);
    getOrCreateSession("postgres", "org-1", { host: "a" }, () => fakeConnector());
    getOrCreateSession("postgres", "org-2", { host: "a" }, () => fakeConnector());
    expect(_sessionCacheSizeForTests()).toBe(2);
  });
});
