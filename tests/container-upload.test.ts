import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ensureContainerFileIds — the step that hands a code-execution agent the REAL
 * file instead of the flattened text.
 *
 * The behaviour that matters here is what it does NOT do: it must not re-upload
 * a file it has already sent, must not send bytes it does not have, and must
 * not throw when Anthropic refuses. The extracted text is already in the
 * prompt, so a failure here should degrade the answer, never break the run.
 */

let rows: any[] = [];
const updates: Array<{ id: string; anthropicFileId: string }> = [];

vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
    update: () => ({
      set: (vals: any) => ({
        where: (w: any) => {
          // The mock cannot read drizzle's where-clause, so record the value and
          // let the tests assert on how many writes happened and with what id.
          updates.push({ id: w?.__id ?? "(unknown)", anthropicFileId: vals.anthropicFileId });
          return Promise.resolve();
        },
      }),
    }),
  },
}));

const uploadMock = vi.fn();
vi.mock("../server/llm-provider", () => ({
  getAnthropicRawClient: async () => ({ beta: { files: { upload: uploadMock } } }),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  toFile: async (buf: Buffer, name: string, opts: any) => ({ buf, name, type: opts?.type }),
}));

vi.mock("../server/storage", () => ({ storage: {} }));
vi.mock("../server/tool-dispatcher", () => ({ evaluateActionPolicy: vi.fn() }));

import { ensureContainerFileIds } from "../server/anthropic-code-execution";

const row = (over: any = {}) => ({
  id: "f1",
  filename: "book.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  content: Buffer.from("PKfake"),
  anthropicFileId: null,
  organizationId: "org",
  ...over,
});

beforeEach(() => {
  rows = [];
  updates.length = 0;
  uploadMock.mockReset();
  uploadMock.mockResolvedValue({ id: "file_abc" });
});

describe("ensureContainerFileIds", () => {
  it("returns nothing and never calls Anthropic for an empty list", async () => {
    expect(await ensureContainerFileIds([], "org")).toEqual([]);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads the bytes and returns the new file id", async () => {
    rows = [row()];
    const ids = await ensureContainerFileIds(["f1"], "org");
    expect(ids).toEqual(["file_abc"]);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    // The real filename and mime type go up, so the container sees a .xlsx
    // rather than an unnamed blob the runtime cannot open.
    const sent = (uploadMock.mock.calls[0][0] as any).file;
    expect(sent.name).toBe("book.xlsx");
    expect(sent.type).toContain("spreadsheetml");
  });

  it("reuses an id it already has instead of paying for a second upload", async () => {
    rows = [row({ anthropicFileId: "file_existing" })];
    const ids = await ensureContainerFileIds(["f1"], "org");
    expect(ids).toEqual(["file_existing"]);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("caches the id back to the row so the next turn reuses it", async () => {
    rows = [row()];
    await ensureContainerFileIds(["f1"], "org");
    expect(updates).toHaveLength(1);
    expect(updates[0].anthropicFileId).toBe("file_abc");
  });

  it("skips a row with no stored bytes rather than failing the run", async () => {
    // Rows uploaded before bytes were retained; the text path still works.
    rows = [row({ content: null })];
    expect(await ensureContainerFileIds(["f1"], "org")).toEqual([]);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("survives an Anthropic failure and returns the files that did work", async () => {
    rows = [row({ id: "a", filename: "bad.xlsx" }), row({ id: "b", filename: "good.xlsx" })];
    uploadMock
      .mockRejectedValueOnce(new Error("413 payload too large"))
      .mockResolvedValueOnce({ id: "file_good" });

    const ids = await ensureContainerFileIds(["a", "b"], "org");
    // One bad file must not discard the other, and must not throw: the turn
    // still has the extracted text to answer from.
    expect(ids).toEqual(["file_good"]);
  });

  it("preserves the order the user attached them in", async () => {
    rows = [
      row({ id: "second", filename: "2.xlsx", anthropicFileId: "file_2" }),
      row({ id: "first", filename: "1.xlsx", anthropicFileId: "file_1" }),
    ];
    expect(await ensureContainerFileIds(["first", "second"], "org")).toEqual(["file_1", "file_2"]);
  });

  it("ignores an id that resolved to no row (another org's file)", async () => {
    rows = [row({ id: "mine", anthropicFileId: "file_mine" })];
    expect(await ensureContainerFileIds(["mine", "someone-elses"], "org")).toEqual(["file_mine"]);
  });
});
