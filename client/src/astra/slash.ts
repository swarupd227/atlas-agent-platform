/**
 * "/" commands in the Cowork composer. Pure: no React, no DOM.
 *
 * A command is a shortcut to something Cowork can already do. Most send a
 * written message (the same thing the Decide buttons do), so the answer still
 * comes from a tool with its proof, and anything that changes the platform
 * still waits for its confirmation card. A few only navigate.
 *
 * Commands whose tool this role can't use are left out of the menu, so it
 * never offers something that would then refuse.
 */
import type { PermissionAction } from "@/components/role-provider";

/** What the command needs after it, and where the picker gets the options. */
export type SlashArg =
  | { kind: "agent"; label: string; required: true }
  | { kind: "team"; label: string; required: true }
  | { kind: "decision"; label: string; required: true }
  | { kind: "text"; label: string; required?: boolean };

export interface SlashCommand {
  name: string;
  /** ask: sends a message. go: opens a page. */
  kind: "ask" | "go";
  label: string;
  hint: string;
  /** Hidden from the menu when this role can't do it. */
  permission?: PermissionAction;
  arg?: SlashArg;
  /** What the picker puts into the message: the thing's name, or its id when the command needs one. */
  argValue?: "name" | "id";
  /** ask: the message to send. */
  ask?: (arg: string) => string;
  /** go: where to open, inside the shell (~ prefixed by the caller). */
  href?: string;
  /** go with an argument: where the picked thing lives. */
  hrefFor?: (arg: string) => string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // ── Decisions ──
  { name: "needs", kind: "ask", label: "What needs me", hint: "Everything waiting on your decision", ask: () => "Show me everything that needs my decision." },
  {
    name: "approve", kind: "ask", label: "Approve something", hint: "Pick what's waiting and approve it", permission: "approve_changes",
    arg: { kind: "decision", label: "which one", required: true },
    ask: (a) => `Show me ${a} so I can approve it.`,
  },
  {
    name: "reject", kind: "ask", label: "Reject something", hint: "Pick what's waiting and turn it down", permission: "approve_changes",
    arg: { kind: "decision", label: "which one", required: true },
    ask: (a) => `Show me ${a} so I can reject it. Ask me why first.`,
  },
  // ── Work ──
  {
    name: "run", kind: "ask", label: "Run an agent", hint: "Give one of your agents a piece of work",
    arg: { kind: "agent", label: "which agent", required: true },
    ask: (a) => `Ask @${a} to do this: `,
  },
  {
    name: "team", kind: "ask", label: "Run a team", hint: "Start a team on a piece of work",
    arg: { kind: "team", label: "which team", required: true },
    ask: (a) => `Run the team @${a} on: `,
  },
  {
    name: "team-plan", kind: "ask", label: "Plan a team for some work", hint: "Describe the process; no outcome needed", permission: "create_modify_blueprints",
    arg: { kind: "text", label: "the work", required: true },
    ask: (a) => `Plan a team for this work: ${a}`,
  },
  { name: "status", kind: "ask", label: "What's running", hint: "Runs in progress and what they're waiting on", ask: () => "What's running right now, and what is each run waiting on?" },
  // ── Build ──
  {
    name: "outcome", kind: "ask", label: "Turn a goal into an outcome", hint: "Describe the goal in your own words", permission: "create_modify_outcomes",
    arg: { kind: "text", label: "the goal" },
    ask: (a) => (a ? `Turn this goal into an outcome: ${a}` : "I want to turn a goal into an outcome. Ask me what I'm trying to achieve."),
  },
  {
    name: "connect", kind: "ask", label: "Find a connector", hint: "What your agents can be given access to",
    arg: { kind: "text", label: "what you need" },
    ask: (a) => (a ? `Which connectors can my agents use for ${a}?` : "What connectors can my agents use, and which are connected?"),
  },
  {
    name: "knowledge", kind: "ask", label: "Search knowledge", hint: "Ask a question of a knowledge base",
    arg: { kind: "text", label: "your question", required: true },
    ask: (a) => `Search our knowledge bases for: ${a}`,
  },
  // ── Check ──
  {
    name: "policies", kind: "ask", label: "Policies on an agent", hint: "What an agent is held to, and what's blocked",
    arg: { kind: "agent", label: "which agent", required: true },
    ask: (a) => `Which policies apply to @${a}, and which tools do they block?`,
  },
  {
    name: "evals", kind: "ask", label: "How an agent is tested", hint: "Its eval runs and the latest pass rate",
    arg: { kind: "agent", label: "which agent", required: true },
    ask: (a) => `How is @${a} doing on its evals, and when did it last run?`,
  },
  { name: "spend", kind: "ask", label: "What it cost", hint: "Model spend recorded on runs this week", permission: "view_traces", ask: () => "What have our runs cost this week, and which agents cost the most?" },
  { name: "industry", kind: "ask", label: "Industry context", hint: "The industry and regulations that apply", ask: () => "What industry and regulatory context applies to us?" },
  // ── Go ──
  { name: "approvals", kind: "go", label: "Open Approvals", hint: "The full queue with evidence", href: "/approvals" },
  { name: "governance", kind: "go", label: "Open Governance", hint: "Policies, exceptions and regulations", href: "/governance" },
  { name: "deployments", kind: "go", label: "Open Deployments", hint: "What's released where", href: "/deployments" },
  { name: "agents", kind: "go", label: "Open Agents", hint: "Every agent and team", href: "/agents" },
  {
    name: "agent", kind: "go", label: "Open one agent", hint: "Its runs, setup, rules and releases",
    arg: { kind: "agent", label: "which agent", required: true },
    argValue: "id",
    hrefFor: (id) => `/agents/${encodeURIComponent(id)}`,
  },
  { name: "teams", kind: "go", label: "Open Teams", hint: "The registry on its Teams view", href: "/agents/teams" },
  { name: "library", kind: "go", label: "Open the Library", hint: "Everything this organization has", href: "library" },
  { name: "new", kind: "go", label: "New conversation", hint: "Start a fresh thread", href: "new" },
];

const MAX_QUERY = 60;

export interface SlashQuery {
  /** What's typed after the "/", up to the caret. */
  query: string;
  /** The command once it's been typed in full and followed by a space. */
  command: SlashCommand | null;
  /** What's typed after the command name. */
  rest: string;
}

/**
 * The command being typed, if any. Only at the very start of the message: a
 * "/" mid-sentence is a date or a path, not a command.
 */
export function findSlashQuery(text: string, caret: number, commands = SLASH_COMMANDS): SlashQuery | null {
  if (!text.startsWith("/") || caret < 1) return null;
  const line = text.slice(1);
  if (/[\n\r]/.test(line) || line.length > MAX_QUERY + 200) return null;
  const space = line.indexOf(" ");
  if (space < 0) return { query: line.slice(0, MAX_QUERY), command: null, rest: "" };
  const name = line.slice(0, space).toLowerCase();
  const command = commands.find((c) => c.name === name) ?? null;
  // "/nonsense more words" is not a command being typed; the menu closes and sending says so.
  if (!command) return null;
  return { query: name, command, rest: line.slice(space + 1) };
}

/** Commands matching what's typed: name first, then label; only those this role can use. */
export function rankCommands(query: string, allowed: (p?: PermissionAction) => boolean, commands = SLASH_COMMANDS, limit = 8): SlashCommand[] {
  const q = query.trim().toLowerCase();
  const usable = commands.filter((c) => allowed(c.permission));
  if (!q) return usable.slice(0, limit);
  const score = (c: SlashCommand) => {
    if (c.name.startsWith(q)) return 0;
    if (c.label.toLowerCase().startsWith(q)) return 1;
    if (c.name.includes(q) || c.label.toLowerCase().includes(q)) return 2;
    return -1;
  };
  return usable
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s >= 0)
    .sort((x, y) => x.s - y.s || x.c.name.localeCompare(y.c.name))
    .slice(0, limit)
    .map((x) => x.c);
}

/** Picking a command from the menu: "/run ", ready for its argument. */
export function applyCommand(command: SlashCommand): { text: string; caret: number } {
  const text = command.kind === "go" ? `/${command.name}` : `/${command.name} `;
  return { text, caret: text.length };
}

/** How many single-character edits apart two words are, up to a small cap. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** The command a typo most likely meant, if any is close enough. */
export function closestCommand(typed: string, commands = SLASH_COMMANDS): SlashCommand | null {
  const scored = commands
    .map((c) => ({ c, d: c.name.startsWith(typed) || typed.startsWith(c.name) ? 0 : editDistance(typed, c.name) }))
    .sort((x, y) => x.d - y.d || x.c.name.localeCompare(y.c.name));
  return scored[0] && scored[0].d <= 2 ? scored[0].c : null;
}

export type SlashResult =
  | { action: "send"; text: string }
  | { action: "go"; href: string }
  | { action: "need_arg"; command: SlashCommand }
  | { action: "unknown"; typed: string; suggestion: SlashCommand | null };

/**
 * What sending a message starting with "/" should do. Anything else is an
 * ordinary message and isn't passed here.
 */
export function resolveSlash(text: string, commands = SLASH_COMMANDS): SlashResult {
  const line = text.slice(1).trim();
  const space = line.indexOf(" ");
  const name = (space < 0 ? line : line.slice(0, space)).toLowerCase();
  const rest = (space < 0 ? "" : line.slice(space + 1)).trim();
  const command = commands.find((c) => c.name === name);
  if (!command) {
    return { action: "unknown", typed: name, suggestion: closestCommand(name, commands) };
  }
  if (command.arg?.required && !rest) return { action: "need_arg", command };
  if (command.kind === "go") return { action: "go", href: command.hrefFor ? command.hrefFor(rest) : command.href! };
  return { action: "send", text: command.ask!(rest) };
}

/** The message a picked option produces: the command's own wording, filled in. */
export function fillArg(command: SlashCommand, value: string): string {
  return command.ask ? command.ask(value) : value;
}
