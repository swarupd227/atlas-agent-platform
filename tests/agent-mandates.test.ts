import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Covers the two pieces of real logic in storage.ts's mandate methods, not
 * the plain CRUD around them: approveAgentMandate's required-field guard
 * (S1.1.3's "reject vague mandates" ask, cheapened to what this increment
 * actually needs), and upsertAgentMandate's "editing an approved mandate
 * reopens it as draft" rule -- an approval signs a specific set of answers,
 * so letting the content change underneath a prior approval would be exactly
 * the drift this whole design exists to prevent.
 *
 * Exercises the real storage singleton (spied, not reimplemented) so this
 * fails if the shipped logic changes, matching this file's siblings
 * (tests/file-upload-attach.test.ts) rather than asserting against a local copy.
 */

let updateCalls: Array<{ set: any }> = [];
vi.mock("../server/db", () => ({
  db: {
    update: () => ({
      set: (vals: any) => {
        updateCalls.push({ set: vals });
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: "m1", ...vals }]),
          }),
        };
      },
    }),
  },
}));

const { storage } = await import("../server/storage");

const baseMandate = {
  id: "m1", agentId: "a1", organizationId: "org1",
  whatItDoes: "Flags suspicious wire transfers for review.",
  mustNever: "Never release funds on its own authority.",
  status: "draft" as const,
  version: 1,
};

beforeEach(() => {
  updateCalls = [];
  vi.restoreAllMocks();
});

describe("approveAgentMandate", () => {
  it("refuses to approve when \"what it does\" is missing, without writing anything", async () => {
    vi.spyOn(storage, "getAgentMandate").mockResolvedValue({ ...baseMandate, whatItDoes: "" } as any);
    await expect(storage.approveAgentMandate("a1", "user1")).rejects.toThrow(/what it does/i);
    expect(updateCalls.length).toBe(0);
  });

  it("refuses to approve when \"must never\" is missing, without writing anything", async () => {
    vi.spyOn(storage, "getAgentMandate").mockResolvedValue({ ...baseMandate, mustNever: "   " } as any);
    await expect(storage.approveAgentMandate("a1", "user1")).rejects.toThrow(/must never/i);
    expect(updateCalls.length).toBe(0);
  });

  it("returns undefined rather than throwing when there is no mandate to approve", async () => {
    vi.spyOn(storage, "getAgentMandate").mockResolvedValue(undefined as any);
    await expect(storage.approveAgentMandate("a1", "user1")).resolves.toBeUndefined();
    expect(updateCalls.length).toBe(0);
  });

  it("approves and records the approver when both required sections are filled in", async () => {
    vi.spyOn(storage, "getAgentMandate").mockResolvedValue({ ...baseMandate } as any);
    const result = await storage.approveAgentMandate("a1", "user1");
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].set.status).toBe("active");
    expect(updateCalls[0].set.approvedBy).toBe("user1");
    expect(updateCalls[0].set.approvedAt).toBeInstanceOf(Date);
    expect(result?.status).toBe("active");
  });
});

describe("upsertAgentMandate", () => {
  it("reopens an approved mandate to draft and clears the approval when its content changes", async () => {
    vi.spyOn(storage, "getAgentMandate").mockResolvedValue({ ...baseMandate, status: "active", approvedBy: "user1", approvedAt: new Date(), version: 3 } as any);
    await storage.upsertAgentMandate("a1", { whatItDoes: "Updated description." });
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].set.status).toBe("draft");
    expect(updateCalls[0].set.approvedBy).toBeNull();
    expect(updateCalls[0].set.approvedAt).toBeNull();
    expect(updateCalls[0].set.version).toBe(4);
  });

  it("does not touch approval state when editing a mandate that was already a draft", async () => {
    vi.spyOn(storage, "getAgentMandate").mockResolvedValue({ ...baseMandate, status: "draft", version: 1 } as any);
    await storage.upsertAgentMandate("a1", { whatItDoes: "Still drafting." });
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].set.status).toBeUndefined();
    expect("approvedBy" in updateCalls[0].set).toBe(false);
  });

  it("does not let an edit reassign who originally created the mandate", async () => {
    vi.spyOn(storage, "getAgentMandate").mockResolvedValue({ ...baseMandate, status: "draft", version: 1, createdBy: "original-author" } as any);
    // The route always passes createdBy through (it's the demo-mode actor
    // fallback) -- upsert must ignore it once a mandate already exists.
    await storage.upsertAgentMandate("a1", { whatItDoes: "Edited by someone else.", createdBy: "whoever-is-editing-now" });
    expect(updateCalls.length).toBe(1);
    expect("createdBy" in updateCalls[0].set).toBe(false);
  });
});
