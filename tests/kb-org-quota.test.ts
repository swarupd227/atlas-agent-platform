/**
 * Storing an original Knowledge Base file checks the organization's quota
 * before the insert. A database error other than the quota is still non-fatal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY = "test-key-not-used";
});

const execute = vi.hoisted(() => vi.fn());
const insertValues = vi.hoisted(() => vi.fn());
const existingRows = vi.hoisted(() => ({ rows: [] as Array<{ sourceId: string }> }));
const storedBytes = vi.hoisted(() => ({ used: 0 }));
const dbMock = vi.hoisted(() => {
  const executor = () => ({
    execute,
    insert: () => ({
      values: (row: { sizeBytes?: number }) => {
        insertValues(row);
        storedBytes.used += row.sizeBytes ?? 0;
        return { onConflictDoNothing: async () => {} };
      },
    }),
    select: () => ({
      from: () => ({
        where: async () => existingRows.rows,
      }),
    }),
  });
  return {
    ...executor(),
    transaction: async (fn: (tx: ReturnType<typeof executor>) => Promise<void>) => fn(executor()),
  };
});

vi.mock("../server/db", () => ({
  db: dbMock,
  pool: { on: () => {}, end: async () => {} },
}));

import { OrgStorageQuotaError, saveSourceFile } from "../server/kb-routes";
import { knowledgeLimits } from "../server/config";

function sqlText(node: unknown): string {
  const parts: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === "string" || typeof n === "number") { parts.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n !== "object") return;
    if (n.constructor?.name === "StringChunk" && Array.isArray(n.value)) { parts.push(n.value.join("")); return; }
    if (n.constructor?.name === "Param") { parts.push(String(n.value)); return; }
    if (Array.isArray(n.queryChunks)) n.queryChunks.forEach(walk);
  };
  walk(node);
  return parts.join("");
}

const file = { buffer: Buffer.from("hello"), originalname: "notes.txt", mimetype: "text/plain", size: 5 };

beforeEach(() => {
  execute.mockReset();
  insertValues.mockReset();
  existingRows.rows = [];
  storedBytes.used = 0;
  execute.mockImplementation(async (query: unknown) => {
    const text = sqlText(query);
    if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (text.includes("SUM")) return { rows: [{ used: storedBytes.used }] };
    return { rows: [] };
  });
});

describe("saveSourceFile", () => {
  it("does not insert when the organization is already at the quota", async () => {
    storedBytes.used = knowledgeLimits.orgStoredBytes;
    await expect(saveSourceFile("source-1", file, "org-1")).rejects.toBeInstanceOf(OrgStorageQuotaError);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("inserts when the upload still fits", async () => {
    await expect(saveSourceFile("source-1", file, "org-1")).resolves.toBe(true);
    expect(insertValues).toHaveBeenCalledOnce();
  });

  it("locks the organization, then counts, then inserts, so a second upload sees the first", async () => {
    const order: string[] = [];
    execute.mockImplementation(async (query: unknown) => {
      const text = sqlText(query);
      if (text.includes("pg_advisory_xact_lock")) {
        order.push("lock");
        expect(text).toContain("kb-org-files:org-1");
        return { rows: [] };
      }
      if (text.includes("SUM")) {
        order.push("sum");
        return { rows: [{ used: storedBytes.used }] };
      }
      return { rows: [] };
    });
    insertValues.mockImplementation(() => {
      order.push("insert");
    });

    storedBytes.used = knowledgeLimits.orgStoredBytes - file.size;
    await expect(saveSourceFile("source-1", file, "org-1")).resolves.toBe(true);
    await expect(saveSourceFile("source-2", file, "org-1")).rejects.toBeInstanceOf(OrgStorageQuotaError);

    expect(order).toEqual(["lock", "sum", "insert", "lock", "sum"]);
    expect(insertValues).toHaveBeenCalledOnce();
  });
});
