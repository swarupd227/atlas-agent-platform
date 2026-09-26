/**
 * Keeping a conversation: naming it, knowing when things happened, taking it
 * with you.
 *
 * From the Cowork usability review. A title was the first 60 characters of
 * whatever you typed first and could never be changed — which is also all the
 * rail and the ⌘K palette have to search by. Messages carried no time at all,
 * in a surface where one turn can run for minutes and you come back to it
 * later. And there was no way to get an exchange into a ticket except by
 * selecting it by hand.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { transcript, transcriptFilename, transcriptLine } from "../client/src/astra/transcript";
import { messageTime } from "../client/src/astra/thread";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const store = read("server", "astra", "store.ts");
const routes = read("server", "routes", "astra.ts");
const layout = read("client", "src", "astra", "astra-layout.tsx");
const title = read("client", "src", "astra", "conversation-title.tsx");
const thread = read("client", "src", "astra", "thread.tsx");

const msg = (over: Record<string, any> = {}) => ({ role: "astra", markdown: "The team is built.", createdAt: "2026-09-26T09:15:00.000Z", pendingAction: null, ...over }) as any;

describe("naming a conversation", () => {
  it("is a route of its own, and only for a conversation the caller can open", () => {
    expect(routes).toContain('router.patch("/api/astra/threads/:id", checkPermission("use_astra")');
    expect(store).toContain("async renameThread(threadId: string, orgId: string, userId: string | null, title: string)");
    expect(store).toContain("canAccessThread(");
  });

  it("tidies the name rather than storing whatever was typed", () => {
    const at = store.indexOf("async renameThread(");
    const body = store.slice(at, store.indexOf("\n  async ", at + 10));
    expect(body).toContain('const clean = title.replace(/\\s+/g, " ").trim().slice(0, 200);');
    // An empty name keeps the old one instead of leaving a blank row in the rail.
    expect(body).toContain("if (!clean) return toSummary(row);");
  });

  it("is edited where it is shown, and Escape puts it back", () => {
    expect(layout).toContain("<ConversationTitle");
    expect(title).toContain('if (e.key === "Enter") void save();');
    expect(title).toContain('if (e.key === "Escape") {');
    // Renaming to the same thing, or to nothing, asks the server for nothing.
    expect(title).toContain("if (!next || next === title) {");
  });
});

describe("when a message was written", () => {
  it("shows the clock today, and the day as well before that", () => {
    // Rendered through toLocaleTimeString, so the exact words are the
    // viewer's locale's business; what this pins is which parts are shown.
    const now = new Date("2026-09-26T18:00:00");
    const today = messageTime(new Date("2026-09-26T09:15:00").toISOString(), now);
    const earlier = messageTime(new Date("2026-09-24T09:15:00").toISOString(), now);
    expect(today).toContain("15");
    expect(today).not.toContain("24");
    expect(earlier).toContain("24");
    expect(earlier.length).toBeGreaterThan(today.length);
  });

  it("says nothing rather than an Invalid Date for a time it can't read", () => {
    expect(messageTime("not a date")).toBe("");
  });

  it("is a real time element, with the full timestamp on hover", () => {
    expect(thread).toContain("dateTime={message.createdAt}");
    expect(thread).toContain("title={new Date(message.createdAt).toLocaleString()}");
  });
});

describe("taking it with you", () => {
  it("writes the exchange as markdown, headed by the conversation's name", () => {
    const text = transcript("Rental fleet", [msg({ role: "user", markdown: "Build the team" }), msg()]);
    expect(text.startsWith("# Rental fleet")).toBe(true);
    expect(text).toContain("**You**");
    expect(text).toContain("**Astra**");
    expect(text).toContain("The team is built.");
  });

  it("notes a decision, because it changes what the reply above it means", () => {
    const line = transcriptLine(msg({ pendingAction: { decision: "confirmed" } }), "Astra");
    expect(line).toContain("You confirmed this");
    expect(transcriptLine(msg({ pendingAction: { decision: "declined" } }), "Astra")).toContain("You chose Not now");
  });

  it("leaves out messages with nothing in them", () => {
    expect(transcript("T", [msg({ markdown: "   " }), msg()]).split("---")).toHaveLength(1 + 1);
  });

  it("names the file after the conversation and the day", () => {
    expect(transcriptFilename("Rental fleet utilization!", new Date(2026, 8, 26))).toBe("rental-fleet-utilization-2026-09-26.md");
    expect(transcriptFilename("", new Date(2026, 8, 26))).toBe("conversation-2026-09-26.md");
  });

  it("is offered in the header, once there is something to copy", () => {
    expect(layout).toContain('testId="astra-copy-transcript"');
    expect(layout).toContain("thread.messages.length > 0");
  });
});
