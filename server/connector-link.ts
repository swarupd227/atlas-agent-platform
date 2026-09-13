/**
 * Policy warnings for linking a connector (MCP server) to an agent.
 *
 * The same checks POST /api/agents/:id/mcp-servers runs inline
 * (server/routes/runtime.ts), as a pure function so the Astra Workspace's
 * attach_connector tool shows the user exactly what that route would ask them
 * to acknowledge. Behaviour is kept identical, including its quirks, which
 * tests/connector-link-warnings.test.ts freezes:
 *  - a tool is checked when it is high/critical risk or looks like a write;
 *    the selection counts idempotentHint === false as a write, the warning
 *    itself does not;
 *  - a high-risk warning wins over a write warning for the same tool.
 * The route has not been switched to call this yet.
 */

export interface LinkCheckTool {
  id: string;
  name: string;
  description?: string | null;
  riskClassification?: string | null;
  annotations?: unknown;
}

export interface LinkCheckPolicy {
  id: string;
  domain: string;
  status: string;
}

export interface ConnectorLinkWarning {
  toolName: string;
  toolId: string;
  riskClassification: string;
  issue: string;
  requiredPolicyDomain: "tool_permissions" | "data_handling";
}

const WRITE_WORDS = ["write", "delete", "update", "create", "modify", "remove"];

function hasWriteWord(tool: LinkCheckTool): boolean {
  const desc = (tool.description || "").toLowerCase();
  const name = (tool.name || "").toLowerCase();
  return WRITE_WORDS.some((w) => desc.includes(w)) || WRITE_WORDS.some((w) => name.includes(w));
}

function riskOf(tool: LinkCheckTool): string {
  return (tool.riskClassification || "low").toLowerCase();
}

function isHighRisk(risk: string): boolean {
  return risk === "high" || risk === "critical";
}

/**
 * policyBindings is written in two shapes: an array of { policyId, name,
 * domain } (wizard, provisioning) or { policies: ["<name>", ...] } (teams
 * created from proposals).
 */
export function normalizePolicyBindings(raw: unknown): Array<{ policyId?: string; domain?: string; [key: string]: unknown }> {
  if (Array.isArray(raw)) return raw;
  const policies = (raw as { policies?: unknown } | null | undefined)?.policies;
  if (Array.isArray(policies)) return policies.map((p) => (typeof p === "string" ? { name: p } : p));
  return [];
}

export function assessConnectorLinkWarnings(
  agent: { policyBindings?: unknown },
  tools: LinkCheckTool[],
  policies: LinkCheckPolicy[],
): ConnectorLinkWarning[] {
  const selected = new Map<string, LinkCheckTool>();
  for (const t of tools) {
    if (isHighRisk(riskOf(t))) selected.set(t.id, t);
  }
  for (const t of tools) {
    const a = t.annotations as { destructive?: unknown; readOnlyHint?: unknown; idempotentHint?: unknown } | null | undefined;
    const destructive = !!a && (a.destructive === true || a.readOnlyHint === false || a.idempotentHint === false);
    if (hasWriteWord(t) || destructive) selected.set(t.id, t);
  }
  if (selected.size === 0) return [];

  const bindings = normalizePolicyBindings(agent.policyBindings);
  const active = policies.filter((p) => p.status === "active");
  const boundIds = new Set(bindings.map((b) => b.policyId).filter(Boolean));
  const boundDomains = new Set<string>([
    ...(bindings.map((b) => b.domain).filter(Boolean) as string[]),
    ...active.filter((p) => boundIds.has(p.id)).map((p) => p.domain),
  ]);
  const hasToolPermissions = boundDomains.has("tool_permissions");
  const hasDataHandling = boundDomains.has("data_handling");

  const warnings: ConnectorLinkWarning[] = [];
  for (const tool of Array.from(selected.values())) {
    const risk = riskOf(tool);
    if (isHighRisk(risk) && !hasToolPermissions) {
      warnings.push({
        toolName: tool.name,
        toolId: tool.id,
        riskClassification: risk,
        issue: `Tool "${tool.name}" has ${risk}-risk classification but agent lacks a tool_permissions policy to govern its usage.`,
        requiredPolicyDomain: "tool_permissions",
      });
    }
    const a = tool.annotations as { destructive?: unknown; readOnlyHint?: unknown } | null | undefined;
    const destructive = !!a && (a.destructive === true || a.readOnlyHint === false);
    if ((hasWriteWord(tool) || destructive) && !hasDataHandling && !hasToolPermissions) {
      if (!warnings.some((w) => w.toolId === tool.id)) {
        warnings.push({
          toolName: tool.name,
          toolId: tool.id,
          riskClassification: risk,
          issue: `Tool "${tool.name}" has write/destructive capabilities but agent lacks data_handling or tool_permissions policies.`,
          requiredPolicyDomain: "data_handling",
        });
      }
    }
  }
  return warnings;
}
