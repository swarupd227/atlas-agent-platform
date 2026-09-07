/**
 * Brand-asset resolution shared by Workspace runs and Team DAG workers.
 * Proves the gate is document CAPABILITY (a pptx/pdf-granting skill), not
 * document MODE -- the regression that made sandbox-mode agents, the only
 * ones able to build on a real .pptx master, receive no brand assets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rows = [{ id: "brand-newest" }, { id: "brand-older" }];
const limit = vi.fn(async () => rows);
const orderBy = vi.fn(() => ({ limit }));
const where = vi.fn(() => ({ orderBy }));
const from = vi.fn(() => ({ where }));
const select = vi.fn(() => ({ from }));

vi.mock("../server/db", () => ({ db: { select: (...a: any[]) => select(...a) } }));

import { resolveBrandAssetFileIds, BRAND_ASSET_LIMIT } from "../server/brand-assets";

function skill(overrides: Record<string, any>) {
  return { id: "s1", name: "PDF & PPTX Generator", status: "active", skillKind: "code_execution", anthropicSkillIds: ["pptx", "pdf"], ...overrides } as any;
}

describe("resolveBrandAssetFileIds", () => {
  beforeEach(() => { select.mockClear(); limit.mockClear(); });

  it("returns nothing, without touching the database, when no active skill grants document generation", async () => {
    expect(await resolveBrandAssetFileIds([skill({ anthropicSkillIds: ["xlsx"] })], "org-1")).toEqual([]);
    expect(await resolveBrandAssetFileIds([skill({ status: "draft" })], "org-1")).toEqual([]);
    expect(await resolveBrandAssetFileIds([], "org-1")).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("returns the org's brand uploads, newest first and capped, for a document-capable agent regardless of document mode", async () => {
    // No mode argument exists on purpose: sandbox / platform / auto all qualify.
    expect(await resolveBrandAssetFileIds([skill({})], "org-1")).toEqual(["brand-newest", "brand-older"]);
    expect(limit).toHaveBeenCalledWith(BRAND_ASSET_LIMIT);
  });

  it("drops ids the caller already attached explicitly", async () => {
    expect(await resolveBrandAssetFileIds([skill({})], "org-1", ["brand-newest"])).toEqual(["brand-older"]);
  });
});
