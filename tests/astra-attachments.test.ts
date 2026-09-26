/**
 * Attaching a file to a Cowork message.
 *
 * The last gap from the usability review, and the one people described
 * first: the surface where "here is the spreadsheet, what does it mean for my
 * agents" is the natural thing to say had no way to say it.
 *
 * Nothing here parses anything. The platform already uploads a file, extracts
 * its text and keeps the bytes, and already knows how to frame that text for a
 * model. This ties those to a conversation — which is also what lets deleting
 * the conversation take its attachments with it.
 *
 * The split that matters: the model reads the extracted text, the transcript
 * shows the file's name. A conversation with a spreadsheet pasted into it is
 * unreadable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { attachedLine } from "../server/astra/engine";
import { MAX_FILES, chipLabel, filesFrom, readyToSend, sizeLabel, sortIncoming } from "../client/src/astra/attach";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const engine = read("server", "astra", "engine.ts");
const server = read("server", "astra", "attachments.ts");
const routes = read("server", "routes", "astra.ts");
const composer = read("client", "src", "astra", "composer.tsx");
const thread = read("client", "src", "astra", "thread.tsx");
const layout = read("client", "src", "astra", "astra-layout.tsx");
const actions = read("server", "astra", "thread-actions.ts");
const db = read("server", "db.ts");

const file = (name: string, size: number) => ({ name, size }) as File;

describe("what can be attached", () => {
  it("takes what fits and says what didn't, rather than refusing the lot", () => {
    const { accepted, refusals } = sortIncoming([file("a.pdf", 1000), file("huge.pdf", 30 * 1024 * 1024)], 0);
    expect(accepted.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(refusals[0]).toContain("huge.pdf is 30.0 MB");
  });

  it("stops at five per message, counting what is already attached", () => {
    const { accepted, refusals } = sortIncoming([file("a", 1), file("b", 1), file("c", 1)], MAX_FILES - 1);
    expect(accepted).toHaveLength(1);
    expect(refusals).toHaveLength(2);
    expect(refusals[0]).toContain(`a message can carry ${MAX_FILES} files`);
  });

  it("won't take an empty file", () => {
    expect(sortIncoming([file("empty.csv", 0)], 0).refusals[0]).toContain("empty.csv is empty");
  });

  it("says sizes the way a person does", () => {
    expect(sizeLabel(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(sizeLabel(2048)).toBe("2 KB");
    expect(sizeLabel(10)).toBe("1 KB");
  });
});

describe("the chips", () => {
  it("say what the reader made of the file, or what went wrong", () => {
    expect(chipLabel({ id: "1", filename: "q3.xlsx", kind: "xlsx" })).toBe("q3.xlsx · xlsx");
    expect(chipLabel({ id: "1", filename: "q3.xlsx", kind: null, uploading: true })).toBe("q3.xlsx — reading…");
    expect(chipLabel({ id: "1", filename: "q3.xlsx", kind: null, error: "Too big" })).toBe("q3.xlsx — Too big");
  });

  it("hold the message back until a file has finished being read", () => {
    expect(readyToSend("look at this", [{ id: "1", filename: "a", kind: null, uploading: true }])).toBe(false);
    expect(readyToSend("look at this", [{ id: "1", filename: "a", kind: "pdf" }])).toBe(true);
    // A file on its own is a message: "what do you make of this?"
    expect(readyToSend("", [{ id: "1", filename: "a", kind: "pdf" }])).toBe(true);
    expect(readyToSend("", [])).toBe(false);
    // One that failed isn't something to send.
    expect(readyToSend("", [{ id: "1", filename: "a", kind: null, error: "no" }])).toBe(false);
  });
});

describe("three ways in", () => {
  it("a click, a paste and a drop all arrive the same way", () => {
    const dropped = { items: [{ kind: "file", getAsFile: () => file("dropped.csv", 10) }], files: [] } as unknown as DataTransfer;
    expect(filesFrom(dropped).map((f) => f.name)).toEqual(["dropped.csv"]);
    // A folder drop yields no files rather than an error.
    const folder = { items: [{ kind: "string", getAsFile: () => null }], files: [] } as unknown as DataTransfer;
    expect(filesFrom(folder)).toEqual([]);
    expect(filesFrom(null)).toEqual([]);
  });

  it("the paperclip and paste live on the composer", () => {
    expect(composer).toContain('data-testid="astra-attach"');
    expect(composer).toContain("const pasted = filesFrom(e.clipboardData);");
  });

  it("the drop target is the whole conversation, not a small button", () => {
    expect(thread).toContain('data-testid="astra-drop-target"');
    expect(thread).toContain("Drop to attach to your next message");
    // Dragging over a child shouldn't flicker the target off.
    expect(thread).toContain("if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;");
  });

  it("uploads as soon as a file is chosen, not when the message is sent", () => {
    expect(layout).toContain('await fetch("/api/files/upload"');
    expect(layout).toContain("uploading: true");
  });
});

describe("what the model sees and what the conversation shows", () => {
  it("are different: the text for one, the names for the other", () => {
    expect(attachedLine(["q3.xlsx", "notes.pdf"])).toBe("_Attached: q3.xlsx, notes.pdf_");
    expect(engine).toContain("cp.messages.push({ role: \"user\", content: attachments?.context ? `${userText}\\n\\n${attachments.context}` : userText });");
    expect(engine).toContain("markdown: attachments?.names.length ? `${userText}\\n\\n${attachedLine(attachments.names)}` : userText,");
  });

  it("reuses the platform's own extraction and framing", () => {
    expect(server).toContain("buildAttachmentContext(kept, orgId)");
    expect(server).not.toContain("extractTextFromFile");
  });
});

describe("whose file it is", () => {
  it("is stamped onto the conversation when the message is sent", () => {
    // A file is attached before a new conversation exists.
    expect(server).toContain(".set({ threadId, context: \"cowork\" })");
    expect(routes).toContain("const attached = await attachFilesToThread(parsed.data.fileIds ?? [], ctx.orgId, threadId);");
  });

  it("can't be taken from another organization or another conversation", () => {
    expect(server).toContain("eq(uploadedFiles.organizationId, orgId)");
    expect(server).toContain("or(isNull(uploadedFiles.threadId), eq(uploadedFiles.threadId, threadId))");
  });

  it("goes when the conversation does, and the plan says so first", () => {
    expect(actions).toContain("await deleteThreadAttachments(threadId, actor.orgId);");
    expect(actions).toContain('goes.push(`${plural(attached.length, "attached file")}');
    expect(db).toContain("ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS thread_id VARCHAR;");
  });
});
