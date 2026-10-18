/**
 * How a proposed agent's connector bindings ({server, tool} named by the
 * model) resolve to the organization's real connectors, and what would stop
 * them working. Pure.
 *
 * resolveBindingServer is the matching rule team builds use to link
 * connectors (server/team-build.ts), so a proposal is judged exactly as it
 * will be built.
 */

/** Words that say what kind of thing a connector is, not which one it is. */
const GENERIC_NAME_WORDS = new Set([
  "the", "a", "an", "and", "of", "for", "to",
  "mcp", "server", "connector", "api", "service", "services", "platform",
  "system", "systems", "record", "engine", "queue", "store", "hub", "gateway",
]);

function nameTokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !GENERIC_NAME_WORDS.has(t));
}

/**
 * The connector a proposed binding means.
 *
 * Tried in order: the exact name; a name that wholly contains (or is contained
 * by) the proposed one; then the candidate sharing the most distinctive words
 * with it. Only a clear winner counts -- on a tie the old first-match rule
 * still answers, so an ambiguous one-word binding resolves as it always did.
 *
 * The best-match step is what stops a shared generic word from deciding.
 * Live 2026-09-24: "Surplus Lines Compliance & Bordereau Queue" resolved to
 * "Compliance Connector MCP Server" because the old rule matched a candidate's
 * FIRST WORD alone, and "Insurity Policy System of Record" resolved to
 * "Insurity Rating & Predict Engine" the same way. Both bound silently: the
 * builder reported nothing unresolved, the agent showed a connector, and the
 * failure only surfaced at run time as a clause reviewer refusing to certify
 * an endorsement because its verification tool "was not functional" -- it was
 * attached to a connector that does not have that tool.
 */
export function resolveBindingServer<T extends { name: string }>(serverName: string, servers: T[]): T | undefined {
  const want = serverName.trim().toLowerCase();

  const exact = servers.find((s) => s.name.trim().toLowerCase() === want);
  if (exact) return exact;

  const contained = servers.filter((s) => {
    const name = s.name.trim().toLowerCase();
    return name.includes(want) || want.includes(name);
  });
  if (contained.length === 1) return contained[0];

  const wanted = new Set(nameTokens(want));
  let best: T | undefined;
  let bestScore = 0;
  let tied = false;
  for (const server of servers) {
    const score = nameTokens(server.name).filter((t) => wanted.has(t)).length;
    if (score > bestScore) { best = server; bestScore = score; tied = false; }
    else if (score === bestScore && score > 0) { tied = true; }
  }
  if (best && bestScore > 0 && !tied) return best;

  // Ambiguous or nothing distinctive in common: the historical rule, so a
  // binding that used to resolve still resolves the same way.
  return contained[0]
    ?? servers.find((s) => want.includes(s.name.toLowerCase().split(" ")[0]));
}

/** How a declared tool name had to be fixed up before it resolved. */
export type DeclaredToolRepair = "normalised" | "composite";

export interface ResolvedDeclaredTool {
  /** The resolving name, in the casing the dispatchable set uses. */
  name: string;
  /** null when the declared name was already exactly a dispatchable one. */
  repaired: DeclaredToolRepair | null;
}

/**
 * The dispatchable tool a declared name means, if any.
 *
 * MEASURED, 2026-10-18, over 882 tool names declared by 451 agents: 199 of them
 * resolved to nothing. Counting stops there and supports exactly one fix --
 * drop them -- and that fix is wrong, because reading the 199 splits them:
 *
 *   "generate_pptx "                                        a real built-in, one trailing space
 *   "advantive one -- support triage engine: execute_query"  a real tool, with its connector
 *                                                           glued on; execute_query IS on
 *                                                           "Advantive ONE -- Support Triage Engine"
 *   "excel workbook generator"                              prose; a name with a space can
 *                                                           never be dispatched
 *   "policy_coverage_checker"                               invented, 9 agents
 *
 * 25 of the 199 named something that exists. Dropping an unresolvable name
 * would have deleted real capability from a quarter of the ones it touched, so
 * the order matters: normalise, re-resolve, and only judge what is left.
 *
 * Both composite separators were in the data -- "<connector>: <tool>" and
 * "<tool> - <connector>". A hyphen must have whitespace around it to count, so
 * an ordinary hyphenated tool name (`snow-search-incidents`) is not split apart.
 *
 * Ambiguity returns null rather than guessing. If two different parts of a
 * composite each resolve there is no way to tell which was meant, and a name
 * reported as unresolvable is recoverable by a person; a name silently bound to
 * the wrong tool is not.
 */
export function resolveDeclaredToolName(declared: string, dispatchable: Iterable<string>): ResolvedDeclaredTool | null {
  const canonical = new Map<string, string>();
  for (const name of dispatchable) {
    const key = String(name).trim().toLowerCase();
    if (key && !canonical.has(key)) canonical.set(key, String(name));
  }

  const trimmed = declared.trim();
  const direct = canonical.get(trimmed.toLowerCase());
  if (direct) return { name: direct, repaired: direct === declared ? null : "normalised" };

  // Only a separator with whitespace (or a colon/dash pair) splits, so a tool
  // name that merely contains a hyphen stays whole.
  const parts = trimmed.split(/\s*[:–—]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const hits = new Set<string>();
  for (const part of parts) {
    const hit = canonical.get(part.toLowerCase());
    if (hit) hits.add(hit);
  }
  if (hits.size !== 1) return null;
  return { name: Array.from(hits)[0], repaired: "composite" };
}

export type BindingIssueCode = "server_unresolved" | "server_not_connected" | "tool_not_on_server" | "server_no_tools_discovered";

export interface BindingIssue {
  agent: string;
  server: string;
  tool?: string;
  code: BindingIssueCode;
  message: string;
}

export interface BindingConnector {
  id: string;
  name: string;
  /** null for connectors that aren't enterprise integrations (no connection to check). */
  connected: boolean | null;
}

export interface ProposedAgentBindings {
  name: string;
  mcpToolBindings?: Array<{ server: string; tool: string }>;
}

export function assessProposalBindings(
  agents: ProposedAgentBindings[],
  connectors: BindingConnector[],
  toolNamesByConnectorId: Map<string, string[]>,
): { agents: Array<{ name: string; connectors: string[]; issues: BindingIssue[] }>; issues: BindingIssue[] } {
  const out = agents.map((agent) => {
    const issues: BindingIssue[] = [];
    const linked = new Set<string>();
    const bindings = agent.mcpToolBindings ?? [];
    const byServer = new Map<string, string[]>();
    for (const b of bindings) byServer.set(b.server, [...(byServer.get(b.server) ?? []), b.tool]);

    for (const [serverName, tools] of Array.from(byServer.entries())) {
      const connector = resolveBindingServer(serverName, connectors);
      if (!connector) {
        issues.push({ agent: agent.name, server: serverName, code: "server_unresolved", message: `${agent.name} names "${serverName}", which isn't a connector in this organization.` });
        continue;
      }
      linked.add(connector.name);
      if (connector.connected === false) {
        issues.push({ agent: agent.name, server: connector.name, code: "server_not_connected", message: `${connector.name} isn't connected, so ${agent.name}'s calls to it will fail until it is.` });
      }
      const known = toolNamesByConnectorId.get(connector.id) ?? [];
      if (known.length === 0) {
        issues.push({ agent: agent.name, server: connector.name, code: "server_no_tools_discovered", message: `${connector.name} has no discovered tools, so ${agent.name}'s tool names can't be checked.` });
        continue;
      }
      const knownLower = new Set(known.map((t) => t.toLowerCase()));
      for (const tool of Array.from(new Set(tools))) {
        if (!knownLower.has(tool.toLowerCase())) {
          issues.push({ agent: agent.name, server: connector.name, tool, code: "tool_not_on_server", message: `${agent.name} expects a "${tool}" tool on ${connector.name}, which it doesn't have.` });
        }
      }
    }
    return { name: agent.name, connectors: Array.from(linked), issues };
  });
  return { agents: out, issues: out.flatMap((a) => a.issues) };
}
