/**
 * "/" commands in the Cowork composer. A command is a shortcut to something
 * Cowork already does: most send a written message, so the answer still comes
 * from a tool with its proof and a change still waits for its confirmation
 * card. Commands this role can't use are never offered, and an unknown one
 * says so instead of being sent to the model.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { SLASH_COMMANDS, applyCommand, fillArg, findSlashQuery, rankCommands, resolveSlash, type SlashCommand } from "../client/src/astra/slash";

const all = () => true;
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const byName = (n: string) => SLASH_COMMANDS.find((c) => c.name === n)!;

describe("typing a command", () => {
  it("only at the very start: a slash mid-sentence is a date or a path", () => {
    expect(findSlashQuery("/ru", 3)?.query).toBe("ru");
    expect(findSlashQuery("due 21/09 ok", 8)).toBeNull();
    expect(findSlashQuery("see docs/readme", 15)).toBeNull();
  });

  it("knows the command once it's typed, and what follows it", () => {
    const q = findSlashQuery("/run Invoice", 12);
    expect(q?.command?.name).toBe("run");
    expect(q?.rest).toBe("Invoice");
  });

  it("stops offering anything once the text isn't a command at all", () => {
    expect(findSlashQuery("/nonsense and more", 18)).toBeNull();
  });
});

describe("the menu", () => {
  it("ranks by name, then label", () => {
    expect(rankCommands("app", all).map((c) => c.name)).toEqual(["approvals", "approve"]);
    expect(rankCommands("polic", all)[0].name).toBe("policies");
  });

  it("leaves out commands this role can't use", () => {
    const viewer = (p?: string) => p !== "approve_changes" && p !== "view_traces" && p !== "create_modify_outcomes";
    const names = rankCommands("", viewer as any, SLASH_COMMANDS, 50).map((c) => c.name);
    expect(names).not.toContain("approve");
    expect(names).not.toContain("spend");
    expect(names).toContain("needs");
  });

  it("picking one leaves it ready for its argument", () => {
    expect(applyCommand(byName("run"))).toEqual({ text: "/run ", caret: 5 });
    expect(applyCommand(byName("approvals")).text).toBe("/approvals");
  });
});

describe("sending", () => {
  it("sends the command's own wording, with what you typed", () => {
    expect(resolveSlash("/needs")).toEqual({ action: "send", text: "Show me everything that needs my decision." });
    expect(resolveSlash("/knowledge what is our refund window")).toEqual({ action: "send", text: "Search our knowledge bases for: what is our refund window" });
  });

  it("opens a page for a go command", () => {
    expect(resolveSlash("/approvals")).toEqual({ action: "go", href: "/approvals" });
    expect(resolveSlash("/library")).toEqual({ action: "go", href: "library" });
  });

  it("asks for the missing argument rather than sending half a request", () => {
    const r = resolveSlash("/run");
    expect(r).toMatchObject({ action: "need_arg" });
    expect((r as any).command.arg.label).toBe("which agent");
  });

  it("says so, with the closest match, when there's no such command", () => {
    expect(resolveSlash("/aprove ap-1")).toMatchObject({ action: "unknown", typed: "aprove", suggestion: { name: "approve" } });
  });

  it("a picked item goes into the message by name and id, so Astra can find it", () => {
    expect(fillArg(byName("approve"), '"Launch readiness" (approval ap-1)')).toBe('Show me "Launch readiness" (approval ap-1) so I can approve it.');
    expect(fillArg(byName("reject"), '"Launch readiness" (approval ap-1)')).toContain("Ask me why first.");
  });
});

describe("what the commands promise", () => {
  it("every ask command has wording and every go command a destination", () => {
    for (const c of SLASH_COMMANDS) {
      if (c.kind === "ask") expect(typeof c.ask, c.name).toBe("function");
      else expect(c.href, c.name).toBeTruthy();
    }
  });

  it("a required argument always has a picker or is free text", () => {
    const withArg = SLASH_COMMANDS.filter((c) => c.arg?.required) as SlashCommand[];
    expect(withArg.length).toBeGreaterThan(3);
    for (const c of withArg) expect(["agent", "team", "decision", "text"]).toContain(c.arg!.kind);
  });

  it("nothing a command sends decides anything by itself", () => {
    // Every one asks to be shown the thing, or to do work Astra will confirm first.
    for (const c of SLASH_COMMANDS.filter((c) => c.kind === "ask")) {
      const text = c.ask!("X");
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/^(approve|reject|delete|deploy) /i);
    }
  });
});

describe("the composer", () => {
  const composer = read("client", "src", "astra", "composer.tsx");

  it("shows the command menu instead of the @ menu while a command is being typed", () => {
    expect(composer).toContain("const menuOpen = !slashMenu &&");
  });

  it("names both triggers in the placeholder", () => {
    expect(read("client", "src", "astra", "thread.tsx")).toContain("Ask Astra, / for a command, @ for one of your agents");
  });

  it("pickers read what's really there: your agents, your teams, and what's waiting on you", () => {
    const layout = read("client", "src", "astra", "astra-layout.tsx");
    expect(layout).toContain("(needsYou?.needsDecision ?? [])");
    expect(layout).toContain(".filter((i) => i.canDecideHere)");
    expect(composer).toContain('rankMentionables(mentionables.filter((m) => (m.kind ?? "agent") === wanted)');
  });
});
