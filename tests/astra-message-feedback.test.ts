/**
 * Rating an answer, where the answer is.
 *
 * The last gap from the Cowork usability review but one. The platform has a
 * Feedback page and a store behind it; the only way in was a form on another
 * screen, so telling anyone an answer was wrong meant describing from memory
 * something you were looking at.
 *
 * A rating goes to that same store rather than a new one — the people who
 * triage feedback already read it — carrying the question and the start of the
 * answer, because "that was wrong" without the exchange is unactionable. The
 * UI says so before it sends.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { excerpt, feedbackText } from "../server/astra/message-feedback";
import { sentLine } from "../client/src/astra/message-feedback";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const routes = read("server", "routes", "astra.ts");
const ui = read("client", "src", "astra", "message-feedback.tsx");
const thread = read("client", "src", "astra", "thread.tsx");

const rows: any[] = [];
vi.mock("../server/db", () => ({
  db: { insert: () => ({ values: (v: any) => ({ returning: async () => { rows.push(v); return [{ id: "fb-1", ...v }]; } }) }) },
}));

const { recordMessageFeedback, MessageFeedbackError } = await import("../server/astra/message-feedback");

const ORG = "org-a";
const actor = { orgId: ORG, userId: "user-1", actorLabel: "admin" };
const messages = [
  { id: "m1", role: "user", markdown: "Which agents serve the fleet outcome?" },
  { id: "m2", role: "astra", markdown: "Four agents are bound to it: " + "x".repeat(900) },
] as any[];

const store = {
  getThreadForCaller: async (threadId: string, orgId: string) =>
    threadId === "t1" && orgId === ORG ? { thread: { id: "t1", title: "Fleet" } as any, messages } : null,
};

beforeEach(() => { rows.length = 0; });

describe("what gets recorded", () => {
  it("leads with the verdict, then the note, then the exchange", () => {
    const text = feedbackText("down", "It missed two agents", "Which agents serve the fleet outcome?", "Four agents are bound to it.");
    expect(text.startsWith("Rated not helpful in Astra Cowork.")).toBe(true);
    expect(text).toContain("What they said: It missed two agents");
    expect(text).toContain("They asked: Which agents serve the fleet outcome?");
    expect(text).toContain("Astra answered: Four agents are bound to it.");
  });

  it("keeps a thumb up without a note just as readable", () => {
    const text = feedbackText("up", null, "Anything waiting on me?", "Two approvals.");
    expect(text.startsWith("Rated helpful in Astra Cowork.")).toBe(true);
    expect(text).not.toContain("What they said");
  });

  it("trims a long answer rather than pasting the whole thing", () => {
    expect(excerpt("y".repeat(1000)).endsWith("…")).toBe(true);
    expect(excerpt("short answer")).toBe("short answer");
    // Markdown's line breaks would make the feedback list unreadable.
    expect(excerpt("one\n\ntwo   three")).toBe("one two three");
  });
});

describe("recording it", () => {
  it("writes to the platform's own feedback store, tagged as Cowork", async () => {
    await recordMessageFeedback(store, actor, { threadId: "t1", messageId: "m2", rating: "down", note: "Missed two" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ featureArea: "Astra Cowork", subFeature: "conversation t1", submittedBy: "admin", status: "open" });
    // A complaint is a bug to triage; a compliment isn't.
    expect(rows[0].feedbackType).toBe("bug");
  });

  it("files a thumb up as general rather than a bug", async () => {
    await recordMessageFeedback(store, actor, { threadId: "t1", messageId: "m2", rating: "up" });
    expect(rows[0].feedbackType).toBe("general");
  });

  it("attaches the question that answer was answering", async () => {
    await recordMessageFeedback(store, actor, { threadId: "t1", messageId: "m2", rating: "down" });
    expect(rows[0].feedbackText).toContain("They asked: Which agents serve the fleet outcome?");
  });

  it("refuses a conversation that isn't the caller's, and a message that isn't in it", async () => {
    await expect(recordMessageFeedback(store, { ...actor, orgId: "org-b" }, { threadId: "t1", messageId: "m2", rating: "up" }))
      .rejects.toBeInstanceOf(MessageFeedbackError);
    await expect(recordMessageFeedback(store, actor, { threadId: "t1", messageId: "nope", rating: "up" }))
      .rejects.toThrow("No message with that id");
    expect(rows).toHaveLength(0);
  });

  it("won't rate the user's own message", async () => {
    await expect(recordMessageFeedback(store, actor, { threadId: "t1", messageId: "m1", rating: "up" }))
      .rejects.toThrow("Only Astra's answers can be rated.");
  });
});

describe("the buttons", () => {
  it("ask why on a thumb down, and let it be skipped", () => {
    expect(ui).toContain("What was wrong with it? (optional)");
    expect(ui).toContain('data-testid="astra-feedback-note"');
    // A thumb up sends straight away: making people explain praise loses it.
    expect(ui).toContain('onClick={() => void send("up")}');
  });

  it("say where it goes before it goes", () => {
    expect(ui).toContain("Goes to the Feedback page with your question and the start of this answer.");
    expect(sentLine("down")).toContain("Sent to the Feedback page");
    expect(sentLine("up")).toContain("Feedback page");
  });

  it("are only on Astra's answers", () => {
    expect(thread).toContain('{message.role === "astra" && message.threadId && (');
    expect(thread).toContain("<MessageFeedback threadId={message.threadId} messageId={message.id} />");
  });

  it("are behind the permission that uses Cowork", () => {
    expect(routes).toContain('router.post("/api/astra/threads/:id/messages/:messageId/feedback", checkPermission("use_astra")');
  });
});
