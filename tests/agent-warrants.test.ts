import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Covers the real logic in storage.ts's warrant methods: issueWarrant's
 * auto-supersession of whatever was previously active for the same task
 * class (a task class must have at most one active warrant, so "what
 * authority applies right now" is never ambiguous), and getActiveWarrant's
 * filter (not revoked, not expired) -- the exact query the warrant gate in
 * tool-dispatcher.ts relies on to decide ALLOW/BLOCK/REQUIRE_APPROVAL.
 *
 * Exercises the real storage singleton (spied, not reimplemented), matching
 * tests/agent-mandates.test.ts's approach for the sibling primitive.
 */

let insertedValues: any[] = [];
let updateCalls: Array<{ set: any; targetId?: string }> = [];
let selectRows: any[] = [];

vi.mock("../server/db", () => ({
  db: {
    insert: () => ({
      values: (vals: any) => {
        insertedValues.push(vals);
        return { returning: () => Promise.resolve([{ id: "w-new", ...vals }]) };
      },
    }),
    update: () => ({
      set: (vals: any) => {
        updateCalls.push({ set: vals });
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: "w-prior", ...vals }]),
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(selectRows),
          }),
        }),
      }),
    }),
  },
}));

const { storage } = await import("../server/storage");

beforeEach(() => {
  insertedValues = [];
  updateCalls = [];
  selectRows = [];
});

describe("getActiveWarrant", () => {
  it("returns the row the query yields (not-revoked, not-expired filtering happens in the WHERE clause)", async () => {
    selectRows = [{ id: "w-1", taskClassId: "tc-1", grants: "autonomous" }];
    const result = await storage.getActiveWarrant("tc-1");
    expect(result?.id).toBe("w-1");
  });

  it("returns undefined when nothing is active for this task class", async () => {
    selectRows = [];
    const result = await storage.getActiveWarrant("tc-1");
    expect(result).toBeUndefined();
  });
});

describe("issueWarrant", () => {
  it("issues a fresh warrant with no supersession when nothing was active", async () => {
    selectRows = []; // getActiveWarrant lookup inside issueWarrant finds nothing
    const created = await storage.issueWarrant({
      taskClassId: "tc-1", agentId: "a-1", grants: "autonomous",
      issuedBy: "user-1", expiresAt: new Date(Date.now() + 86_400_000),
    } as any);

    expect(created.id).toBe("w-new");
    expect(insertedValues[0].supersedesWarrantId).toBeNull();
    expect(updateCalls.length).toBe(0); // nothing to revoke
  });

  it("supersedes (revokes) the prior active warrant for the same task class", async () => {
    selectRows = [{ id: "w-prior", taskClassId: "tc-1", grants: "requires_approval" }];
    const created = await storage.issueWarrant({
      taskClassId: "tc-1", agentId: "a-1", grants: "autonomous",
      issuedBy: "user-2", expiresAt: new Date(Date.now() + 86_400_000),
    } as any);

    expect(insertedValues[0].supersedesWarrantId).toBe("w-prior");
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].set.revokedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].set.revokedBy).toBe("user-2");
    expect(updateCalls[0].set.revokedReason).toBe("superseded by renewal");
    void created;
  });
});

describe("revokeWarrant", () => {
  it("sets revokedAt/revokedBy/revokedReason", async () => {
    const revoked = await storage.revokeWarrant("w-1", "user-3", "manually revoked");
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].set.revokedBy).toBe("user-3");
    expect(updateCalls[0].set.revokedReason).toBe("manually revoked");
    expect(revoked?.id).toBe("w-prior"); // mock always returns this id shape
  });
});
