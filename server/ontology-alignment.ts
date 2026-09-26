/**
 * How well an agent's tools line up with the ontology — the check that blocks
 * a production deployment.
 *
 * The computation lived twice inside server/deployment-actions.ts (create and
 * promote), where it could only ever produce a refusal: "3 tool(s) have
 * ontology alignment below 50%". Nothing could say which parameters didn't
 * match, or why. It is here so both gates and Astra read the same numbers.
 *
 * Two properties of the check are easy to misread and are reported plainly
 * instead:
 * - A tool with NO recorded parameter matches scores 0, not "unknown". That is
 *   what the gate does, so it is what this returns -- with `unmatchedBecauseNothingRecorded`
 *   set, because "nobody has run parameter matching on this connector" is a
 *   different problem from "these parameters don't align".
 * - With no blueprint for the agent, the gate examines nothing at all and the
 *   deployment passes. `hasBlueprint: false` says so rather than implying a pass.
 */
import { storage } from "./storage";

export const ALIGNMENT_THRESHOLD = 0.5;

export interface ToolAlignment {
  toolName: string;
  serverName: string;
  /** matched + partial, over the parameters with a recorded match. 0 when none were recorded. */
  score: number;
  matched: number;
  total: number;
}

export interface AlignmentAssessment {
  /** The gate only examines an agent that has a blueprint; without one nothing is checked. */
  hasBlueprint: boolean;
  serversLinked: number;
  /** Every tool the gate looked at, aligned or not. */
  examined: ToolAlignment[];
  /** Those below the threshold: exactly what the gate refuses on. */
  low: ToolAlignment[];
  /** Of the low ones, those with no parameter matching recorded at all. */
  unmatchedBecauseNothingRecorded: ToolAlignment[];
  threshold: number;
}

/**
 * The tool-parameter alignment for one agent, as the production gate computes
 * it. Tool names come from the agent's blueprint nodes; the parameters come
 * from the parameter matches recorded against each linked connector.
 *
 * This takes no organization and checks none: the caller establishes that the
 * agent is theirs (both gates load the agent with `getAgent(id, orgId)` first,
 * and so does the Astra service). A signature that accepted an orgId it didn't
 * enforce would read like a scoped call and wouldn't be one.
 */
export async function assessToolAlignment(agentId: string): Promise<AlignmentAssessment> {
  const blueprints = await storage.getBlueprints();
  const agentBlueprint = blueprints.find((b) => b.agentId === agentId);
  const mcpLinks = await storage.getAgentMcpServers(agentId);
  const serversLinked = mcpLinks.length;
  if (!agentBlueprint) {
    return { hasBlueprint: false, serversLinked, examined: [], low: [], unmatchedBecauseNothingRecorded: [], threshold: ALIGNMENT_THRESHOLD };
  }

  const bpJson = agentBlueprint.blueprintJson as any;
  const nodes = bpJson?.nodes || [];
  const toolNodes = nodes.filter((n: any) => {
    const nodeType = (n.type || n.data?.type || "").toLowerCase();
    return nodeType.includes("tool") || nodeType.includes("mcp") || nodeType.includes("action");
  });
  const requiredToolNames = toolNodes.map((n: any) => n.data?.toolName || n.data?.tool || n.toolName || n.label || n.id || "unknown");

  const examined: ToolAlignment[] = [];
  for (const link of mcpLinks) {
    const server = await storage.getMcpServer(link.serverId);
    if (!server) continue;
    const serverTools = await storage.getMcpServerTools(link.serverId);
    const matches = await storage.getMcpParameterMatches(link.serverId);
    for (const tool of serverTools) {
      const isReferenced = requiredToolNames.length === 0 || requiredToolNames.some((name: string) =>
        name.toLowerCase().includes(tool.name.toLowerCase()) ||
        tool.name.toLowerCase().includes(name.toLowerCase())
      );
      if (!isReferenced) continue;
      const toolMatches = matches.filter((m) => m.toolName === tool.name);
      const matchedCount = toolMatches.filter((m) => m.matchStatus === "matched" || m.matchStatus === "partial").length;
      const totalCount = toolMatches.length;
      const score = totalCount > 0 ? matchedCount / totalCount : 0;
      examined.push({ toolName: tool.name, serverName: server.name, score: Math.round(score * 100) / 100, matched: matchedCount, total: totalCount });
    }
  }

  const low = examined.filter((t) => t.score < ALIGNMENT_THRESHOLD);
  return {
    hasBlueprint: true,
    serversLinked,
    examined,
    low,
    unmatchedBecauseNothingRecorded: low.filter((t) => t.total === 0),
    threshold: ALIGNMENT_THRESHOLD,
  };
}
