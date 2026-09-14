/**
 * Outcome intelligence: what the platform already has for a proposed outcome
 * -- live agents matching the proposed roles, industry templates, which
 * proposed tools already exist, policies that would apply, and a composite
 * risk read.
 *
 * Moved unchanged from GET /api/outcomes/intelligence (server/routes/outcomes.ts)
 * as a pure function over a snapshot, so the Astra Workspace can ground an
 * outcome draft without an HTTP request. The route loads the snapshot and
 * returns this function's result.
 */
import type { Agent, AgentTemplate, McpServer, McpServerTool, Policy } from "@shared/schema";

export interface OutcomeIntelligenceSnapshot {
  agents: Agent[];
  templates: AgentTemplate[];
  servers: McpServer[];
  tools: McpServerTool[];
  policies: Policy[];
}

export interface OutcomeIntelligenceQuery {
  industry: string;
  toolNames: string[];
  roleNames: string[];
  autonomyModes: string[];
  riskTiers: string[];
  proposedApprovalGatesCount: number | null;
}

export function assessOutcomeIntelligence(snapshot: OutcomeIntelligenceSnapshot, query: OutcomeIntelligenceQuery) {
  const { agents: allAgents, templates: allTemplates, servers: allServers, tools: allTools, policies: allPolicies } = snapshot;
  const { industry: industryStr, toolNames, roleNames: roleNamesIn, autonomyModes: autonomyList, riskTiers: riskList } = query;
  const roleNames = [...roleNamesIn];

  // Live agent matching by keyword overlap with proposed role names/descriptions
  const matchedAgents = roleNames.map((role) => {
    const roleWords = role.toLowerCase().split(/[\s,_-]+/).filter((w) => w.length > 3);
    const scored = allAgents
      .filter((a) => a.status !== "archived")
      .map((a) => {
        const haystack = (a.name + " " + (a.description || "") + " " + (a.department || "")).toLowerCase();
        const overlap = roleWords.filter((w) => haystack.includes(w)).length;
        return { agent: a, score: overlap };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return {
      role,
      matches: scored.map(({ agent: a }) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        healthScore: Math.round(a.healthScore || 0),
        status: a.status,
        totalRuns: a.totalRuns || 0,
        autonomyMode: a.autonomyMode,
        riskTier: a.riskTier,
      })),
    };
  });

  // Template matching by industry + cross_industry
  const industryTemplates = allTemplates
    .filter((t) => !industryStr || t.industry === industryStr || t.industry === "cross_industry")
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      industry: t.industry,
      category: t.category,
      complexity: t.complexity,
      estimatedTimeToProd: t.estimatedTimeToProd,
      deploymentCount: t.deploymentCount || 0,
      avgKpiDelivery: t.avgKpiDelivery || 0,
      defaultRiskTier: t.defaultRiskTier,
      complianceCertifications: t.complianceCertifications || [],
      tags: t.tags || [],
      toolNames: Array.isArray(t.toolsConfig)
        ? (t.toolsConfig as Array<{ name?: string }>).map((tc) => tc.name).filter(Boolean)
        : [],
    }));

  // Tool catalog coverage — match against individual tool functions AND MCP server names.
  // The AI generates high-level integration names ("FFIEC MCP integration", "SEC EDGAR MCP interface")
  // which map to MCP server names, not individual tool function names. Keyword-based server matching
  // catches these so the coverage count is accurate.
  const MCP_STOP_WORDS = new Set([
    "mcp", "api", "integration", "interface", "engine", "system", "service",
    "server", "tool", "data", "feed", "platform", "for", "the", "and", "legacy",
    "compatibility", "enterprise", "internal", "external",
  ]);

  const toolCoverage = toolNames.map((toolName) => {
    const nameLow = toolName.toLowerCase().replace(/[\s_-]+/g, "_");

    // 1. Exact tool function name match
    const exactMatch = allTools.find((t) => t.name.toLowerCase().replace(/[\s_-]+/g, "_") === nameLow);

    // 2. Substring tool function match
    const partialToolMatch =
      !exactMatch &&
      allTools.find(
        (t) =>
          t.name.toLowerCase().includes(toolName.toLowerCase().replace(/_/g, " ")) ||
          toolName.toLowerCase().includes(t.name.toLowerCase().replace(/_/g, " "))
      );

    // 3. Keyword match against MCP server names (handles AI-generated integration names)
    let serverKeywordMatch: (typeof allServers)[0] | undefined;
    if (!exactMatch && !partialToolMatch) {
      const keywords = toolName
        .toLowerCase()
        .split(/[\s_\-\/()]+/)
        .filter((w) => w.length > 2 && !MCP_STOP_WORDS.has(w));
      if (keywords.length > 0) {
        serverKeywordMatch = allServers.find((s) => {
          const sNameLow = s.name.toLowerCase();
          return keywords.some((kw) => sNameLow.includes(kw));
        });
      }
    }

    const toolMatch = exactMatch || partialToolMatch;
    const status = exactMatch
      ? "exists"
      : partialToolMatch
      ? "partial"
      : serverKeywordMatch
      ? "partial"
      : "missing";

    return {
      proposedName: toolName,
      status,
      matchedTool: toolMatch
        ? {
            id: toolMatch.id,
            name: toolMatch.name,
            riskClassification: toolMatch.riskClassification || "low",
            serverId: toolMatch.serverId,
          }
        : serverKeywordMatch
        ? {
            id: serverKeywordMatch.id,
            name: serverKeywordMatch.name,
            riskClassification: "low",
            serverId: serverKeywordMatch.id,
          }
        : null,
    };
  });

  // Policy matching by domain keywords derived from industry
  const industryDomainMap: Record<string, string[]> = {
    financial_services: ["access_control", "audit", "compliance", "data_handling", "risk", "finance", "financial"],
    healthcare: ["hipaa", "clinical", "patient", "health", "phi", "data_handling", "access_control"],
    manufacturing: ["quality", "safety", "osha", "iso", "compliance", "operational"],
    insurance: ["claims", "compliance", "acord", "regulatory", "data_handling", "risk"],
    retail: ["pci", "ccpa", "consumer", "data_handling", "fraud", "inventory"],
    technology_saas: ["access_control", "soc2", "api", "security", "data_handling", "incident"],
  };
  const domainKeywords = industryDomainMap[industryStr] || ["data_handling", "compliance", "access_control"];
  const matchedPolicies = allPolicies
    .filter((p) => p.status === "active")
    .filter((p) =>
      domainKeywords.some(
        (kw) =>
          p.domain.toLowerCase().includes(kw) ||
          p.name.toLowerCase().includes(kw) ||
          (p.description || "").toLowerCase().includes(kw)
      )
    )
    .slice(0, 6)
    .map((p) => {
      const bracketMatch = p.name.match(/^\[([^\]]+)\]/);
      const packPrefixMap: Record<string, string> = {
        "HIPAA": "HIPAA Compliance Pack",
        "MiFID II": "MiFID II Compliance Pack",
        "SOX": "SOX Compliance Pack",
        "SEC": "Credit Rating / SEC Compliance Pack",
        "GDPR": "GDPR Compliance Pack",
        "EU AI Act": "EU AI Act Compliance Pack",
        "Clinical Safety": "Clinical Safety Pack",
        "Anti-Fraud": "Anti-Fraud Detection Pack",
      };
      const policyPack = bracketMatch ? (packPrefixMap[bracketMatch[1]] ?? null) : null;
      return {
        id: p.id,
        name: p.name,
        domain: p.domain,
        description: p.description,
        enforcementType: (() => {
          const pjEnforcement = (p.policyJson as any)?.enforcement as string | undefined;
          if (pjEnforcement === "block" || pjEnforcement === "warn" || pjEnforcement === "audit") return "auto";
          if (pjEnforcement === "require_approval") return "manual";
          return p.scopeType === "org" ? "auto" : "manual";
        })(),
        scopeType: p.scopeType,
        policyPack,
      };
    });

  // Composite risk calculation
  const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const toolRiskLevels = toolCoverage
    .filter((t) => t.matchedTool)
    .map((t) => (t.matchedTool!.riskClassification || "low").toUpperCase());
  const highestToolRisk = toolRiskLevels.reduce(
    (max, r) => (RISK_LEVELS.indexOf(r) > RISK_LEVELS.indexOf(max) ? r : max),
    "LOW"
  );
  const hasFullyAutonomous = autonomyList.some((m) => m === "fully_autonomous" || m === "FULLY_AUTONOMOUS");
  const highRiskToolCount = toolRiskLevels.filter((r) => r === "HIGH" || r === "CRITICAL").length;
  const rationale: string[] = [];
  let compositeIdx = RISK_LEVELS.indexOf(highestToolRisk);
  if (highRiskToolCount > 0) rationale.push(`${highRiskToolCount} HIGH/CRITICAL tool${highRiskToolCount > 1 ? "s" : ""}`);
  if (hasFullyAutonomous) {
    if (compositeIdx < 3) compositeIdx++;
    rationale.push("fully-autonomous mode");
  }
  const proposedHighRisk = riskList.some((r) => r === "HIGH" || r === "CRITICAL");
  if (proposedHighRisk && compositeIdx < 2) {
    compositeIdx = 2;
    rationale.push("HIGH-risk agent tier");
  }
  // Approval gate risk: HIGH/CRITICAL tools without auto-enforced platform policies
  const hasAutoEnforcedPolicy = matchedPolicies.some((p) => p.enforcementType === "auto");
  const explicitGateCount = query.proposedApprovalGatesCount;
  // Approval gap: HIGH/CRITICAL tools without sufficient approval gates.
  // When gate count is explicit: flag if fewer gates than high-risk tools (ratio-based).
  // When no gate count: fall back to checking whether any auto-enforced policy exists.
  const hasApprovalGapRisk = highRiskToolCount > 0 &&
    (explicitGateCount !== null ? explicitGateCount < highRiskToolCount : !hasAutoEnforcedPolicy);
  if (hasApprovalGapRisk) {
    if (compositeIdx < 2) compositeIdx = 2;
    rationale.push("HIGH/CRITICAL tools lack auto-enforced approval gates");
  }

  if (rationale.length === 0) rationale.push("no high-risk tools detected");
  const compositeLevel = RISK_LEVELS[compositeIdx];

  // Industry-based fallback: when no roles provided (e.g. Quick Create Step 2),
  // match top-N active agents by industry tag overlap + health score
  if (roleNames.length === 0 && industryStr) {
    const industryWords = industryStr.toLowerCase().split(/[_-]+/).filter((w: string) => w.length > 3);
    const industryAgents = allAgents
      .filter((a) => a.status === 'active' || a.status === 'degraded')
      .map((a) => {
        const haystack = (a.name + ' ' + (a.description || '') + ' ' + (a.department || '')).toLowerCase();
        const overlap = industryWords.filter((w: string) => haystack.includes(w)).length;
        return { agent: a, score: overlap * 2 + (Number(a.healthScore) || 0) / 100 };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, 5);
    if (industryAgents.length > 0) {
      matchedAgents.push({
        role: 'Industry Agents',
        matches: industryAgents.map(({ agent: a }) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          healthScore: Math.round(a.healthScore || 0),
          status: a.status,
          totalRuns: a.totalRuns || 0,
          autonomyMode: a.autonomyMode,
          riskTier: a.riskTier,
        })),
      });
    }
  }
  const totalLiveMatches = matchedAgents.reduce((sum, r) => sum + r.matches.length, 0);
  const coverageCount = toolCoverage.filter((t) => t.status !== "missing").length;

  return {
    matchedAgents,
    matchedTemplates: industryTemplates,
    toolCoverage,
    matchedPolicies,
    compositeRisk: {
      level: compositeLevel,
      rationale: rationale,
    },
    summary: {
      liveAgentMatchCount: totalLiveMatches,
      templateCount: industryTemplates.length,
      toolCoveragePercent: toolNames.length > 0 ? Math.round((coverageCount / toolNames.length) * 100) : 100,
      matchedPolicyCount: matchedPolicies.length,
      hasApprovalGapRisk,
    },
  };
}
