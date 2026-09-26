/**
 * The small things a conversation needs: following without being dragged,
 * copying what came back, and asking again.
 *
 * From the Cowork usability review: the view scrolled to the bottom on every
 * new step, so reading anything while a turn ran was impossible; there was no
 * copy on a message or a code block; a typo meant retyping the message; and an
 * unsent draft followed you from one conversation into the next, because the
 * thread view was never keyed by the conversation it showed.
 *
 * Editing and asking again are deliberately NOT rewrites: this product keeps
 * what was said. Editing puts the old message back in the box, and asking
 * again sends a new message — the earlier exchange stays visible.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { COPIED_FOR_MS } from "../client/src/components/copy-button";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const thread = read("client", "src", "astra", "thread.tsx");
const layout = read("client", "src", "astra", "astra-layout.tsx");
const composer = read("client", "src", "astra", "composer.tsx");
const markdown = read("client", "src", "components", "markdown.tsx");
const copy = read("client", "src", "components", "copy-button.tsx");

describe("following a turn without being dragged", () => {
  it("only auto-scrolls while the reader is at the bottom", () => {
    expect(thread).toContain("if (!following) return;");
    expect(thread).toContain("setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX);");
  });

  it("offers the way back, and says when there is more coming", () => {
    expect(thread).toContain('data-testid="astra-jump-to-latest"');
    expect(thread).toContain('{streaming ? "Astra is still working — jump to latest" : "Jump to latest"}');
  });
});

describe("copying", () => {
  it("is offered on each of Astra's messages", () => {
    expect(thread).toContain('testId="astra-copy-message"');
    expect(thread).toContain("text={message.markdown}");
  });

  it("is offered on code blocks, attached after sanitising rather than written into the HTML", () => {
    // A button written into model-authored HTML would be stripped by DOMPurify
    // -- and shouldn't survive: nothing the model writes should add a control.
    expect(markdown).toContain('pre.querySelector("[data-code-copy]")');
    expect(markdown).toContain("button.addEventListener(\"click\"");
    expect(markdown).toContain("DOMPurify.sanitize");
  });

  it("copies the code, not the button's own label", () => {
    // The button lives inside the <pre>, so its text would join pre.textContent.
    expect(markdown).toContain('const source = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";');
    expect(markdown).toContain("await copyText(source)");
  });

  it("says it worked, and falls back rather than failing silently", () => {
    expect(COPIED_FOR_MS).toBeGreaterThan(0);
    expect(copy).toContain("navigator.clipboard?.writeText");
    expect(copy).toContain('document.execCommand("copy")');
    expect(copy).toContain('state === "failed" ? "Press Ctrl+C"');
  });
});

describe("asking again", () => {
  it("edits by putting the old message back in the box, not by rewriting it", () => {
    expect(thread).toContain('data-testid="astra-edit-message"');
    expect(layout).toContain("setComposerInsert({ text, nonce: Date.now(), replace: true })");
    // An insert can now replace the box; a mention still appends.
    expect(composer).toContain("insert.replace");
    expect(composer).toContain("? insert.text");
  });

  it("re-asks the last thing you asked, as a new message", () => {
    expect(thread).toContain('data-testid="astra-retry"');
    expect(layout).toContain('const lastAsked = [...thread.messages].reverse().find((m) => m.role === "user")?.markdown;');
  });

  it("offers it after an answer or an error, never mid-turn", () => {
    expect(thread).toContain('{onRetry && !streaming && !waiting && (last?.role === "astra" || error) && (');
    expect(thread).toContain('{error ? "Try that again" : "Ask again"}');
  });
});

describe("a draft belongs to its conversation", () => {
  it("the thread view is keyed by the conversation it shows", () => {
    expect(layout).toContain('key={threadId ?? "home"}');
  });
});
