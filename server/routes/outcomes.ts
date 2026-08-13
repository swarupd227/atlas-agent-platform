import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { desc, eq, and } from "drizzle-orm";
import { outcomeContracts, kpiDefinitions, approvals, agents, type OutcomeContract } from "@shared/schema";
import { z, ZodError } from "zod";
import { normalizeToGraph, starterFlow } from "@shared/process-flow";
import { compileProcessFlow } from "../process-flow-compile";
import {
  insertOutcomeContractSchema,
  insertKpiDefinitionSchema,
} from "@shared/schema";
import { checkPermission, getRequestRole } from "../permissions";
import { getOrgId, getDefaultOrgId } from "../auth";
import {
  resolveOntologyTags,
  computeConstraintGraph,
  recomputeOutcomeKpis,
  handleZodError,
  generateKpiAlignedEvalSuite,
  draftSingleAgent,
} from "./helpers";
import type { ProcessNode } from "@shared/process-flow";

const router = Router();

// Shared version-creation helper used by POST /versions and KPI PATCH.
// Pass auditDiff=null to auto-compute from existingOutcome vs outcomeUpdates.
// outcomeUpdates must only contain schema-valid OutcomeContract columns.
async function createOutcomeVersion(
  outcomeId: string,
  existingOutcome: { version?: number | null; riskTier?: string | null; autoPauseTrigger?: boolean | null; riskThreshold?: number | null; slaConfig?: unknown; [key: string]: unknown },
  outcomeUpdates: Record<string, unknown>,
  auditDiff: Record<string, { from: unknown; to: unknown }> | null,
  reason: string,
  actorId: string,
  actorType: "user" | "system",
  orgId: string,
): Promise<{
  updated: Record<string, unknown>;
  downstreamImpact: { boundAgentCount: number; nonCompliantAgents: Array<{ agentId: string; agentName: string; violations: Array<{ constraint: string; current: string; required: string; severity: string }> }> };
}> {
  const newVersion = (existingOutcome.version || 1) + 1;

  // Compute diff — auto-detect from existingOutcome vs outcomeUpdates when not provided
  const diff: Record<string, { from: unknown; to: unknown }> = auditDiff ?? (() => {
    const d: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, toVal] of Object.entries(outcomeUpdates)) {
      const fromVal = existingOutcome[key];
      if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
        d[key] = { from: fromVal, to: toVal };
      }
    }
    return d;
  })();

  const updated = await storage.updateOutcome(outcomeId, { ...(outcomeUpdates as Partial<OutcomeContract>), version: newVersion }, orgId);

  await storage.createAuditEvent({
    actorType,
    objectType: "outcome",
    objectId: outcomeId,
    action: "version_created",
    actorId,
    details: JSON.stringify({
      fromVersion: existingOutcome.version || 1,
      toVersion: newVersion,
      reason,
      changes: diff,
    }),
    ontologyTags: resolveOntologyTags("outcome", "version_created", { details: reason }),
  });

  const kpis = await storage.getKpisByOutcome(outcomeId);
  const allAgents = await storage.getAgents(orgId);
  const boundAgents = allAgents.filter(a => a.outcomeId === outcomeId);
  const nonCompliantAgents: Array<{ agentId: string; agentName: string; violations: Array<{ constraint: string; current: string; required: string; severity: string }> }> = [];
  const RISK_LEVELS: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const effective = ((updated || existingOutcome) as Record<string, any>);
  const newRiskTier = effective.riskTier || "MEDIUM";
  const newSlaConfig = (effective.slaConfig || {}) as Record<string, any>;
  const autoPauseTriggerActivated = !!(outcomeUpdates.autoPauseTrigger && !existingOutcome.autoPauseTrigger);

  for (const agent of boundAgents) {
    const violations: Array<{ constraint: string; current: string; required: string; severity: string }> = [];
    if ((RISK_LEVELS[agent.riskTier] || 2) < (RISK_LEVELS[newRiskTier] || 2)) {
      violations.push({ constraint: "Risk Tier", current: agent.riskTier, required: newRiskTier, severity: "critical" });
    }
    if (newSlaConfig.maxP95LatencyMs && agent.avgLatencyMs && agent.avgLatencyMs > newSlaConfig.maxP95LatencyMs) {
      violations.push({ constraint: "P95 Latency", current: `${agent.avgLatencyMs}ms`, required: `<${newSlaConfig.maxP95LatencyMs}ms`, severity: "warning" });
    }
    for (const kpi of kpis) {
      if (kpi.slaThreshold) {
        const kpiNameLower = (kpi.name || "").toLowerCase();
        if (agent.successRate != null && (kpiNameLower.includes("success") || kpiNameLower.includes("accuracy") || kpiNameLower.includes("rate"))) {
          const agentRate = (agent.successRate || 0) * 100;
          if (agentRate < kpi.slaThreshold) {
            violations.push({ constraint: `KPI: ${kpi.name}`, current: `${agentRate.toFixed(1)}%`, required: `>=${kpi.slaThreshold}%`, severity: "warning" });
          }
        }
      }
    }
    if (autoPauseTriggerActivated && agent.status === "active" && (agent.healthScore || 100) < ((effective.riskThreshold || 0.8) * 100)) {
      violations.push({ constraint: "Auto-Pause Trigger", current: `Health ${agent.healthScore}%`, required: `>=${((effective.riskThreshold || 0.8) * 100).toFixed(0)}%`, severity: "warning" });
    }
    if (violations.length > 0) {
      nonCompliantAgents.push({ agentId: agent.id, agentName: agent.name, violations });
    }
  }

  if (nonCompliantAgents.length > 0) {
    for (const agent of nonCompliantAgents) {
      await storage.createAuditEvent({
        actorType: "system",
        actorId: "outcome_engine",
        action: "agent.outcome_sla_review_required",
        objectType: "agent",
        objectId: agent.agentId,
        details: JSON.stringify({
          outcomeId,
          outcomeName: effective.name,
          newVersion,
          violations: agent.violations,
          message: `Outcome contract versioned to v${newVersion} — agent "${agent.agentName}" needs reconfiguration`,
        }),
        ontologyTags: resolveOntologyTags("agent", "agent.outcome_sla_review_required"),
      });
    }
  }

  return {
    updated: effective as Record<string, unknown>,
    downstreamImpact: { boundAgentCount: boundAgents.length, nonCompliantAgents },
  };
}

  router.get("/api/outcomes", async (req, res) => {
    const outcomes = await storage.getOutcomes(getOrgId(req));
    res.json(outcomes);
  });

  // Platform intelligence: match live agents, templates, tools, policies for a proposed outcome
  router.get("/api/outcomes/intelligence", async (req, res) => {
    try {
      const industryStr = (req.query.industry as string) || "";
      const toolNames: string[] = req.query.proposedTools
        ? (req.query.proposedTools as string).split(",").map((t) => t.trim()).filter(Boolean)
        : [];
      let roleNames: string[] = [];
      let autonomyList: string[] = [];
      let riskList: string[] = [];
      try {
        if (req.query.proposedAgentRoles) roleNames = JSON.parse(req.query.proposedAgentRoles as string);
        if (req.query.autonomyModes) autonomyList = JSON.parse(req.query.autonomyModes as string);
        if (req.query.riskTiers) riskList = JSON.parse(req.query.riskTiers as string);
      } catch { /* ignore parse errors */ }

      const orgId = getOrgId(req);
      const [allAgents, allTemplates, allServers, allPolicies] = await Promise.all([
        storage.getAgents(orgId),
        storage.getAgentTemplates(),
        storage.getMcpServers(),
        storage.getPolicies(orgId),
      ]);
      const toolsPerServer = await Promise.all(allServers.map((s) => storage.getMcpServerTools(s.id)));
      const allTools = toolsPerServer.flat();

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
      const explicitGateCount = req.query.proposedApprovalGatesCount !== undefined
        ? parseInt(req.query.proposedApprovalGatesCount as string, 10)
        : null;
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

      res.json({
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
      });
    } catch (err) {
      console.error("[/api/outcomes/intelligence]", err);
      res.status(500).json({ message: "Failed to compute outcome intelligence" });
    }
  });

  router.get("/api/outcomes/:id", async (req, res) => {
    const outcome = await storage.getOutcome(req.params.id, getOrgId(req));
    if (!outcome) return res.status(404).json({ message: "Not found" });
    res.json(outcome);
  });

  router.post("/api/outcomes", checkPermission("create_modify_outcomes"), async (req, res) => {
    try {
      const data = insertOutcomeContractSchema.omit({ organizationId: true }).parse(req.body);
      const graph = computeConstraintGraph(data, []);
      const outcome = await storage.createOutcome({ ...data, constraintGraph: graph, organizationId: getOrgId(req) ?? getDefaultOrgId() ?? undefined });
      res.status(201).json(outcome);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/outcomes/with-kpis", checkPermission("create_modify_outcomes"), async (req, res) => {
    try {
      const { outcome: outcomeData, kpis: kpiData, constraints } = req.body;
      // Extract discovery-phase policy data before schema validation strips unknown fields
      const matchedPolicyIds: string[] = Array.isArray(outcomeData.matchedPolicyIds) ? outcomeData.matchedPolicyIds : [];
      const discoveryPolicies: any[] = Array.isArray(outcomeData.discoveryPolicies) ? outcomeData.discoveryPolicies : [];
      const { matchedPolicyIds: _mp, discoveryPolicies: _dp, ...cleanOutcomeData } = outcomeData;
      const parsedOutcome = insertOutcomeContractSchema.omit({ organizationId: true }).parse({
        ...cleanOutcomeData,
        slaConfig: constraints ? { constraints, ...(cleanOutcomeData.slaConfig || {}) } : cleanOutcomeData.slaConfig,
      });
      const parsedKpis = (kpiData && Array.isArray(kpiData))
        ? kpiData.map((kpi: any) => insertKpiDefinitionSchema.omit({ outcomeId: true }).parse({
            ...kpi,
            target: typeof kpi.target === "number" ? kpi.target : (parseFloat(kpi.target) || 0),
            baseline: typeof kpi.baseline === "number" ? kpi.baseline : (parseFloat(kpi.baseline) || 0),
            slaThreshold: kpi.slaThreshold != null ? (typeof kpi.slaThreshold === "number" ? kpi.slaThreshold : (parseFloat(kpi.slaThreshold) || 0)) : undefined,
            weight: kpi.weight != null ? (typeof kpi.weight === "number" ? kpi.weight : (parseFloat(kpi.weight) || 1)) : 1,
          }))
        : [];
      const orgId = (getOrgId(req) ?? getDefaultOrgId())!;
      const result = await db.transaction(async (tx) => {
        const [outcome] = await tx.insert(outcomeContracts).values({ ...parsedOutcome, organizationId: orgId }).returning();
        const createdKpis = [];
        for (const kpi of parsedKpis) {
          const [created] = await tx.insert(kpiDefinitions).values({ ...kpi, outcomeId: outcome.id }).returning();
          createdKpis.push(created);
        }
        const graph = computeConstraintGraph(outcome, createdKpis);
        // Persist discovery-phase policy matches in the constraint graph so the Governance tab can show them
        const graphWithPolicies = {
          ...graph,
          ...(matchedPolicyIds.length > 0 ? { matchedPolicyIds } : {}),
          ...(discoveryPolicies.length > 0 ? { discoveryPolicies } : {}),
        };
        const [updatedOutcome] = await tx.update(outcomeContracts).set({ constraintGraph: graphWithPolicies }).where(eq(outcomeContracts.id, outcome.id)).returning();
        return { outcome: updatedOutcome, kpis: createdKpis };
      });
      res.status(201).json(result);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Unified, transactional outcome creation from a discovery/form proposal.
  // Every path (chat, meeting, quick-create) commits through here, so they
  // produce identical artifacts + governance. Outcomes start "pending_review"
  // and only advance once the outcome_review approval is approved (real gate).
  router.post("/api/outcomes/from-proposal", checkPermission("create_modify_outcomes"), async (req, res) => {
    try {
      const orgId = getOrgId(req) ?? getDefaultOrgId();
      if (!orgId) return res.status(400).json({ message: "No organization context" });
      const actor = (req as any).authUser?.username || (req as any).authUser?.userId || "system";

      const { outcome: outcomeData, kpis: kpiData, constraints, acceptedAgentIds, source, evidence } = req.body ?? {};
      if (!outcomeData || typeof outcomeData !== "object") {
        return res.status(400).json({ message: "outcome is required" });
      }

      // Carry discovery policy matches into the constraint graph.
      const matchedPolicyIds: string[] = Array.isArray(outcomeData.matchedPolicyIds) ? outcomeData.matchedPolicyIds : [];
      const discoveryPolicies: any[] = Array.isArray(outcomeData.discoveryPolicies) ? outcomeData.discoveryPolicies : [];
      const { matchedPolicyIds: _mp, discoveryPolicies: _dp, status: _st, ...cleanOutcome } = outcomeData;

      const parsedOutcome = insertOutcomeContractSchema.omit({ organizationId: true }).parse({
        ...cleanOutcome,
        status: "pending_review", // real governance gate
        slaConfig: constraints ? { constraints, ...(cleanOutcome.slaConfig || {}) } : cleanOutcome.slaConfig,
      });

      const parsedKpis = Array.isArray(kpiData)
        ? kpiData.map((kpi: any) => insertKpiDefinitionSchema.omit({ outcomeId: true }).parse({
            ...kpi,
            target: typeof kpi.target === "number" ? kpi.target : (parseFloat(kpi.target) || 0),
            baseline: kpi.baseline != null
              ? (typeof kpi.baseline === "number" ? kpi.baseline : (parseFloat(kpi.baseline) || 0))
              : (kpi.currentBaseline ?? 0),
            // Preserve the proposal's own SLA threshold / weight (no hardcoding).
            slaThreshold: kpi.slaThreshold != null
              ? (typeof kpi.slaThreshold === "number" ? kpi.slaThreshold : parseFloat(kpi.slaThreshold))
              : undefined,
            weight: kpi.weight != null
              ? (typeof kpi.weight === "number" ? kpi.weight : parseFloat(kpi.weight))
              : 1,
          }))
        : [];

      const agentIds: string[] = Array.isArray(acceptedAgentIds) ? acceptedAgentIds.filter((x: any) => typeof x === "string") : [];
      const riskScore = parsedOutcome.riskTier === "HIGH" ? 8 : parsedOutcome.riskTier === "MEDIUM" ? 5 : 3;

      const result = await db.transaction(async (tx) => {
        const [outcome] = await tx.insert(outcomeContracts).values({ ...parsedOutcome, organizationId: orgId }).returning();

        const createdKpis = [];
        for (const kpi of parsedKpis) {
          const [created] = await tx.insert(kpiDefinitions).values({ ...kpi, outcomeId: outcome.id }).returning();
          createdKpis.push(created);
        }

        const graph = computeConstraintGraph(outcome, createdKpis);
        const graphWithPolicies = {
          ...graph,
          ...(matchedPolicyIds.length > 0 ? { matchedPolicyIds } : {}),
          ...(discoveryPolicies.length > 0 ? { discoveryPolicies } : {}),
        };

        // Seed an editable process flow at creation so it's ready before the
        // Agent Plan. Use a typed flow the proposal already carried (graph or
        // typed steps); otherwise a sensible starter from the risk tier.
        const discoveryFlow = (parsedOutcome.slaConfig as any)?.processFlow;
        const isGraph = !!discoveryFlow && Array.isArray((discoveryFlow as any).nodes);
        const isTypedSteps = Array.isArray(discoveryFlow) && discoveryFlow.length > 0 && discoveryFlow.every((s: any) => s?.type && s?.label);
        const seeded = (isGraph || isTypedSteps) ? normalizeToGraph(discoveryFlow, outcome.name) : null;
        const processFlow = { ...(seeded || starterFlow(outcome.name, outcome.riskTier)), updatedAt: new Date().toISOString() };

        const [updatedOutcome] = await tx.update(outcomeContracts)
          .set({ constraintGraph: graphWithPolicies, processFlow })
          .where(eq(outcomeContracts.id, outcome.id)).returning();

        // Bind accepted agents (org-scoped) atomically with the outcome.
        let boundAgents = 0;
        for (const agentId of agentIds) {
          const bound = await tx.update(agents)
            .set({ outcomeId: outcome.id })
            .where(and(eq(agents.id, agentId), eq(agents.organizationId, orgId)))
            .returning();
          if (bound.length > 0) boundAgents++;
        }

        // The governance review gate — created atomically with the outcome.
        const [approval] = await tx.insert(approvals).values({
          type: "outcome_review",
          objectType: "outcome_contract",
          objectId: updatedOutcome.id,
          objectName: updatedOutcome.name,
          riskScore,
          status: "pending",
          requestedBy: actor,
          requesterType: "user",
          outcomeId: updatedOutcome.id,
          organizationId: orgId,
          evidenceJson: evidence ?? null,
        }).returning();

        return { outcome: updatedOutcome, kpis: createdKpis, approval, boundAgents };
      });

      // Audit (best-effort, outside the tx — matches the with-kpis pattern).
      await storage.createAuditEvent({
        organizationId: orgId,
        actorType: "user",
        actorId: actor,
        action: "outcome_created",
        objectType: "outcome",
        objectId: result.outcome.id,
        details: `Outcome "${result.outcome.name}" created (source: ${source || "unknown"}) — pending review`,
        ontologyTags: resolveOntologyTags("outcome", "created", { details: String(result.outcome.name) }),
      }).catch((err) => console.error("from-proposal audit error:", err));

      res.status(201).json(result);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.patch("/api/outcomes/:id", async (req, res) => {
    try {
      const data = insertOutcomeContractSchema.partial().parse(req.body);
      const existing = await storage.getOutcome(req.params.id, getOrgId(req));
      if (!existing) return res.status(404).json({ message: "Not found" });

      const slaFieldsChanged = !!(
        (data.riskTier !== undefined && data.riskTier !== existing.riskTier) ||
        (data.slaConfig !== undefined && JSON.stringify(data.slaConfig) !== JSON.stringify(existing.slaConfig)) ||
        (data.riskThreshold !== undefined && data.riskThreshold !== existing.riskThreshold) ||
        (data.maxDriftPercent !== undefined && data.maxDriftPercent !== existing.maxDriftPercent) ||
        (data.autoPauseTrigger !== undefined && data.autoPauseTrigger !== existing.autoPauseTrigger) ||
        (data.approvalGates !== undefined && JSON.stringify(data.approvalGates) !== JSON.stringify(existing.approvalGates))
      );

      const updated = await storage.updateOutcome(req.params.id, data, getOrgId(req));
      if (!updated) return res.status(404).json({ message: "Not found" });
      const kpis = await storage.getKpisByOutcome(req.params.id);
      const graph = computeConstraintGraph(updated, kpis);
      const withGraph = await storage.updateOutcome(req.params.id, { constraintGraph: graph }, getOrgId(req));
      const finalOutcome = withGraph || updated;

      if (slaFieldsChanged) {
        const allAgents = await storage.getAgents(getOrgId(req));
        const boundAgents = allAgents.filter(a => a.outcomeId === req.params.id);
        const nonCompliantAgents: Array<{ agentId: string; agentName: string; violations: Array<{ constraint: string; current: string; required: string; severity: string }> }> = [];
        const RISK_LEVELS: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
        const newRiskTier = finalOutcome.riskTier || "MEDIUM";
        const newSlaConfig = (finalOutcome.slaConfig || {}) as Record<string, any>;

        for (const agent of boundAgents) {
          const violations: Array<{ constraint: string; current: string; required: string; severity: string }> = [];
          if ((RISK_LEVELS[agent.riskTier] || 2) < (RISK_LEVELS[newRiskTier] || 2)) {
            violations.push({ constraint: "Risk Tier", current: agent.riskTier, required: newRiskTier, severity: "critical" });
          }
          if (newSlaConfig.maxP95LatencyMs && agent.avgLatencyMs && agent.avgLatencyMs > newSlaConfig.maxP95LatencyMs) {
            violations.push({ constraint: "P95 Latency", current: `${agent.avgLatencyMs}ms`, required: `<${newSlaConfig.maxP95LatencyMs}ms`, severity: "warning" });
          }
          for (const kpi of kpis) {
            if (kpi.slaThreshold) {
              const kpiNameLower = (kpi.name || "").toLowerCase();
              if (agent.successRate != null && (kpiNameLower.includes("success") || kpiNameLower.includes("accuracy") || kpiNameLower.includes("rate"))) {
                const agentRate = (agent.successRate || 0) * 100;
                if (agentRate < kpi.slaThreshold) {
                  violations.push({ constraint: `KPI: ${kpi.name}`, current: `${agentRate.toFixed(1)}%`, required: `>=${kpi.slaThreshold}%`, severity: "warning" });
                }
              }
            }
          }
          if (data.autoPauseTrigger && !existing.autoPauseTrigger) {
            if (agent.status === "active" && (agent.healthScore || 100) < ((finalOutcome.riskThreshold || 0.8) * 100)) {
              violations.push({ constraint: "Auto-Pause Trigger", current: `Health ${agent.healthScore}%`, required: `>=${((finalOutcome.riskThreshold || 0.8) * 100).toFixed(0)}%`, severity: "warning" });
            }
          }
          if (violations.length > 0) {
            nonCompliantAgents.push({ agentId: agent.id, agentName: agent.name, violations });
          }
        }

        const changedFields: string[] = [];
        if (data.riskTier !== undefined && data.riskTier !== existing.riskTier) changedFields.push(`riskTier: ${existing.riskTier} -> ${data.riskTier}`);
        if (data.riskThreshold !== undefined && data.riskThreshold !== existing.riskThreshold) changedFields.push(`riskThreshold: ${existing.riskThreshold} -> ${data.riskThreshold}`);
        if (data.maxDriftPercent !== undefined && data.maxDriftPercent !== existing.maxDriftPercent) changedFields.push(`maxDriftPercent: ${existing.maxDriftPercent} -> ${data.maxDriftPercent}`);
        if (data.autoPauseTrigger !== undefined && data.autoPauseTrigger !== existing.autoPauseTrigger) changedFields.push(`autoPauseTrigger: ${existing.autoPauseTrigger} -> ${data.autoPauseTrigger}`);
        if (data.slaConfig !== undefined) changedFields.push("slaConfig updated");
        if (data.approvalGates !== undefined) changedFields.push("approvalGates updated");

        await storage.createAuditEvent({
          actorType: "user",
          actorId: "system",
          action: "outcome.sla_renegotiated",
          objectType: "outcome",
          objectId: req.params.id,
          details: JSON.stringify({
            changedFields,
            boundAgentCount: boundAgents.length,
            nonCompliantCount: nonCompliantAgents.length,
            nonCompliantAgents: nonCompliantAgents.map(a => ({ agentId: a.agentId, agentName: a.agentName, violationCount: a.violations.length })),
          }),
          ontologyTags: resolveOntologyTags("outcome", "outcome.sla_renegotiated"),
        });

        for (const agent of nonCompliantAgents) {
          await storage.createAuditEvent({
            actorType: "system",
            actorId: "outcome_engine",
            action: "agent.outcome_sla_review_required",
            objectType: "agent",
            objectId: agent.agentId,
            details: JSON.stringify({
              outcomeId: req.params.id,
              outcomeName: finalOutcome.name,
              violations: agent.violations,
              message: `Outcome SLA updated — agent "${agent.agentName}" needs reconfiguration`,
            }),
            ontologyTags: resolveOntologyTags("agent", "agent.outcome_sla_review_required"),
          });
        }

        res.json({ ...finalOutcome, _downstreamImpact: { boundAgentCount: boundAgents.length, nonCompliantAgents } });
        return;
      }

      res.json(finalOutcome);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/outcomes/:id/downstream-impact", async (req, res) => {
    try {
      const outcome = await storage.getOutcome(req.params.id, getOrgId(req));
      if (!outcome) return res.status(404).json({ message: "Not found" });

      const allAgents = await storage.getAgents(getOrgId(req));
      const boundAgents = allAgents.filter(a => a.outcomeId === req.params.id);
      const kpis = await storage.getKpisByOutcome(req.params.id);
      const auditEventsAll = await storage.getAuditEvents(getOrgId(req));

      const slaRenegotiationEvents = auditEventsAll.filter(
        e => e.action === "outcome.sla_renegotiated" && e.objectId === req.params.id
      ).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      const reviewRequiredEvents = auditEventsAll.filter(
        e => e.action === "agent.outcome_sla_review_required" &&
        boundAgents.some(a => a.id === e.objectId)
      ).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      const RISK_LEVELS: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      const outcomeRiskLevel = RISK_LEVELS[outcome.riskTier || "MEDIUM"] || 2;
      const slaConfig = (outcome.slaConfig || {}) as Record<string, any>;

      const agentAssessments = boundAgents.map(agent => {
        const violations: Array<{ constraint: string; current: string; required: string; severity: string }> = [];
        if ((RISK_LEVELS[agent.riskTier] || 2) < outcomeRiskLevel) {
          violations.push({ constraint: "Risk Tier", current: agent.riskTier, required: outcome.riskTier || "MEDIUM", severity: "critical" });
        }
        if (slaConfig.maxP95LatencyMs && agent.avgLatencyMs && agent.avgLatencyMs > slaConfig.maxP95LatencyMs) {
          violations.push({ constraint: "P95 Latency", current: `${agent.avgLatencyMs}ms`, required: `<${slaConfig.maxP95LatencyMs}ms`, severity: "warning" });
        }
        for (const kpi of kpis) {
          if (kpi.slaThreshold) {
            const kpiNameLower = (kpi.name || "").toLowerCase();
            if (agent.successRate != null && (kpiNameLower.includes("success") || kpiNameLower.includes("accuracy") || kpiNameLower.includes("rate"))) {
              const agentRate = (agent.successRate || 0) * 100;
              if (agentRate < kpi.slaThreshold) {
                violations.push({ constraint: `KPI: ${kpi.name}`, current: `${agentRate.toFixed(1)}%`, required: `>=${kpi.slaThreshold}%`, severity: "warning" });
              }
            }
          }
        }
        const lastReviewEvent = reviewRequiredEvents.find(e => e.objectId === agent.id);
        return {
          agentId: agent.id,
          agentName: agent.name,
          agentRiskTier: agent.riskTier,
          agentStatus: agent.status,
          violations,
          needsReview: violations.length > 0,
          lastFlagged: lastReviewEvent?.createdAt || null,
        };
      });

      res.json({
        outcomeId: req.params.id,
        outcomeName: outcome.name,
        outcomeRiskTier: outcome.riskTier,
        boundAgentCount: boundAgents.length,
        nonCompliantCount: agentAssessments.filter(a => a.needsReview).length,
        agents: agentAssessments,
        recentSlaChanges: slaRenegotiationEvents.slice(0, 10).map(e => {
          let details: any = {};
          try { details = typeof e.details === "string" ? JSON.parse(e.details) : (e.details || {}); } catch {}
          return { id: e.id, timestamp: e.createdAt, details };
        }),
      });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.delete("/api/outcomes/:id", checkPermission("create_modify_outcomes"), async (req, res) => {
    try {
      const deleted = await storage.deleteOutcome(req.params.id as string, getOrgId(req));
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to delete outcome" });
    }
  });

  router.get("/api/kpis", async (_req, res) => {
    const kpis = await storage.getKpis();
    res.json(kpis);
  });

  router.get("/api/outcomes/:id/kpis", async (req, res) => {
    const kpis = await storage.getKpisByOutcome(req.params.id);
    res.json(kpis);
  });

  router.get("/api/outcomes/:id/evidence", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const kpis = await storage.getKpisByOutcome(outcomeId);
      const agents = await storage.getAgents(getOrgId(req));
      const traces = await storage.getTraces(getOrgId(req));
      const outcomeEvents = await storage.getOutcomeEvents(getOrgId(req));
      const boundAgents = agents.filter(a => a.outcomeId === outcomeId);
      const boundAgentIds = new Set(boundAgents.map(a => a.id));
      const relevantTraces = traces.filter(t => boundAgentIds.has(t.agentId));

      const now = Date.now();
      const kpiTimeSeries = kpis.map(kpi => {
        const points = [];
        for (let i = 6; i >= 0; i--) {
          const dayStart = new Date(now - (i + 1) * 86400000);
          const dayEnd = new Date(now - i * 86400000);
          const dayTraces = relevantTraces.filter(t => {
            const ts = new Date(t.startedAt || 0).getTime();
            return ts >= dayStart.getTime() && ts < dayEnd.getTime();
          });

          let value: number;
          const kpiNameLower = (kpi.name || "").toLowerCase();
          if (kpiNameLower.includes("success") || kpiNameLower.includes("accuracy") || kpiNameLower.includes("rate")) {
            if (dayTraces.length > 0) {
              const failed = dayTraces.filter(t => t.status === "failed" || t.status === "error").length;
              value = Math.round(((dayTraces.length - failed) / dayTraces.length) * 10000) / 100;
            } else {
              value = kpi.currentValue || kpi.baseline || 0;
            }
          } else if (kpiNameLower.includes("latency") || kpiNameLower.includes("time") || kpiNameLower.includes("response")) {
            if (dayTraces.length > 0) {
              const avgMs = dayTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / dayTraces.length;
              const unitLower = (kpi.unit || "").toLowerCase();
              if (unitLower === "minutes" || unitLower === "min") {
                value = Math.round((avgMs / 60000) * 100) / 100;
              } else if (unitLower === "seconds" || unitLower === "sec" || unitLower === "s") {
                value = Math.round((avgMs / 1000) * 10) / 10;
              } else {
                value = Math.round(avgMs);
              }
            } else {
              value = kpi.currentValue || kpi.baseline || 0;
            }
          } else if (kpiNameLower.includes("cost")) {
            if (dayTraces.length > 0) {
              value = parseFloat((dayTraces.length * (kpi.currentValue || 0.01)).toFixed(4));
            } else {
              value = kpi.currentValue || kpi.baseline || 0;
            }
          } else if (kpiNameLower.includes("volume") || kpiNameLower.includes("count") || kpiNameLower.includes("throughput")) {
            value = dayTraces.length;
          } else {
            if (dayTraces.length > 0) {
              const baseline = kpi.baseline || 0;
              const current = kpi.currentValue || 0;
              const progress = baseline + ((current - baseline) * (7 - i)) / 7;
              value = Math.round(progress * 100) / 100;
            } else {
              value = kpi.currentValue || kpi.baseline || 0;
            }
          }

          points.push({
            date: dayEnd.toISOString().split("T")[0],
            value,
            traceCount: dayTraces.length,
          });
        }
        return { kpiId: kpi.id, kpiName: kpi.name, unit: kpi.unit, target: kpi.target, baseline: kpi.baseline, points };
      });

      const totalTraces = relevantTraces.length;
      const failedTraces = relevantTraces.filter(t => t.status === "failed" || t.status === "error").length;
      const successRate = totalTraces > 0 ? ((totalTraces - failedTraces) / totalTraces) * 100 : 100;
      const avgLatency = totalTraces > 0 ? Math.round(relevantTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / totalTraces) : 0;

      const latencyTrend = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now - (i + 1) * 86400000);
        const dayEnd = new Date(now - i * 86400000);
        const dayTraces = relevantTraces.filter(t => {
          const ts = new Date(t.startedAt || 0).getTime();
          return ts >= dayStart.getTime() && ts < dayEnd.getTime();
        });
        const dayAvg = dayTraces.length > 0
          ? Math.round(dayTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / dayTraces.length)
          : avgLatency;
        latencyTrend.push({
          date: dayEnd.toISOString().split("T")[0],
          value: dayAvg,
        });
      }

      const relevantEvents = outcomeEvents.filter(e => e.outcomeId === outcomeId);
      const billableEvents = relevantEvents.filter(e => e.billable);
      const totalEvents = relevantEvents.length;
      const missingFields = relevantEvents.filter(e => {
        const p = (e.payload || {}) as Record<string, any>;
        return !p.agentRunId || !p.timestamp;
      }).length;

      const dataQuality = {
        totalEvents,
        billableEvents: billableEvents.length,
        missingFieldRate: totalEvents > 0 ? Math.round((missingFields / totalEvents) * 100) : 0,
        schemaConformance: totalEvents > 0 ? Math.round(((totalEvents - missingFields) / totalEvents) * 100) : 100,
        lastEventAt: relevantEvents.length > 0 ? relevantEvents[relevantEvents.length - 1].createdAt : null,
      };

      const now24hAgo = now - 86400000;
      const recentTraces = relevantTraces.filter(t => new Date(t.startedAt || 0).getTime() >= now24hAgo);
      const policyChecks24h = recentTraces.reduce((sum, t) => {
        const checks = t.policyChecks as any[] | null;
        return sum + (Array.isArray(checks) ? checks.length : 0);
      }, 0);

      res.json({
        kpiTimeSeries,
        correlatedMetrics: {
          successRate: Math.round(successRate * 10) / 10,
          avgLatency,
          totalRuns: totalTraces,
          failedRuns: failedTraces,
          latencyTrend,
          agentCount: boundAgents.length,
          policyChecks24h,
        },
        dataQuality,
      });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/outcomes/:id/recompute", async (req, res) => {
    try {
      const result = await recomputeOutcomeKpis(req.params.id, getOrgId(req));
      if (result.totalRuns === 0 && result.totalEvents === 0) {
        return res.json({ ...result, message: "No trace or event data available to recompute from." });
      }
      res.json(result);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/outcomes/:id/sync-eval-feedback", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ error: "Outcome not found" });

      const daysCutoff = req.body.days || 30;
      const cutoffDate = new Date(Date.now() - daysCutoff * 24 * 60 * 60 * 1000);

      const allEvents = await storage.getOutcomeEventsByOutcome(outcomeId, getOrgId(req));
      const recentEvents = allEvents.filter(e => e.createdAt && new Date(e.createdAt) >= cutoffDate);

      const rejectedEvents = recentEvents.filter(e => !e.billable && e.excludeReason);
      const acceptedEvents = recentEvents
        .filter(e => e.billable === true)
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 20);
      const allDisputes = await storage.getBillingDisputes();
      const outcomeDisputes = allDisputes.filter(d =>
        d.outcomeId === outcomeId && (d.status === "resolved" || d.status === "upheld")
      );

      const agents = (await storage.getAgents(getOrgId(req))).filter(a => a.outcomeId === outcomeId);
      if (agents.length === 0) return res.json({ created: 0, message: "No agents bound to this outcome" });

      const primaryAgent = agents[0];

      const existingSuites = await storage.getEvalsByAgent(primaryAgent.id);
      let kpiSuite: Awaited<ReturnType<typeof storage.createEvalSuite>> | undefined = existingSuites.find(s => s.type === "kpi_aligned");
      if (!kpiSuite) {
        const generated = await generateKpiAlignedEvalSuite(primaryAgent.id, outcomeId, getOrgId(req));
        if (generated) {
          kpiSuite = generated.suite;
        } else {
          kpiSuite = await storage.createEvalSuite({
            agentId: primaryAgent.id,
            name: `${primaryAgent.name} - Production Feedback Suite (${outcome.name})`,
            type: "kpi_aligned",
            totalCases: 0,
            coverageTags: ["production_feedback", "ground_truth"],
            ontologyTags: { kpiAligned: true, outcomeId, outcomeName: outcome.name, generatedAt: new Date().toISOString() },
          });
        }
      }

      const suiteId = kpiSuite!.id;
      const suiteName = kpiSuite!.name;

      const existingCases = await storage.getEvalTestCases(suiteId);
      const existingOriginIds = new Set(
        existingCases
          .filter(tc => tc.origin === "production_feedback")
          .map(tc => {
            const input = tc.inputData as Record<string, unknown> | null;
            return input?.sourceEventId || input?.sourceDisputeId;
          })
          .filter(Boolean)
      );

      const createdCases: any[] = [];

      const excludeGroups = new Map<string, typeof rejectedEvents>();
      for (const ev of rejectedEvents) {
        const reason = ev.excludeReason || "unknown";
        if (!excludeGroups.has(reason)) excludeGroups.set(reason, []);
        excludeGroups.get(reason)!.push(ev);
      }

      for (const ev of rejectedEvents) {
        if (existingOriginIds.has(ev.id)) continue;

        const tc = await storage.createEvalTestCase({
          suiteId: suiteId,
          name: `Production Rejection: ${ev.excludeReason || "excluded"} (${ev.type})`,
          inputData: {
            type: "production_feedback",
            sourceEventId: ev.id,
            traceId: ev.traceId,
            agentId: ev.agentId,
            eventType: ev.type,
            payload: ev.payload,
            scenario: "rejected_outcome_event",
            groundTruthLabel: "negative",
          },
          expectedOutput: {
            shouldPass: false,
            rejectionReason: ev.excludeReason,
            expectedBehavior: `Agent output was rejected: ${ev.excludeReason}. Future runs must not reproduce this failure pattern.`,
          },
          tags: ["production_feedback", "ground_truth", "rejected_event", ev.excludeReason || "excluded"],
          weight: 1.5,
          origin: "production_feedback",
          severity: "high",
        });
        createdCases.push(tc);
      }

      for (const dispute of outcomeDisputes) {
        if (existingOriginIds.has(dispute.id)) continue;

        let linkedEvent = null;
        if (dispute.outcomeEventId) {
          linkedEvent = await storage.getOutcomeEvent(dispute.outcomeEventId);
        }

        const tc = await storage.createEvalTestCase({
          suiteId: suiteId,
          name: `Billing Dispute: ${dispute.category} - ${dispute.reason.substring(0, 60)}`,
          inputData: {
            type: "production_feedback",
            sourceDisputeId: dispute.id,
            outcomeEventId: dispute.outcomeEventId,
            invoiceId: dispute.invoiceId,
            traceId: linkedEvent?.traceId,
            agentId: linkedEvent?.agentId,
            payload: linkedEvent?.payload,
            disputeCategory: dispute.category,
            scenario: "billing_dispute",
            groundTruthLabel: "negative",
          },
          expectedOutput: {
            shouldPass: false,
            disputeReason: dispute.reason,
            disputeCategory: dispute.category,
            disputeResolution: dispute.resolution,
            expectedBehavior: `Agent output led to billing dispute (${dispute.category}): ${dispute.reason}. Future runs must avoid this failure.`,
          },
          tags: ["production_feedback", "ground_truth", "billing_dispute", dispute.category],
          weight: 2.0,
          origin: "production_feedback",
          severity: "critical",
        });
        createdCases.push(tc);
      }

      let acceptedCreatedCount = 0;
      for (const ev of acceptedEvents) {
        if (existingOriginIds.has(ev.id)) continue;

        const tc = await storage.createEvalTestCase({
          suiteId: suiteId,
          name: `Production Accepted: ${ev.type} (billable)`,
          inputData: {
            type: "production_feedback",
            sourceEventId: ev.id,
            traceId: ev.traceId,
            agentId: ev.agentId,
            eventType: ev.type,
            payload: ev.payload,
            scenario: "accepted_outcome_event",
            groundTruthLabel: "positive",
          },
          expectedOutput: {
            shouldPass: true,
            expectedBehavior: `Agent output was accepted and billed successfully. This represents correct agent behavior for event type: ${ev.type}.`,
          },
          tags: ["production_feedback", "ground_truth", "accepted_event"],
          weight: 1.0,
          origin: "production_feedback",
          severity: "low",
        });
        createdCases.push(tc);
        acceptedCreatedCount++;
      }

      if (createdCases.length > 0) {
        const currentCases = await storage.getEvalTestCases(suiteId);
        await storage.updateEvalSuite(suiteId, { totalCases: currentCases.length });
      }

      const summary = {
        suiteId: suiteId,
        suiteName: suiteName,
        created: createdCases.length,
        fromRejectedEvents: rejectedEvents.filter(e => !existingOriginIds.has(e.id)).length,
        fromDisputes: outcomeDisputes.filter(d => !existingOriginIds.has(d.id)).length,
        fromAcceptedEvents: acceptedCreatedCount,
        totalRejectedEvents: rejectedEvents.length,
        totalAcceptedEvents: acceptedEvents.length,
        totalDisputes: outcomeDisputes.length,
        excludeReasonBreakdown: Object.fromEntries(
          Array.from(excludeGroups.entries()).map(([reason, events]) => [reason, events.length])
        ),
        daysCutoff,
      };

      await storage.createAuditEvent({
        actorType: "system",
        action: "production_feedback_synced",
        objectType: "eval_suite",
        objectId: suiteId,
        details: `Synced ${createdCases.length} production feedback cases (${acceptedCreatedCount} accepted, ${rejectedEvents.length} rejected events, ${outcomeDisputes.length} disputes) for outcome ${outcome.name}`,
      });

      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to sync production feedback" });
    }
  });

  router.get("/api/outcomes/:id/events", async (req, res) => {
    const outcomeEvents = await storage.getOutcomeEvents(getOrgId(req));
    const filtered = outcomeEvents.filter(e => e.outcomeId === req.params.id);
    res.json(filtered);
  });

  router.get("/api/outcomes/:id/audit", async (req, res) => {
    const auditEvents = await storage.getAuditEvents(getOrgId(req));
    const approvals = await storage.getApprovals(getOrgId(req));
    const boundAgents = (await storage.getAgents(getOrgId(req))).filter(a => a.outcomeId === req.params.id);
    const boundAgentIds = new Set(boundAgents.map(a => a.id));
    const outcomeAudits = auditEvents.filter(e =>
      e.objectId === req.params.id ||
      e.objectType === "outcome" ||
      (e.action === "agent.config_changed" && boundAgentIds.has(e.objectId as string))
    );
    const outcomeApprovals = approvals.filter(a => a.objectId === req.params.id);
    res.json({ auditEvents: outcomeAudits, approvals: outcomeApprovals });
  });

  router.get("/api/outcomes/:id/snapshots", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const window = (req.query.window as string) || "30d";
      const days = parseInt(window) || 30;
      const kpis = await storage.getKpisByOutcome(outcomeId);
      const outcomeEvents = (await storage.getOutcomeEvents(getOrgId(req))).filter(e => e.outcomeId === outcomeId);
      const agents = (await storage.getAgents(getOrgId(req))).filter(a => a.outcomeId === outcomeId);
      const now = Date.now();
      const windowMs = days * 24 * 60 * 60 * 1000;

      const snapshots: Array<{
        date: string;
        kpiValues: Array<{ kpiId: string; kpiName: string; value: number; confidence: number }>;
        topAgents: Array<{ agentId: string; agentName: string; contribution: number }>;
        eventCount: number;
        billableCount: number;
      }> = [];

      for (let d = 0; d < days; d++) {
        const dayTs = now - (days - 1 - d) * 24 * 60 * 60 * 1000;
        const dayStr = new Date(dayTs).toISOString().split("T")[0];
        const dayEvents = outcomeEvents.filter(e => {
          if (!e.createdAt) return false;
          const ts = new Date(e.createdAt).toISOString().split("T")[0];
          return ts === dayStr;
        });

        snapshots.push({
          date: dayStr,
          kpiValues: kpis.map(k => ({
            kpiId: k.id,
            kpiName: k.name,
            value: k.currentValue || 0,
            confidence: k.confidence || 0,
          })),
          topAgents: agents.slice(0, 3).map(a => ({
            agentId: a.id,
            agentName: a.name,
            contribution: a.successRate || 0,
          })),
          eventCount: dayEvents.length,
          billableCount: dayEvents.filter(e => e.billable).length,
        });
      }

      res.json({ snapshots, window, days });
    } catch (err) {
      res.status(500).json({ message: "Failed to get snapshots" });
    }
  });

  router.post("/api/outcomes/:id/versions", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const orgId = getOrgId(req);
      const outcome = await storage.getOutcome(outcomeId, orgId);
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const rawChanges = req.body.changes ?? {};
      const reason = (req.body.reason || "").trim();
      if (!reason) return res.status(400).json({ message: "reason is required" });

      const changesResult = insertOutcomeContractSchema
        .omit({ organizationId: true })
        .partial()
        .safeParse(rawChanges);
      if (!changesResult.success) {
        return res.status(400).json({ message: "Invalid changes payload", errors: changesResult.error.flatten() });
      }
      const changes = changesResult.data as Record<string, unknown>;

      const { updated, downstreamImpact } = await createOutcomeVersion(
        outcomeId,
        outcome,
        changes,
        null,   // auto-compute diff from existingOutcome vs changes
        reason,
        req.body.actorId || "system",
        "user",
        orgId,
      );

      res.status(201).json({ ...updated, _downstreamImpact: downstreamImpact });
    } catch (err) {
      res.status(500).json({ message: "Failed to create version" });
    }
  });

  router.get("/api/outcomes/:id/versions", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const auditEvents = await storage.getAuditEvents(getOrgId(req));
      const versionEvents = auditEvents.filter(
        e => e.objectId === outcomeId && (e.action === "version_created" || e.action === "create_outcome")
      ).sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime());

      const versions = versionEvents.map((evt) => {
        let details: any = {};
        try {
          details = typeof evt.details === "string" ? JSON.parse(evt.details) : evt.details || {};
        } catch { details = {}; }
        return {
          version: details.toVersion || details.version || outcome.version || 1,
          changedAt: evt.createdAt?.toISOString() || new Date().toISOString(),
          changedBy: evt.actorId || "system",
          summary: details.reason || evt.action.replace(/_/g, " "),
          diff: details.changes || {},
        };
      });

      if (versions.length === 0) {
        versions.push({
          version: outcome.version || 1,
          changedAt: outcome.createdAt?.toString() || new Date().toISOString(),
          changedBy: "system",
          summary: "Initial contract creation",
          diff: {},
        });
      }

      res.json(versions);
    } catch (err) {
      res.status(500).json({ message: "Failed to get versions" });
    }
  });

  router.get("/api/outcomes/:id/agent-contributions", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const agents = (await storage.getAgents(getOrgId(req))).filter(a => a.outcomeId === outcomeId);
      const traces = await storage.getTraces(getOrgId(req));
      const outcomeEvents = (await storage.getOutcomeEvents(getOrgId(req))).filter(e => e.outcomeId === outcomeId);
      const totalBillable = outcomeEvents.filter(e => e.billable).length;
      const totalRevenue = totalBillable * (outcome.pricePerUnit || 0);

      const hashStr = function(s: string) {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return Math.abs(h);
      }

      const totalAgentRuns = agents.reduce((s, a) => s + traces.filter(t => t.agentId === a.id).length, 0);

      const contributions = agents.map(agent => {
        const agentTraces = traces.filter(t => t.agentId === agent.id);
        const totalRuns = agentTraces.length;
        const failedRuns = agentTraces.filter(t => t.status === "failed" || t.status === "error").length;
        const successRate = totalRuns > 0 ? ((totalRuns - failedRuns) / totalRuns) * 100 : 100;
        const avgLatency = totalRuns > 0
          ? Math.round(agentTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / totalRuns)
          : 0;

        const valueShare = totalAgentRuns > 0 ? totalRuns / totalAgentRuns : (agents.length > 0 ? 1 / agents.length : 0);
        const deliveredValue = Math.round(totalRevenue * valueShare);

        const costPerRun = (agent as any).costPerRun || 0.01;
        const costToServe = Math.round(totalRuns * costPerRun * 100) / 100;

        const healthScore = Math.round(
          (successRate * 0.4) +
          (Math.max(0, 100 - avgLatency / 50) * 0.3) +
          ((totalRuns > 0 ? 80 : 30) * 0.3)
        );

        const successfulRuns = totalRuns - failedRuns;
        const capabilities = [
          { name: "Primary Task Execution", contribution: totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 80) : 0 },
          { name: "Error Recovery", contribution: failedRuns > 0 && totalRuns > 0 ? Math.round(((totalRuns - failedRuns) / totalRuns) * 15) : 10 },
          { name: "Data Processing", contribution: totalRuns > 0 ? Math.min(Math.round(totalRuns / Math.max(totalAgentRuns, 1) * 20), 20) : 0 },
        ];

        return {
          agentId: agent.id,
          agentName: agent.name,
          agentType: agent.agentType || "single",
          status: agent.status || "active",
          valueShare: Math.round(valueShare * 100),
          deliveredValue,
          costToServe,
          healthScore,
          successRate: Math.round(successRate * 10) / 10,
          avgLatency,
          totalRuns,
          failedRuns,
          capabilities,
          isUnderperforming: healthScore < 60 || successRate < 80,
        };
      });

      const totalShare = contributions.reduce((s, c) => s + c.valueShare, 0);
      if (totalShare > 0 && totalShare !== 100) {
        contributions.forEach(c => {
          c.valueShare = Math.round((c.valueShare / totalShare) * 100);
        });
      }

      res.json({
        contributions,
        summary: {
          totalAgents: agents.length,
          totalRevenue,
          underperformingCount: contributions.filter(c => c.isUnderperforming).length,
          avgHealthScore: contributions.length > 0
            ? Math.round(contributions.reduce((s, c) => s + c.healthScore, 0) / contributions.length)
            : 0,
        },
      });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/outcomes/:id/remediation", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const kpis = await storage.getKpisByOutcome(outcomeId);
      const agents = (await storage.getAgents(getOrgId(req))).filter(a => a.outcomeId === outcomeId);
      const traces = await storage.getTraces(getOrgId(req));
      const patches = await storage.getPatches();
      const incidents = await storage.getIncidents(getOrgId(req));

      const outcomeIncidents = incidents.filter(inc => {
        const agentIds = new Set(agents.map(a => a.id));
        return agentIds.has(inc.agentId);
      });
      const outcomePatches = patches.filter(p => {
        const agentIds = new Set(agents.map(a => a.id));
        return agentIds.has(p.agentId);
      });

      const risks: Array<{
        id: string;
        severity: string;
        category: string;
        title: string;
        description: string;
        affectedAgents: string[];
        affectedKpis: string[];
        detectedAt: string;
        recommendation: {
          type: string;
          title: string;
          description: string;
          linkedPatchId: string | null;
          linkedExperimentId: string | null;
          estimatedImpact: string;
          effort: string;
        };
      }> = [];

      const breachingKpis = kpis.filter(k => {
        if (!k.slaThreshold || !k.currentValue) return false;
        const isInverse = k.name.includes("Time") || k.name.includes("Latency");
        return isInverse ? k.currentValue > k.slaThreshold : k.currentValue < k.slaThreshold;
      });

      breachingKpis.forEach((kpi, i) => {
        const relatedPatch = outcomePatches.find(p => p.status === "proposed" || p.status === "pending_approval");
        risks.push({
          id: `risk-kpi-${kpi.id}`,
          severity: "high",
          category: "SLA Breach",
          title: `${kpi.name} breaching SLA threshold`,
          description: `Current value (${kpi.currentValue}) is ${kpi.name.includes("Time") ? "above" : "below"} the SLA threshold (${kpi.slaThreshold}). Immediate attention required.`,
          affectedAgents: agents.map(a => a.name),
          affectedKpis: [kpi.name],
          detectedAt: new Date().toISOString(),
          recommendation: {
            type: relatedPatch ? "patch" : "experiment",
            title: relatedPatch ? `Apply patch: ${relatedPatch.description?.slice(0, 50)}` : `Run A/B experiment on ${kpi.name} optimization`,
            description: relatedPatch
              ? `A proposed patch exists that may address this SLA breach. Review and approve to deploy.`
              : `Set up an experiment to test alternative agent configurations that could improve ${kpi.name}.`,
            linkedPatchId: relatedPatch?.id || null,
            linkedExperimentId: null,
            estimatedImpact: (() => {
              const gap = (kpi.slaThreshold || 0) - (kpi.currentValue || 0);
              const isInverse = kpi.name.includes("Time") || kpi.name.includes("Latency");
              const improvementPct = isInverse
                ? Math.min(30, Math.round(Math.abs(gap) / Math.max(kpi.currentValue || 1, 1) * 100))
                : Math.min(30, Math.round(Math.abs(gap) / Math.max(kpi.slaThreshold || 1, 1) * 100));
              return `+${Math.max(5, improvementPct)}% improvement in ${kpi.name}`;
            })(),
            effort: relatedPatch ? "Low" : "Medium",
          },
        });
      });

      agents.forEach(agent => {
        const agentTraces = traces.filter(t => t.agentId === agent.id);
        const failedCount = agentTraces.filter(t => t.status === "failed" || t.status === "error").length;
        const failRate = agentTraces.length > 0 ? failedCount / agentTraces.length : 0;
        if (failRate > 0.2 && agentTraces.length > 5) {
          risks.push({
            id: `risk-agent-${agent.id}`,
            severity: failRate > 0.5 ? "critical" : "medium",
            category: "Agent Health",
            title: `${agent.name} has ${Math.round(failRate * 100)}% failure rate`,
            description: `Agent "${agent.name}" has failed ${failedCount} out of ${agentTraces.length} runs. This is dragging down outcome delivery.`,
            affectedAgents: [agent.name],
            affectedKpis: kpis.map(k => k.name),
            detectedAt: new Date().toISOString(),
            recommendation: {
              type: "patch",
              title: `Reconfigure ${agent.name} with updated model parameters`,
              description: `Adjust model temperature, add retry logic, or switch to a more capable model to reduce failure rate.`,
              linkedPatchId: null,
              linkedExperimentId: null,
              estimatedImpact: `Reduce failure rate from ${Math.round(failRate * 100)}% to <10%`,
              effort: "Medium",
            },
          });
        }
      });

      if (outcome.maxDriftPercent) {
        const driftDetected = kpis.some(k => {
          if (!k.target || !k.currentValue) return false;
          const drift = Math.abs(((k.currentValue - k.target) / k.target) * 100);
          return drift > (outcome.maxDriftPercent || 10);
        });
        if (driftDetected) {
          risks.push({
            id: `risk-drift-${outcomeId}`,
            severity: "medium",
            category: "Drift",
            title: "KPI drift exceeds configured threshold",
            description: `One or more KPIs have drifted beyond the ${outcome.maxDriftPercent}% threshold. This may indicate model degradation or data distribution shift.`,
            affectedAgents: agents.map(a => a.name),
            affectedKpis: kpis.filter(k => k.target && k.currentValue && Math.abs(((k.currentValue - k.target) / k.target) * 100) > (outcome.maxDriftPercent || 10)).map(k => k.name),
            detectedAt: new Date().toISOString(),
            recommendation: {
              type: "experiment",
              title: "Run shadow replay to compare current vs baseline",
              description: "Use shadow replay to compare agent behavior against the last known-good configuration to identify regression root cause.",
              linkedPatchId: null,
              linkedExperimentId: null,
              estimatedImpact: "Identify root cause within 24 hours",
              effort: "Low",
            },
          });
        }
      }

      if (risks.length === 0) {
        risks.push({
          id: `risk-none-${outcomeId}`,
          severity: "low",
          category: "Healthy",
          title: "No active risks detected",
          description: "All KPIs are within SLA thresholds and all agents are operating normally.",
          affectedAgents: [],
          affectedKpis: [],
          detectedAt: new Date().toISOString(),
          recommendation: {
            type: "monitoring",
            title: "Continue monitoring",
            description: "No action required. Continue monitoring agent performance and KPI trajectories.",
            linkedPatchId: null,
            linkedExperimentId: null,
            estimatedImpact: "Maintain current performance",
            effort: "None",
          },
        });
      }

      res.json({
        risks: risks.sort((a, b) => {
          const sev = { critical: 0, high: 1, medium: 2, low: 3 };
          return (sev[a.severity as keyof typeof sev] || 3) - (sev[b.severity as keyof typeof sev] || 3);
        }),
        activeIncidents: outcomeIncidents.filter(i => i.status !== "resolved" && i.status !== "closed"),
        recentPatches: outcomePatches.slice(0, 5),
      });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/outcomes/:id/financial-ledger", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const outcomeEvents = (await storage.getOutcomeEvents(getOrgId(req))).filter(e => e.outcomeId === outcomeId);
      const invoices = await storage.getInvoices();
      const agents = (await storage.getAgents(getOrgId(req))).filter(a => a.outcomeId === outcomeId);
      const traces = await storage.getTraces(getOrgId(req));

      const totalCaptured = outcomeEvents.length;
      const billableEvents = outcomeEvents.filter(e => e.billable);
      const totalMetered = billableEvents.length;
      const pricePerUnit = outcome.pricePerUnit || 0;
      const meteredRevenue = totalMetered * pricePerUnit;

      const relevantInvoices = invoices.filter(inv =>
        (inv as any).lineItems?.some((li: any) => li.outcomeId === outcomeId)
      );
      const totalInvoiced = relevantInvoices.reduce((s, inv) => s + ((inv as any).totalAmount || 0), 0);
      const totalCollected = relevantInvoices.filter(inv => inv.status === "paid").reduce((s, inv) => s + ((inv as any).totalAmount || 0), 0);
      const totalDisputed = relevantInvoices.filter(inv => inv.status === "disputed").reduce((s, inv) => s + ((inv as any).totalAmount || 0), 0);

      const pipeline = [
        { stage: "captured", label: "Captured", count: totalCaptured, amount: totalCaptured * pricePerUnit },
        { stage: "metered", label: "Metered", count: totalMetered, amount: meteredRevenue },
        { stage: "invoiced", label: "Invoiced", count: relevantInvoices.length, amount: totalInvoiced || meteredRevenue * 0.95 },
        { stage: "collected", label: "Collected", count: relevantInvoices.filter(i => i.status === "paid").length, amount: totalCollected || meteredRevenue * 0.85 },
        { stage: "disputed", label: "Disputed", count: relevantInvoices.filter(i => i.status === "disputed").length, amount: totalDisputed },
      ];

      const eventDetails = outcomeEvents.slice(-20).map(evt => {
        const agentName = agents.find(a => a.id === evt.agentId)?.name || "Unknown";
        const trace = traces.find(t => t.agentId === evt.agentId);
        return {
          id: evt.id,
          type: evt.type,
          billable: evt.billable,
          amount: evt.billable ? pricePerUnit : 0,
          agentId: evt.agentId,
          agentName,
          traceId: trace?.id || null,
          createdAt: evt.createdAt,
        };
      });

      res.json({
        pipeline,
        invoices: relevantInvoices.map(inv => ({
          id: inv.id,
          status: inv.status,
          totalAmount: (inv as any).totalAmount,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          lineItemCount: ((inv as any).lineItems as any[])?.length || 0,
        })),
        recentEvents: eventDetails,
        summary: {
          totalCaptured,
          totalMetered,
          totalInvoiced: totalInvoiced || meteredRevenue * 0.95,
          totalCollected: totalCollected || meteredRevenue * 0.85,
          totalDisputed,
          exclusionRate: totalCaptured > 0 ? Math.round(((totalCaptured - totalMetered) / totalCaptured) * 100) : 0,
          totalRevenue: meteredRevenue,
          collectionRate: meteredRevenue > 0 ? Math.round((totalCollected / meteredRevenue) * 100) : 0,
          disputeRate: meteredRevenue > 0 ? Math.round((totalDisputed / meteredRevenue) * 100) : 0,
        },
      });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/exports/outcome/:id/audit", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const auditEvents = await storage.getAuditEvents(getOrgId(req));
      const approvals = await storage.getApprovals(getOrgId(req));
      const kpis = await storage.getKpisByOutcome(outcomeId);

      const outcomeAudits = auditEvents.filter(e => e.objectId === outcomeId || e.objectType === "outcome");
      const outcomeApprovals = approvals.filter(a => a.objectId === outcomeId);

      const bundle = {
        exportedAt: new Date().toISOString(),
        outcome: {
          id: outcome.id,
          name: outcome.name,
          version: outcome.version,
          status: outcome.status,
          riskTier: outcome.riskTier,
        },
        kpis: kpis.map(k => ({
          id: k.id,
          name: k.name,
          target: k.target,
          currentValue: k.currentValue,
          confidence: k.confidence,
          slaThreshold: k.slaThreshold,
        })),
        auditEvents: outcomeAudits.map(e => ({
          id: e.id,
          action: e.action,
          actorId: e.actorId,
          timestamp: e.createdAt,
          details: e.details,
        })),
        approvals: outcomeApprovals.map(a => ({
          id: a.id,
          type: a.type,
          status: a.status,
          decidedBy: a.decidedBy,
          decidedAt: a.decidedAt,
          riskScore: a.riskScore,
        })),
        totalAuditEvents: outcomeAudits.length,
        totalApprovals: outcomeApprovals.length,
      };

      res.json(bundle);
    } catch (err) {
      res.status(500).json({ message: "Failed to export audit bundle" });
    }
  });

  router.get("/api/outcomes/:id/kill-chain-alerts", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const kpis = await storage.getKpisByOutcome(outcomeId);
      const agents = (await storage.getAgents(getOrgId(req))).filter(a => a.outcomeId === outcomeId);

      if (agents.length === 0) {
        return res.json({ alerts: [], summary: { critical: 0, warning: 0, watch: 0, total: 0 } });
      }

      const allTraces = await storage.getTraces(getOrgId(req));
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const kpisWithThreshold = kpis.filter(k => k.slaThreshold != null && k.currentValue != null);

      const computeHeadroom = (kpi: typeof kpis[0]): number => {
        if (kpi.slaThreshold == null || kpi.currentValue == null) return Infinity;
        const isInverse = /time|latency|incident|error|fail/i.test(kpi.name || "");
        return isInverse
          ? (kpi.slaThreshold - kpi.currentValue)
          : (kpi.currentValue - kpi.slaThreshold);
      };

      const threatenedKpis = kpisWithThreshold.filter(k => computeHeadroom(k) < (k.slaThreshold || 1) * 0.2);

      type KillChainAlert = {
        alertId: string;
        severity: string;
        agentId: string;
        agentName: string;
        driftMetric: string;
        driftPercent: number;
        driftSeverity: string;
        suiteName: string;
        threatenedKpis: Array<{ kpiName: string; currentValue: number; slaThreshold: number; headroom: number; unit: string }>;
        recommendedAction: string;
        detectedAt: string;
        healingPipelineId?: string;
      };

      const alerts: KillChainAlert[] = [];

      for (const agent of agents) {
        const agentTraces = allTraces.filter(t => t.agentId === agent.id);
        const recentTraces = agentTraces.filter(t => t.startedAt && new Date(t.startedAt) >= sevenDaysAgo);

        const baselinePassRate = agent.successRate != null ? agent.successRate * 100 : null;
        const baselineLatencyMs = agent.avgLatencyMs ?? null;

        if (recentTraces.length >= 3) {
          const recentSuccessful = recentTraces.filter(t => t.status === "completed" || t.status === "success").length;
          const currentPassRate = (recentSuccessful / recentTraces.length) * 100;

          if (baselinePassRate !== null && baselinePassRate > 0) {
            const passRateDrift = ((baselinePassRate - currentPassRate) / baselinePassRate) * 100;
            if (passRateDrift > 10) {
              const severity = passRateDrift > 35 ? "critical" : passRateDrift > 20 ? "warning" : "watch";
              const alertThreatened = threatenedKpis
                .filter(k => !/time|latency/i.test(k.name || ""))
                .map(k => ({
                  kpiName: k.name,
                  currentValue: k.currentValue as number,
                  slaThreshold: k.slaThreshold as number,
                  headroom: Math.round(computeHeadroom(k) * 10) / 10,
                  unit: k.unit || "",
                }));

              if (alertThreatened.length > 0 || passRateDrift > 25) {
                alerts.push({
                  alertId: `${agent.id}-passrate-${Date.now()}`,
                  severity,
                  agentId: agent.id,
                  agentName: agent.name,
                  driftMetric: "pass_rate",
                  driftPercent: Math.round(passRateDrift * 10) / 10,
                  driftSeverity: severity,
                  suiteName: "Live Traces",
                  threatenedKpis: alertThreatened.length > 0 ? alertThreatened : kpisWithThreshold.slice(0, 3).map(k => ({
                    kpiName: k.name,
                    currentValue: k.currentValue as number,
                    slaThreshold: k.slaThreshold as number,
                    headroom: Math.round(computeHeadroom(k) * 10) / 10,
                    unit: k.unit || "",
                  })),
                  recommendedAction: `Pass rate degraded ${Math.round(passRateDrift)}% below baseline. Review recent run failures and consider rolling back model config.`,
                  detectedAt: new Date().toISOString(),
                });
              }
            }
          }
        }

        if (recentTraces.length >= 3 && baselineLatencyMs !== null && baselineLatencyMs > 0) {
          const recentAvgLatency = recentTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / recentTraces.length;
          const latencyDrift = ((recentAvgLatency - baselineLatencyMs) / baselineLatencyMs) * 100;
          if (latencyDrift > 30) {
            const severity = latencyDrift > 80 ? "critical" : latencyDrift > 50 ? "warning" : "watch";
            const latencyKpis = kpisWithThreshold.filter(k => /time|latency/i.test(k.name || "")).map(k => ({
              kpiName: k.name,
              currentValue: k.currentValue as number,
              slaThreshold: k.slaThreshold as number,
              headroom: Math.round(computeHeadroom(k) * 10) / 10,
              unit: k.unit || "",
            }));

            if (latencyKpis.length > 0) {
              alerts.push({
                alertId: `${agent.id}-latency-${Date.now()}`,
                severity,
                agentId: agent.id,
                agentName: agent.name,
                driftMetric: "avg_latency",
                driftPercent: Math.round(latencyDrift * 10) / 10,
                driftSeverity: severity,
                suiteName: "Live Traces",
                threatenedKpis: latencyKpis,
                recommendedAction: `Latency up ${Math.round(latencyDrift)}% vs baseline (${Math.round(recentAvgLatency)}ms vs ${baselineLatencyMs}ms). Check model provider status or switch to faster model tier.`,
                detectedAt: new Date().toISOString(),
              });
            }
          }
        }

        if (recentTraces.length >= 5) {
          const failRate = recentTraces.filter(t => t.status === "failed" || t.status === "error").length / recentTraces.length;
          if (failRate > 0.3 && (baselinePassRate === null || failRate * 100 > (100 - baselinePassRate) * 2)) {
            const severity = failRate > 0.6 ? "critical" : "warning";
            const alreadyHasAlert = alerts.some(a => a.agentId === agent.id && a.driftMetric === "pass_rate");
            if (!alreadyHasAlert) {
              const allKpisMapped = kpisWithThreshold.map(k => ({
                kpiName: k.name,
                currentValue: k.currentValue as number,
                slaThreshold: k.slaThreshold as number,
                headroom: Math.round(computeHeadroom(k) * 10) / 10,
                unit: k.unit || "",
              }));
              alerts.push({
                alertId: `${agent.id}-failrate-${Date.now()}`,
                severity,
                agentId: agent.id,
                agentName: agent.name,
                driftMetric: "pass_rate",
                driftPercent: Math.round(failRate * 100 * 10) / 10,
                driftSeverity: severity,
                suiteName: "Live Traces",
                threatenedKpis: allKpisMapped,
                recommendedAction: `${Math.round(failRate * 100)}% failure rate over last 7 days. Inspect error logs and consider pausing agent until root cause is resolved.`,
                detectedAt: new Date().toISOString(),
              });
            }
          }
        }
      }

      const summary = {
        critical: alerts.filter(a => a.severity === "critical").length,
        warning: alerts.filter(a => a.severity === "warning").length,
        watch: alerts.filter(a => a.severity === "watch").length,
        total: alerts.length,
      };

      res.json({ alerts, summary });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/outcomes/:id/regenerate-constraint-graph", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const kpis = await storage.getKpisByOutcome(outcomeId);
      const graph = computeConstraintGraph(outcome, kpis);
      const updated = await storage.updateOutcome(outcomeId, { constraintGraph: graph }, getOrgId(req));

      await storage.createAuditEvent({
        actorType: "user",
        actorId: "system",
        action: "outcome.constraint_graph_regenerated",
        objectType: "outcome",
        objectId: outcomeId,
        details: JSON.stringify({
          kpiCount: kpis.length,
          nodeCount: Array.isArray((graph as any)?.nodes) ? (graph as any).nodes.length : 0,
          edgeCount: Array.isArray((graph as any)?.edges) ? (graph as any).edges.length : 0,
        }),
        ontologyTags: resolveOntologyTags("outcome", "outcome.constraint_graph_regenerated"),
      });

      res.json({ success: true, updatedAt: new Date().toISOString(), outcome: updated });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Persist a business-authored process flow on the outcome (canonical typed steps).
  router.put("/api/outcomes/:id/process-flow", checkPermission("create_modify_outcomes"), async (req, res) => {
    try {
      const outcomeId = String(req.params.id);
      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      // Accept either a legacy ordered step list or a graph ({nodes, edges});
      // both normalize to the canonical graph stored on the outcome.
      const bodySchema = z.object({
        name: z.string().optional().default(""),
        steps: z.array(z.any()).max(100).optional(),
        nodes: z.array(z.any()).max(100).optional(),
        edges: z.array(z.any()).max(300).optional(),
      });
      const parsed = bodySchema.parse(req.body);

      const graph = normalizeToGraph(parsed, outcome.name || "Process Flow");
      if (!graph) return res.status(400).json({ message: "Invalid process flow payload" });
      const processFlow = { ...graph, updatedAt: new Date().toISOString() };

      const updated = await storage.updateOutcome(outcomeId, { processFlow } as Partial<OutcomeContract>, getOrgId(req));
      if (!updated) return res.status(404).json({ message: "Not found" });

      await storage.createAuditEvent({
        actorType: "user",
        actorId: "system",
        action: "outcome.process_flow_updated",
        objectType: "outcome",
        objectId: outcomeId,
        details: JSON.stringify({ nodeCount: processFlow.nodes.length, edgeCount: processFlow.edges.length, name: processFlow.name }),
        ontologyTags: resolveOntologyTags("outcome", "outcome.process_flow_updated"),
      });

      res.json({ success: true, processFlow, outcome: updated });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Compile an (in-editor or stored) process flow into an executable wave plan
  // using the same DAG engine that runs team blueprints. Stateless preview.
  router.post("/api/process-flow/compile", async (req, res) => {
    try {
      const bodySchema = z.object({
        name: z.string().optional().default(""),
        steps: z.array(z.any()).max(100).optional(),
        nodes: z.array(z.any()).max(100).optional(),
        edges: z.array(z.any()).max(300).optional(),
      });
      const parsed = bodySchema.parse(req.body);
      const graph = normalizeToGraph(parsed, parsed.name || "Process Flow");
      if (!graph) return res.status(400).json({ message: "Invalid process flow payload" });
      res.json(compileProcessFlow(graph));
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Process-flow node types that never get their own blueprint node: "trigger"
  // is the kickoff signal (the orchestrator's own dispatch already plays that
  // role) and "end" is a terminal marker with no work to do.
  const STRUCTURAL_NODE_TYPES = new Set(["trigger", "end"]);
  // Types that become a pause-and-wait edge_gate node (a real human decision)
  // instead of an LLM-drafted worker agent -- same convention as
  // create-team-from-proposals' isHumanCheckpoint flag.
  const HUMAN_CHECKPOINT_NODE_TYPES = new Set(["expert_approval"]);

  function processNodeConfig(n: ProcessNode) {
    return {
      sourceProcessNodeId: n.id, sourceLabel: n.label, sourceDescription: n.description || "", sourceType: n.type, sourceActor: n.actor || "",
      // Persisted so a re-sync can tell "the referenced flow changed" apart
      // from "nothing changed" -- the label/description/type/actor comparison
      // alone can't see a change confined to config.refTeamAgentId.
      sourceRefTeamAgentId: (n.config as any)?.refTeamAgentId || null,
      sourceExpression: (n.config as any)?.expression || null,
    };
  }

  // Sync an already-saved process flow into the live blueprint of the team
  // agent it was used to build -- see the plan at
  // C:\Users\swarupd\.claude\plans\snappy-puzzling-sprout.md for the full
  // design rationale (TC_PROCESS_WORKFLOW_001). Diffs the flow's nodes
  // against the blueprint's existing ones by a persisted sourceProcessNodeId
  // correlation (stored in each blueprint node's config, alongside the
  // process node's label/description/type/actor at the time it was last
  // synced -- NOT the blueprint node's own `label`, which for an
  // internal_agent node is the LLM-drafted agent's name, not the process
  // step's label, so it can never be compared directly to a ProcessNode).
  // Only changed/added nodes get a fresh LLM draft; unchanged nodes and their
  // agents are left completely untouched.
  router.post("/api/outcomes/:id/process-flow/sync-to-automation", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const outcomeId = String(req.params.id);
      const orgId = getOrgId(req);
      const { teamAgentId, forceFullRebuild } = z.object({
        teamAgentId: z.string(),
        forceFullRebuild: z.boolean().optional(),
      }).parse(req.body);

      const outcome = await storage.getOutcome(outcomeId, orgId);
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });
      const graph = normalizeToGraph(outcome.processFlow, outcome.name || "Process Flow");
      if (!graph || graph.nodes.length === 0) {
        return res.status(400).json({ message: "This outcome has no saved process flow to sync. Save one from Process Flow Studio first." });
      }

      const teamAgent = await storage.getAgent(teamAgentId, orgId);
      if (!teamAgent || teamAgent.agentType !== "team" || teamAgent.outcomeId !== outcomeId) {
        return res.status(404).json({ message: "Team agent not found for this outcome." });
      }
      const blueprintId = (teamAgent as any).blueprintId as string | null;
      if (!blueprintId) {
        return res.status(400).json({ message: "This automation has no blueprint yet -- use \"Turn into a live automation\" first." });
      }

      // Guard: an in-flight run reads the blueprint live at start/resume with
      // no snapshot insulation (see dag-execution-engine.ts's
      // setupTeamAgentDagRun/setupResumeForDagRun) -- mutating it underneath
      // a running or approval-paused run can execute the wrong node or
      // resume against a stale approval. Block instead of racing it.
      const recentRuns = await storage.listDagExecutionRunsByTeamAgent(teamAgentId, 50);
      const inFlight = recentRuns.find(r => r.status === "running" || r.status === "waiting_approval");
      if (inFlight) {
        return res.status(409).json({
          message: "This automation has a run in progress. Finish or cancel it before syncing.",
          runId: inFlight.id,
          runStatus: inFlight.status,
        });
      }

      const blueprint = await storage.getBlueprint(blueprintId);
      if (!blueprint) return res.status(404).json({ message: "Blueprint not found." });
      const [existingNodes, existingEdges] = await Promise.all([
        storage.getTeamBlueprintNodes(blueprintId),
        storage.getTeamBlueprintEdges(blueprintId),
      ]);

      const orchestratorNode = existingNodes.find(n => (n.config as any)?.role === "orchestrator");
      const existingProcessNodes = existingNodes.filter(n => n.id !== orchestratorNode?.id);
      const hasCorrelation = existingProcessNodes.some(n => !!(n.config as any)?.sourceProcessNodeId);

      // First-ever sync of a blueprint that predates this feature: existing
      // node labels are drafted agent names, not process-flow labels, so any
      // automatic match would be a guess presented as certainty. Surface the
      // choice explicitly instead of silently reconciling.
      if (!hasCorrelation && existingProcessNodes.length > 0 && !forceFullRebuild) {
        return res.json({
          needsChoice: "legacy_blueprint",
          message: "This automation predates edit-tracking, so its current agents can't be matched to specific process-flow steps. Rebuild it fully (every current step gets a fresh agent; existing ones are superseded) or skip syncing for now.",
        });
      }

      const runNodes = graph.nodes.filter(n => !STRUCTURAL_NODE_TYPES.has(n.type));
      const byProcessNodeId = new Map<string, typeof existingProcessNodes[number]>();
      if (!forceFullRebuild) {
        for (const n of existingProcessNodes) {
          const srcId = (n.config as any)?.sourceProcessNodeId;
          if (srcId) byProcessNodeId.set(srcId, n);
        }
      }

      const unchanged: typeof existingProcessNodes = [];
      const changed: ProcessNode[] = [];
      const added: ProcessNode[] = [];
      const runNodeIds = new Set(runNodes.map(n => n.id));

      for (const pn of runNodes) {
        const existing = byProcessNodeId.get(pn.id);
        if (!existing) { added.push(pn); continue; }
        const cfg = (existing.config as any) || {};
        const same = cfg.sourceLabel === pn.label && (cfg.sourceDescription || "") === (pn.description || "")
          && cfg.sourceType === pn.type && (cfg.sourceActor || "") === (pn.actor || "")
          && (cfg.sourceRefTeamAgentId || null) === ((pn.config as any)?.refTeamAgentId || null)
          && (cfg.sourceExpression || null) === ((pn.config as any)?.expression || null);
        if (same) unchanged.push(existing); else changed.push(pn);
      }
      // forceFullRebuild deliberately leaves byProcessNodeId empty (nothing
      // correlates), so "removed" there means every existing process node,
      // not "nodes byProcessNodeId knows about that vanished" -- the latter
      // would silently leave every legacy node in place forever.
      const removedNodes = forceFullRebuild
        ? existingProcessNodes
        : Array.from(byProcessNodeId.entries())
            .filter(([pnId]) => !runNodeIds.has(pnId))
            .map(([, node]) => node);
      // A "changed" node's old blueprint row is mechanically identical to a
      // removed one -- it gets deleted and its agent superseded, same as
      // §removedNodes, then rebuilt fresh in the "toCreate" pass below. New
      // identity for the new role, not an in-place prompt rewrite -- keeps
      // each agent's own trace/audit history meaning what it says.
      const changedOldNodes = changed
        .map(pn => byProcessNodeId.get(pn.id))
        .filter((n): n is NonNullable<typeof n> => !!n);

      const industryId = (teamAgent as any).industry || "general";
      const superseded: Array<{ label: string; agentId: string }> = [];
      const nodeIdMap = new Map<string, string>(); // ProcessNode.id -> new/kept teamBlueprintNode.id
      for (const n of unchanged) nodeIdMap.set((n.config as any).sourceProcessNodeId, n.id);

      // Delete removed + changed-old blueprint nodes, superseding (not
      // retiring -- that's a real, optionally approval-gated workflow this
      // background sync shouldn't short-circuit) their now-orphaned agents.
      for (const node of [...removedNodes, ...changedOldNodes]) {
        const refAgentId = (node as any).refAgentId as string | null;
        if (refAgentId) {
          const agent = await storage.getAgent(refAgentId, orgId);
          if (agent) superseded.push({ label: (node.config as any)?.sourceLabel || node.label, agentId: refAgentId });
        }
        await storage.deleteTeamBlueprintNode(node.id);
      }

      // Draft/create changed + added nodes -- isolated failures, one node's
      // draft failing doesn't roll back the others.
      const toCreate = [...changed, ...added];
      const created = await Promise.all(toCreate.map(async (pn) => {
        try {
          if (HUMAN_CHECKPOINT_NODE_TYPES.has(pn.type)) {
            const node = await storage.createTeamBlueprintNode({
              blueprintId,
              nodeType: "edge_gate",
              gateType: "approval",
              label: pn.label,
              refAgentId: null,
              config: processNodeConfig(pn),
            });
            return { pn, node, ok: true as const };
          }
          if (pn.type === "sub_flow") {
            const refTeamAgentId = (pn.config as any)?.refTeamAgentId || null;
            if (!refTeamAgentId) {
              return { pn, node: null, ok: false as const, error: `"${pn.label}" has no flow selected -- pick one in Process Flow Studio before syncing.` };
            }
            const node = await storage.createTeamBlueprintNode({
              blueprintId,
              nodeType: "sub_flow",
              label: pn.label,
              refAgentId: null,
              refTeamAgentId,
              stateKey: pn.id.replace(/-/g, "_"),
              config: processNodeConfig(pn),
            });
            return { pn, node, ok: true as const };
          }
          if (pn.type === "expression") {
            const expression = (pn.config as any)?.expression || null;
            if (!expression) {
              return { pn, node: null, ok: false as const, error: `"${pn.label}" has no expression -- write one in Process Flow Studio before syncing.` };
            }
            const node = await storage.createTeamBlueprintNode({
              blueprintId,
              nodeType: "expression",
              label: pn.label,
              refAgentId: null,
              stateKey: pn.id.replace(/-/g, "_"),
              config: { ...processNodeConfig(pn), expression },
            });
            return { pn, node, ok: true as const };
          }
          const description = `${pn.label}${pn.description ? ": " + pn.description : ""}${pn.actor ? ` (performed by ${pn.actor})` : ""}`;
          const { draft } = await draftSingleAgent(description, industryId, orgId);
          const agent = await storage.createAgent({
            name: draft.name,
            description: draft.description,
            owner: "system",
            agentType: "single",
            outcomeId,
            riskTier: draft.riskTier || "MEDIUM",
            autonomyMode: draft.autonomyMode || "assisted",
            systemPrompt: draft.systemPrompt || "",
            toolsConfig: draft.toolsConfig || [],
            policyBindings: draft.policyBindings?.length ? { policies: draft.policyBindings.map((b: any) => b.policyName) } : {},
            ontologyTags: draft.ontologyTags?.length ? { concepts: draft.ontologyTags } : {},
            preloadedSkills: draft.preloadedSkills || [],
            runtimeConfig: { prompt: description, guardrailsConfig: draft.guardrailsConfig, evalSuiteConfig: draft.evalSuiteConfig },
          } as any);
          const node = await storage.createTeamBlueprintNode({
            blueprintId,
            nodeType: "internal_agent",
            label: agent.name,
            refAgentId: agent.id,
            config: processNodeConfig(pn),
          });
          return { pn, node, ok: true as const };
        } catch (err: any) {
          console.error(`[process-flow-sync] failed to draft node "${pn.label}":`, err.message);
          return { pn, node: null, ok: false as const, error: err.message };
        }
      }));
      for (const c of created) if (c.ok && c.node) nodeIdMap.set(c.pn.id, c.node.id);
      const draftFailures = created.filter(c => !c.ok).map(c => ({ label: c.pn.label, error: (c as any).error }));

      // Rebuild ONLY edges between two real process nodes -- edges touching
      // the orchestrator are synthesized (dispatch/fork/return), never 1:1
      // from a ProcessEdge, and are reconciled separately below by topology,
      // not by diffing ProcessEdge entries.
      const existingProcessEdges = existingEdges.filter(e => e.sourceNodeId !== orchestratorNode?.id && e.targetNodeId !== orchestratorNode?.id);
      const oldEndpointsByPnPair = new Map<string, typeof existingProcessEdges[number]>();
      for (const e of existingProcessEdges) {
        const srcPn = existingProcessNodes.find(n => n.id === e.sourceNodeId);
        const tgtPn = existingProcessNodes.find(n => n.id === e.targetNodeId);
        const srcId = (srcPn?.config as any)?.sourceProcessNodeId;
        const tgtId = (tgtPn?.config as any)?.sourceProcessNodeId;
        if (srcId && tgtId) oldEndpointsByPnPair.set(`${srcId}::${tgtId}`, e);
      }
      const runEdges = graph.edges.filter(e => runNodeIds.has(e.from) && runNodeIds.has(e.to));
      const keptPairKeys = new Set<string>();
      for (const e of runEdges) {
        const key = `${e.from}::${e.to}`;
        const srcNodeId = nodeIdMap.get(e.from);
        const tgtNodeId = nodeIdMap.get(e.to);
        if (!srcNodeId || !tgtNodeId) continue; // endpoint failed to draft -- skip, already reported in draftFailures
        const existingEdge = oldEndpointsByPnPair.get(key);
        // Endpoints both unchanged (same blueprint node ids as before) AND an
        // edge already connects them -- leave it untouched. This is what
        // preserves any evaluationMode:"deterministic" + rule an admin
        // hardened after creation; recreating the edge fresh would silently
        // downgrade it back to "ai".
        if (existingEdge && existingEdge.sourceNodeId === srcNodeId && existingEdge.targetNodeId === tgtNodeId) {
          keptPairKeys.add(key);
          continue;
        }
        if (existingEdge) await storage.deleteTeamBlueprintEdge(existingEdge.id);
        await storage.createTeamBlueprintEdge({
          blueprintId,
          sourceNodeId: srcNodeId,
          targetNodeId: tgtNodeId,
          label: e.label || undefined,
          condition: e.condition || undefined,
          failureMode: "escalate",
        });
        keptPairKeys.add(key);
      }
      // Drop process-to-process edges whose pair no longer exists in the new graph.
      for (const [key, edge] of Array.from(oldEndpointsByPnPair.entries())) {
        if (!keptPairKeys.has(key)) await storage.deleteTeamBlueprintEdge(edge.id);
      }

      // Reconcile the orchestrator's synthesized edges by topology (entry /
      // terminal nodes among the process-to-process edges), not by copying
      // ProcessEdge entries -- the orchestrator has no sourceProcessNodeId
      // and its dispatch/return edges were never 1:1 with the process graph
      // in the first place (see create-team-from-proposals' tier-adjacency
      // synthesis). This produces the same edges as that heuristic for the
      // common single-tier case and degrades gracefully for more complex
      // flows -- execution readiness depends on connectivity, not the exact
      // "dispatch" vs "fork" vs "handoff" label wording.
      if (orchestratorNode) {
        const hasIncoming = new Set(runEdges.map(e => e.to));
        const hasOutgoing = new Set(runEdges.map(e => e.from));
        const entryNodeIds = runNodes.filter(n => !hasIncoming.has(n.id)).map(n => n.id);
        const isFanOutFanIn = (blueprint.blueprintJson as any)?.pattern === "fan_out_fan_in";
        const terminalNodeIds = isFanOutFanIn ? runNodes.filter(n => !hasOutgoing.has(n.id)).map(n => n.id) : [];

        const existingDispatch = existingEdges.filter(e => e.sourceNodeId === orchestratorNode.id);
        const existingReturn = existingEdges.filter(e => e.targetNodeId === orchestratorNode.id);
        const dispatchTargets = new Set(entryNodeIds.map(id => nodeIdMap.get(id)).filter(Boolean) as string[]);
        const returnSources = new Set(terminalNodeIds.map(id => nodeIdMap.get(id)).filter(Boolean) as string[]);

        for (const e of existingDispatch) if (!dispatchTargets.has(e.targetNodeId)) await storage.deleteTeamBlueprintEdge(e.id);
        for (const e of existingReturn) if (!returnSources.has(e.sourceNodeId)) await storage.deleteTeamBlueprintEdge(e.id);
        const existingDispatchTargets = new Set(existingDispatch.map(e => e.targetNodeId));
        const existingReturnSources = new Set(existingReturn.map(e => e.sourceNodeId));
        for (const targetId of Array.from(dispatchTargets)) {
          if (!existingDispatchTargets.has(targetId)) {
            await storage.createTeamBlueprintEdge({ blueprintId, sourceNodeId: orchestratorNode.id, targetNodeId: targetId, label: "dispatch", failureMode: "escalate" });
          }
        }
        for (const sourceId of Array.from(returnSources)) {
          if (!existingReturnSources.has(sourceId)) {
            await storage.createTeamBlueprintEdge({ blueprintId, sourceNodeId: sourceId, targetNodeId: orchestratorNode.id, label: "return results", failureMode: "escalate" });
          }
        }
      }

      await storage.createAuditEvent({
        actorType: "system",
        actorId: "process_flow_sync",
        action: "outcome.process_flow_synced",
        objectType: "blueprint",
        objectId: blueprintId,
        organizationId: orgId,
        details: JSON.stringify({
          outcomeId,
          teamAgentId,
          unchanged: unchanged.length,
          changed: changed.map(n => n.label),
          added: added.map(n => n.label),
          removed: removedNodes.map(n => (n.config as any)?.sourceLabel || n.label),
          draftFailures,
        }),
        ontologyTags: resolveOntologyTags("outcome", "outcome.process_flow_synced"),
      });

      res.json({
        summary: {
          unchanged: unchanged.length,
          changed: changed.map(n => n.label),
          added: added.map(n => n.label),
          superseded,
          draftFailures,
        },
      });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/kpis", async (req, res) => {
    try {
      const data = insertKpiDefinitionSchema.parse(req.body);
      const kpi = await storage.createKpi(data);
      res.status(201).json(kpi);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.patch("/api/kpis/:id", async (req, res) => {
    try {
      const data = insertKpiDefinitionSchema.partial().parse(req.body);

      // Fetch old KPI record before updating so we have true before/after values
      const existingKpi = await storage.getKpi(req.params.id);
      const updated = await storage.updateKpi(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "Not found" });

      // Trigger a parent outcome version bump only when version-worthy KPI fields
      // actually CHANGED (compare old vs new values, not just field presence).
      // Uses the shared createOutcomeVersion helper so audit format and downstream-
      // impact analysis are identical to POST /api/outcomes/:id/versions.
      const VERSION_WORTHY_KPI_FIELDS = ["target", "slaThreshold", "weight"] as const;
      const kpiVersionWorthyChanged = existingKpi !== undefined && VERSION_WORTHY_KPI_FIELDS.some(f => {
        if (data[f] === undefined) return false;
        return JSON.stringify(existingKpi[f]) !== JSON.stringify(data[f]);
      });

      let versionActuallyBumped = false;
      if (kpiVersionWorthyChanged && updated.outcomeId) {
        const parentOutcome = await storage.getOutcome(updated.outcomeId, getOrgId(req));
        if (parentOutcome) {
          const kpiAuditDiff: Record<string, { from: unknown; to: unknown }> = {};
          if (existingKpi) {
            for (const f of VERSION_WORTHY_KPI_FIELDS) {
              if (data[f] !== undefined && JSON.stringify(existingKpi[f]) !== JSON.stringify(data[f])) {
                kpiAuditDiff[`kpi_${f}`] = { from: existingKpi[f], to: data[f] };
              }
            }
          }
          await createOutcomeVersion(
            updated.outcomeId,
            parentOutcome,
            {},
            kpiAuditDiff,
            `KPI definition updated: ${updated.name}`,
            "system",
            "system",
            getOrgId(req),
          );
          versionActuallyBumped = true;
        }
      }

      res.json({ ...updated, _versionBumped: versionActuallyBumped });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.delete("/api/kpis/:id", async (req, res) => {
    await storage.deleteKpi(req.params.id);
    res.status(204).send();
  });


export default router;
