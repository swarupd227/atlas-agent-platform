/**
 * Tool risk classification: the vocabulary, its ordering, and the single rule
 * for reconciling a DECLARED classification against a STORED one.
 *
 * WHY THIS EXISTS. `mcp_server_tools.risk_classification` defaults to "low"
 * (shared/schema.ts) and, until this change, nothing could declare anything
 * else: `RealMcpToolDef` carried only name/description/inputSchema, so both
 * registrars stamped one blanket value on every tool they created --
 * server/mock-mcp/register.ts "low", server/integrations/register.ts "medium".
 * A connector could not say which of its tools post to a ledger.
 *
 * That is not cosmetic, because two controls read this field and nothing else:
 *   - assessConnectorLinkWarnings (server/connector-link.ts) demands a
 *     `tool_permissions` policy only for a high/critical tool. Measured on
 *     Azure 2026-10-27: both Dealer Operations connectors returned 57 tools at
 *     "low", `post_allocation` among them -- so that branch could never fire,
 *     and the grant check asked only for the `data_handling` policy its
 *     write-word branch accepts.
 *   - computeApprovalRiskScore bases on HIGH 0.6 / LOW 0.2, so a ledger post
 *     scored like a read of the same shape.
 *
 * THE RULE: a declaration is a FLOOR, never a ceiling. Sync raises a stored
 * value to the declared one and never lowers it. The reason is that
 * `riskClassification` is also operator-settable (PATCH in
 * server/routes/runtime.ts, gated on a Security Admin role for write and
 * high-risk tools), so a sync that simply wrote the declaration would silently
 * undo a person's deliberate decision. Raising cannot: an operator who moved a
 * tool UP keeps their value, and one who moved it DOWN below what the
 * connector's own code says is overridden in the fail-safe direction.
 *
 * An undeclared tool is left exactly as it is -- this never reclassifies a
 * connector that has said nothing.
 */

export type McpToolRisk = "low" | "medium" | "high" | "critical";

/** Ascending. Index is the rank. */
export const TOOL_RISK_ORDER: readonly McpToolRisk[] = ["low", "medium", "high", "critical"];

export function isMcpToolRisk(value: unknown): value is McpToolRisk {
  return typeof value === "string" && (TOOL_RISK_ORDER as readonly string[]).includes(value.toLowerCase());
}

/** Rank of a stored or declared value; -1 when it is absent or not one of ours. */
export function toolRiskRank(value: string | null | undefined): number {
  if (typeof value !== "string") return -1;
  return (TOOL_RISK_ORDER as readonly string[]).indexOf(value.toLowerCase());
}

/**
 * The classification to write, or null when the row should be left alone.
 *
 * null is returned for "nothing declared" and for "already at least as high",
 * and those two cases must stay indistinguishable to callers: both mean do not
 * touch this row.
 */
export function reconcileToolRisk(
  declared: string | null | undefined,
  stored: string | null | undefined,
): McpToolRisk | null {
  if (!isMcpToolRisk(declared)) return null;
  const want = declared.toLowerCase() as McpToolRisk;
  // A row holding nothing usable takes the declaration whatever it is, which is
  // also the "new row" case.
  if (toolRiskRank(stored) < 0) return want;
  return toolRiskRank(want) > toolRiskRank(stored) ? want : null;
}
