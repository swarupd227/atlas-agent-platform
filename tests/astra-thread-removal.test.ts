/**
 * Deleting a Cowork conversation.
 *
 * Cowork became the default surface and nothing ever removed a thread, so the
 * rail only grew. What makes this delete different from the platform's others
 * is that almost nothing in a conversation is in the conversation: the outcome
 * Astra created, the team it built, the approval decided on a card all live
 * elsewhere. Deleting takes the transcript, not the work — and the dialog has
 * to say so, or people will think they are undoing something.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MemoryThreadStore } from "../server/astra/memory-store";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const routes = read("server", "routes", "astra.ts");
const rail = read("client", "src", "astra", "rail.tsx");
const dialog = read("client", "src", "components", "remove-dialog.tsx");
const store = read("server", "astra", "store.ts");

const audits: any[] = [];
vi.mock("../server/storage", () => ({ storage: { createAuditEvent: vi.fn(async (e: any) => { audits.push(e); return e; }) } }));

const { planThreadRemoval, removeThread, ThreadRemovalError } = await import("../server/astra/thread-actions");

const ORG = "org-a";
const actor = { orgId: ORG, userId: "user-1", actorLabel: "admin" };

let threads: MemoryThreadStore;
let threadId: string;

beforeEach(async () => {
  audits.length = 0;
  threads = new MemoryThreadStore();
  threadId = threads.createThread(ORG);
  await threads.appendMessage(ORG, { threadId, role: "user", markdown: "Build me a team" } as any);
  await threads.appendMessage(ORG, { threadId, role: "assistant", markdown: "Here is the plan" } as any);
});

describe("what deleting a conversation takes", () => {
  it("counts the messages, and says the work itself stays", async () => {
    const plan = await planThreadRemoval(threads as any, actor, threadId);
    expect(plan.goes).toEqual(["2 messages in this conversation"]);
    expect(plan.stays[0]).toContain("anything Astra did here");
    expect(plan.stays[1]).toContain("the audit trail keeps who asked for it");
  });

  it("warns that a waiting confirmation is dropped, and nothing it asked for happens", async () => {
    await threads.saveState(threadId, ORG, { status: "awaiting_confirmation", checkpoint: { messages: [] } as any, pendingAction: { id: "act-1" } as any });
    const plan = await planThreadRemoval(threads as any, actor, threadId);
    expect(plan.warning).toContain("drops that request");
    expect(plan.warning).toContain("nothing it was asking for will be done");
  });

  it("refuses a conversation the caller can't open", async () => {
    await expect(planThreadRemoval(threads as any, { ...actor, orgId: "org-b" }, threadId)).rejects.toBeInstanceOf(ThreadRemovalError);
  });
});

describe("deleting it", () => {
  it("takes the thread and its messages", async () => {
    const result = await removeThread(threads as any, actor, threadId);
    expect(result).toMatchObject({ deleted: true });
    expect(await threads.loadThread(threadId, ORG)).toBeNull();
    expect(threads.messages.filter((m) => m.threadId === threadId)).toHaveLength(0);
  });

  it("won't delete one mid-turn, and says to wait", async () => {
    await threads.saveState(threadId, ORG, { status: "running", checkpoint: { messages: [] } as any, pendingAction: null });
    await expect(removeThread(threads as any, actor, threadId)).rejects.toThrow("Wait for the turn to finish");
    // Still there: a running turn would otherwise resurrect it as a stub when it saved.
    expect(await threads.loadThread(threadId, ORG)).not.toBeNull();
  });

  it("records it in the audit trail, which is the only thing that keeps it", async () => {
    await removeThread(threads as any, actor, threadId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "conversation_deleted", objectType: "astra_thread", actorId: "user-1" });
    expect(JSON.parse(audits[0].details).via).toBe("Astra Cowork");
  });
});

describe("the store", () => {
  it("checks the conversation is the caller's before deleting, not just the organization's", () => {
    const at = store.indexOf("async deleteThread(");
    const body = store.slice(at, store.indexOf("\n  async ", at + 10));
    expect(body).toContain("canAccessThread(");
    expect(body).toContain('if (row.status === "running") return false;');
    // Messages first: they are the thread's, and nothing else references them.
    expect(body.indexOf("delete(astraMessages)")).toBeLessThan(body.indexOf("delete(astraThreads)"));
  });
});

describe("the rail", () => {
  it("puts the delete beside the row, not inside it", () => {
    // A button inside a button is invalid, and clicking delete must not open
    // the conversation.
    expect(rail).toContain('noun="conversation"');
    expect(rail).toContain("iconOnly");
    expect(rail).toContain("onDeleted={() => { if (t.id === activeId) onNew(); }}");
  });

  it("keeps the ✕ quiet until the row is hovered or focused", () => {
    expect(dialog).toContain("opacity-0 transition-opacity");
    expect(dialog).toContain("group-hover:opacity-100");
    expect(dialog).toContain("focus:opacity-100");
    expect(dialog).toContain("aria-label={`Delete ${noun} ${name}`}");
  });
});

describe("the routes", () => {
  it("are behind the permission that uses Cowork at all", () => {
    expect(routes).toContain('router.get("/api/astra/threads/:id/removal", checkPermission("use_astra")');
    expect(routes).toContain('router.delete("/api/astra/threads/:id", checkPermission("use_astra")');
  });
});
