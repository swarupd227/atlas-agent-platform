import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { desc, eq } from "drizzle-orm";
import { outcomeContracts, kpiDefinitions } from "@shared/schema";
import { z, ZodError } from "zod";
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
} from "./helpers";

const router = Router();

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

      // Tool catalog coverage
      const toolCoverage = toolNames.map((toolName) => {
        const nameLow = toolName.toLowerCase().replace(/[\s_-]+/g, "_");
        const exactMatch = allTools.find((t) => t.name.toLowerCase().replace(/[\s_-]+/g, "_") === nameLow);
        const partialMatch =
          !exactMatch &&
          allTools.find(
            (t) =>
              t.name.toLowerCase().includes(toolName.toLowerCase().replace(/_/g, " ")) ||
              toolName.toLowerCase().includes(t.name.toLowerCase().replace(/_/g, " "))
          );
        const match = exactMatch || partialMatch;
        return {
          proposedName: toolName,
          status: exactMatch ? "exists" : partialMatch ? "partial" : "missing",
          matchedTool: match
            ? {
                id: match.id,
                name: match.name,
                riskClassification: match.riskClassification || "low",
                serverId: match.serverId,
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
      const parsedOutcome = insertOutcomeContractSchema.omit({ organizationId: true }).parse({
        ...outcomeData,
        slaConfig: constraints ? { constraints, ...(outcomeData.slaConfig || {}) } : outcomeData.slaConfig,
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
        const [updatedOutcome] = await tx.update(outcomeContracts).set({ constraintGraph: graph }).where(eq(outcomeContracts.id, outcome.id)).returning();
        return { outcome: updatedOutcome, kpis: createdKpis };
      });
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

      const allEvents = await storage.getOutcomeEventsByOutcome(outcomeId);
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
      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const newVersion = (outcome.version || 1) + 1;
      const changes = req.body.changes || {};
      const reason = req.body.reason || "Version bump";

      const updated = await storage.updateOutcome(outcomeId, {
        ...changes,
        version: newVersion,
      });

      await storage.createAuditEvent({
        objectType: "outcome",
        objectId: outcomeId,
        action: "version_created",
        actorId: req.body.actorId || "system",
        details: JSON.stringify({
          fromVersion: outcome.version,
          toVersion: newVersion,
          reason,
          changes,
        }),
        ontologyTags: resolveOntologyTags("outcome", "version_created", { details: reason }),
      });

      res.status(201).json(updated);
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
        e => e.objectId === outcomeId && (e.action === "version_created" || e.action === "outcome_updated" || e.action === "create_outcome")
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
      const updated = await storage.updateKpi(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.delete("/api/kpis/:id", async (req, res) => {
    await storage.deleteKpi(req.params.id);
    res.status(204).send();
  });


export default router;
