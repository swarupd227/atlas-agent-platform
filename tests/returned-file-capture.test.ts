/**
 * Files an external tool returns in its result become run files.
 *
 * A connector that builds a document (live: a deck built by headless Claude
 * Code on a VM service) returned its file as base64 inside a JSON result:
 * nothing stored it, nothing could download it, and a reviewer had nothing to
 * inspect. It is now stored, marked like a built-in tool's file, and the bytes
 * never reach the model.
 */
import { describe, it, expect, vi } from "vitest";
import { captureReturnedFile, findReturnedFile, safeFilename, RETURNED_FILE_MAX_BYTES } from "../server/returned-file-capture";
import { collectRunFiles } from "../shared/run-files";

const MARKER = "__generatedFile";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const bytes = Buffer.from("PK\u0003\u0004 a small fake deck");
const b64 = bytes.toString("base64");

const deps = () => ({
  marker: MARKER,
  createFile: vi.fn(async (f: any) => ({ id: "file-1", filename: f.filename, mimeType: f.mimeType })),
});

describe("captureReturnedFile", () => {
  it("stores a returned deck, marks the result and removes the bytes before the model sees them", async () => {
    const d = deps();
    const result = { job_id: "j1", slides: 22, file: { filename: "creative-pack.pptx", mimeType: PPTX, contentBase64: b64 } };

    const out: any = await captureReturnedFile(result, { orgId: "org-1", agentId: "agent-1", toolName: "build_deck" }, d);

    expect(d.createFile).toHaveBeenCalledTimes(1);
    const stored = d.createFile.mock.calls[0][0];
    expect(stored.content.equals(bytes)).toBe(true);
    expect(stored).toMatchObject({ filename: "creative-pack.pptx", mimeType: PPTX, organizationId: "org-1", agentId: "agent-1" });
    expect(out[MARKER]).toEqual({ id: "file-1", filename: "creative-pack.pptx", mimeType: PPTX });
    expect(out.slides).toBe(22);
    expect(out.file.stored).toBe(true);
    expect(JSON.stringify(out)).not.toContain(b64);
  });

  it("takes the first entry of a files list and says the others were not stored", async () => {
    const d = deps();
    const result = { files: [{ filename: "a.pdf", mimeType: "application/pdf", contentBase64: b64 }, { filename: "b.pdf", mimeType: "application/pdf", contentBase64: b64 }] };
    const out: any = await captureReturnedFile(result, { agentId: "agent-1", toolName: "t" }, d);
    expect(d.createFile).toHaveBeenCalledTimes(1);
    expect(out.files[0].stored).toBe(true);
    expect(out.files[1]).toMatchObject({ stored: false });
    expect(JSON.stringify(out)).not.toContain(b64);
  });

  it("passes results without a file, and results already carrying a file, through unchanged", async () => {
    const d = deps();
    const plain = { ok: true, board_id: "b1" };
    expect(await captureReturnedFile(plain, { agentId: "a", toolName: "t" }, d)).toBe(plain);
    const builtin = { ok: true, [MARKER]: { id: "x" }, file: { filename: "x.pptx", mimeType: PPTX, contentBase64: b64 } };
    expect(await captureReturnedFile(builtin, { agentId: "a", toolName: "t" }, d)).toBe(builtin);
    expect(d.createFile).not.toHaveBeenCalled();
  });

  it("refuses executable or unknown types, but never fails the call and never keeps the bytes", async () => {
    const d = deps();
    const result = { file: { filename: "run.sh", mimeType: "application/x-sh", contentBase64: b64 } };
    const out: any = await captureReturnedFile(result, { agentId: "a", toolName: "t" }, d);
    expect(d.createFile).not.toHaveBeenCalled();
    expect(out.file).toMatchObject({ stored: false });
    expect(out.file.storeError).toContain("not accepted");
    expect(out[MARKER]).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain(b64);
  });

  it("reports a storage failure in the result instead of throwing", async () => {
    const d = { marker: MARKER, createFile: vi.fn(async () => { throw new Error("db down"); }) };
    const out: any = await captureReturnedFile({ file: { filename: "d.pptx", mimeType: PPTX, contentBase64: b64 } }, { agentId: "a", toolName: "t" }, d);
    expect(out.file).toMatchObject({ stored: false });
    expect(out[MARKER]).toBeUndefined();
  });
});

describe("findReturnedFile", () => {
  it("rejects non-base64 content, empty files and files over the size limit", () => {
    expect(findReturnedFile({ file: { filename: "a.pdf", mimeType: "application/pdf", contentBase64: "not base64 !!" } })).toMatchObject({ kind: "rejected" });
    expect(findReturnedFile({ file: { filename: "a.pdf", mimeType: "application/pdf", contentBase64: "" } })).toMatchObject({ kind: "rejected" });
    const huge = Buffer.alloc(RETURNED_FILE_MAX_BYTES + 1).toString("base64");
    expect(findReturnedFile({ file: { filename: "a.pdf", mimeType: "application/pdf", contentBase64: huge } })).toMatchObject({ kind: "rejected" });
  });

  it("ignores shapes that are not a file envelope", () => {
    expect(findReturnedFile({ file: "a.pdf" })).toEqual({ kind: "none" });
    expect(findReturnedFile({ file: { filename: "a.pdf" } })).toEqual({ kind: "none" });
    expect(findReturnedFile([{ file: {} }])).toEqual({ kind: "none" });
  });
});

describe("safeFilename", () => {
  it("keeps only a harmless base name", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\decks\\q2<draft>.pptx")).toBe("q2draft.pptx");
    expect(safeFilename("..")).toBe("file");
  });
});

describe("collectRunFiles (run monitor downloads)", () => {
  it("finds files at the top level and inside a nested team step, once each", () => {
    const f1 = { id: "f1", filename: "deck.pptx", mimeType: PPTX };
    const f2 = { id: "f2", filename: "report.pdf", mimeType: "application/pdf" };
    const state = {
      request: "x",
      deck_files: [f1],
      deck_result: { deck_assembler: "built", deck_assembler_files: [f1, f2] },
      notes: ["not", "files"],
    };
    expect(collectRunFiles(state)).toEqual([f1, f2]);
  });

  it("is empty for a state with no files", () => {
    expect(collectRunFiles({ request: "x", review: "PASS" })).toEqual([]);
    expect(collectRunFiles(null)).toEqual([]);
  });
});
