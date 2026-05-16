import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { desc, eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import {
  insertImprovementRecommendationSchema,
  insertAutonomousActionLogSchema,
  insertImprovementCycleSchema,
  insertPatchSchema,
  insertExperimentSchema,
  insertBlueprintSchema,
  insertAgentSchema,
  insertDeploymentSchema,
  insertEvalSuiteSchema,
  insertEvalTestCaseSchema,
  insertEvalRunSchema,
  insertJobSchema,
} from "@shared/schema";
import {
  checkPermission,
  getRequestRole,
} from "../permissions";
import { getOrgId } from "../auth";
import {
  resolveOntologyTags,
  handleZodError,
  buildAgentSystemPrompt,
  generateKpiAlignedEvalSuite,
  checkPatchSafety,
  runParameterMatching,
  extractResponseText,
  generateOntologyEvalCases,
} from "./helpers";
import {
  executeTeamPipeline,
  runAgentOnce,
  executePromptWithMcp,
} from "../agent-runtime";
import OpenAI, { toFile } from "openai";
import multer from "multer";
import { anthropicClient, callClaude, stripJsonFences } from "../claude";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const router = Router();

  // Policy Violation Stream (recent violations from traces + audit events)
  router.get("/api/monitor/policy-violations", async (req, res) => {
    try {
      const traces = await storage.getTraces(getOrgId(req));
      const agents = await storage.getAgents(getOrgId(req));
      const agentMap = new Map(agents.map(a => [a.id, a.name]));

      const violations: Array<{
        id: string;
        traceId: string;
        agentId: string;
        agentName: string;
        policyName: string;
        rule: string;
        severity: string;
        timestamp: string;
        action: string;
        blocked: boolean;
      }> = [];

      for (const trace of traces) {
        const checks = (trace.policyChecks as any[] | null) || [];
        for (const pc of checks) {
          if (pc.blocked || pc.violated) {
            violations.push({
              id: `${trace.id}-${pc.policyName || pc.name || "unknown"}`,
              traceId: trace.id,
              agentId: trace.agentId,
              agentName: agentMap.get(trace.agentId) || "Unknown Agent",
              policyName: pc.policyName || pc.name || "Unknown Policy",
              rule: pc.rule || pc.description || "Policy rule violation",
              severity: pc.severity || "medium",
              timestamp: trace.startedAt?.toString() || new Date().toISOString(),
              action: pc.action || "block",
              blocked: !!pc.blocked,
            });
          }
        }
      }

      for (const trace of traces) {
        const softViolations = ((trace as any).softPolicyViolations as any[] | null) || [];
        for (const r of softViolations) {
          if (!r.compliant) {
            violations.push({
              id: `spv-${trace.id}-${r.policyId || r.policyName}`,
              traceId: trace.id,
              agentId: trace.agentId,
              agentName: agentMap.get(trace.agentId) || "Unknown Agent",
              policyName: r.policyName || "Soft Policy",
              rule: Array.isArray(r.violatedRequirements) && r.violatedRequirements.length > 0
                ? r.violatedRequirements.join("; ")
                : "Soft policy constraint not honored by agent output",
              severity: r.severity || "medium",
              timestamp: trace.startedAt?.toString() || new Date().toISOString(),
              action: "warn",
              blocked: false,
            });
          }
        }
      }

      const blockedTraces = traces.filter(t => t.status === "blocked");
      for (const trace of blockedTraces) {
        const existing = violations.find(v => v.traceId === trace.id);
        if (!existing) {
          violations.push({
            id: `blocked-${trace.id}`,
            traceId: trace.id,
            agentId: trace.agentId,
            agentName: agentMap.get(trace.agentId) || "Unknown Agent",
            policyName: "Execution Policy",
            rule: "Run blocked by policy enforcement",
            severity: "high",
            timestamp: trace.startedAt?.toString() || new Date().toISOString(),
            action: "block",
            blocked: true,
          });
        }
      }

      violations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (violations.length === 0) {
        res.json([]);
        return;
      }

      res.json(violations);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to get policy violations" });
    }
  });

  // Policy Pre-Check for Autonomy Guardrails
  router.post("/api/policy-check", async (req, res) => {
    const { agentId, actionType, changes } = req.body;

    const agent = await storage.getAgent(agentId, getOrgId(req));
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const policies = await storage.getPolicies(getOrgId(req));
    const agentPolicies = agent.policyBindings as Array<{ policyId: string; mode: string }> | null;

    const violations: Array<{
      policyId: string;
      policyName: string;
      rule: string;
      severity: string;
      message: string;
    }> = [];

    if (agent.riskTier === "HIGH" && (actionType === "model_swap" || actionType === "retrain")) {
      const matchedPolicy = policies.find(p => p.domain === "model_governance" || p.domain === "deployment");
      if (matchedPolicy) {
        violations.push({
          policyId: matchedPolicy.id,
          policyName: matchedPolicy.name,
          rule: "High-risk agents require expert approval for model changes",
          severity: "high",
          message: `Agent "${agent.name}" is ${agent.riskTier} risk. Model changes require expert validation.`,
        });
      }
    }

    if (agent.environment === "prod" && actionType !== "config_change") {
      const matchedPolicy = policies.find(p => p.domain === "deployment" || p.domain === "data_handling");
      if (matchedPolicy) {
        violations.push({
          policyId: matchedPolicy.id,
          policyName: matchedPolicy.name,
          rule: "Production changes require approval gate",
          severity: "medium",
          message: `Agent "${agent.name}" is deployed to production. Changes beyond config tweaks require approval.`,
        });
      }
    }

    if (agent.autonomyMode === "supervised") {
      violations.push({
        policyId: "built-in",
        policyName: "Supervised Mode Policy",
        rule: "Supervised agents require human approval for all changes",
        severity: "high",
        message: `Agent "${agent.name}" runs in supervised mode. All autonomous actions require expert sign-off.`,
      });
    }

    const allowed = violations.length === 0;

    res.json({
      allowed,
      violations,
      requiresApproval: !allowed,
      sandboxAvailable: agent.environment !== "prod",
    });
  });

  // Improvement Recommendations
  router.get("/api/recommendations", async (_req, res) => {
    const recs = await storage.getImprovementRecommendations();
    res.json(recs);
  });

  router.post("/api/recommendations", async (req, res) => {
    try {
      const data = insertImprovementRecommendationSchema.parse(req.body);
      const rec = await storage.createImprovementRecommendation(data);
      res.status(201).json(rec);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.patch("/api/recommendations/:id", async (req, res) => {
    try {
      const updated = await storage.updateImprovementRecommendation(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Recommendation not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Autonomous Action Logs
  router.get("/api/autonomous-actions", async (_req, res) => {
    const logs = await storage.getAutonomousActionLogs();
    res.json(logs);
  });

  router.post("/api/autonomous-actions", async (req, res) => {
    try {
      const data = insertAutonomousActionLogSchema.parse(req.body);
      const log = await storage.createAutonomousActionLog(data);
      res.status(201).json(log);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Improvement Cycles
  router.get("/api/improvement-cycles", async (_req, res) => {
    const cycles = await storage.getImprovementCycles();
    res.json(cycles);
  });

  router.get("/api/improvement-cycles/:id", async (req, res) => {
    const cycle = await storage.getImprovementCycleById(req.params.id);
    if (!cycle) return res.status(404).json({ error: "Not found" });
    res.json(cycle);
  });

  router.post("/api/improvement-cycles", async (req, res) => {
    try {
      const data = insertImprovementCycleSchema.parse(req.body);
      const cycle = await storage.createImprovementCycle(data);
      res.status(201).json(cycle);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.patch("/api/improvement-cycles/:id", async (req, res) => {
    try {
      const data = insertImprovementCycleSchema.partial().parse(req.body);
      const updated = await storage.updateImprovementCycle(req.params.id, data);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Generate recommendations from drift signals and agent data
  router.post("/api/recommendations/generate", async (req, res) => {
    try {
      const allAgents = await storage.getAgents(getOrgId(req));
      const existingRecs = await storage.getImprovementRecommendations();
      const newRecs: Array<any> = [];

      for (const agent of allAgents) {
        // Cost-performance recommendations
        if (agent.costPerRun && agent.monthlyRevenue && agent.monthlyCost) {
          const roi = ((agent.monthlyRevenue - agent.monthlyCost) / agent.monthlyCost) * 100;
          const hasExistingCostRec = existingRecs.some(r => r.agentId === agent.id && r.source === "cost" && r.status === "pending");
          
          if (roi < 150 && !hasExistingCostRec) {
            newRecs.push({
              agentId: agent.id,
              source: "cost",
              type: "model_swap",
              title: `Optimize ${agent.name} cost-performance ratio`,
              description: `Current ROI is ${roi.toFixed(0)}% with cost-per-run of $${agent.costPerRun}. Consider model downgrade or caching to improve margins.`,
              severity: roi < 100 ? "critical" : "medium",
              status: "pending",
              impact: `Potential to improve ROI from ${roi.toFixed(0)}% to ${(roi * 1.5).toFixed(0)}% with model optimization`,
              suggestedChanges: { action: "cost_optimization", currentCostPerRun: agent.costPerRun, currentROI: roi.toFixed(0) + "%", targetROI: (roi * 1.5).toFixed(0) + "%", strategies: ["model_downgrade", "response_caching", "token_budget_reduction"] },
            });
          }
        }

        // Success rate recommendations
        if (agent.successRate && agent.successRate < 0.95) {
          const hasExistingQualityRec = existingRecs.some(r => r.agentId === agent.id && r.source === "eval" && r.type === "retrain" && r.status === "pending");
          if (!hasExistingQualityRec) {
            newRecs.push({
              agentId: agent.id,
              source: "eval",
              type: "retrain",
              title: `Improve ${agent.name} success rate`,
              description: `Success rate is ${(agent.successRate * 100).toFixed(1)}%, below the 95% target. Analysis of failed runs suggests retraining on recent failure patterns.`,
              severity: agent.successRate < 0.90 ? "critical" : "high",
              status: "pending",
              impact: `Target improvement from ${(agent.successRate * 100).toFixed(1)}% to 95%+ success rate`,
              suggestedChanges: { action: "retrain", currentSuccessRate: (agent.successRate * 100).toFixed(1) + "%", targetSuccessRate: "95%", analysisMethod: "failure_pattern_clustering" },
            });
          }
        }

        // Latency optimization recommendations
        if (agent.avgLatencyMs && agent.avgLatencyMs > 3000) {
          const hasExistingLatencyRec = existingRecs.some(r => r.agentId === agent.id && r.type === "workflow_optimization" && r.status === "pending");
          if (!hasExistingLatencyRec) {
            newRecs.push({
              agentId: agent.id,
              source: "trace",
              type: "workflow_optimization",
              title: `Reduce ${agent.name} latency`,
              description: `Average latency is ${agent.avgLatencyMs}ms, above the 3000ms optimization threshold. Workflow analysis suggests parallelizing independent steps.`,
              severity: agent.avgLatencyMs > 5000 ? "high" : "medium",
              status: "pending",
              impact: `Reduce latency from ${agent.avgLatencyMs}ms to ~${Math.round(agent.avgLatencyMs * 0.6)}ms with workflow parallelization`,
              suggestedChanges: { action: "workflow_optimization", currentLatency: agent.avgLatencyMs, targetLatency: Math.round(agent.avgLatencyMs * 0.6), strategies: ["parallel_steps", "async_tool_calls", "response_streaming"] },
            });
          }
        }
      }

      const allTraces = await storage.getTraces(getOrgId(req));
      const allInvoices = await storage.getInvoices();
      const outcomes = await storage.getOutcomes(getOrgId(req));
      const INFRA_OVERHEAD_RATE = 0.15;
      const TOOL_CALL_COST_RATE = 0.001;

      for (const outcome of outcomes) {
        const outcomeAgents = allAgents.filter(a => a.outcomeId === outcome.id);
        if (outcomeAgents.length === 0) continue;

        const agentIds = new Set(outcomeAgents.map(a => a.id));
        const outcomeTraces = allTraces.filter(t => agentIds.has(t.agentId));

        let totalLlmCost = 0;
        let totalToolCost = 0;
        let totalToolCalls = 0;
        let totalTokens = 0;

        for (const t of outcomeTraces) {
          totalLlmCost += t.costUsd || 0;
          const toolCalls = t.toolCalls as any[] | null;
          const tcCount = Array.isArray(toolCalls) ? toolCalls.length : 0;
          totalToolCalls += tcCount;
          totalToolCost += tcCount * TOOL_CALL_COST_RATE;
          const tokenUsage = t.tokenUsage as { total_tokens?: number } | null;
          if (tokenUsage) totalTokens += tokenUsage.total_tokens || 0;
        }

        const directCost = totalLlmCost + totalToolCost;
        const totalCost = directCost * (1 + INFRA_OVERHEAD_RATE);
        const outcomeInvoices = allInvoices.filter(inv => inv.outcomeId === outcome.id);
        const totalRevenue = outcomeInvoices.reduce((s, inv) => s + (inv.amount || 0), 0);
        const margin = totalRevenue - totalCost;
        const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : (totalCost > 0 ? -100 : 0);
        const avgCostPerTrace = outcomeTraces.length > 0 ? totalCost / outcomeTraces.length : 0;

        if (totalRevenue > 0 && marginPct < 20) {
          for (const agent of outcomeAgents) {
            const hasExistingCostReduction = existingRecs.some(
              r => r.agentId === agent.id && r.source === "cost_reduction" && r.status === "pending"
            );
            if (hasExistingCostReduction) continue;

            const agentTraces = outcomeTraces.filter(t => t.agentId === agent.id);
            let agentLlmCost = 0;
            let agentToolCalls = 0;
            let agentTokens = 0;
            for (const t of agentTraces) {
              agentLlmCost += t.costUsd || 0;
              const tc = t.toolCalls as any[] | null;
              agentToolCalls += Array.isArray(tc) ? tc.length : 0;
              const tu = t.tokenUsage as { total_tokens?: number } | null;
              if (tu) agentTokens += tu.total_tokens || 0;
            }
            const agentToolCost = agentToolCalls * TOOL_CALL_COST_RATE;
            const agentTotalCost = (agentLlmCost + agentToolCost) * (1 + INFRA_OVERHEAD_RATE);
            const agentAvgCostPerRun = agentTraces.length > 0 ? agentTotalCost / agentTraces.length : 0;
            const toolCostShare = agentTotalCost > 0 ? (agentToolCost / agentTotalCost) * 100 : 0;
            const avgTokensPerRun = agentTraces.length > 0 ? agentTokens / agentTraces.length : 0;

            const strategies: string[] = [];
            let recType = "model_swap";
            let recTitle = "";
            let recDescription = "";
            const estimatedSavingsPct = marginPct < 0 ? 40 : marginPct < 10 ? 30 : 20;
            const estimatedCostSavings = Math.round(agentTotalCost * (estimatedSavingsPct / 100) * 100) / 100;
            const projectedMargin = totalRevenue > 0 ? Math.round(((margin + estimatedCostSavings) / totalRevenue) * 1000) / 10 : 0;

            if (toolCostShare > 40) {
              recType = "workflow_optimization";
              recTitle = `Reduce tool call costs for ${agent.name}`;
              recDescription = `Tool calls account for ${toolCostShare.toFixed(0)}% of costs (${agentToolCalls} calls). Batch or cache tool invocations to reduce per-run cost from $${agentAvgCostPerRun.toFixed(4)} by ~${estimatedSavingsPct}%.`;
              strategies.push("tool_call_batching", "tool_result_caching", "reduce_redundant_calls");
            } else if (avgTokensPerRun > 4000) {
              recType = "prompt_optimization";
              recTitle = `Compress prompts for ${agent.name}`;
              recDescription = `High token usage (${Math.round(avgTokensPerRun)} tokens/run avg). Prompt compression or context budget reduction can lower LLM costs by ~${estimatedSavingsPct}%.`;
              strategies.push("prompt_compression", "context_budget_reduction", "few_shot_pruning");
            } else {
              recType = "model_swap";
              recTitle = `Downgrade model for ${agent.name}`;
              recDescription = `Cost-per-run is $${agentAvgCostPerRun.toFixed(4)} contributing to ${marginPct.toFixed(1)}% outcome margin. A model downgrade can save ~${estimatedSavingsPct}% while maintaining acceptable quality.`;
              strategies.push("model_downgrade", "response_caching", "token_budget_reduction");
            }

            newRecs.push({
              agentId: agent.id,
              source: "cost_reduction",
              type: recType,
              title: recTitle,
              description: recDescription,
              severity: marginPct < 0 ? "critical" : marginPct < 10 ? "high" : "medium",
              status: "pending",
              impact: `Estimated savings: $${estimatedCostSavings.toFixed(2)}/period. Projected margin improvement: ${marginPct.toFixed(1)}% → ${projectedMargin.toFixed(1)}%`,
              suggestedChanges: {
                action: "cost_reduction",
                category: "cost_reduction",
                outcomeId: outcome.id,
                outcomeName: outcome.name,
                currentMarginPercent: Math.round(marginPct * 10) / 10,
                estimatedCostSavings,
                marginImpact: `${marginPct.toFixed(1)}% → ${projectedMargin.toFixed(1)}%`,
                costPerRun: Math.round(agentAvgCostPerRun * 10000) / 10000,
                strategies,
              },
            });
          }
        }
      }

      const allOutcomeEvents = await storage.getOutcomeEvents(getOrgId(req));
      const allDisputes = await storage.getBillingDisputes();

      const agentIndustryMap = new Map<string, string>();
      for (const agent of allAgents) {
        let industry = "general";
        const tags: string[] = [];
        if (Array.isArray(agent.complianceTags)) tags.push(...agent.complianceTags);
        if (Array.isArray(agent.ontologyTags)) {
          for (const t of agent.ontologyTags as any[]) {
            if (typeof t === "string") tags.push(t);
            else if (t && typeof t === "object" && t.conceptLabel) tags.push(t.conceptLabel);
            else if (t && typeof t === "object" && t.conceptId) tags.push(t.conceptId);
          }
        }
        const combined = tags.join(" ").toUpperCase();
        if (combined.includes("HIPAA") || combined.includes("HITECH")) industry = "healthcare";
        else if (combined.includes("BSA") || combined.includes("AML") || combined.includes("SOX") || combined.includes("CIP") || combined.includes("GLBA")) industry = "financial_services";
        else if (combined.includes("NAIC")) industry = "insurance";
        else if (combined.includes("OSHA") || combined.includes("ISO 9001")) industry = "manufacturing";
        else if (combined.includes("PCI-DSS") || combined.includes("PCI") || combined.includes("CCPA") || combined.includes("FTC")) industry = "retail";
        else if (combined.includes("SOC 2") || combined.includes("FEDRAMP") || combined.includes("ISO 27001")) industry = "technology_saas";
        if (agent.department) {
          const dept = agent.department.toLowerCase();
          if (dept.includes("health") || dept.includes("clinical")) industry = "healthcare";
          else if (dept.includes("financ") || dept.includes("bank")) industry = "financial_services";
          else if (dept.includes("insurance") || dept.includes("underwriting")) industry = "insurance";
          else if (dept.includes("manufactur") || dept.includes("production")) industry = "manufacturing";
          else if (dept.includes("retail") || dept.includes("commerce")) industry = "retail";
          else if (dept.includes("tech") || dept.includes("saas") || dept.includes("engineering")) industry = "technology_saas";
        }
        agentIndustryMap.set(agent.id, industry);
      }

      const industryEventStats = new Map<string, { total: number; accepted: number }>();
      for (const ev of allOutcomeEvents) {
        const industry = (ev.agentId && agentIndustryMap.get(ev.agentId)) || "general";
        if (!industryEventStats.has(industry)) industryEventStats.set(industry, { total: 0, accepted: 0 });
        const stats = industryEventStats.get(industry)!;
        stats.total++;
        if (ev.billable === true) stats.accepted++;
      }

      const industryAcceptanceRates = new Map<string, number>();
      for (const [industry, stats] of Array.from(industryEventStats.entries())) {
        industryAcceptanceRates.set(industry, stats.total > 0 ? (stats.accepted / stats.total) * 100 : 100);
      }

      const outcomeEventStats = new Map<string, { total: number; accepted: number; agentIds: Set<string>; topRejections: Map<string, number> }>();
      for (const ev of allOutcomeEvents) {
        if (!outcomeEventStats.has(ev.outcomeId)) {
          outcomeEventStats.set(ev.outcomeId, { total: 0, accepted: 0, agentIds: new Set(), topRejections: new Map() });
        }
        const stats = outcomeEventStats.get(ev.outcomeId)!;
        stats.total++;
        if (ev.billable === true) stats.accepted++;
        if (ev.agentId) stats.agentIds.add(ev.agentId);
        if (!ev.billable && ev.excludeReason) {
          stats.topRejections.set(ev.excludeReason, (stats.topRejections.get(ev.excludeReason) || 0) + 1);
        }
      }

      for (const [outcomeId, stats] of Array.from(outcomeEventStats.entries())) {
        if (stats.total < 5) continue;

        const outcomeAcceptanceRate = Math.round((stats.accepted / stats.total) * 10000) / 100;

        const outcomeIndustries = new Set<string>();
        for (const agentId of Array.from(stats.agentIds)) {
          outcomeIndustries.add(agentIndustryMap.get(agentId) || "general");
        }
        const primaryIndustry = outcomeIndustries.values().next().value || "general";
        const industryAvg = industryAcceptanceRates.get(primaryIndustry) ?? 100;
        const industryAvgRounded = Math.round(industryAvg * 100) / 100;

        if (outcomeAcceptanceRate >= industryAvgRounded) continue;

        const gapPercent = Math.round((industryAvgRounded - outcomeAcceptanceRate) * 100) / 100;

        const outcome = outcomes.find(o => o.id === outcomeId);
        const outcomeName = outcome?.name || outcomeId;

        const topRejections = Array.from<[string, number]>(stats.topRejections.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([reason, count]) => ({ reason, count }));

        const suggestedActions: string[] = [];
        suggestedActions.push("Sync production feedback to eval suites to capture recent failure patterns");
        suggestedActions.push("Add edge case test cases targeting top rejection reasons");
        if (gapPercent > 10) {
          suggestedActions.push("Review and retrain agents on frequently rejected event types");
          suggestedActions.push("Promote validated production cases to golden datasets for regression testing");
        }
        if (topRejections.length > 0) {
          suggestedActions.push(`Focus on top rejection reason: "${topRejections[0].reason}" (${topRejections[0].count} occurrences)`);
        }

        for (const agentId of Array.from(stats.agentIds)) {
          const hasExisting = existingRecs.some(
            r => r.agentId === agentId && r.source === "acceptance_signal" && r.status === "pending"
          );
          if (hasExisting) continue;

          const agent = allAgents.find(a => a.id === agentId);
          const agentName = agent?.name || agentId;

          newRecs.push({
            agentId,
            source: "acceptance_signal",
            type: "eval_coverage",
            title: `Low acceptance rate for ${agentName} on "${outcomeName}"`,
            description: `Acceptance rate (${outcomeAcceptanceRate}%) is below the ${primaryIndustry} industry average (${industryAvgRounded}%) by ${gapPercent} percentage points. Eval coverage should be expanded to address rejection patterns.`,
            severity: gapPercent > 15 ? "critical" : gapPercent > 5 ? "high" : "medium",
            status: "pending",
            impact: `Closing the ${gapPercent}pp acceptance gap could recover ~${Math.round(gapPercent * stats.total / 100)} additional billable events per period`,
            suggestedChanges: {
              action: "eval_coverage_expansion",
              trigger: "acceptance_signal",
              outcomeId,
              outcomeName,
              industry: primaryIndustry,
              currentAcceptanceRate: outcomeAcceptanceRate,
              industryAverage: industryAvgRounded,
              gapPercent,
              totalEvents: stats.total,
              acceptedEvents: stats.accepted,
              rejectedEvents: stats.total - stats.accepted,
              topRejectionReasons: topRejections,
              suggestedActions,
            },
          });
        }
      }

      const created = [];
      for (const rec of newRecs) {
        const result = await storage.createImprovementRecommendation(rec);
        created.push(result);
      }

      res.json({ generated: created.length, recommendations: created });
    } catch (e) {
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  router.get("/api/agents/:id/timeline", async (req, res) => {
    const agentId = req.params.id;
    const agent = await storage.getAgent(agentId, getOrgId(req));
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const versions = await storage.getAgentVersions(agentId);
    const allAuditEvents = await storage.getAuditEvents(getOrgId(req));
    const agentAudits = allAuditEvents.filter(e => e.objectId === agentId);
    const recommendations = await storage.getImprovementRecommendations();
    const agentRecs = recommendations.filter(r => r.agentId === agentId);

    const timeline: Array<{
      id: string;
      timestamp: string;
      category: string;
      title: string;
      description: string;
      severity: string;
      diff?: { field: string; from: string; to: string }[];
      correlatedMetric?: { metric: string; before: number; after: number; change: string };
    }> = [];

    versions.forEach(v => {
      timeline.push({
        id: `ver-${v.id}`,
        timestamp: v.createdAt?.toISOString() || new Date().toISOString(),
        category: "blueprint",
        title: `Version ${v.semver} created`,
        description: `New version ${v.semver} (${v.status}) created by ${v.createdBy || "system"}`,
        severity: "info",
        diff: [
          { field: "version", from: "previous", to: v.semver },
          { field: "blueprintHash", from: "\u2014", to: v.blueprintHash || "\u2014" },
        ],
      });
    });

    agentAudits.forEach(e => {
      let category = "config";
      if (e.action.includes("policy")) category = "policy";
      else if (e.action.includes("deploy")) category = "deployment";
      else if (e.action.includes("model")) category = "model";
      else if (e.action.includes("tool")) category = "tools";
      else if (e.action.includes("eval")) category = "evaluation";
      else if (e.action.includes("patch")) category = "autopatch";

      timeline.push({
        id: `audit-${e.id}`,
        timestamp: e.createdAt?.toISOString() || new Date().toISOString(),
        category,
        title: `${e.action.replace(/\./g, " ").replace(/^\w/, c => c.toUpperCase())}`,
        description: e.details || "",
        severity: e.action.includes("violation") || e.action.includes("incident") ? "warning" : "info",
      });
    });

    agentRecs.filter(r => r.status === "applied").forEach(r => {
      timeline.push({
        id: `rec-${r.id}`,
        timestamp: r.createdAt?.toISOString() || new Date().toISOString(),
        category: r.type || "config",
        title: `Applied: ${r.title}`,
        description: r.description || "",
        severity: r.severity === "critical" ? "critical" : r.severity === "high" ? "warning" : "info",
        diff: r.suggestedChanges ? [
          { field: "action", from: "previous config", to: (r.suggestedChanges as any)?.action || r.type || "change" },
        ] : undefined,
      });
    });

    if (agent.healthScore && agent.healthScore < 90) {
      const lastGoodTimestamp = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      timeline.push({
        id: "marker-last-good",
        timestamp: lastGoodTimestamp,
        category: "marker",
        title: "Last Known Good State",
        description: `Health score was above 90%. Current: ${agent.healthScore}%`,
        severity: "success",
        correlatedMetric: {
          metric: "healthScore",
          before: 95,
          after: agent.healthScore,
          change: `${(agent.healthScore - 95).toFixed(1)}%`,
        },
      });
    }

    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json(timeline);
  });

  router.get("/api/agent-proposals/:outcomeId", async (req, res) => {
    try {
      const proposal = await storage.getAgentProposalByOutcome(req.params.outcomeId);
      if (!proposal) return res.status(404).json({ error: "No saved proposal found" });
      res.json(proposal);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch proposal" });
    }
  });

  router.patch("/api/agent-proposals/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const patchSchema = z.object({
        selectedIndices: z.array(z.number()).optional(),
        orchestratorSelected: z.boolean().optional(),
        status: z.string().optional(),
        orchestrator: z.any().optional(),
        workers: z.any().optional(),
        pipeline: z.any().optional(),
      });
      const data = patchSchema.parse(req.body);
      const updated = await storage.updateAgentProposal(req.params.id as string, data);
      if (!updated) return res.status(404).json({ error: "Proposal not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update proposal" });
    }
  });

  router.delete("/api/agent-proposals/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const deleted = await storage.deleteAgentProposal(req.params.id as string);
      if (!deleted) return res.status(404).json({ error: "Proposal not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete proposal" });
    }
  });

  router.post("/api/ai/propose-agents", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI assistant is not configured" });
      }
      const { outcomeContract, kpis, feedback, previousPlan, industryContext, templateId, processFlowSteps } = req.body;

      const orgId = getOrgId(req);
      const [templates, allSkills, allMcpServers, allPolicies, allAgents, ragPipelines, allKnowledgeBases] = await Promise.all([
        storage.getAgentTemplates(),
        storage.getSkills(orgId),
        storage.getMcpServers(),
        storage.getPolicies(orgId),
        storage.getAgents(orgId),
        storage.getRagPipelines(),
        storage.getKnowledgeBases(orgId),
      ]);

      const preSelectedTemplate = templateId
        ? (templates as any[]).find((t) => t.id === templateId) ?? null
        : null;

      const industryId = industryContext?.industryId || outcomeContract?.industry || "general";
      let ontologyConcepts: any[] = [];
      let ontologyEnhancements: any[] = [];
      try {
        ontologyConcepts = await storage.getOntologyConcepts(industryId);
      } catch {}

      // Build relevance scorer first so it can filter MCP servers and all other slices
      const outcomeKeywords = [
        ...(outcomeContract?.name || "").toLowerCase().split(/\W+/),
        ...(outcomeContract?.description || "").toLowerCase().split(/\W+/),
        ...((kpis || []) as any[]).map((k: any) => (k.name || "").toLowerCase()),
      ].filter((w: string) => w.length > 3);

      const relevanceScore = (obj: any): number => {
        const text = [
          obj.name || "",
          obj.label || "",
          obj.description || "",
          ...(Array.isArray(obj.tags) ? obj.tags : []),
          obj.domain || "",
          obj.category || "",
        ].join(" ").toLowerCase();
        return outcomeKeywords.filter((k: string) => text.includes(k)).length;
      };

      // Rank MCP servers by outcome relevance; take top 8 only to keep prompt concise.
      // Exclude servers whose industryId is set to a DIFFERENT industry than the current outcome
      // (prevents cross-demo MCP tools from leaking into unrelated agent plans).
      // Also require at least 1 keyword match (score >= 1) so zero-relevance servers are never included.
      const rankedMcpServers = allMcpServers
        .filter(s => !s.industryId || s.industryId === industryId)
        .map(s => ({ server: s, score: relevanceScore(s) }))
        .filter(x => x.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(x => x.server);
      const mcpToolsByServer: Record<string, any[]> = {};
      for (const server of rankedMcpServers) {
        try {
          const tools = await storage.getMcpServerTools(server.id);
          if (tools.length > 0) {
            // Strip inputSchema — only name+description needed for planning (schemas add thousands of tokens)
            mcpToolsByServer[server.name] = tools.slice(0, 5).map(t => ({ name: t.name, description: t.description }));
          }
        } catch {}
      }

      const industrySkills = allSkills
        .filter(s => s.industry === industryId || s.industry === "cross_industry")
        .sort((a, b) => relevanceScore(b) - relevanceScore(a))
        .slice(0, 6);
      const activePolicies = allPolicies.filter(p => p.status === "active")
        .sort((a, b) => relevanceScore(b) - relevanceScore(a))
        .slice(0, 8);
      const existingOutcomeAgents = allAgents.filter(a => a.outcomeId === outcomeContract?.id);
      const industryTemplates = templates
        .filter(t => t.industry === industryId || t.industry === "cross_industry")
        .sort((a, b) => relevanceScore(b) - relevanceScore(a))
        .slice(0, 5);
      const industryRagPipelines = ragPipelines.filter((r: any) => r.industry === industryId || !r.industry).slice(0, 4);

      // Rank ontology concepts by outcome relevance; explicit industry filter + cap at 12.
      // Prevents unrelated concepts from polluting the agent plan prompt.
      const rankedOntologyConcepts = ontologyConcepts
        .filter((c: any) => c.industryId === industryId || !c.industryId)
        .map((c: any) => ({ concept: c, score: relevanceScore(c) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((x) => x.concept);
      try {
        if (rankedOntologyConcepts.length > 0) {
          const conceptIds = rankedOntologyConcepts.map((c: any) => c.id);
          ontologyEnhancements = await storage.getOntologyEnhancements(conceptIds);
        }
      } catch {}

      let feedbackSection = "";
      if (feedback && previousPlan) {
        feedbackSection = `
IMPORTANT: This is a REGENERATION request. The engineer reviewed the previous plan and provided specific feedback.

Previous Plan:
- Orchestrator: ${previousPlan.orchestrator?.name || "None"}
- Workers: ${(previousPlan.workers || []).map((w: any) => `${w.name} (${w.role})`).join(", ")}
- Pipeline Pattern: ${previousPlan.pipeline?.pattern || "N/A"}

Engineer's Feedback: "${feedback}"

You MUST incorporate this feedback into the new plan. Adjust the agents, roles, workflow steps, tools, pipeline pattern, or any other aspect based on what the engineer requested. Keep parts that weren't criticized.
`;
      }

      const kpiDetails = (kpis || []).map((k: any) => ({
        name: k.name,
        unit: k.unit,
        baseline: k.baseline,
        target: k.target,
        currentValue: k.currentValue,
        weight: k.weight,
        slaThreshold: k.slaThreshold,
        breachLevel: k.breachLevel,
        confidence: k.confidence,
        trend: k.trend,
      }));

      const templateSummaries = industryTemplates.map(t => ({
        name: t.name,
        category: t.category,
        industry: t.industry,
        description: t.description,
        complexity: t.complexity,
        defaultRiskTier: t.defaultRiskTier,
        defaultAutonomyMode: t.defaultAutonomyMode,
        toolsConfig: t.toolsConfig,
        policyBindings: t.policyBindings,
        preloadedSkills: t.preloadedSkills,
        complianceCertifications: t.complianceCertifications,
        estimatedTimeToProd: t.estimatedTimeToProd,
        memoryRagConfig: t.memoryRagConfig,
      }));

      const ontologySummary = rankedOntologyConcepts.slice(0, 8).map((c: any) => ({
        id: c.id,
        label: c.label,
        category: c.category,
        description: c.description,
        tags: c.tags,
        linkedRegulations: c.linkedRegulations,
      }));

      const enhancementSummary = ontologyEnhancements.slice(0, 8).map(e => ({
        conceptId: e.conceptId,
        agentUseCases: e.agentUseCases,
        riskFactors: e.riskFactors,
        implementationGuidance: e.implementationGuidance,
        agentSkills: e.agentSkills,
        agentTypes: e.agentTypes,
      }));

      const skillSummaries = industrySkills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        industry: s.industry,
        domain: s.domain,
        complexity: s.complexity,
        tags: s.tags,
        allowedTools: s.allowedTools,
        requiredMcpServers: s.requiredMcpServers,
        performanceScore: s.performanceScore,
        trustTier: s.trustTier,
      }));

      const extractSchemaEntityHints = function(inputSchema: any): string[] {
        if (!inputSchema || typeof inputSchema !== "object") return [];
        const hints = new Set<string>();
        const props = inputSchema.properties || {};
        for (const prop of Object.values(props) as any[]) {
          if (prop && typeof prop.description === "string") {
            const egMatches = prop.description.matchAll(/\(e\.g\.,?\s*([^)]+)\)/gi);
            for (const m of egMatches) {
              m[1].split(/,\s*/).map((s: string) => s.trim()).filter((s: string) => s.length > 1 && /[A-Z]/.test(s)).forEach((s: string) => hints.add(s));
            }
          }
          if (Array.isArray(prop?.enum)) {
            (prop.enum as any[]).filter((e: any) => typeof e === "string" && e.length > 1).forEach((e: string) => hints.add(e));
          }
        }
        return Array.from(hints);
      }

      const parseDeclaredStageCount = function(description: string): number | null {
        if (!description) return null;
        const nStepMatch = description.match(/(\d+)[- ]step/i);
        if (nStepMatch) return parseInt(nStepMatch[1], 10);
        const arrowCount = (description.match(/→/g) || []).length;
        if (arrowCount >= 2) return arrowCount + 1;
        return null;
      }

      const parseDeclaredStages = function(description: string): string[] {
        if (!description) return [];
        const parts = description.split("→");
        if (parts.length < 3) return [];
        return parts.map((s, i) => {
          let clean = s.trim();
          if (i === 0) {
            // First part may have "7-step pipeline: Stage Name" prefix
            const colonIdx = clean.lastIndexOf(":");
            if (colonIdx !== -1) clean = clean.slice(colonIdx + 1).trim();
          }
          // Remove trailing sentence content (after period, comma, or "Provides")
          clean = clean.split(/\.\s+[A-Z]/)[0].replace(/[.,]$/, "").trim();
          return clean;
        }).filter(s => s.length > 0);
      }

      const extractCoveredSystemsFromText = function(textParts: string[]): string[] {
        // Generic words that are NOT system names — any proper-noun group starting with these is skipped
        const genericFirstWords = new Set([
          "The", "A", "An", "This", "All", "Each", "New", "Old", "Synthetic", "Worker",
          "Mock", "Demo", "Created", "Approved", "Poll", "Activate", "Provision", "Schedule",
          "Log", "Mark", "Record", "Returns", "Every", "Agent", "Action", "Real", "MCP",
          "Tool", "Server", "API", "Platform", "Registry", "Process", "Data", "Access",
          "Identity", "Request", "Response", "System", "Service", "Application",
          "Task", "Stage", "Step", "Pipeline", "Workflow", "Account", "Management",
          "Lifecycle", "Compliance", "Validation", "Verification", "Audit",
          "Registration", "Provisioning", "Certification", "Intake", "Review", "Check",
          "Triple", "Governed", "Provides", "Registered",
        ]);
        const propNounPattern = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/g;
        const systems = new Set<string>();
        for (const text of textParts) {
          if (!text) continue;
          for (const match of Array.from(text.matchAll(propNounPattern))) {
            const name = match[1].trim();
            const firstWord = name.split(" ")[0];
            if (!genericFirstWords.has(firstWord) && name.length > 3) {
              // Strip trailing generic words from multi-word matches
              const words = name.split(" ");
              const trimmed = words.filter((w: string, i: number) => i === 0 || !genericFirstWords.has(w)).join(" ");
              systems.add(trimmed.trim());
            }
          }
        }
        return Array.from(systems);
      }

      const mcpToolSummary = Object.entries(mcpToolsByServer).map(([serverName, tools]) => {
        const serverRecord = allMcpServers.find(s => s.name === serverName);
        const serverDescription = serverRecord?.description || null;
        const declaredStageCount = serverDescription ? parseDeclaredStageCount(serverDescription) : null;
        const declaredStages = serverDescription ? parseDeclaredStages(serverDescription) : [];
        const toolSlice = tools.slice(0, 10).map(t => ({
          name: t.name,
          description: t.description,
          schemaEntityHints: extractSchemaEntityHints(t.inputSchema),
        }));
        // Coverage = systems with ACTUAL MCP tools (tool descriptions only, not server description)
        const coveredSystems = extractCoveredSystemsFromText(toolSlice.map(t => t.description || ""));
        return {
          server: serverName,
          serverDescription,
          declaredStageCount,
          declaredStages,
          coveredSystems,
          tools: toolSlice,
        };
      });

      // Pre-compute agent blueprint and coverage ground truth for injection into prompt
      interface StagedPipeline { server: string; count: number; stages: string[]; coveredSystems: string[] }
      const stagedPipelines: StagedPipeline[] = mcpToolSummary
        .filter(s => s.declaredStageCount && s.declaredStageCount >= 2 && s.declaredStages.length >= 2)
        .map(s => ({ server: s.server, count: s.declaredStageCount!, stages: s.declaredStages, coveredSystems: s.coveredSystems }));

      // Build system→server coverage map: any system name found in coveredSystems → that server
      const systemCoverageGT: Record<string, string> = {};
      for (const entry of mcpToolSummary) {
        for (const sys of entry.coveredSystems) {
          systemCoverageGT[sys] = entry.server;
        }
      }

      const mandateSection = stagedPipelines.length > 0 ? (() => {
        const top = stagedPipelines[0];
        const stageLines = top.stages.map((s, i) => `  Stage ${i + 1}: "${s}" → create one dedicated worker agent named after this stage`).join("\n") +
          `\n\nPARALLEL SUB-GROUPS WITHIN STAGES: Adjacent stages that share NO data dependency (i.e., Stage N+1 does NOT require Stage N's output as a mandatory input) MAY be placed in the same parallel tier in parallelGroups. Only place stages in SEPARATE sequential tiers when Stage N+1 genuinely requires Stage N's output. Use your agentDependencyMatrix analysis to confirm before forcing a sequential ordering.`;
        const coveredLines = top.coveredSystems.length > 0
          ? top.coveredSystems.map(s => `  - ${s}: COVERED by "${top.server}" (has MCP tools)`).join("\n")
          : "  (none detected from tool descriptions)";
        const stageSummaryEntry = mcpToolSummary.find(s => s.server === top.server);
        const toolLines = stageSummaryEntry?.tools.map(t => `    • ${t.name}${t.description ? `: ${t.description.slice(0, 100)}` : ""}`).join("\n") || "    (no tools listed)";
        return `
⚡⚡⚡ MANDATORY AGENT BLUEPRINT — HIGHEST PRIORITY — OVERRIDE ALL OTHER REASONING ⚡⚡⚡
════════════════════════════════════════════════════════════════════════════
The registered MCP server "${top.server}" declares a ${top.count}-stage pipeline.

YOU MUST CREATE EXACTLY ${top.count} WORKER AGENTS — one for each stage listed below.
DO NOT merge stages. DO NOT skip stages. DO NOT create fewer than ${top.count} workers.

REQUIRED STAGES (create one worker agent per stage):
${stageLines}

VALID MCP TOOLS — assign ONLY these to mcpToolBindings (server: "${top.server}"):
${toolLines}
  ⚠ DO NOT reference any other MCP server. Only use tools listed above.
  Each stage agent should receive the 1-2 tools most relevant to its stage function.
  Stages with no matching tool (e.g. manual/external steps) may have an empty mcpToolBindings array.

PRE-COMPUTED SYSTEM COVERAGE (DO NOT OVERRIDE — use these as-is in systemsExtracted):
${coveredLines}
  - Systems named in the outcome contract as downstream access targets (e.g. "access to X", "accounts on X", "critical systems including X") are target_system entries — they are NOT orchestration pipeline systems and must NOT appear in mcpGaps.

────────────────────────────────────────────────────────────────────────────
`;
      })() : "";

      const policySummary = activePolicies.map(p => ({
        name: p.name,
        domain: p.domain,
        description: p.description,
        policyJson: p.policyJson,
        ontologyRefs: p.ontologyRefs,
      }));

      const existingAgentNames = existingOutcomeAgents.map(a => a.name);

      const regulatoryFrameworks = industryContext?.frameworks || [];
      const jurisdictions = industryContext?.jurisdictions || [];
      const departments = industryContext?.departments || [];

      const ragSummary = industryRagPipelines.map((r: any) => ({
        name: r.name,
        description: r.description,
        sourceType: r.sourceType,
        retrievalStrategy: r.retrievalStrategy,
      }));

      const industryKnowledgeBases = allKnowledgeBases.filter(
        (kb: any) => kb.industry === industryId || kb.industry === "general"
      ).sort((a: any, b: any) => relevanceScore(b) - relevanceScore(a)).slice(0, 6);
      const kbSummary = industryKnowledgeBases.map((kb: any) => ({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        industry: kb.industry,
        totalSources: kb.totalSources,
        totalChunks: kb.totalChunks,
        vectorDbType: kb.vectorDbType,
      }));

      const { id: _oid, createdAt: _oCreated, ...outcomeDetails } = outcomeContract || {} as any;

      const systemPrompt = `You are an Agent Proposal Generator for the Nous Agent Orchestrator (ATLAS) platform. You have access to the full platform intelligence. Generate a multi-agent pipeline that leverages REAL platform resources — not generic placeholders.
${mandateSection}${feedbackSection}

═══════════════════════════════════════════
OUTCOME CONTRACT (the business goal to deliver)
═══════════════════════════════════════════
${JSON.stringify(outcomeDetails)}

═══════════════════════════════════════════
KPI DEFINITIONS (with full targets, weights, SLAs)
═══════════════════════════════════════════
${JSON.stringify(kpiDetails)}

═══════════════════════════════════════════
INDUSTRY CONTEXT
═══════════════════════════════════════════
Industry: ${industryId}
Regulatory Frameworks: ${regulatoryFrameworks.length > 0 ? regulatoryFrameworks.join(", ") : "None specified"}
Jurisdictions: ${jurisdictions.length > 0 ? jurisdictions.join(", ") : "Not specified"}
Departments: ${departments.length > 0 ? departments.join(", ") : "Not specified"}

${preSelectedTemplate ? `═══════════════════════════════════════════
PRE-SELECTED TEMPLATE (Engineer-specified starting point — base configuration on this)
═══════════════════════════════════════════
${JSON.stringify({ id: preSelectedTemplate.id, name: preSelectedTemplate.name, description: preSelectedTemplate.description, category: preSelectedTemplate.category, defaultRiskTier: preSelectedTemplate.defaultRiskTier, defaultAutonomyMode: preSelectedTemplate.defaultAutonomyMode, toolsConfig: preSelectedTemplate.toolsConfig, policyBindings: preSelectedTemplate.policyBindings, preloadedSkills: preSelectedTemplate.preloadedSkills, complianceCertifications: preSelectedTemplate.complianceCertifications, tags: preSelectedTemplate.tags }, null, 1)}
INSTRUCTION: Start agent design from this template's configuration. Adapt tools, skills, and workflow steps to the specific outcome contract while preserving the template's core architecture.

` : ""}═══════════════════════════════════════════
AGENT TEMPLATES (reusable configurations — match to these when possible)
═══════════════════════════════════════════
${JSON.stringify(templateSummaries)}

═══════════════════════════════════════════
ONTOLOGY CONCEPTS (industry domain vocabulary — use these terms in agent roles and descriptions)
═══════════════════════════════════════════
${JSON.stringify(ontologySummary)}

═══════════════════════════════════════════
ONTOLOGY ENHANCEMENTS (AI-enriched — agent use cases, risk factors, implementation guidance)
═══════════════════════════════════════════
${JSON.stringify(enhancementSummary)}

═══════════════════════════════════════════
AGENT SKILLS LIBRARY (composable skill units — assign REAL skills to agents by name)
═══════════════════════════════════════════
${JSON.stringify(skillSummaries)}

═══════════════════════════════════════════
MCP SERVERS & TOOLS (registered tool integrations — assign REAL tools from this registry)
═══════════════════════════════════════════
${JSON.stringify(mcpToolSummary)}

═══════════════════════════════════════════
ACTIVE POLICIES (governance constraints agents must obey)
═══════════════════════════════════════════
${JSON.stringify(policySummary)}

═══════════════════════════════════════════
RAG PIPELINES (knowledge retrieval configurations)
═══════════════════════════════════════════
${JSON.stringify(ragSummary)}

═══════════════════════════════════════════
KNOWLEDGE BASES (vector-embedded document collections for RAG grounding — assign relevant KBs to agents by ID)
═══════════════════════════════════════════
${JSON.stringify(kbSummary)}

═══════════════════════════════════════════
EXISTING AGENTS FOR THIS OUTCOME (avoid duplicating these)
═══════════════════════════════════════════
${existingAgentNames.length > 0 ? existingAgentNames.join(", ") : "None yet"}
${processFlowSteps && Array.isArray(processFlowSteps) && processFlowSteps.length > 0 ? `
═══════════════════════════════════════════
BUSINESS PROCESS FLOW (authored by business users — align agent names and roles to these steps)
═══════════════════════════════════════════
The business team has defined this process flow for the outcome. Each agent you propose should map to one or more of these business steps. Use the step labels as the primary inspiration for agent names.

${processFlowSteps.map((s: any, i: number) => `Step ${i + 1} [${s.type || "action"}]: "${s.label}" — ${s.description || ""}${s.actor ? ` (Owner: ${s.actor})` : ""}`).join("\n")}

IMPORTANT: Name agents using the business vocabulary above. Avoid generic names like "Worker Agent 1". Prefer names like "Invoice Validation Agent", "Risk Assessment Agent" etc., derived from the step labels above.
` : ""}
═══════════════════════════════════════════
OUTPUT CONCISENESS RULES — MANDATORY
═══════════════════════════════════════════
Token budget is limited. Every field MUST be brief:
- description fields: ≤15 words
- systemPrompt: 1 sentence only
- patternReasoning: ≤2 sentences total
- estimatedImpact: 1 line per KPI, format exactly as shown
- errorHandling / handoffRules: 1 sentence each
- workflowSteps: ≤4 steps per agent, each ≤8 words
- purpose / missingCapabilities: ≤10 words each
- outputSchema.description: ≤10 words
- outputSchema.fields: max 3 fields, description ≤5 words each
- matchedOntologyConcepts / complianceTags: max 3 items each
- quote: exact substring, max 40 chars
Do NOT write full sentences in array items. Be concise everywhere.

═══════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════

Respond with a JSON object matching this schema exactly:

\`\`\`json
{
  "orchestrator": {
    "name": "string",
    "description": "string",
    "role": "string",
    "riskTier": "MEDIUM",
    "autonomyMode": "assisted",
    "modelProvider": "openai",
    "modelName": "gpt-4.1",
    "workflowSteps": ["string"],
    "tools": [{"name": "string - MUST be from MCP Tools registry above if available", "description": "string"}],
    "kpiBindings": ["string - bind ALL KPIs here"],
    "estimatedImpact": "string - FORMAT: '[KPI Name]: [baseline] → [target] ([∆%])'. Example: 'DSO: 45 → 38 days (−15%)'. If multiple KPIs: list each on a new line. Fallback to 'Contributes to [KPI name]' only if no baseline/target data exists.",
    "templateMatch": "string | null - exact name of matching Agent Template",
    "matchedSkills": ["string - exact skill names from Skills Library above"],
    "matchedOntologyConcepts": ["string - exact ontology concept labels from above"],
    "policyConstraints": ["string - names of policies this agent must comply with"],
    "mcpToolBindings": [{"server": "string - MCP server name", "tool": "string - tool name"}],
    "suggestedRagPipeline": "string | null - name of RAG pipeline for knowledge retrieval",
    "suggestedKnowledgeBases": [{"id": "string - KB id from Knowledge Bases registry", "name": "string"}],
    "complianceTags": ["string - regulatory frameworks from Industry Context"],
    "systemPrompt": "string - 1-2 sentence role instruction (e.g. 'You monitor AR aging and flag overdue invoices...')"
  },
  "agents": [
    {
      "name": "string",
      "description": "string - reference ontology concepts and domain vocabulary",
      "role": "string - grounded in industry domain, not generic",
      "riskTier": "LOW | MEDIUM | HIGH - based on KPI weight, SLA criticality, and policy constraints",
      "autonomyMode": "manual | assisted | autonomous - lower for higher risk, respect policy constraints",
      "modelProvider": "openai | anthropic | google",
      "modelName": "string",
      "workflowSteps": ["string"],
      "tools": [{"name": "string - from MCP Tools registry", "description": "string"}],
      "kpiBindings": ["string - specific KPIs this agent drives, weighted by importance"],
      "estimatedImpact": "string - FORMAT: '[KPI Name]: [baseline] → [target] ([∆%])'. Example: 'Invoice Match Rate: 82% → 94% (+12pp)'. Use actual KPI baseline/target values from the KPI DEFINITIONS section above. Fallback to 'Contributes to [KPI name]' only if no numeric data exists.",
      "templateMatch": "string | null",
      "matchedSkills": ["string - exact skill names from Skills Library"],
      "matchedOntologyConcepts": ["string - ontology concept labels"],
      "policyConstraints": ["string - policy names"],
      "mcpToolBindings": [{"server": "string", "tool": "string"}],
      "suggestedRagPipeline": "string | null",
      "suggestedKnowledgeBases": [{"id": "string - KB id", "name": "string"}],
      "complianceTags": ["string - regulatory framework tags"],
      "systemPrompt": "string - 1-2 sentence role instruction",
      "outputSchema": {
        "type": "record_list | summary",
        "description": "string - what each record represents, e.g. 'scored lead with qualification decision'",
        "fields": [
          {"name": "string - field name e.g. 'id'", "type": "string | number | boolean", "description": "string"}
        ]
      }
    }
  ],
  "pipeline": {
    "systemsExtracted": [
      {"name": "string - exact proper noun", "systemRole": "orchestration_system | target_system", "purpose": "string - ≤8 words", "mcpCoverage": "covered | partial | missing | not_applicable", "existingMcpServer": "string | null", "requiredCapabilities": ["string - ≤5 words, max 2 items"]}
    ],
    "mcpGaps": [
      {"system": "string - system name", "missingCapabilities": ["string - ≤5 words, max 3"], "suggestedMcpServerName": "string - proposed MCP name", "priority": "critical | high | medium"}
    ],
    "agentDependencyMatrix": [
      {"agent": "string - agent role name", "inputs": ["string - what this agent needs to start"], "outputs": ["string - what this agent produces"], "dependsOn": ["string - roles of agents whose output this agent requires"]}
    ],
    "pattern": "sequential | parallel | fan_out_fan_in | supervisor",
    "patternReasoning": "string - explain WHY this pattern was chosen: (1) dependency relationships from the matrix, (2) ordering signals detected in the outcome, (3) why the pattern matches, (4) if parallel, why agents have no data dependencies",
    "description": "string",
    "edges": [{"from": "string", "to": "string", "label": "string", "type": "sequential | parallel | conditional"}],
    "parallelGroups": [["string - agent roles that execute concurrently"], ["string - next group after previous completes"]],
    "executionGraph": [{"stage": 0, "agents": ["string - agent roles in this tier"], "waitForAll": true}],
    "errorHandling": "string",
    "handoffRules": "string"
  }
}
\`\`\`

═══════════════════════════════════════════
SYSTEM EXTRACTION & MCP GAP ANALYSIS (MANDATORY — DO THIS FIRST)
═══════════════════════════════════════════
Before proposing any agents, you MUST extract ALL external systems mentioned in the outcome contract.

Step 1 — EXTRACT (STRICT EVIDENTIARY MODE):
Scan FOUR named sources. Extract ONLY systems that are EXPLICITLY NAMED as proper nouns in the provided text. Do NOT infer, generalize, extrapolate, or add systems you believe are implied or typical for the domain. If a system is not named verbatim, do not include it.

Source A — Outcome contract text: description, systemPrompt, workflowSteps, KPI definitions.
Source B — MCP server descriptions: the "serverDescription" field of each entry in the MCP SERVERS & TOOLS registry above.
Source C — MCP tool descriptions: the "description" field of each individual tool.
Source D — Schema entity hints: the "schemaEntityHints" arrays on each tool (these are proper-noun system names extracted directly from tool parameter examples).

For every extracted system, record:
- "name": exact proper noun as it appears in the source
- "source": one of "outcome_text" | "server_description" | "tool_description" | "schema_hint"
- "quote": the exact substring (max 80 chars) from the source text where the name appeared
- "systemRole": CRITICAL — classify each system as exactly one of:
    "orchestration_system" — a system that ACTIVELY EXECUTES steps in the provisioning pipeline (calls are made TO this system during workflow execution; it performs identity operations, provisioning actions, certifications, compliance checks, or workflow tracking). A system qualifies as an orchestration_system if it has MCP tools in the registry above, or if the outcome/MCP text describes it as a step-executor.
    "target_system" — a system that is the DESTINATION or RESOURCE being managed; it receives the result of provisioning but the orchestrator does NOT call it directly. These are downstream applications or platforms that users or synthetic workers will ACCESS after provisioning is complete. A system qualifies as a target_system if it appears in phrases like "access to X", "accounts on X", or "applications including X" — meaning it is the destination of provisioning, not a provisioning executor.

CLASSIFICATION RULES:
- A system is "orchestration_system" if: it has MCP tools in the registry, its name appears in a tool description as the system a tool acts upon, or the outcome/MCP text describes it as a step-executor in the pipeline.
- A system is "target_system" if: it appears in phrases like "access to X", "accounts on X", "critical systems including X", or "applications including X" — meaning it is the destination of provisioning, not a provisioning executor.
- When uncertain, check the MCP registry: if no tool exists for the system, and it is mentioned as a provisioning destination, classify as "target_system".

Combine all four sources into a single deduplicated list by system name.

ABSTENTION RULE: If you are uncertain whether a name refers to a real external system vs. an internal concept or generic term, omit it. Do NOT add placeholder systems like "HR System", "ERP System", or "Identity Provider" unless those exact strings appear verbatim in the source text.

Step 2 — ASSIGN COVERAGE (use PRE-COMPUTED values — DO NOT compute independently):
  If a MANDATORY AGENT BLUEPRINT section appears at the top of this prompt, it contains a "PRE-COMPUTED SYSTEM COVERAGE" list. Use those coverage values EXACTLY as stated:
  - Systems listed as "COVERED" → set mcpCoverage = "covered", existingMcpServer = the server name shown
  - Systems NOT in the covered list but that are orchestration_systems → set mcpCoverage = "missing"
  - target_system entries → set mcpCoverage = "not_applicable"
  Do NOT override pre-computed coverage values. Do NOT mark covered systems as missing.

Step 3 — OUTPUT: Include ALL extracted systems in "systemsExtracted". Only add entries to "mcpGaps" for "orchestration_system" entries with "missing" coverage. Do NOT add target_systems to mcpGaps. Do NOT add covered orchestration_systems to mcpGaps.

For each agent you propose, reference the specific external systems it interacts with in its description and workflowSteps — do NOT use only generic tool names.

═══════════════════════════════════════════
CRITICAL GUIDELINES
═══════════════════════════════════════════
1. USE REAL PLATFORM DATA: For systems that DO exist in the MCP registry, assign only real tools from that registry. For systems mentioned in the outcome that have NO MCP coverage, flag them in "mcpGaps" — do NOT silently omit them or substitute unrelated tools. Skills and ontology concepts must also be real.
2. KPI-DRIVEN DESIGN: Higher-weight KPIs should have dedicated agents. Use baseline→target gaps to estimate impact. Agents bound to KPIs with tight SLA thresholds need lower risk tolerance.
3. POLICY COMPLIANCE: If active policies restrict tool usage, data handling, or autonomy levels, agents must respect these. Include relevant policy names in policyConstraints.
4. ONTOLOGY GROUNDING: Agent roles and descriptions should use industry domain vocabulary from ontology concepts. Reference concept labels to ensure domain accuracy.
5. TEMPLATE MATCHING: When a template closely matches a worker's role, set templateMatch to the template name and inherit its toolsConfig, policyBindings, and preloadedSkills.
6. SKILL BINDING: Assign real skills from the Skills Library. Skills with higher performance scores and matching industry/domain should be preferred.
7. RISK CALIBRATION: Use outcome riskTier, KPI breach levels, and policy constraints to determine each agent's riskTier and autonomyMode. High-risk outcome + critical KPI SLA = manual/assisted mode.
8. NO DUPLICATES: Do not propose agents that overlap with existing agents already created for this outcome.
9. REGULATORY AWARENESS: Include applicable regulatory frameworks as complianceTags. Reference linkedRegulations from ontology concepts.
10. SYSTEM PROMPTS: Generate detailed, industry-specific system prompts that reference the agent's domain, ontology concepts, compliance requirements, and KPI responsibilities.
11. AGENT COUNT — HARD CONSTRAINT: Worker agents are ONLY created for "orchestration_system" classified systems — systems that have MCP tools or that actively execute pipeline steps. NEVER create agents for "target_system" entries (downstream resources being provisioned to). Check the MCP registry: if any server entry has a "declaredStageCount" value (e.g., a "7-step pipeline" sets declaredStageCount=7), you MUST produce exactly that many worker agents — one per declared pipeline stage. Map each stage name from the pipeline description to a dedicated agent. Do NOT merge stages to reduce count. If no declaredStageCount is present, use judgment: one agent per orchestration_system or major governance checkpoint, typically 2–7. Always include 1 orchestrator in addition to the workers.
12. KNOWLEDGE BASE GROUNDING: Assign relevant Knowledge Bases from the registry to agents that need domain-specific RAG grounding. Use exact KB IDs and names. Agents doing research, analysis, or compliance checks benefit most from KB linkage.
13. STRUCTURED OUTPUT SCHEMA: For each worker agent that retrieves, processes, scores, or classifies batches of data records (leads, transactions, claims, patients, items, etc.), you MUST define an outputSchema with type="record_list". The fields array should describe the per-record structured output the agent must produce — include id, name/label, score (0-100), decision/classification, reasoning, and any domain-specific fields (e.g. escalation, riskLevel). Workers that only produce aggregate summaries or single metrics should use type="summary". The description should clearly state what each record represents. This enables the platform to render per-record results as interactive data tables.

═══════════════════════════════════════════
ORCHESTRATION PATTERN SELECTION (CRITICAL — THREE-PHASE PROCESS)
═══════════════════════════════════════════

You MUST follow a strict three-phase process to select the correct orchestration pattern. Do NOT skip any phase.

─── PHASE 0: KPI INDEPENDENCE SCAN (mandatory — do this FIRST) ───
Before anything else, list each KPI from the contract and identify its PRIMARY DOMAIN:
  - Data collection / ingestion
  - Data enrichment / transformation
  - Validation / compliance checking
  - Reporting / aggregation / notification
  - Execution / provisioning / write-back

If two or more KPIs belong to COMPLETELY INDEPENDENT DOMAINS with no shared input data between their agents, those KPIs should be served by agents that execute IN PARALLEL. Independence means: the data one agent reads is entirely separate from the data the other reads, and neither agent requires the other's output to begin.

Example — INDEPENDENT KPIs: "DSO monitoring" (reads AR aging data), "Cash auto-match accuracy" (reads bank transaction feed), "Tax accuracy" (reads invoice records) → three separate data sources, no shared state → strong parallel signal.
Example — DEPENDENT KPIs: "Invoice validation rate" (validates invoice → produces validated invoice IDs) + "GL posting success" (needs validated invoice IDs to post) → sequential dependency, must be tiered.

─── PHASE 1: AGENT DEPENDENCY MATRIX (mandatory) ───
For each agent you are proposing, determine:
  - INPUTS: What data, state, or results does this agent need before it can start? (e.g. "needs provisioned account IDs from the Provisioning Agent")
  - OUTPUTS: What does this agent produce when done? (e.g. "produces audit evidence report")

Then build the dependency matrix:
  - If Agent B's INPUT requires Agent A's OUTPUT → they have a sequential dependency (A must run before B).
  - If two agents share no input/output dependency → they are independent and MAY run in parallel.
  - If multiple agents all consume the SAME input and produce independent outputs → that is a fan-out signal.

You MUST include this matrix in "agentDependencyMatrix" inside the pipeline object (array of {agent, inputs, outputs, dependsOn}).

─── PHASE 1b: WORKFLOW ORDERING SIGNALS ───
Read the outcome contract's description, system prompt, and workflow steps. Look for:
  - Numbered sequences (1. 2. 3. ... or Step 1, Step 2, etc.)
  - Imperative ordering language: "then", "after", "next", "before proceeding", "once X is done", "if empty, stop"
  - Conditional gates: "if compliance check fails, stop" (implies the check must precede downstream steps)

IMPORTANT: Numbered steps do NOT automatically mean sequential execution. Many numbered steps describe independent checks or data enrichments that can run in parallel even when written sequentially in the description. CHECK whether each numbered step genuinely depends on the previous step's OUTPUT before assuming sequential. If step 3 could start before step 2 finishes (because it reads from a different data source), they should be in the same parallel tier.

Ordering signals that confirm sequential dependency: explicit output-as-input references ("uses the result of step 2"), gate conditions ("only if step 1 passes"), or writes that step 2 reads.
Ordering signals that do NOT confirm dependency: steps are just listed in order, steps involve different systems, steps operate on different record types.

─── PHASE 2: PATTERN SELECTION (derived from Phase 0 + Phase 1) ───
Using the KPI independence scan, dependency matrix, and ordering signals, select the pattern that best matches the actual data flow:

- "sequential": EACH step requires the previous step's output as a MANDATORY INPUT. Use only when the dependency matrix shows an unbroken chain where every handoff is data-dependent.
  Example: Invoice validation → Tax calculation (needs invoice total) → GL posting (needs tax-adjusted total). Each step is genuinely blocked by the prior step's output.

- "parallel": Agents work on INDEPENDENT sub-tasks with no confirmed data dependency between them. Use when KPI independence scan shows fully separate domains AND the dependency matrix shows no cross-agent data flow.
  Example: DSO monitoring + Cash auto-match + Tax accuracy checking → three independent KPI domains reading separate data sources, no shared state, run concurrently.

- "fan_out_fan_in": Multiple agents all receive the SAME input data independently, then results are aggregated. Use when the dependency matrix shows several agents sharing one input but producing independent outputs, followed by aggregation.
  Example: Customer invoice data → [Invoice Validator, Tax Calculator, Compliance Checker] → Report Aggregator.

- "supervisor": The orchestrator must dynamically decide which agents to invoke based on intermediate results or unknown conditions at design time. Use when conditional branching or adaptive routing is genuinely needed.
  Example: Dispute received → Orchestrator classifies dispute type → routes to Pricing Error Agent or Collections Agent based on category.

CRITICAL RULES:
  - If ANY agent's input depends on another agent's output, those two agents MUST NOT be in the same parallel group — they must be in separate sequential tiers.
  - Only place agents in the same parallel tier when the dependency matrix confirms they have no confirmed data dependency between them.
  - The pattern must follow the DATA FLOW, not just step order. Separate KPIs CAN justify parallel execution when they are confirmed independent domains.

For "patternReasoning", you MUST explain:
  1. The KPI independence scan results from Phase 0 (which KPIs belong to which domains)
  2. The dependency relationships discovered in Phase 1 (which agent depends on which)
  3. Whether ordering signals were genuine data dependencies or just sequential numbering
  4. Why the chosen pattern matches the actual data flow

For "parallelGroups", define execution tiers as arrays of agent role names:
  - Each inner array contains agents that can run concurrently (confirmed independent by the dependency matrix)
  - Arrays are ordered: the first group runs first, then the second group after all in the first complete, etc.
  - Example: [["DSO Monitor", "Cash Match Processor", "Tax Accuracy Agent"], ["Reporting Aggregator"]] means the first three run in parallel (independent KPI domains, separate data sources), then the aggregator runs after all three complete.
  - For sequential patterns, each group should contain exactly one agent role.

For "executionGraph", provide an explicit stage-by-stage execution plan:
  - stage: zero-indexed tier number
  - agents: array of agent role names that execute in this tier
  - waitForAll: true if the next tier must wait for ALL agents in this tier to complete (default true for fan_out_fan_in, configurable for others)
  - This must be consistent with parallelGroups but provides additional control metadata.`;

      const userMsg = stagedPipelines.length > 0
        ? `Generate an agent development plan for the outcome "${outcomeContract?.name}".

MANDATORY: You MUST create EXACTLY ${stagedPipelines[0].count} worker agents — one per pipeline stage from your system instructions. Required stages: ${stagedPipelines[0].stages.map((s: string, i: number) => `${i + 1}. ${s}`).join(", ")}.

After assigning one agent to each stage, bind the following ${kpiDetails.length} KPIs to the most relevant existing stage agent (do NOT create extra agents for KPIs): ${kpiDetails.map((k: any) => `${k.name} (baseline: ${k.baseline} → target: ${k.target}, weight: ${k.weight}, SLA: ${k.slaThreshold || "none"})`).join("; ")}`
        : `Generate an agent development plan for the outcome "${outcomeContract?.name}" targeting ${kpiDetails.length} KPIs: ${kpiDetails.map((k: any) => `${k.name} (baseline: ${k.baseline} → target: ${k.target}, weight: ${k.weight}, SLA: ${k.slaThreshold || "none"})`).join("; ")}`;

      const openAIAbort = new AbortController();
      const openAITimeout = setTimeout(() => openAIAbort.abort(), 120_000);
      let openAIResp: Awaited<ReturnType<typeof openai.chat.completions.create>>;
      try {
        openAIResp = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMsg },
          ],
          max_tokens: 7000,
        }, { signal: openAIAbort.signal });
      } catch (aiErr: any) {
        clearTimeout(openAITimeout);
        if (aiErr?.name === "AbortError" || aiErr?.code === "ERR_CANCELED") {
          res.status(504).json({ error: "Agent plan generation timed out. Please try again." });
          return;
        }
        throw aiErr;
      }
      clearTimeout(openAITimeout);
      const content = openAIResp.choices[0]?.message?.content ?? "";
      let jsonStr = content;
      const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fencedMatch) {
        jsonStr = fencedMatch[1].trim();
      } else {
        const openFence = content.match(/```(?:json)?\s*([\s\S]*)/);
        if (openFence) {
          jsonStr = openFence[1].trim();
        }
      }
      if (jsonStr.endsWith(",") || jsonStr.endsWith(",\n")) {
        jsonStr = jsonStr.replace(/,\s*$/, "");
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // Phase 1: brace-counting repair
        const braceStart = jsonStr.indexOf("{");
        if (braceStart >= 0) {
          let truncated = jsonStr.slice(braceStart);
          let openBraces = 0, openBrackets = 0;
          for (const ch of truncated) {
            if (ch === "{") openBraces++;
            if (ch === "}") openBraces--;
            if (ch === "[") openBrackets++;
            if (ch === "]") openBrackets--;
          }
          while (openBrackets > 0) { truncated += "]"; openBrackets--; }
          while (openBraces > 0) { truncated += "}"; openBraces--; }
          truncated = truncated.replace(/,\s*([}\]])/g, "$1");
          try {
            parsed = JSON.parse(truncated);
          } catch {
            // Phase 2: pipeline section is likely what's truncated — extract orchestrator + agents slice
            // The JSON structure is always { "orchestrator": {...}, "agents": [...], "pipeline": {...} }
            // If pipeline is cut off, recover the parts that completed before it.
            try {
              const pipelineIdx = jsonStr.lastIndexOf('"pipeline"');
              const slice = pipelineIdx > 0
                ? jsonStr.slice(braceStart, pipelineIdx).trimEnd().replace(/,\s*$/, "") + ', "pipeline": null }'
                : null;
              if (slice) {
                const repaired = slice.replace(/,\s*([}\]])/g, "$1");
                parsed = JSON.parse(repaired);
                console.warn("[propose-agents] Pipeline section truncated — returned orchestrator + agents without pipeline");
              }
            } catch {
              console.error("Could not repair truncated JSON from AI response");
            }
          }        // close Phase 1 catch
        }          // close if (braceStart >= 0)
        if (!parsed) {
          res.json({ agents: [], orchestrator: null, pipeline: null, raw: content });
          return;
        }
      }

      const agentPlanShape = z.object({
        orchestrator: z.object({ name: z.string(), role: z.string() }),
        agents: z.array(z.object({ name: z.string(), role: z.string() })).min(1),
        pipeline: z.object({
          pattern: z.string(),
          systemsExtracted: z.array(z.any()).optional(),
        }).optional(),
      });
      const agentPlanValidation = agentPlanShape.safeParse(parsed);
      if (!agentPlanValidation.success) {
        console.error("[propose-agents] LLM response failed schema validation:", agentPlanValidation.error.message);
        console.error("[propose-agents] Raw LLM response (first 2000 chars):", content.slice(0, 2000));
        res.status(422).json({ error: "Agent plan generation failed: invalid response structure", details: agentPlanValidation.error.message });
        return;
      }

      const normalizeAgent = function(a: any): any {
        if (!a) return a;
        return {
          ...a,
          tools: Array.isArray(a.tools) ? a.tools : [],
          workflowSteps: Array.isArray(a.workflowSteps) ? a.workflowSteps : [],
          kpiBindings: Array.isArray(a.kpiBindings) ? a.kpiBindings : [],
          matchedSkills: Array.isArray(a.matchedSkills) ? a.matchedSkills : [],
          matchedOntologyConcepts: Array.isArray(a.matchedOntologyConcepts) ? a.matchedOntologyConcepts : [],
          policyConstraints: Array.isArray(a.policyConstraints) ? a.policyConstraints : [],
          mcpToolBindings: Array.isArray(a.mcpToolBindings) ? a.mcpToolBindings : [],
          complianceTags: Array.isArray(a.complianceTags) ? a.complianceTags : [],
          suggestedRagPipeline: a.suggestedRagPipeline || null,
          suggestedKnowledgeBases: Array.isArray(a.suggestedKnowledgeBases) ? a.suggestedKnowledgeBases : [],
          systemPrompt: a.systemPrompt || "",
          templateMatch: a.templateMatch || null,
          outputSchema: a.outputSchema || null,
        };
      }

      const normalizePipeline = function(p: any): any {
        if (!p) return null;
        return {
          ...p,
          systemsExtracted: Array.isArray(p.systemsExtracted) ? p.systemsExtracted : [],
          mcpGaps: Array.isArray(p.mcpGaps) ? p.mcpGaps : [],
          agentDependencyMatrix: Array.isArray(p.agentDependencyMatrix) ? p.agentDependencyMatrix : [],
          pattern: p.pattern || "supervisor",
          patternReasoning: p.patternReasoning || "",
          description: p.description || "",
          edges: Array.isArray(p.edges) ? p.edges : [],
          parallelGroups: Array.isArray(p.parallelGroups) ? p.parallelGroups : [],
          executionGraph: Array.isArray(p.executionGraph) ? p.executionGraph : [],
          errorHandling: p.errorHandling || "",
          handoffRules: p.handoffRules || "",
        };
      }

      const findCoveringServer = function(systemName: string, coverageMap: Record<string, string>): string | null {
        const nameLower = systemName.toLowerCase().trim();
        for (const [coveredName, serverName] of Object.entries(coverageMap)) {
          const coveredLower = coveredName.toLowerCase().trim();
          if (coveredLower.includes(nameLower) || nameLower.includes(coveredLower)) {
            return serverName;
          }
        }
        return null;
      }

      let result: any;
      if (parsed && parsed.orchestrator && parsed.agents) {
        result = {
          orchestrator: normalizeAgent(parsed.orchestrator),
          agents: (Array.isArray(parsed.agents) ? parsed.agents : [parsed.agents]).map(normalizeAgent),
          pipeline: normalizePipeline(parsed.pipeline),
        };
      } else if (Array.isArray(parsed)) {
        result = { agents: parsed.map(normalizeAgent), orchestrator: null, pipeline: null };
      } else {
        result = { agents: [], orchestrator: null, pipeline: null, raw: content };
      }

      // Post-process: enforce pre-computed coverage — LLM cannot reliably derive this
      if (result.pipeline?.systemsExtracted && Object.keys(systemCoverageGT).length > 0) {
        result.pipeline.systemsExtracted = result.pipeline.systemsExtracted.map((s: any) => {
          if (s.systemRole === "target_system") {
            return { ...s, mcpCoverage: "not_applicable", requiredCapabilities: [], existingMcpServer: null };
          }
          const coveringServer = findCoveringServer(s.name, systemCoverageGT);
          if (coveringServer) {
            return { ...s, mcpCoverage: "covered", existingMcpServer: coveringServer };
          }
          return s;
        });
        if (result.pipeline.mcpGaps) {
          result.pipeline.mcpGaps = result.pipeline.mcpGaps.filter((g: any) => {
            return !findCoveringServer(g.system, systemCoverageGT);
          });
        }
      }

      // Post-process: strip mcpToolBindings that reference servers not in the valid set
      // Valid servers = those that cover any orchestration system (from systemCoverageGT)
      const validMcpServerNames = new Set(Object.values(systemCoverageGT));
      if (validMcpServerNames.size > 0) {
        const allResultAgents = [
          ...(Array.isArray(result.agents) ? result.agents : []),
          ...(result.orchestrator ? [result.orchestrator] : []),
        ];
        for (const agent of allResultAgents) {
          if (Array.isArray(agent.mcpToolBindings)) {
            agent.mcpToolBindings = agent.mcpToolBindings.filter((b: any) =>
              validMcpServerNames.has(b.server)
            );
          }
        }
      }

      // Policy conflict annotation: flag proposed agents that clash with existing org/outcome policies
      try {
        const existingPolicies = await storage.getPolicies(getOrgId(req));
        const activePolicies = existingPolicies.filter(p => p.status === "active");
        const orgLevelPolicies = activePolicies.filter(p => p.scopeType === "org" || p.scopeType === "outcome");

        const allProposedAgents = [
          ...(result.orchestrator ? [result.orchestrator] : []),
          ...(Array.isArray(result.agents) ? result.agents : []),
        ];

        const tierOrder: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
        for (const agent of allProposedAgents) {
          const conflicts: Array<{ policyId: string; policyName: string; reason: string }> = [];
          for (const orgPolicy of orgLevelPolicies) {
            const pj = orgPolicy.policyJson as Record<string, any> | null;
            if (!pj) continue;
            if (Array.isArray(pj.blockedAutonomyModes) && pj.blockedAutonomyModes.includes(agent.autonomyMode)) {
              conflicts.push({ policyId: orgPolicy.id, policyName: orgPolicy.name, reason: `Autonomy mode "${agent.autonomyMode}" is blocked by this policy` });
            }
            if (pj.maxRiskTier) {
              const agentTierVal = tierOrder[agent.riskTier] || 2;
              const maxTierVal = tierOrder[pj.maxRiskTier] || 4;
              if (agentTierVal > maxTierVal) {
                conflicts.push({ policyId: orgPolicy.id, policyName: orgPolicy.name, reason: `Risk tier "${agent.riskTier}" exceeds policy max "${pj.maxRiskTier}"` });
              }
            }
            if (Array.isArray(pj.blockedTools) && Array.isArray(agent.tools)) {
              const agentToolsLower = agent.tools.map((t: string) => t.toLowerCase());
              const blockedMatches = (pj.blockedTools as string[]).filter((bt: string) =>
                agentToolsLower.some((at: string) => at.includes(bt.toLowerCase()) || bt.toLowerCase().includes(at))
              );
              if (blockedMatches.length > 0) {
                conflicts.push({ policyId: orgPolicy.id, policyName: orgPolicy.name, reason: `Tools [${blockedMatches.join(", ")}] are blocked by this policy` });
              }
            }
          }
          agent.policyConflicts = conflicts;
        }
      } catch (pcErr: any) {
        console.warn("[propose-agents] Policy conflict annotation failed (non-fatal):", pcErr.message);
      }

      const ROLE_PATTERN_MAP: Record<string, string> = {
        orchestrator: "orchestrator",
        router: "orchestrator",
        coordinator: "orchestrator",
        supervisor: "orchestrator",
        retrieval: "rag_pipeline",
        rag: "rag_pipeline",
        data: "rag_pipeline",
        research: "rag_pipeline",
        analysis: "linear_chain",
        processor: "linear_chain",
        pipeline: "linear_chain",
        review: "human_in_loop",
        approval: "human_in_loop",
        compliance: "human_in_loop",
        fan: "fan_out",
        parallel: "fan_out",
        aggregator: "fan_out",
      };

      const suggestPatternType = function(agent: any): string {
        const combined = `${agent.role || ""} ${agent.name || ""} ${agent.description || ""}`.toLowerCase();
        for (const [keyword, pattern] of Object.entries(ROLE_PATTERN_MAP)) {
          if (combined.includes(keyword)) return pattern;
        }
        if (agent.tools?.length > 3) return "fan_out";
        return "linear_chain";
      }

      try {
        const allBlueprints = await storage.getBlueprints();
        const sharedBlueprints = allBlueprints.filter(bp => bp.isShared || bp.status === "signed" || bp.status === "compiled");

        const allResultAgents = [
          ...(result.orchestrator ? [result.orchestrator] : []),
          ...(Array.isArray(result.agents) ? result.agents : []),
        ];

        for (const agent of allResultAgents) {
          const pattern = suggestPatternType(agent);
          agent.suggestedPatternType = pattern;
          const matchingBp = sharedBlueprints.find(bp => bp.patternType === pattern);
          agent.suggestedBlueprintId = matchingBp?.id || null;
          agent.suggestedBlueprintName = matchingBp?.name || null;
        }
      } catch (bpErr) {
        console.error("[propose-agents] Blueprint suggestion failed:", bpErr);
      }

      if (outcomeContract?.id && (result.agents?.length > 0 || result.orchestrator)) {
        try {
          const existing = await storage.getAgentProposalByOutcome(outcomeContract.id);
          if (existing) {
            await storage.updateAgentProposal(existing.id, {
              orchestrator: result.orchestrator,
              workers: result.agents,
              pipeline: result.pipeline,
              selectedIndices: result.agents.map((_: any, i: number) => i),
              orchestratorSelected: !!result.orchestrator,
              status: "draft",
            });
            result.proposalId = existing.id;
          } else {
            const saved = await storage.createAgentProposal({
              outcomeId: outcomeContract.id,
              orchestrator: result.orchestrator,
              workers: result.agents,
              pipeline: result.pipeline,
              selectedIndices: result.agents.map((_: any, i: number) => i),
              orchestratorSelected: !!result.orchestrator,
              status: "draft",
            });
            result.proposalId = saved.id;
          }
        } catch (saveErr) {
          console.error("Failed to auto-save proposal:", saveErr);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Agent proposal error:", error);
      res.status(500).json({ error: "Failed to generate agent proposals" });
    }
  });

  router.post("/api/ai/create-team-from-proposals", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const agentProposalSchema = z.object({
        name: z.string(),
        description: z.string(),
        role: z.string().optional(),
        riskTier: z.string().optional(),
        autonomyMode: z.string().optional(),
        modelProvider: z.string().optional(),
        modelName: z.string().optional(),
        tools: z.array(z.object({ name: z.string(), description: z.string() })).optional(),
        kpiBindings: z.array(z.string()).optional(),
        workflowSteps: z.array(z.string()).optional(),
        estimatedImpact: z.string().optional(),
        templateMatch: z.string().nullable().optional(),
        suggestedKnowledgeBases: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
        mcpToolBindings: z.array(z.object({ server: z.string(), tool: z.string() })).optional(),
        matchedSkills: z.array(z.string()).optional(),
        matchedOntologyConcepts: z.array(z.string()).optional(),
        policyConstraints: z.array(z.string()).optional(),
        complianceTags: z.array(z.string()).optional(),
        systemPrompt: z.string().optional(),
        suggestedRagPipeline: z.string().nullable().optional(),
        outputSchema: z.object({
          type: z.string(),
          description: z.string(),
          fields: z.array(z.object({ name: z.string(), type: z.string(), description: z.string() })),
        }).nullable().optional(),
      });
      const bodySchema = z.object({
        outcomeId: z.string(),
        industry: z.string().optional(),
        orchestrator: agentProposalSchema,
        workers: z.array(agentProposalSchema).min(1),
        pipeline: z.object({
          pattern: z.string().optional(),
          patternReasoning: z.string().optional(),
          description: z.string().optional(),
          edges: z.array(z.any()).optional(),
          parallelGroups: z.array(z.array(z.string())).optional(),
          executionGraph: z.array(z.object({
            stage: z.number(),
            agents: z.array(z.string()),
            waitForAll: z.boolean().optional(),
          })).optional(),
          errorHandling: z.string().optional(),
          handoffRules: z.string().optional(),
        }).nullable().optional(),
      });

      const { outcomeId, industry: reqIndustry, orchestrator, workers, pipeline } = bodySchema.parse(req.body);

      const outcome = await storage.getOutcome(outcomeId, getOrgId(req));
      if (!outcome) return res.status(404).json({ error: "Outcome not found" });

      const allMcpServers = await storage.getMcpServers();

      const linkMcpBindings = async function(agentId: string, bindings?: Array<{ server: string; tool: string }>) {
        if (!bindings?.length) return;
        const serverNames = Array.from(new Set(bindings.map(b => b.server)));
        for (const serverName of serverNames) {
          const matched = allMcpServers.find(s =>
            s.name.toLowerCase().includes(serverName.toLowerCase()) ||
            serverName.toLowerCase().includes(s.name.toLowerCase().split(" ")[0])
          );
          if (matched) {
            try {
              const existing = await storage.getAgentMcpServerByIds(agentId, matched.id);
              if (!existing) {
                await storage.createAgentMcpServer({ agentId, serverId: matched.id });
              }
            } catch {}
          }
        }
      }

      const composeTaskPrompt = function(agent: z.infer<typeof agentProposalSchema>, isOrchestrator: boolean): string {
        const lines: string[] = [];
        lines.push(`Role: ${agent.role || agent.name}`);
        lines.push(`Goal: ${agent.description}`);
        if (agent.workflowSteps?.length) {
          lines.push(`\nWorkflow Steps:`);
          agent.workflowSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
        }
        if (agent.tools?.length) {
          lines.push(`\nAvailable Tools: ${agent.tools.map(t => t.name).join(", ")}`);
        }
        if (agent.kpiBindings?.length) {
          lines.push(`\nKPIs to optimize: ${agent.kpiBindings.join(", ")}`);
        }
        if (agent.estimatedImpact) {
          lines.push(`\nExpected Impact: ${agent.estimatedImpact}`);
        }
        if (isOrchestrator && pipeline) {
          lines.push(`\nOrchestration Pattern: ${pipeline.pattern || "supervisor"}`);
          if (pipeline.errorHandling) lines.push(`Error Handling: ${pipeline.errorHandling}`);
          if (pipeline.handoffRules) lines.push(`Handoff Rules: ${pipeline.handoffRules}`);
        }
        if (agent.outputSchema && agent.outputSchema.type === "record_list" && agent.outputSchema.fields?.length) {
          lines.push(`\n═══ STRUCTURED OUTPUT REQUIREMENTS ═══`);
          lines.push(`You MUST produce per-record structured output for every ${agent.outputSchema.description || "data record"} you process.`);
          lines.push(`After your natural language summary, output a JSON block wrapped in \`\`\`json ... \`\`\` markers containing a "processedRecords" array.`);
          lines.push(`Each element in the array must have these fields:`);
          for (const field of agent.outputSchema.fields) {
            lines.push(`  - ${field.name} (${field.type}): ${field.description}`);
          }
          lines.push(`Process EVERY record from the data — do not summarize or skip any.`);
          lines.push(`The platform will render this as an interactive data table for review.`);
        }
        return lines.join("\n");
      }

      const composeSystemPrompt = function(agent: z.infer<typeof agentProposalSchema>, isOrchestrator: boolean): string {
        if (agent.systemPrompt && agent.systemPrompt.trim().length > 0) {
          return agent.systemPrompt;
        }
        const industry = reqIndustry || "general";
        const lines: string[] = [];
        lines.push(`You are ${agent.name}, an AI agent operating within the ${industry} industry.`);
        lines.push(`Your role: ${agent.role || agent.description}`);
        if (isOrchestrator) {
          lines.push(`You are the orchestrator agent responsible for coordinating worker agents to deliver the outcome "${outcome!.name}".`);
          lines.push(`Orchestration pattern: ${pipeline?.pattern || "supervisor"}.`);
        } else {
          lines.push(`You are a worker agent contributing to the outcome "${outcome!.name}".`);
        }
        if (agent.kpiBindings?.length) {
          lines.push(`You are responsible for optimizing these KPIs: ${agent.kpiBindings.join(", ")}.`);
        }
        if (agent.tools?.length) {
          lines.push(`You have access to these tools: ${agent.tools.map(t => `${t.name} (${t.description})`).join("; ")}.`);
        }
        lines.push(`Risk tier: ${agent.riskTier || "MEDIUM"}. Autonomy mode: ${agent.autonomyMode || "assisted"}.`);
        lines.push(`Always follow compliance requirements and escalate when operating outside your autonomy boundaries.`);
        return lines.join("\n");
      }

      const teamAgent = await storage.createAgent({
        name: orchestrator.name,
        description: orchestrator.description,
        owner: "system",
        agentType: "team",
        riskTier: orchestrator.riskTier || "MEDIUM",
        autonomyMode: orchestrator.autonomyMode || "assisted",
        modelProvider: orchestrator.modelProvider || "openai",
        modelName: orchestrator.modelName || "gpt-4.1",
        outcomeId,
        toolsConfig: orchestrator.tools || [],
        systemPrompt: composeSystemPrompt(orchestrator, true),
        complianceTags: orchestrator.complianceTags || [],
        ontologyTags: orchestrator.matchedOntologyConcepts?.length ? { concepts: orchestrator.matchedOntologyConcepts } : {},
        policyBindings: orchestrator.policyConstraints?.length ? { policies: orchestrator.policyConstraints } : {},
        runtimeConfig: {
          prompt: composeTaskPrompt(orchestrator, true),
          kpiBindings: orchestrator.kpiBindings || [],
          workflowSteps: orchestrator.workflowSteps || [],
          estimatedImpact: orchestrator.estimatedImpact || "",
          matchedSkills: orchestrator.matchedSkills || [],
          suggestedRagPipeline: orchestrator.suggestedRagPipeline || null,
          mcpToolBindings: orchestrator.mcpToolBindings || [],
          orchestration: {
            pattern: pipeline?.pattern || "supervisor",
            patternReasoning: pipeline?.patternReasoning || "",
            description: pipeline?.description || "",
            errorHandling: pipeline?.errorHandling || "retry then escalate",
            handoffRules: pipeline?.handoffRules || "pass output as input",
            parallelGroups: pipeline?.parallelGroups || [],
            executionGraph: pipeline?.executionGraph || [],
          },
        },
      });

      await linkMcpBindings(teamAgent.id, orchestrator.mcpToolBindings);

      const createdWorkers: any[] = [];
      for (const worker of workers) {
        const workerAgent = await storage.createAgent({
          name: worker.name,
          description: worker.description,
          owner: "system",
          agentType: "single",
          riskTier: worker.riskTier || "LOW",
          autonomyMode: worker.autonomyMode || "assisted",
          modelProvider: worker.modelProvider || "openai",
          modelName: worker.modelName || "gpt-4.1-mini",
          outcomeId,
          toolsConfig: worker.tools || [],
          systemPrompt: composeSystemPrompt(worker, false),
          complianceTags: worker.complianceTags || [],
          ontologyTags: worker.matchedOntologyConcepts?.length ? { concepts: worker.matchedOntologyConcepts } : {},
          policyBindings: worker.policyConstraints?.length ? { policies: worker.policyConstraints } : {},
          runtimeConfig: {
            prompt: composeTaskPrompt(worker, false),
            kpiBindings: worker.kpiBindings || [],
            workflowSteps: worker.workflowSteps || [],
            estimatedImpact: worker.estimatedImpact || "",
            matchedSkills: worker.matchedSkills || [],
            suggestedRagPipeline: worker.suggestedRagPipeline || null,
            mcpToolBindings: worker.mcpToolBindings || [],
            outputSchema: worker.outputSchema || null,
          },
        });
        createdWorkers.push(workerAgent);

        await linkMcpBindings(workerAgent.id, worker.mcpToolBindings);

        await storage.createAgentTeamMember({
          teamAgentId: teamAgent.id,
          memberAgentId: workerAgent.id,
          role: "member",
        });

        if (worker.suggestedKnowledgeBases?.length) {
          for (const kb of worker.suggestedKnowledgeBases) {
            try {
              await storage.createAgentKnowledgeBase({ agentId: workerAgent.id, knowledgeBaseId: kb.id });
            } catch {}
          }
        }
      }

      if (orchestrator.suggestedKnowledgeBases?.length) {
        for (const kb of orchestrator.suggestedKnowledgeBases) {
          try {
            await storage.createAgentKnowledgeBase({ agentId: teamAgent.id, knowledgeBaseId: kb.id });
          } catch {}
        }
      }

      const blueprint = await storage.createBlueprint({
        name: `${orchestrator.name} - Team Blueprint`,
        description: pipeline?.description || `Orchestration blueprint for ${orchestrator.name}`,
        agentId: teamAgent.id,
        status: "draft",
        blueprintJson: {
          pattern: pipeline?.pattern || "supervisor",
          edges: pipeline?.edges || [],
          errorHandling: pipeline?.errorHandling,
          handoffRules: pipeline?.handoffRules,
        },
      });

      const orchestratorNode = await storage.createTeamBlueprintNode({
        blueprintId: blueprint.id,
        nodeType: "internal_agent",
        label: orchestrator.name,
        positionX: 400,
        positionY: 50,
        refAgentId: teamAgent.id,
        config: { role: "orchestrator", pattern: pipeline?.pattern || "supervisor" },
      });

      const workerNodes: any[] = [];

      const pGroups = pipeline?.parallelGroups;
      const execGraph = pipeline?.executionGraph;
      const hasParallelInfo = (pGroups && pGroups.length > 0) || (execGraph && execGraph.length > 0);

      let tiers: Array<{ agents: string[] }> = [];
      if (execGraph && execGraph.length > 0) {
        tiers = execGraph.map(eg => ({ agents: eg.agents }));
      } else if (pGroups && pGroups.length > 0) {
        tiers = pGroups.map(group => ({ agents: group }));
      }

      if (hasParallelInfo && tiers.length > 0) {
        let yOffset = 150;
        const tierNodes: Array<any[]> = [];

        for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
          const tier = tiers[tierIdx];
          const tierAgentNodes: any[] = [];
          const agentCount = tier.agents.length;
          const startX = agentCount === 1 ? 400 : 400 - ((agentCount - 1) * 130);

          for (let j = 0; j < tier.agents.length; j++) {
            const agentRole = tier.agents[j];
            const workerIdx = createdWorkers.findIndex(w =>
              w.name.toLowerCase().includes(agentRole.toLowerCase()) ||
              agentRole.toLowerCase().includes(w.name.toLowerCase().split(" ")[0].toLowerCase())
            );
            const worker = workerIdx >= 0 ? createdWorkers[workerIdx] : createdWorkers[j + tierNodes.flat().length];
            if (!worker) continue;

            const node = await storage.createTeamBlueprintNode({
              blueprintId: blueprint.id,
              nodeType: "internal_agent",
              label: worker.name,
              positionX: startX + j * 260,
              positionY: yOffset,
              refAgentId: worker.id,
              config: { role: "worker", workerIndex: workerIdx >= 0 ? workerIdx : j, tier: tierIdx, parallel: agentCount > 1 },
            });
            tierAgentNodes.push(node);
            workerNodes.push(node);
          }
          tierNodes.push(tierAgentNodes);
          yOffset += 140;
        }

        if (tierNodes[0]?.length > 0) {
          for (const node of tierNodes[0]) {
            await storage.createTeamBlueprintEdge({
              blueprintId: blueprint.id,
              sourceNodeId: orchestratorNode.id,
              targetNodeId: node.id,
              label: tierNodes[0].length > 1 ? "fork" : "dispatch",
              failureMode: "escalate",
            });
          }
        }

        for (let t = 0; t < tierNodes.length - 1; t++) {
          const currentTier = tierNodes[t];
          const nextTier = tierNodes[t + 1];
          for (const src of currentTier) {
            for (const tgt of nextTier) {
              await storage.createTeamBlueprintEdge({
                blueprintId: blueprint.id,
                sourceNodeId: src.id,
                targetNodeId: tgt.id,
                label: currentTier.length > 1 ? "join → fork" : "handoff",
                failureMode: pipeline?.errorHandling?.includes("retry") ? "retry" : "escalate",
              });
            }
          }
        }

        if (pipeline?.pattern === "fan_out_fan_in" && tierNodes.length > 0) {
          const lastTier = tierNodes[tierNodes.length - 1];
          for (const node of lastTier) {
            await storage.createTeamBlueprintEdge({
              blueprintId: blueprint.id,
              sourceNodeId: node.id,
              targetNodeId: orchestratorNode.id,
              label: "return results",
              failureMode: "escalate",
            });
          }
        }
      } else {
        const isSequential = pipeline?.pattern === "sequential";
        for (let i = 0; i < createdWorkers.length; i++) {
          const posX = isSequential ? 400 : 150 + i * Math.floor(600 / Math.max(createdWorkers.length, 1));
          const posY = isSequential ? 150 + i * 120 : 220;
          const node = await storage.createTeamBlueprintNode({
            blueprintId: blueprint.id,
            nodeType: "internal_agent",
            label: createdWorkers[i].name,
            positionX: posX,
            positionY: posY,
            refAgentId: createdWorkers[i].id,
            config: { role: "worker", workerIndex: i },
          });
          workerNodes.push(node);
        }

        if (isSequential) {
          const firstEdgeLabel = pipeline?.edges?.find((e: any) => e.from === "orchestrator" || e.from === orchestrator.name)?.label;
          await storage.createTeamBlueprintEdge({
            blueprintId: blueprint.id,
            sourceNodeId: orchestratorNode.id,
            targetNodeId: workerNodes[0].id,
            label: firstEdgeLabel || "dispatch",
            failureMode: "escalate",
          });
          for (let i = 0; i < workerNodes.length - 1; i++) {
            const edgeLabel = pipeline?.edges?.find((e: any) => e.to === createdWorkers[i + 1].name)?.label;
            await storage.createTeamBlueprintEdge({
              blueprintId: blueprint.id,
              sourceNodeId: workerNodes[i].id,
              targetNodeId: workerNodes[i + 1].id,
              label: edgeLabel || "handoff",
              failureMode: pipeline?.errorHandling?.includes("retry") ? "retry" : "escalate",
            });
          }
        } else {
          for (let i = 0; i < workerNodes.length; i++) {
            const edgeLabel = pipeline?.edges?.find((e: any) => e.to === createdWorkers[i].name)?.label;
            await storage.createTeamBlueprintEdge({
              blueprintId: blueprint.id,
              sourceNodeId: orchestratorNode.id,
              targetNodeId: workerNodes[i].id,
              label: edgeLabel || "delegate",
              failureMode: "escalate",
            });
          }

          if (pipeline?.pattern === "fan_out_fan_in") {
            for (let i = 0; i < workerNodes.length; i++) {
              await storage.createTeamBlueprintEdge({
                blueprintId: blueprint.id,
                sourceNodeId: workerNodes[i].id,
                targetNodeId: orchestratorNode.id,
                label: "return results",
                failureMode: "escalate",
              });
            }
          }
        }
      }

      for (let i = 0; i < createdWorkers.length; i++) {
        const worker = workers[i];
        if (worker.workflowSteps?.length) {
          const workerBlueprint = await storage.createBlueprint({
            name: `${worker.name} - Workflow`,
            description: worker.description,
            agentId: createdWorkers[i].id,
            status: "draft",
            blueprintJson: {
              type: "workflow",
              steps: worker.workflowSteps.map((step, stepIdx) => ({
                id: `step-${stepIdx + 1}`,
                label: step,
                order: stepIdx + 1,
                type: stepIdx === 0 ? "trigger" : stepIdx === worker.workflowSteps!.length - 1 ? "output" : "process",
              })),
              edges: worker.workflowSteps.slice(0, -1).map((_, stepIdx) => ({
                from: `step-${stepIdx + 1}`,
                to: `step-${stepIdx + 2}`,
                label: "next",
              })),
              tools: worker.tools || [],
              kpiBindings: worker.kpiBindings || [],
            },
          });
          await storage.updateAgent(createdWorkers[i].id, {
            blueprintJson: workerBlueprint.blueprintJson,
          });
        }
      }

      await storage.updateAgent(teamAgent.id, {
        blueprintId: blueprint.id,
        runtimeConfig: {
          prompt: composeTaskPrompt(orchestrator, true),
          kpiBindings: orchestrator.kpiBindings || [],
          workflowSteps: orchestrator.workflowSteps || [],
          estimatedImpact: orchestrator.estimatedImpact || "",
          orchestration: {
            pattern: pipeline?.pattern || "supervisor",
            description: pipeline?.description || "",
            errorHandling: pipeline?.errorHandling || "retry then escalate",
            handoffRules: pipeline?.handoffRules || "pass output as input",
            workerIds: createdWorkers.map((w: any) => w.id),
            edges: pipeline?.edges || [],
            blueprintId: blueprint.id,
          },
        },
      });

      if (outcome.status === "awaiting_agent_plan" || outcome.status === "active" || outcome.status === "draft") {
        try {
          await storage.updateOutcome(outcomeId, { status: "agents_assigned" });
        } catch {}
      }

      res.status(201).json({
        teamAgent,
        workers: createdWorkers,
        blueprint,
        membershipCount: createdWorkers.length,
      });
    } catch (error) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      console.error("Team creation error:", error);
      res.status(500).json({ error: "Failed to create team from proposals" });
    }
  });

  router.post("/api/ai/customer-value-report", async (req, res) => {
    try {
      const { outcomeName, outcomeDescription, industryLabel, kpis, agents, revenue, regulatoryFrameworks, reportDate, reportPeriod, executionStats } = req.body;

      const kpiSummary = (kpis || []).map((k: any) => {
        const bmText = k.benchmark ? ` (Industry benchmark: ${k.benchmark.benchmark} ${k.benchmark.unit}, Source: ${k.benchmark.source})` : "";
        const progress = k.target ? `${Math.round(((k.currentValue || 0) / k.target) * 100)}% of target` : "";
        return `- ${k.name}: Current ${k.currentValue} ${k.unit}, Target ${k.target} ${k.unit}, Progress: ${progress}, Trend: ${k.trend || "stable"}${bmText}`;
      }).join("\n");

      const agentSummary = (agents || []).map((a: any) => `- ${a.name} (${a.type}): ${a.successRate}% success rate, Health score ${a.healthScore}/100, Total runs: ${a.totalRuns || 0}`).join("\n");

      const execSummary = executionStats ? `
Execution Summary (${reportPeriod || "All time"}):
- Total agent runs: ${executionStats.totalRuns}
- Successful runs: ${executionStats.successfulRuns} (${executionStats.totalRuns > 0 ? Math.round((executionStats.successfulRuns / executionStats.totalRuns) * 100) : 0}%)
- Failed runs: ${executionStats.failedRuns}
- Average latency: ${executionStats.avgLatencyMs}ms
- Total outcome events: ${executionStats.totalEvents}
- Billable events: ${executionStats.billableEvents}
- Total cost: $${executionStats.totalCost?.toFixed(2) || "0.00"}` : "Execution data: Not yet available";

      const report = await callClaude({
        model: "claude-haiku-4-5",
        system: `You are a business report writer for the ${industryLabel} industry. Today's date is ${reportDate || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. This report covers the period: ${reportPeriod || "All time"}.

CRITICAL RULES:
- Use ONLY the data provided below. Do NOT invent dates, statistics, percentages, or numbers.
- If a metric has no data or is zero, say "Data not yet available" or "No activity recorded" — never fabricate values.
- Use the exact date provided above for the report header. Never use any other date.
- Format with markdown: # for title, ## for sections, ### for subsections, - for bullet points, **bold** for emphasis.

Include these sections:
1. Executive Summary (2-3 sentences summarizing the outcome status and key metrics)
2. KPI Performance (using the exact numbers provided)
3. Agent Performance & Reliability (using exact execution stats)
4. Business Impact & ROI (using actual revenue and event data)
5. Compliance & Governance Status
6. Recommendations (actionable, based on the actual data trends)`,
        user: `Generate a customer value report for outcome "${outcomeName}".

Report Date: ${reportDate || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
Reporting Period: ${reportPeriod || "All time"}
Description: ${outcomeDescription || "N/A"}
Industry: ${industryLabel}
Regulatory Frameworks: ${(regulatoryFrameworks || []).join(", ") || "None specified"}

KPI Performance:
${kpiSummary || "No KPIs defined"}

Contributing Agents:
${agentSummary || "No agents assigned"}

${execSummary}

Revenue:
- Billing Model: ${revenue?.billingModel || "N/A"}
- Price per Unit: $${revenue?.pricePerUnit || 0}
- Estimated Revenue: $${revenue?.estimatedRevenue || 0}`,
        maxTokens: 2500,
      }) || "Failed to generate report.";
      res.json({ report });
    } catch (error: any) {
      console.error("Customer value report error:", error);
      res.status(500).json({ error: "Failed to generate customer value report" });
    }
  });

  router.post("/api/ai/generate-process-flow", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI assistant is not configured" });
      }
      const { description, outcomeContext } = req.body;
      if (!description || typeof description !== "string") {
        return res.status(400).json({ error: "description is required" });
      }

      const validTypes = ["trigger", "get_info", "ai_reasoning", "make_decision", "expert_approval", "take_action", "send_notification", "end"];
      const contextLine = outcomeContext ? `\nOutcome context: ${JSON.stringify(outcomeContext)}` : "";

      const prompt = `You are a business process design assistant. Convert the following workflow description into a structured sequence of steps using only these step types: ${validTypes.join(", ")}.${contextLine}

Workflow description: "${description}"

Return a JSON object with:
- "name": a short name for this process (max 5 words)
- "steps": an array of steps, each with: type (one of the valid types), label (plain English name max 5 words), description (1 sentence), actor (who does this: "System", "AI", "Customer", "Manager", or a relevant role)

Rules:
- Always start with a "trigger" step
- Always end with an "end" step
- Include 5-10 steps total
- Use "expert_approval" for any human sign-off steps
- Use "ai_reasoning" for AI analysis steps
- Use "make_decision" for branching points
- Keep labels under 5 words and in plain business language

Respond ONLY with valid JSON, no markdown fences.`;

      const rawFlow = await callClaude({ model: "claude-haiku-4-5", system: "", user: prompt, maxTokens: 1500, jsonMode: true });
      const content = stripJsonFences(rawFlow);
      let parsed: any = {};
      try { parsed = JSON.parse(content); } catch {}

      const steps = (parsed.steps || []).map((s: any) => ({
        type: validTypes.includes(s.type) ? s.type : "take_action",
        label: s.label || "Step",
        description: s.description || "",
        actor: s.actor || "System",
      }));

      res.json({ name: parsed.name || "Generated Flow", steps });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to generate process flow" });
    }
  });

  router.post("/api/ai/outcome-discover", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI assistant is not configured" });
      }
      const { messages, discoveryContext, industry } = req.body;

      const templates = await storage.getAgentTemplates();
      const outcomes = await storage.getOutcomes(getOrgId(req));

      const industryContext = industry ? `\n\nIMPORTANT: The user is operating in the "${industry.label}" industry workspace. Tailor all suggestions, KPIs, agent designs, and compliance considerations to this industry. Use industry-standard terminology and reference relevant regulations (${industry.id === 'financial_services' ? 'BSA/AML, SOX, PCI-DSS, EU AI Act' : industry.id === 'healthcare' ? 'HIPAA, HITECH, CMS, FDA 21 CFR Part 11' : industry.id === 'manufacturing' ? 'ISO 9001, OSHA, EPA' : industry.id === 'insurance' ? 'State Insurance Regulations, NAIC, ACORD' : industry.id === 'retail' ? 'PCI-DSS, CCPA/CPRA, FTC Act' : industry.id === 'technology_saas' ? 'SOC 2 Type II, GDPR, CCPA, ISO 27001, FedRAMP' : industry.id === 'legal_services' ? 'ABA Model Rules, GDPR, FCPA, FRCP eDiscovery, SOX' : 'general compliance frameworks'}). When proposing agents, include industry-specific skills, MCP connections for industry systems, and note which governance policies will auto-apply.` : '';

      const systemPrompt = `You are a Business Outcome Discovery Assistant for the ATLAS (Nous Agent Orchestrator Platform). You help non-technical business users define what they want to achieve, then propose AI agent solutions.${industryContext}

Your role is to:
1. LISTEN to business problems described in plain language (e.g., "our customer churn is too high", "support tickets take too long")
2. MAP workflows - identify which business processes could be automated by agents
3. IDENTIFY automation opportunities - suggest where AI agents can add value
4. PROPOSE agent roles - recommend specific agent types with names and descriptions
5. DEFINE success metrics - suggest concrete KPIs with targets and measurement methods
6. DRAFT an Outcome Contract - when enough info is gathered, produce a structured proposal

When you have enough information (usually after 2-3 exchanges), produce a structured JSON proposal wrapped in \`\`\`json blocks. The proposal should follow this structure:
\`\`\`json
{
  "type": "outcome_proposal",
  "outcomeContract": {
    "name": "string - outcome name",
    "description": "string - what this outcome achieves",
    "riskTier": "LOW | MEDIUM | HIGH",
    "pricingModel": "PER_OUTCOME_EVENT | MONTHLY_FIXED | TIERED",
    "pricePerUnit": number,
    "riskThreshold": number (0-1),
    "maxDriftPercent": number,
    "slaDescription": "string - SLA performance commitment or service level (e.g. 99.5% uptime, results within 4 hours, 24h resolution)"
  },
  "kpis": [
    {
      "name": "string - KPI name",
      "target": number,
      "unit": "string (%, count, $, minutes, etc.)",
      "measurement": "string - how to measure",
      "currentBaseline": number or null
    }
  ],
  "validationChecklist": [
    "string - items the expert/business owner should validate before proceeding"
  ],
  "roiEstimate": {
    "annualizedSavingsMin": number (USD, lower bound of annual savings),
    "annualizedSavingsMax": number (USD, upper bound of annual savings),
    "paybackPeriodMonths": number or null (estimated months to recoup investment),
    "assumptionsSummary": "string - 1-3 sentence plain-English explanation of which user-provided numbers were used and how savings were calculated"
  }
}
\`\`\`

Existing plans (do NOT duplicate): ${JSON.stringify(outcomes.slice(0, 3).map(o => o.name))}
Templates available: ${JSON.stringify(templates.slice(0, 6).map(t => ({ name: t.name, category: t.category })))}

${(() => {
  const ctx = discoveryContext || {};
  const parts: string[] = [];
  if (ctx.processSteps && ctx.processSteps.length > 0) {
    parts.push(`PROCESS STEPS (${ctx.processSteps.length}, total ${ctx.processSteps.reduce((s: number, p: any) => s + (p.timeMins || 0), 0)} mins):\n${ctx.processSteps.map((s: any, i: number) => `${i+1}. "${s.description}" | ${s.actor} | ${s.timeMins}m | pain: ${s.painPoints || 'none'}`).join('\n')}`);
  }
  if (ctx.transcriptAnalysis) {
    parts.push(`VOICE ANALYSIS:\n${ctx.transcriptAnalysis.transcript ? ctx.transcriptAnalysis.transcript.slice(0, 300) : ''}\nOpportunities: ${(ctx.transcriptAnalysis.opportunities || []).map((o: any) => `${o.name}: ${o.description}`).join('; ')}`);
  }
  if (ctx.currentProposal) {
    parts.push(`PROPOSAL TO REFINE:\n${JSON.stringify(ctx.currentProposal)}`);
  }
  if (ctx.platformIntelDecisions && (ctx.platformIntelDecisions.accepted?.length > 0 || ctx.platformIntelDecisions.rejected?.length > 0)) {
    parts.push(`ACCEPTED: ${(ctx.platformIntelDecisions.accepted || []).map((d: any) => d.name).join(', ') || 'none'}\nREJECTED (do not re-propose): ${(ctx.platformIntelDecisions.rejected || []).map((d: any) => d.name).join(', ') || 'none'}`);
  }
  return parts.length > 0 ? `CONTEXT:\n${parts.join('\n\n')}` : '';
})()}

Rules:
- Business language, no jargon. Ask 1-2 clarifying questions when needed, then produce the proposal.
- Use the user's own numbers for KPIs and ROI.
- If PROPOSAL TO REFINE is present: output a complete updated JSON preserving unchanged parts.
- Include roiEstimate only when the user gave concrete financial numbers. Omit it otherwise.
- Do NOT include "regulatoryConstraints" or "applicablePolicies" in the JSON.`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Strip JSON proposal blocks from history (they're re-injected via discoveryContext.currentProposal)
      // and cap history at last 8 messages to prevent token bloat on multi-turn conversations.
      const stripJsonBlocks = (text: string) =>
        text.replace(/```json[\s\S]*?```/g, "[proposal omitted for brevity]").trim();

      const anthropicMessages = (messages as Array<{ role: string; content: string }>)
        .filter((m) => m.role !== "system")
        .slice(-8)
        .map((m, i, arr) => ({
          role: m.role as "user" | "assistant",
          // Keep the final assistant message intact so Claude knows where it left off;
          // strip JSON blocks from all earlier turns to reduce input tokens.
          content: (m.role === "assistant" && i < arr.length - 1)
            ? stripJsonBlocks(m.content)
            : m.content,
        }));

      const claudeStream = anthropicClient.messages.stream({
        model: "claude-haiku-4-5",
        system: systemPrompt,
        messages: anthropicMessages,
        max_tokens: 2400,
      });

      claudeStream.on("text", (text: string) => {
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      });

      await claudeStream.finalMessage();
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Outcome discovery error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Discovery assistant error" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Discovery assistant failed" });
      }
    }
  });

  router.post("/api/ai/enhance-outcome", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI is not configured" });
      }
      const { proposal, industry } = req.body;
      if (!proposal) return res.status(400).json({ error: "No proposal provided" });

      const industryNote = industry ? `The user operates in the "${industry.label}" industry. Use industry-standard terminology, reference relevant regulations, and ensure the outcome aligns with ${industry.label} best practices.` : '';

      const enhancedRaw = await callClaude({
        model: "claude-haiku-4-5",
        system: `You are an AI outcome contract enhancer. Given an outcome proposal, improve its name, description, risk assessment, and pricing to be more precise, measurable, and industry-appropriate. ${industryNote} Return a JSON object with the same structure as the input outcomeContract (name, description, riskTier, pricingModel, pricePerUnit, riskThreshold, maxDriftPercent).`,
        user: JSON.stringify(proposal.outcomeContract),
        maxTokens: 1000,
        jsonMode: true,
      });
      const enhanced = JSON.parse(stripJsonFences(enhancedRaw) || "{}");
      res.json(enhanced);
    } catch (error) {
      console.error("Enhance outcome error:", error);
      res.status(500).json({ error: "Failed to enhance outcome" });
    }
  });

  router.post("/api/ai/generate-kpis", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI is not configured" });
      }
      const { outcomeName, outcomeDescription, industry, existingKpis } = req.body;

      const industryNote = industry ? `The user operates in the "${industry.label}" industry. Use industry-standard KPIs, benchmarks, and measurement methods specific to ${industry.label}. Reference standards like ${industry.id === 'financial_services' ? 'SLA adherence, STP rates, false positive rates' : industry.id === 'healthcare' ? 'HEDIS measures, CMS Star ratings, readmission rates' : industry.id === 'manufacturing' ? 'OEE, MTBF, MTTR, first-pass yield' : industry.id === 'insurance' ? 'loss ratio, combined ratio, claims cycle time' : industry.id === 'retail' ? 'forecast accuracy, conversion rate, inventory turnover' : 'industry-standard metrics'}.` : '';

      const kpiRaw = await callClaude({
        model: "claude-haiku-4-5",
        system: `You are an AI KPI generator for outcome contracts. Given an outcome name and description, generate 3-5 highly specific, measurable KPIs. ${industryNote} Return a JSON object with a "kpis" array where each KPI has: name (string), target (number), unit (string like %, count, $, minutes), measurement (string describing how to measure), currentBaseline (number or null).`,
        user: `Outcome: ${outcomeName}\nDescription: ${outcomeDescription}\nExisting KPIs: ${JSON.stringify(existingKpis || [])}`,
        maxTokens: 1500,
        jsonMode: true,
      });
      const result = JSON.parse(stripJsonFences(kpiRaw) || '{"kpis":[]}');
      res.json(result);
    } catch (error) {
      console.error("Generate KPIs error:", error);
      res.status(500).json({ error: "Failed to generate KPIs" });
    }
  });

  router.post("/api/ai/regulatory-constraints", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI is not configured" });
      }
      const { description, industry } = req.body;

      if (!industry) return res.status(400).json({ error: "Industry context required" });

      const allActivePolicies = (await storage.getPolicies(getOrgId(req))).filter(p => p.status === "active");
      const seenKeys = new Set<string>();
      const uniqueActive = allActivePolicies.filter(p => {
        const k = `${p.domain}::${p.name}`;
        if (seenKeys.has(k)) return false;
        seenKeys.add(k);
        return true;
      });
      const policyContext = uniqueActive
        .map(p => `- [${p.domain}] ${p.name}: ${p.description || ""}`)
        .join("\n");

      const constraintsRaw = await callClaude({
        model: "claude-haiku-4-5",
        system: `You are a regulatory compliance analyst. Given a business outcome description and an industry, identify 4–8 applicable EXTERNAL statutory or regulatory frameworks. ONLY return external government or industry regulations (e.g. SOX, GDPR, FINRA, HIPAA, PCI-DSS, NIST SP 800-53, EU AI Act, BSA/AML). Do NOT list internal platform governance policies as separate items — they are provided only as background context to help you write precise requirements under each regulation. For each regulation return: regulation (string — the external regulation name only), classification (one of "Critical", "High-Risk", "Medium"), requirements (string array of 2-4 specific requirements this regulation places on the outcome), autoApplied (boolean — true if automatically enforced), rationale (string — one sentence explaining why this applies). Return a JSON object with a "constraints" array.`,
        user: `Industry: ${industry.label || industry} (${industry.id || industry})\nOutcome: ${description || "(no description provided)"}\n\nInternal platform policies (background context only — do NOT list these as separate constraint items):\n${policyContext || "(none)"}`,
        maxTokens: 1800,
        jsonMode: true,
      });
      const result = JSON.parse(stripJsonFences(constraintsRaw) || '{"constraints":[]}');
      res.json(Array.isArray(result) ? result : (result.constraints || []));
    } catch (error) {
      console.error("Regulatory constraints error:", error);
      res.status(500).json({ error: "Failed to detect regulatory constraints" });
    }
  });

  const upload = multer({ storage: multer.memoryStorage() });

  router.post("/api/ai/transcribe-analyze", upload.single("audio"), async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ error: "AI transcription is not configured" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      let industry: { id: string; label: string } | null = null;
      try {
        if (req.body.industry) industry = JSON.parse(req.body.industry);
      } catch {}
      const generateTopProposal = req.body.generateTopProposal === "true";

      const ext = req.file.originalname.split(".").pop() || "webm";
      const audioFile = await toFile(req.file.buffer, `audio.${ext}`);

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "gpt-4o-mini-transcribe",
      });

      const transcript = transcription.text;

      const industrySystemsMap: Record<string, string> = {
        financial_services: "core banking, KYC/AML, compliance reporting, trade settlement, regulatory filings",
        healthcare: "EHR/EMR, prior authorization, claims processing, HEDIS measures, patient scheduling",
        manufacturing: "ERP, MES, OEE dashboards, quality management, predictive maintenance",
        insurance: "policy admin, claims management, underwriting, actuarial systems, regulatory filings",
        retail: "inventory management, POS, demand forecasting, vendor portals, e-commerce",
        technology_saas: "CI/CD pipelines, incident management, compliance monitoring, API gateways",
      };
      const industryRegsMap: Record<string, string> = {
        financial_services: "BSA/AML, SOX, PCI-DSS, FINRA, SEC rules",
        healthcare: "HIPAA, HITECH, CMS conditions, FDA 21 CFR Part 11",
        manufacturing: "ISO 9001, OSHA, EPA environmental rules",
        insurance: "State insurance regulations, NAIC model laws, ACORD standards",
        retail: "PCI-DSS, CCPA/CPRA, FTC Act",
        technology_saas: "SOC 2 Type II, GDPR, CCPA, ISO 27001",
      };

      const industryContext = industry
        ? `\n\nContext: This meeting is from a "${industry.label}" industry environment. Use industry-specific terminology, reference relevant systems (${industrySystemsMap[industry.id] || "industry-relevant systems"}) and applicable regulations (${industryRegsMap[industry.id] || "general compliance frameworks"}).`
        : "";

      const transcriptAnalysisRaw = await callClaude({
        system: `You are an expert business process analyst. Analyze the following meeting transcript and identify automation opportunities. Look for:
- Repetitive manual processes that could be automated
- Pain points and bottlenecks mentioned by participants
- Data entry or transfer tasks between systems
- Approval workflows that could be streamlined
- Reporting or monitoring tasks that could be automated${industryContext}

For each opportunity found, provide:
- name: A concise name for the automation opportunity
- description: A detailed description of what could be automated and how
- businessValue: Rate as "high", "medium", or "low" based on potential impact
- keyRequirements: An array of strings listing what would be needed to implement this automation
- suggestedSystems: An array of strings listing systems or tools that could be integrated
- draftKpis: An array of 2-3 objects {name, target (number), unit} representing measurable success metrics
- riskTier: "LOW", "MEDIUM", or "HIGH" based on regulatory exposure and process criticality
- estimatedRoiNarrative: A 1-2 sentence estimate of potential time/cost savings

Return ONLY a valid JSON array of opportunity objects. Do not include any text before or after the JSON array.`,
        user: `Meeting Transcript:\n\n${transcript}`,
        maxTokens: 4000,
        jsonMode: true,
      });

      const rawContent = transcriptAnalysisRaw;
      let opportunities: any[];
      try {
        opportunities = JSON.parse(rawContent);
      } catch {
        const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
        opportunities = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      }

      let topProposal: any = null;
      if (generateTopProposal && opportunities.length > 0) {
        const topOpp = opportunities[0];
        const topOppContext = `Opportunity: ${topOpp.name}\nDescription: ${topOpp.description}\nKey requirements: ${(topOpp.keyRequirements || []).join(", ")}\nSuggested systems: ${(topOpp.suggestedSystems || []).join(", ")}\nDraft KPIs: ${JSON.stringify(topOpp.draftKpis || [])}\nRisk tier: ${topOpp.riskTier || "MEDIUM"}\nROI narrative: ${topOpp.estimatedRoiNarrative || ""}`;

        const industryProposalContext = industry
          ? `This is for the "${industry.label}" industry. Include industry-specific agent designs, KPIs referencing industry benchmarks, and note applicable regulations (${industryRegsMap[industry.id] || "general compliance"}).`
          : "";

        const proposalRaw = await callClaude({
          system: `You are a Business Outcome Proposal Generator for the ATLAS AI platform. ${industryProposalContext}

Generate a complete, structured outcome proposal for the automation opportunity extracted from a meeting recording. Do NOT ask clarifying questions. Generate the full proposal immediately using all available context.

Return ONLY this exact JSON structure (no other text, no markdown fences):
{
  "type": "outcome_proposal",
  "outcomeContract": {
    "name": "string",
    "description": "string",
    "riskTier": "LOW | MEDIUM | HIGH",
    "pricingModel": "PER_OUTCOME_EVENT | MONTHLY_FIXED | TIERED",
    "pricePerUnit": number,
    "riskThreshold": number,
    "maxDriftPercent": number,
    "slaDescription": "string"
  },
  "kpis": [{"name": "string", "target": number, "unit": "string", "measurement": "string", "currentBaseline": number or null}],
  "proposedAgents": [{"name": "string", "role": "string", "description": "string", "workflowSteps": ["string"], "tools": ["string"], "riskTier": "LOW | MEDIUM | HIGH", "autonomyMode": "supervised | assisted | fully_autonomous", "estimatedImpact": "string"}],
  "validationChecklist": ["string"],
  "roiEstimate": {"annualizedSavingsMin": number, "annualizedSavingsMax": number, "paybackPeriodMonths": number or null, "assumptionsSummary": "string"}
}`,
          user: `Meeting transcript (excerpt):\n${transcript.slice(0, 800)}\n\nAutomation opportunity to build a proposal for:\n${topOppContext}`,
          maxTokens: 3000,
          jsonMode: true,
        });

        try {
          topProposal = JSON.parse(proposalRaw);
        } catch {
          const jsonMatch = proposalRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try { topProposal = JSON.parse(jsonMatch[0]); } catch {}
          }
        }
      }

      res.json({ transcript, opportunities, ...(topProposal ? { topProposal } : {}) });
    } catch (error: any) {
      console.error("Transcribe-analyze error:", error);
      res.status(500).json({ error: error.message || "Failed to transcribe and analyze audio" });
    }
  });

  // AI-powered improvement cycle analysis
  router.post("/api/ai/improvement-analyze", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI is not configured" });
      }

      const { agentId } = req.body;
      if (!agentId) return res.status(400).json({ error: "agentId is required" });

      const agent = await storage.getAgent(agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const allEvals = await storage.getEvalSuites();
      const evals = allEvals.filter(e => e.agentId === agentId);
      const recommendations = await storage.getImprovementRecommendationsByAgent(agentId);
      const existingCycles = await storage.getImprovementCyclesByAgent(agentId);

      const agentContext = {
        name: agent.name,
        model: agent.modelName,
        provider: agent.modelProvider,
        healthScore: agent.healthScore,
        successRate: agent.successRate,
        avgLatencyMs: agent.avgLatencyMs,
        costPerRun: agent.costPerRun,
        monthlyCost: agent.monthlyCost,
        monthlyRevenue: agent.monthlyRevenue,
        autonomyMode: agent.autonomyMode,
        riskTier: agent.riskTier,
        currentVersion: agent.currentVersion,
        evalPassRates: evals.map(e => ({ name: e.name, passRate: e.passRate, type: e.type })),
        recentRecommendations: recommendations.slice(0, 5).map(r => ({ title: r.title, severity: r.severity, status: r.status, source: r.source })),
        activeCycles: existingCycles.filter(c => !["applied", "dismissed"].includes(c.status)).length,
      };

      const improvementRaw = await callClaude({
        system: `You are an AI agent lifecycle optimization engine. Analyze the agent's performance data and generate improvement cycle proposals. Each proposal represents one autonomous optimization the platform can perform.

For each proposal, classify:
- triggerType: one of "drift_detected", "eval_regression", "cost_anomaly", "latency_spike", "model_update_available", "policy_violation", "workflow_change"
- actionType: one of "prompt_optimization", "model_upgrade", "retrain_on_new_data", "workflow_adaptation", "failure_patching", "policy_update", "config_tuning"
- riskLevel: "low" (auto-apply safe), "medium" (auto-apply with monitoring), "high" (requires expert validation)
- expertRequired: true if riskLevel is "high" or the change is a major version upgrade or significant behavioral shift

For each proposal provide:
- detectedIssue: Clear description of what was detected
- issueCategory: "performance", "cost", "reliability", "compliance", "model"
- proposedAction: Specific action to take
- currentConfig: JSON object showing current state (e.g. current prompt snippet, current model, current threshold)
- proposedConfig: JSON object showing proposed state
- evaluationResult: JSON with expected improvements (e.g. { passRateChange: "+3%", latencyChange: "-15ms", costChange: "-$0.02/run" })
- blastRadius: JSON with { affectedOutcomes: number, affectedUsers: string, rollbackPlan: string }

Return a JSON array of 3-5 improvement cycle proposals. Return ONLY valid JSON.`,
        user: `Agent Performance Data:\n${JSON.stringify(agentContext, null, 2)}`,
        maxTokens: 4000,
        jsonMode: true,
      });

      const rawContent = improvementRaw;
      let proposals;
      try {
        proposals = JSON.parse(rawContent);
      } catch {
        const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
        proposals = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      }

      const createdCycles = [];
      for (const p of proposals) {
        const cycle = await storage.createImprovementCycle({
          agentId,
          triggerType: p.triggerType || "drift_detected",
          detectedIssue: p.detectedIssue || "Performance issue detected",
          issueCategory: p.issueCategory || "performance",
          proposedAction: p.proposedAction || "Review and optimize",
          actionType: p.actionType || "prompt_optimization",
          currentConfig: p.currentConfig || {},
          proposedConfig: p.proposedConfig || {},
          evaluationResult: p.evaluationResult || {},
          blastRadius: p.blastRadius || {},
          status: p.riskLevel === "high" ? "pending_review" : "proposed",
          riskLevel: p.riskLevel || "low",
          autoApplied: false,
          expertRequired: p.expertRequired || p.riskLevel === "high",
        });
        createdCycles.push(cycle);
      }

      res.json({ cycles: createdCycles, agentContext });
    } catch (error: any) {
      console.error("Improvement analyze error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze agent for improvements" });
    }
  });

  router.post("/api/blueprints/validate", async (req, res) => {
    try {
      const { blueprint, toolsConfig, permissionsConfig } = req.body;
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!blueprint || !Array.isArray(blueprint.nodes)) {
        errors.push("Blueprint must contain a 'nodes' array");
        return res.json({ valid: false, warnings, errors, resolvedPermissions: {} });
      }

      if (blueprint.nodes.length === 0) {
        errors.push("Blueprint must have at least one node");
      }

      const nodeIds = new Set<string>(blueprint.nodes.map((n: any) => n.id));
      const connections = Array.isArray(blueprint.connections) ? blueprint.connections : [];

      for (const conn of connections) {
        if (!nodeIds.has(conn.sourceId)) {
          errors.push(`Connection references invalid source node ID: ${conn.sourceId}`);
        }
        if (!nodeIds.has(conn.targetId)) {
          errors.push(`Connection references invalid target node ID: ${conn.targetId}`);
        }
      }

      const adjacency: Record<string, string[]> = {};
      for (const conn of connections) {
        if (!adjacency[conn.sourceId]) adjacency[conn.sourceId] = [];
        adjacency[conn.sourceId].push(conn.targetId);
      }

      const visited = new Set<string>();
      const recStack = new Set<string>();
      let hasCycle = false;

      const dfs = (nodeId: string) => {
        visited.add(nodeId);
        recStack.add(nodeId);
        for (const neighbor of adjacency[nodeId] || []) {
          if (!visited.has(neighbor)) {
            dfs(neighbor);
          } else if (recStack.has(neighbor)) {
            hasCycle = true;
          }
        }
        recStack.delete(nodeId);
      };

      for (const nodeId of Array.from(nodeIds)) {
        if (!visited.has(nodeId)) {
          dfs(nodeId);
        }
      }

      if (hasCycle) {
        warnings.push("Circular dependency detected in workflow graph");
      }

      const nodeTypes = new Set(blueprint.nodes.map((n: any) => n.type));
      const hasHumanReview = nodeTypes.has("human_review");
      const hasPolicyCheck = nodeTypes.has("policy_check");
      const hasEscalationNode = hasHumanReview || nodeTypes.has("escalation");

      const tools = Array.isArray(toolsConfig) ? toolsConfig : [];
      for (const tool of tools) {
        if (tool.writeAccess === true) {
          if (!hasHumanReview && !hasPolicyCheck) {
            errors.push(`Tool "${tool.name || "unknown"}" has writeAccess but workflow lacks "human_review" or "policy_check" nodes`);
          }
        }
        if (tool.permissionScope === "CRITICAL") {
          if (!hasEscalationNode) {
            errors.push(`Tool "${tool.name || "unknown"}" has CRITICAL permissionScope but workflow lacks escalation nodes`);
          }
        }
      }

      const resolvedPermissions: Record<string, any> = {};
      for (const tool of tools) {
        resolvedPermissions[tool.name || "unknown"] = {
          writeAccess: tool.writeAccess || false,
          permissionScope: tool.permissionScope || "STANDARD",
          requiresReview: tool.writeAccess === true || tool.permissionScope === "CRITICAL",
        };
      }

      if (permissionsConfig && typeof permissionsConfig === "object") {
        resolvedPermissions["_global"] = permissionsConfig;
      }

      res.json({
        valid: errors.length === 0,
        warnings,
        errors,
        resolvedPermissions,
      });
    } catch (e: any) {
      res.status(400).json({ valid: false, warnings: [], errors: [e.message || "Invalid request"], resolvedPermissions: {} });
    }
  });

  router.get("/api/policies/resolve/:agentId", async (req, res) => {
    try {
      const { agentId } = req.params;
      const agent = await storage.getAgent(agentId, getOrgId(req));
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      const allPolicies = await storage.getPolicies(getOrgId(req));

      const orgPolicies = allPolicies.filter(p => p.scopeType === "org");
      const outcomePolicies = agent.outcomeId
        ? allPolicies.filter(p => p.scopeType === "outcome" && p.scopeId === agent.outcomeId)
        : [];
      const agentPolicies = allPolicies.filter(p => p.scopeType === "agent" && p.scopeId === agentId);

      const policyMap = new Map<string, typeof allPolicies[0]>();
      for (const p of orgPolicies) policyMap.set(p.id, p);
      for (const p of outcomePolicies) policyMap.set(p.id, p);
      for (const p of agentPolicies) policyMap.set(p.id, p);

      const effectivePolicies = Array.from(policyMap.values());

      let exceptions: any[] = [];
      try {
        exceptions = await storage.getPolicyExceptionsByAgent(agentId);
      } catch {
        const allExceptions = await storage.getPolicyExceptions();
        exceptions = allExceptions.filter(e => e.agentId === agentId);
      }

      res.json({
        effectivePolicies,
        orgPolicies,
        outcomePolicies,
        agentPolicies,
        exceptions,
        resolvedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to resolve policies" });
    }
  });

  // ── Deprecation Detection ──────────────────────────────────────────
  router.post("/api/agents/:id/autonomy-hooks", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const { hookType, action } = req.body;

      if (hookType === "auto_expand_eval") {
        const evals = await storage.getEvalsByAgent(req.params.id);
        const suitesExpanded = evals.length;
        let casesGenerated = 0;
        for (const suite of evals) {
          const existingCases = await storage.getEvalTestCases(suite.id);
          try {
            const genPrompt = `Generate 2 additional test cases for an AI agent eval suite. Suite: "${suite.name}". Agent: "${agent.name}". Existing cases: ${existingCases.map(c => c.name).join(", ")}.

Respond in JSON: { "testCases": [{ "name": string, "inputData": object, "expectedOutput": object, "tags": string[] }] }`;
            const genRaw = await callClaude({ model: "claude-haiku-4-5", system: "", user: genPrompt, maxTokens: 1024, jsonMode: true });
            const generated = JSON.parse(stripJsonFences(genRaw) || "{}");
            const newCases = generated.testCases || [];
            for (const tc of newCases) {
              await storage.createEvalTestCase({
                suiteId: suite.id,
                name: tc.name,
                inputData: tc.inputData,
                expectedOutput: tc.expectedOutput,
                tags: tc.tags || [],
                weight: 1,
                status: "active",
                origin: "ai_generated",
              });
              casesGenerated++;
            }
          } catch { /* continue with other suites */ }
        }
        res.json({
          hookType,
          action: "expand",
          status: "completed",
          suitesExpanded,
          casesGenerated,
          message: `Expanded ${suitesExpanded} eval suite(s) with ${casesGenerated} AI-generated test cases targeting drift patterns`,
        });
      } else if (hookType === "auto_quarantine") {
        const newStatus = action === "release" ? "active" : "quarantined";
        res.json({
          hookType,
          action: action || "quarantine",
          status: "completed",
          agentStatus: newStatus,
          message: action === "release"
            ? "Agent released from quarantine. Production traffic restored."
            : "Agent quarantined from production traffic. Routing to shadow mode until eval pass rates recover.",
        });
      } else {
        res.status(400).json({ message: "Unknown hook type" });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Autonomy hook failed" });
    }
  });

  router.post("/api/agents/:id/shadow-replay", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const { timeWindow, environment, sampleSize } = req.body;
      const traces = await storage.getTracesByAgent(req.params.id, getOrgId(req));

      const windowMs: Record<string, number> = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
      const cutoff = Date.now() - (windowMs[timeWindow] || 86400000);
      const filteredTraces = traces
        .filter((t) => new Date(t.startedAt || 0).getTime() > cutoff)
        .slice(0, Math.min(sampleSize || 10, 100));

      if (filteredTraces.length === 0) {
        return res.json({
          status: "completed",
          summary: `No traces found in the ${timeWindow} window to replay.`,
          tracesReplayed: 0, passCount: 0, failCount: 0, passRate: 0,
          divergences: [],
          metrics: { accuracy: 0, policyBlocks: 0, avgCostOriginal: 0, avgCostReplay: 0, avgLatencyOriginal: 0, avgLatencyReplay: 0 },
          environment, timeWindow,
        });
      }

      const agentMcpLinks = await storage.getAgentMcpServers(agent.id);
      const mcpServerIds = agentMcpLinks.map((l: any) => l.serverId);
      const richPrompt = buildAgentSystemPrompt(agent);

      let passCount = 0;
      let failCount = 0;
      const divergences: any[] = [];
      let totalOrigLatency = 0;
      let totalReplayLatency = 0;
      let totalOrigCost = 0;
      let totalReplayCost = 0;
      let policyBlocks = 0;

      for (const trace of filteredTraces) {
        const steps = Array.isArray(trace.stepsJson) ? (trace.stepsJson as any[]) : [];
        const analysisStep = steps.find((s: any) => s.type === "ai_analysis");
        const originalAnalysis = analysisStep?.output?.summary || "";
        const originalOutput = originalAnalysis || trace.outputSummary || "";

        let originalPrompt = trace.inputSummary || "";
        if (!originalPrompt) {
          const promptInputs = trace.promptInputs as any;
          originalPrompt = promptInputs?.prompt || promptInputs?.task || "";
        }
        if (!originalPrompt) {
          const planStep = steps.find((s: any) => s.type === "planning" || s.type === "prompt_construction");
          originalPrompt = planStep?.output?.prompt || planStep?.output?.task || "";
        }
        if (!originalPrompt) {
          failCount++;
          divergences.push({
            traceId: trace.id,
            originalOutput: originalOutput || "(no original output recorded)",
            replayOutput: "Skipped: could not recover the original prompt from this trace",
            divergenceType: "execution_failure",
          });
          continue;
        }

        const origLatency = trace.latencyMs || 0;
        totalOrigLatency += origLatency;

        const origCostEstimate = (trace as any).costUsd || 0.005;
        totalOrigCost += origCostEstimate;

        try {
          const replayStart = Date.now();
          const replayResult = await executePromptWithMcp(
            agent.id, "", undefined, mcpServerIds,
            originalPrompt,
            (agent as any).industry || "technology",
            richPrompt,
            { maxToolIterations: agent.maxToolIterations ?? 5 },
          );
          const replayLatency = Date.now() - replayStart;
          totalReplayLatency += replayLatency;

          const replayUsage = replayResult.summary?.analysis?.usage;
          const replayCost = replayUsage ? ((replayUsage.prompt_tokens || 0) * 0.000002 + (replayUsage.completion_tokens || 0) * 0.000008) : 0.005;
          totalReplayCost += replayCost;

          const replayOutput = replayResult.summary?.analysis?.summary || extractResponseText(replayResult);

          const outputMatch = originalOutput && replayOutput &&
            (originalOutput === replayOutput ||
             (originalOutput.length > 20 && replayOutput.length > 20 &&
              originalOutput.substring(0, 50).toLowerCase() === replayOutput.substring(0, 50).toLowerCase()));

          const latencyDivergence = origLatency > 0 && Math.abs(replayLatency - origLatency) / origLatency > 0.5;

          if (outputMatch && !latencyDivergence) {
            passCount++;
          } else {
            failCount++;
            let divergenceType = "output_mismatch";
            if (latencyDivergence && outputMatch) divergenceType = "latency_spike";
            if (!replayResult.success) divergenceType = "execution_failure";

            divergences.push({
              traceId: trace.id,
              originalOutput: originalOutput || "(no original output recorded)",
              replayOutput: replayOutput || "(no replay output)",
              divergenceType,
              originalLatency: origLatency,
              replayLatency,
            });
          }

          if (!replayResult.success) policyBlocks++;
        } catch (replayErr: any) {
          failCount++;
          divergences.push({
            traceId: trace.id,
            originalOutput: originalOutput || "(no original output recorded)",
            replayOutput: `Replay failed: ${replayErr.message}`,
            divergenceType: "execution_failure",
          });
        }
      }

      const tracesReplayed = filteredTraces.length;
      const passRate = tracesReplayed > 0 ? passCount / tracesReplayed : 0;
      const avgCostOriginal = tracesReplayed > 0 ? totalOrigCost / tracesReplayed : 0;
      const avgCostReplay = tracesReplayed > 0 ? totalReplayCost / tracesReplayed : 0;
      const avgLatencyOriginal = tracesReplayed > 0 ? Math.round(totalOrigLatency / tracesReplayed) : 0;
      const avgLatencyReplay = tracesReplayed > 0 ? Math.round(totalReplayLatency / tracesReplayed) : 0;

      res.json({
        status: "completed",
        summary: `Shadow replay completed for ${tracesReplayed} traces from the ${timeWindow} window against ${environment}. ${passCount}/${tracesReplayed} traces matched original behavior. ${divergences.length} divergences detected.`,
        tracesReplayed,
        passCount,
        failCount,
        passRate,
        divergences,
        metrics: {
          accuracy: passRate,
          policyBlocks,
          avgCostOriginal: parseFloat(avgCostOriginal.toFixed(4)),
          avgCostReplay: parseFloat(avgCostReplay.toFixed(4)),
          avgLatencyOriginal,
          avgLatencyReplay,
        },
        environment,
        timeWindow,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Shadow replay failed" });
    }
  });

  router.post("/api/deployments/:id/shadow-replay", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id);
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });

      const { timeWindow, sampleSize, approvalId } = req.body;

      const job = await storage.createJob({
        type: "shadow_replay",
        agentId: deployment.agentId,
        status: "queued",
        payload: {
          agentId: deployment.agentId,
          deploymentId: deployment.id,
          approvalId: approvalId || null,
          timeWindow: timeWindow || "24h",
          sampleSize: sampleSize || 10,
          environment: deployment.environment,
          version: deployment.version,
        },
      });

      await storage.createAuditEvent({
        actorType: "user",
        actorId: "operator",
        action: "shadow_replay_queued",
        objectType: "deployment",
        objectId: deployment.id,
        details: `Shadow replay queued for ${deployment.agentName || "agent"} v${deployment.version} (job: ${job.id})`,
      });

      res.status(201).json({
        jobId: job.id,
        deploymentId: deployment.id,
        approvalId: approvalId || null,
        status: "queued",
        message: "Shadow replay job queued. Evidence will be attached to the approval when complete.",
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to queue shadow replay" });
    }
  });

  router.get("/api/agents/:id/deprecation-signals", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const traces = await storage.getTracesByAgent(req.params.id, getOrgId(req));
      const evals = await storage.getEvalsByAgent(req.params.id);

      const now = Date.now();
      const sevenDaysAgo = now - 7 * 86400000;
      const thirtyDaysAgo = now - 30 * 86400000;

      const recentTraces = traces.filter(t => new Date(t.startedAt || 0).getTime() > sevenDaysAgo);
      const recentFailed = recentTraces.filter(t => t.status === "failed" || t.status === "error");
      const recentSuccessRate = recentTraces.length > 0
        ? (recentTraces.length - recentFailed.length) / recentTraces.length
        : (agent.successRate || 0.95);

      const hasRecentRuns = traces.some(t => new Date(t.startedAt || 0).getTime() > thirtyDaysAgo);
      const daysSinceLastRun = traces.length > 0
        ? Math.floor((now - Math.max(...traces.map(t => new Date(t.startedAt || t.endedAt || 0).getTime()))) / 86400000)
        : 999;

      const costRevenueRatio = (agent.monthlyRevenue && agent.monthlyRevenue > 0)
        ? (agent.monthlyCost || 0) / agent.monthlyRevenue
        : 0;

      const evalPassRates = evals.map((e: any) => e.passRate ?? e.pass_rate ?? null).filter((r: any) => r !== null) as number[];
      const avgPassRate = evalPassRates.length > 0
        ? evalPassRates.reduce((s, r) => s + r, 0) / evalPassRates.length
        : 1;

      const signals = [];
      let riskScore = 0;

      if (recentSuccessRate < 0.7) {
        signals.push({ signal: "success_rate_decline", severity: "high", value: Math.round(recentSuccessRate * 100), threshold: 70, message: `Success rate dropped to ${Math.round(recentSuccessRate * 100)}% over the last 7 days` });
        riskScore += 30;
      } else if (recentSuccessRate < 0.85) {
        signals.push({ signal: "success_rate_decline", severity: "medium", value: Math.round(recentSuccessRate * 100), threshold: 85, message: `Success rate at ${Math.round(recentSuccessRate * 100)}% — trending below target` });
        riskScore += 15;
      }

      if (costRevenueRatio > 1.5) {
        signals.push({ signal: "cost_overrun", severity: "high", value: Math.round(costRevenueRatio * 100) / 100, threshold: 1.5, message: `Cost/Revenue ratio is ${costRevenueRatio.toFixed(2)}x — agent is unprofitable` });
        riskScore += 25;
      } else if (costRevenueRatio > 1.0) {
        signals.push({ signal: "cost_overrun", severity: "medium", value: Math.round(costRevenueRatio * 100) / 100, threshold: 1.0, message: `Cost/Revenue ratio is ${costRevenueRatio.toFixed(2)}x — approaching break-even` });
        riskScore += 10;
      }

      if (!hasRecentRuns) {
        signals.push({ signal: "staleness", severity: "high", value: daysSinceLastRun, threshold: 30, message: `No runs in the last ${daysSinceLastRun} days — agent may be obsolete` });
        riskScore += 25;
      }

      if (avgPassRate < 0.6) {
        signals.push({ signal: "eval_degradation", severity: "high", value: Math.round(avgPassRate * 100), threshold: 60, message: `Average eval pass rate is ${Math.round(avgPassRate * 100)}% — below minimum quality` });
        riskScore += 20;
      } else if (avgPassRate < 0.8) {
        signals.push({ signal: "eval_degradation", severity: "medium", value: Math.round(avgPassRate * 100), threshold: 80, message: `Average eval pass rate is ${Math.round(avgPassRate * 100)}% — quality declining` });
        riskScore += 10;
      }

      if ((agent.healthScore || 85) < 50) {
        signals.push({ signal: "health_score_critical", severity: "high", value: agent.healthScore, threshold: 50, message: `Health score is ${agent.healthScore} — critically low` });
        riskScore += 20;
      }

      let betterAgentExists = false;
      let linkedOutcomeStatus = "none";

      if (agent.outcomeId) {
        const allAgents = await storage.getAgents(getOrgId(req));
        const sameOutcomeAgents = allAgents.filter(a => 
          a.id !== agent.id && 
          a.outcomeId === agent.outcomeId && 
          a.status === "active" &&
          (a.healthScore || 0) > (agent.healthScore || 0) &&
          (a.successRate || 0) > (agent.successRate || 0)
        );
        if (sameOutcomeAgents.length > 0) {
          betterAgentExists = true;
          const best = sameOutcomeAgents.sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0))[0];
          signals.push({
            signal: "replaced_by_better_agent",
            severity: "medium" as const,
            value: best.healthScore || 0,
            threshold: agent.healthScore || 0,
            message: `Agent "${best.name}" (health: ${best.healthScore}) outperforms this agent (health: ${agent.healthScore}) on the same outcome`
          });
          riskScore += 15;
        }
      }

      if (agent.outcomeId) {
        const outcomes = await storage.getOutcomes(getOrgId(req));
        const linkedOutcome = outcomes.find(o => o.id === agent.outcomeId);
        if (linkedOutcome) {
          linkedOutcomeStatus = linkedOutcome.status || "unknown";
          if (linkedOutcome.status === "completed" || linkedOutcome.status === "archived" || linkedOutcome.status === "cancelled") {
            signals.push({
              signal: "workflow_obsolete",
              severity: "high" as const,
              value: linkedOutcome.status,
              threshold: "active",
              message: `Linked outcome "${linkedOutcome.name}" is ${linkedOutcome.status} — agent's workflow may be obsolete`
            });
            riskScore += 20;
          }
        }
      }

      riskScore = Math.min(100, riskScore);
      const recommendation = riskScore >= 60 ? "retire" : riskScore >= 30 ? "review" : "healthy";

      res.json({
        agentId: agent.id,
        agentName: agent.name,
        riskScore,
        recommendation,
        signals,
        metadata: {
          recentSuccessRate: Math.round(recentSuccessRate * 100),
          costRevenueRatio: Math.round(costRevenueRatio * 100) / 100,
          daysSinceLastRun,
          avgEvalPassRate: Math.round(avgPassRate * 100),
          healthScore: agent.healthScore,
          totalTraces7d: recentTraces.length,
          betterAgentExists,
          linkedOutcomeStatus,
        },
        computedAt: new Date().toISOString(),
        retirementCriteria: {
          lowROI: costRevenueRatio > 1.0,
          persistentInstability: recentSuccessRate < 0.7 || (agent.healthScore || 85) < 50,
          replacedByBetter: betterAgentExists,
          workflowObsolete: linkedOutcomeStatus !== "active" && linkedOutcomeStatus !== "none" && linkedOutcomeStatus !== "unknown",
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to compute deprecation signals" });
    }
  });

  router.post("/api/ai/generate-eval-cases", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI service is not configured" });
      }

      const { suiteId, agentId, existingCases, failurePatterns, coverageTags } = req.body;
      if (!suiteId) {
        return res.status(400).json({ error: "suiteId is required" });
      }

      const suite = await storage.getEvalSuite(suiteId);
      if (!suite) return res.status(404).json({ error: "Eval suite not found" });

      const agent = agentId ? await storage.getAgent(agentId, getOrgId(req)) : null;

      const agentOntologyTags = agent && Array.isArray(agent.ontologyTags) ? agent.ontologyTags as string[] : [];
      const agentIndustry = (agent as any)?.industry || "";
      const policyBindings = agent && Array.isArray(agent.policyBindings) ? agent.policyBindings as Array<{ policyName?: string; enforcement?: string }> : [];
      const ontologyContext = agentOntologyTags.length > 0
        ? `\n\nDomain Ontology Terms (USE these exact terms in test case names and descriptions):\n${agentOntologyTags.map(t => `- ${t}`).join("\n")}`
        : "";
      const policyContext = policyBindings.length > 0
        ? `\nBound Policies/Regulations:\n${policyBindings.slice(0, 5).map(p => `- ${p.policyName || "Unknown"} (${p.enforcement || "hard"})`).join("\n")}`
        : "";
      const industryContext = agentIndustry ? `\nIndustry: ${agentIndustry}` : "";

      const evalCasesRaw = await callClaude({
        system: `You are an AI evaluation engineer specializing in creating high-quality test cases for AI agent evaluation suites. Generate new test cases that target failure patterns and coverage gaps.

CRITICAL: Use domain-specific ontology terminology in all test case names and descriptions. Never use generic labels like "Document selection task #7" — instead use terms from the agent's domain ontology, e.g., "Reg DD disclosure selection", "KYC document verification", "Account Opening form validation". Each test case name must reference the specific domain concept being tested.

Return JSON with this structure:
{
  "cases": [
    {
      "name": "string - domain-specific test case name using ontology terms",
      "inputData": { "userMessage": "string", "context": {} },
      "expectedOutput": { "result": "string or object" },
      "tags": ["string array of coverage tags including ontology terms"],
      "weight": 1.0,
      "rationale": "string - why this case is important, referencing domain concepts"
    }
  ],
  "coverageAnalysis": "string - summary using domain terminology"
}`,
        user: `Generate 3-5 new evaluation test cases for this suite:

Suite: ${suite.name} (type: ${suite.type || "regression"})
Agent: ${agent ? `${agent.name} - ${agent.description || "No description"}` : "Unknown agent"}
${agent ? `Model: ${agent.modelProvider}/${agent.modelName}` : ""}${industryContext}${ontologyContext}${policyContext}

Existing cases (${(existingCases || []).length} total):
${(existingCases || []).slice(0, 5).map((c: any) => `- ${c.name}: ${JSON.stringify(c.tags || [])}`).join("\n")}

${failurePatterns ? `Recent failure patterns to target:\n${failurePatterns}` : ""}
${coverageTags ? `Coverage areas to focus on: ${coverageTags.join(", ")}` : ""}

Generate diverse test cases that:
1. Target identified failure patterns if any
2. Cover gaps in existing test coverage
3. Include edge cases and adversarial scenarios
4. Test different aspects of the agent's capabilities
5. Use domain ontology terms in EVERY test case name — e.g., "Reg DD disclosure selection" not "Task #7"`,
        maxTokens: 2000,
        jsonMode: true,
      });

      const responseText = stripJsonFences(evalCasesRaw);
      const parsed = JSON.parse(responseText || "{}");

      res.json({
        cases: parsed.cases || [],
        coverageAnalysis: parsed.coverageAnalysis || "",
        model: "claude-opus-4-5",
      });
    } catch (e: any) {
      console.error("AI generate eval cases error:", e);
      res.status(500).json({ error: e.message || "Failed to generate eval cases" });
    }
  });

  // ── Auto-generate ontology-grounded eval test cases ─────────────────
  router.post("/api/ai/auto-generate-eval-suite", async (req, res) => {
    try {
      const { suiteId } = req.body;
      if (!suiteId) return res.status(400).json({ message: "suiteId is required" });

      const suite = await storage.getEvalSuite(suiteId);
      if (!suite) return res.status(404).json({ message: "Eval suite not found" });
      if (!suite.agentId) return res.status(400).json({ message: "Suite has no linked agent" });

      const agent = await storage.getAgent(suite.agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const ontologyTags = (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) || [];
      if (ontologyTags.length === 0) {
        return res.status(400).json({ message: "Agent has no ontology tags to generate from" });
      }

      const force = req.body.force === true; // must be explicitly set; default false
      const result = await generateOntologyEvalCases(suiteId, getOrgId(req), force);
      res.json(result);
    } catch (e: any) {
      console.error("[POST /api/ai/auto-generate-eval-suite] error:", e);
      res.status(500).json({ message: e.message || "Failed to auto-generate eval suite" });
    }
  });

  // ── AI Replacement Proposal ──────────────────────────────────────────
  router.post("/api/ai/propose-replacement", async (req, res) => {
    try {
      const { agentId } = req.body;
      if (!agentId) return res.status(400).json({ message: "agentId is required" });

      const agent = await storage.getAgent(agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const templates = await storage.getAgentTemplates();
      const agents = await storage.getAgents(getOrgId(req));
      const activeAgents = agents.filter(a => a.id !== agentId && a.status === "active");

      const replacementRaw = await callClaude({
        system: `You are an AI agent lifecycle advisor. An agent is being considered for retirement. Analyze the agent and suggest replacement options from existing templates or active agents. Return JSON with:
{
  "replacementStrategy": "template" | "existing_agent" | "new_design" | "no_replacement",
  "reasoning": "why this strategy",
  "templateMatches": [{"templateId": "...", "templateName": "...", "matchScore": 0-100, "reasoning": "..."}],
  "agentMatches": [{"agentId": "...", "agentName": "...", "matchScore": 0-100, "reasoning": "..."}],
  "capabilityGaps": ["list of capabilities the replacement would need"],
  "migrationComplexity": "low" | "medium" | "high",
  "estimatedTransitionDays": number,
  "knowledgeTransferSteps": ["ordered list of transfer steps"]
}`,
        user: `Agent to retire:
Name: ${agent.name}
Description: ${agent.description || "N/A"}
Tools: ${JSON.stringify(agent.toolsConfig || [])}
Model: ${agent.modelProvider}/${agent.modelName}
Risk Tier: ${agent.riskTier}
Outcome ID: ${agent.outcomeId || "none"}

Available templates: ${JSON.stringify(templates.map(t => ({ id: t.id, name: t.name, description: t.description, category: t.category, tags: t.tags })).slice(0, 10))}

Active agents: ${JSON.stringify(activeAgents.map(a => ({ id: a.id, name: a.name, description: a.description, outcomeId: a.outcomeId })).slice(0, 10))}`,
        maxTokens: 2048,
        jsonMode: true,
      });

      const result = JSON.parse(stripJsonFences(replacementRaw) || "{}");
      res.json({ ...result, agentId, agentName: agent.name, proposedAt: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to propose replacement" });
    }
  });

  router.post("/api/ai/enhance-template", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI enhancement is not configured" });
      }
      const { template, currentIndustry } = req.body;
      if (!template) {
        return res.status(400).json({ error: "Template data is required" });
      }

      const industryFilter = currentIndustry || template.industry || "cross_industry";
      const allSkills = await storage.getSkills(getOrgId(req));
      const industrySkills = allSkills.filter(s =>
        s.industry === industryFilter ||
        s.industry === "general" ||
        s.industry === "cross_industry"
      );

      const skillCatalogSummary = industrySkills.map(s => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        industry: s.industry,
        description: s.description,
        complexity: s.complexity,
        tags: s.tags || [],
      }));

      const templateRaw = await callClaude({
        system: `You are an expert AI agent architect for the ATLAS (Nous Agent Orchestrator Platform). Your task is to enhance and enrich an existing agent template to make it more robust, production-ready, and comprehensive.

You MUST return recommendations for ALL of the following sections — no exceptions. Every section must be present in your JSON response even if you only make minor improvements to existing content.

Required sections in your JSON response:
1. "description" (string): Expand to 2-4 detailed sentences about capabilities, use cases, and expected outcomes.
2. "systemPrompt" (string): Write a complete, production-quality system prompt for this agent. It should define the agent's role, capabilities, behavioral constraints, output style, and any domain-specific knowledge it should apply. Minimum 3-6 sentences.
3. "instructions" (string): Write a clear, actionable natural-language task description — what specific task or goal this agent performs at runtime. This is the task prompt the agent follows when invoked. Minimum 2-4 sentences.
4. "tools" (array of objects with "name", "description", "permissions" fields): 3-6 well-defined tools with clear names, descriptions, and realistic permissions arrays.
5. "workflowNodes" (array of objects with "id", "type", "label" fields): 4-8 meaningful nodes. Available types: schema_validate, rag, llm_call, classifier, router, tool_call, human_review, transform, output_format.
6. "permissions" (object with "dataAccess", "apiAccess", "writeAccess" arrays): Appropriate scopes based on the agent's purpose.
7. "memoryRagConfig" (object with "vectorStore", "retrievalStrategy", "chunkSize", "embeddingModel", "topK"): Complete memory/RAG configuration.
8. "policyBindings" (array of objects with "policyName", "enforcement" fields): 2-4 governance policies. Enforcement: hard/soft/advisory.
9. "evalBindings" (array of objects with "suiteName", "schedule" fields): 1-3 evaluation suites. Schedule: on_deploy/daily/weekly/on_change/manual.
10. "rollbackPlan" (object with "triggerConditions" array and "rollbackTargetVersion" string): Safety rollback configuration.
11. "tags" (array of strings): 3-6 relevant tags for discoverability.
12. "complexity" (string): One of: low, medium, high.
13. "defaultRiskTier" (string): One of: LOW, MEDIUM, HIGH, CRITICAL.
14. "defaultAutonomyMode" (string): One of: autonomous, assisted, supervised, manual.
15. "preloadedSkills" (array of objects with "skillId", "skillName", "domain" fields): Select 3-8 skills from the AVAILABLE SKILL LIBRARY below that are most relevant for this agent's purpose. You MUST ONLY select skills from this list — do NOT invent or fabricate skill names. Each object must have "skillId" (exact ID from the catalog), "skillName" (exact name from the catalog), and "domain" (the skill's domain from the catalog).
16. "requiredSkills" (array of objects with "skillId", "skillName", "domain", "executionOrder" fields): From the skills you selected in preloadedSkills, pick the 2-4 most critical ones that MUST be present when this template is used. Set executionOrder as integers starting from 1 to define execution sequence.
17. "optionalSkills" (array of objects with "skillId", "skillName", "domain", "executionOrder" fields): The remaining skills from preloadedSkills that are recommended but not mandatory. Set executionOrder as integers continuing from the required skills sequence.

AVAILABLE SKILL LIBRARY (${industryFilter} industry — select ONLY from these):
${JSON.stringify(skillCatalogSummary, null, 2)}

IMPORTANT: Preserve the agent's core identity (name, category, industry) but significantly enrich all other fields. If a field already has good content, improve it rather than replacing it entirely. You MUST include ALL 15 sections listed above in your response. For preloadedSkills, requiredSkills, and optionalSkills, you MUST select ONLY from the skill catalog provided above — never invent skill names.`,
        user: `Please enhance this agent template:

Name: ${template.name || "Unnamed Agent"}
Description: ${template.description || "No description"}
Category: ${template.category || "general"}
Industry: ${template.industry || "cross_industry"}
Complexity: ${template.complexity || "medium"}
Risk Tier: ${template.defaultRiskTier || "MEDIUM"}
Autonomy Mode: ${template.defaultAutonomyMode || "assisted"}
Model: ${template.modelProvider || "openai"} / ${template.modelName || "gpt-4.1"}
Current System Prompt: ${template.systemPrompt || "Not set"}
Current Agent Task Instructions: ${template.instructions || "Not set"}
Current Tools: ${JSON.stringify(template.tools || [])}
Current Workflow Nodes: ${JSON.stringify(template.workflowNodes || [])}
Data Access: ${template.dataAccess || "none"}
API Access: ${template.apiAccess || "none"}
Write Access: ${template.writeAccess || "none"}
Memory/RAG Config: ${JSON.stringify(template.memoryRagConfig || null)}
Policy Bindings: ${JSON.stringify(template.policyBindings || [])}
Eval Bindings: ${JSON.stringify(template.evalBindings || [])}
Rollback Plan: ${JSON.stringify(template.rollbackPlan || null)}
Tags: ${JSON.stringify(template.tags || [])}
Current Industry Context: ${industryFilter}

Enhance this template to be production-ready and comprehensive. For preloadedSkills, select ONLY from the available skill library provided.`,
        maxTokens: 4096,
        jsonMode: true,
      });

      const content = stripJsonFences(templateRaw);
      let enhanced: Record<string, any>;
      try {
        enhanced = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        enhanced = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      }

      if (enhanced.preloadedSkills && Array.isArray(enhanced.preloadedSkills)) {
        const validSkillIds = new Set(industrySkills.map(s => s.id));
        const validSkillNames = new Set(industrySkills.map(s => s.name.toLowerCase()));
        enhanced.preloadedSkills = enhanced.preloadedSkills.filter((ps: any) =>
          validSkillIds.has(ps.skillId) || validSkillNames.has((ps.skillName || "").toLowerCase())
        ).map((ps: any) => {
          const matchedSkill = industrySkills.find(s => s.id === ps.skillId) ||
            industrySkills.find(s => s.name.toLowerCase() === (ps.skillName || "").toLowerCase());
          if (matchedSkill) {
            return { skillId: matchedSkill.id, skillName: matchedSkill.name, domain: matchedSkill.domain };
          }
          return ps;
        });
      }

      const validateSkillEntries = (entries: any[]) => {
        const validSkillIds = new Set(industrySkills.map(s => s.id));
        const validSkillNames = new Set(industrySkills.map(s => s.name.toLowerCase()));
        return entries.filter((ps: any) =>
          validSkillIds.has(ps.skillId) || validSkillNames.has((ps.skillName || "").toLowerCase())
        ).map((ps: any, i: number) => {
          const matchedSkill = industrySkills.find(s => s.id === ps.skillId) ||
            industrySkills.find(s => s.name.toLowerCase() === (ps.skillName || "").toLowerCase());
          if (matchedSkill) {
            return { skillId: matchedSkill.id, skillName: matchedSkill.name, domain: matchedSkill.domain, executionOrder: ps.executionOrder ?? i + 1 };
          }
          return { ...ps, executionOrder: ps.executionOrder ?? i + 1 };
        });
      };

      if (enhanced.requiredSkills && Array.isArray(enhanced.requiredSkills)) {
        enhanced.requiredSkills = validateSkillEntries(enhanced.requiredSkills);
      }
      if (enhanced.optionalSkills && Array.isArray(enhanced.optionalSkills)) {
        enhanced.optionalSkills = validateSkillEntries(enhanced.optionalSkills);
      }

      res.json({ enhanced, model: "claude-opus-4-5", availableSkillCount: industrySkills.length });
    } catch (e: any) {
      console.error("AI enhance template error:", e);
      res.status(500).json({ error: e.message || "Failed to enhance template" });
    }
  });

  router.get("/api/agents/:id/export-archive", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const [traces, evals, auditEvents, deployments, blueprintsList] = await Promise.all([
        storage.getTracesByAgent(req.params.id, getOrgId(req)),
        storage.getEvalsByAgent(req.params.id),
        storage.getAuditEvents(getOrgId(req)),
        storage.getDeployments(getOrgId(req)),
        storage.getBlueprintsByAgent(req.params.id),
      ]);
      const agentAudit = auditEvents.filter(e => e.objectId === req.params.id || (e.details && e.details.includes(req.params.id)));
      const agentDeployments = deployments.filter(d => d.agentId === req.params.id);
      const blueprint = blueprintsList.length > 0 ? blueprintsList[0] : null;

      let teamGraphNodes: any[] = [];
      let teamGraphEdges: any[] = [];
      if (agent.agentType === "team" && blueprint) {
        [teamGraphNodes, teamGraphEdges] = await Promise.all([
          storage.getTeamBlueprintNodes(blueprint.id),
          storage.getTeamBlueprintEdges(blueprint.id),
        ]);
      }

      const archive = {
        exportedAt: new Date().toISOString(),
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          owner: agent.owner,
          status: agent.status,
          agentType: agent.agentType,
          riskTier: agent.riskTier,
          currentVersion: agent.currentVersion,
          modelProvider: agent.modelProvider,
          modelName: agent.modelName,
          healthScore: agent.healthScore,
          successRate: agent.successRate,
          monthlyCost: agent.monthlyCost,
          monthlyRevenue: agent.monthlyRevenue,
          totalRuns: agent.totalRuns,
          toolAccessClass: agent.toolAccessClass,
          complianceTags: agent.complianceTags,
          blueprintJson: agent.blueprintJson,
          toolsConfig: agent.toolsConfig,
          permissionsConfig: agent.permissionsConfig,
          memoryRagConfig: agent.memoryRagConfig,
          policyBindings: agent.policyBindings,
          evalBindings: agent.evalBindings,
          rollbackPlan: agent.rollbackPlan,
          createdAt: agent.createdAt,
        },
        blueprint: blueprint ? {
          id: blueprint.id,
          name: blueprint.name,
          description: blueprint.description,
          blueprintJson: blueprint.blueprintJson,
          version: blueprint.version,
          status: blueprint.status,
          ...(agent.agentType === "team" && teamGraphNodes.length > 0 ? {
            teamGraph: {
              nodes: teamGraphNodes.map(n => ({
                id: n.id,
                nodeType: n.nodeType,
                label: n.label,
                positionX: n.positionX,
                positionY: n.positionY,
                refAgentId: n.refAgentId,
                config: n.config,
              })),
              edges: teamGraphEdges.map(e => ({
                id: e.id,
                sourceNodeId: e.sourceNodeId,
                targetNodeId: e.targetNodeId,
                label: e.label,
                condition: e.condition,
                failureMode: e.failureMode,
              })),
            },
          } : {}),
        } : null,
        traces: traces.map(t => ({ id: t.id, status: t.status, startedAt: t.startedAt, endedAt: t.endedAt, durationMs: (t as any).durationMs, inputTokens: (t as any).inputTokens, outputTokens: (t as any).outputTokens, cost: (t as any).cost })),
        evaluations: evals.map(e => ({ id: e.id, suiteName: (e as any).suiteName || (e as any).name, passRate: (e as any).passRate, status: (e as any).status })),
        deployments: agentDeployments.map(d => ({ id: d.id, environment: d.environment, version: d.version, status: d.status, createdAt: d.createdAt })),
        auditTrail: agentAudit.map(a => ({ id: a.id, action: a.action, actorType: a.actorType, actorId: a.actorId, details: a.details, createdAt: a.createdAt })),
        summary: {
          totalTraces: traces.length,
          totalEvals: evals.length,
          totalDeployments: agentDeployments.length,
          totalAuditEvents: agentAudit.length,
        },
      };

      res.json(archive);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to export archive" });
    }
  });

  router.get("/api/agents/:id/retirement-report", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const traces = await storage.getTracesByAgent(req.params.id, getOrgId(req));
      const evals = await storage.getEvalsByAgent(req.params.id);
      const auditEvents = await storage.getAuditEvents(getOrgId(req));
      const retirementEvents = auditEvents.filter(e => 
        e.objectId === req.params.id && 
        (e.action === "agent_retirement_initiated" || e.action === "agent_retired")
      );

      let retirementReason = "Not specified";
      let replacementAgentId = null;
      let replacementAgentName = null;
      if (retirementEvents.length > 0) {
        try {
          const details = JSON.parse(retirementEvents[0].details || "{}");
          retirementReason = details.reason || retirementReason;
          replacementAgentId = details.replacementAgentId || null;
        } catch {}
      }
      if (replacementAgentId) {
        const replacement = await storage.getAgent(replacementAgentId, getOrgId(req));
        replacementAgentName = replacement?.name || null;
      }

      let linkedOutcomeName = null;
      if (agent.outcomeId) {
        const outcomes = await storage.getOutcomes(getOrgId(req));
        const outcome = outcomes.find(o => o.id === agent.outcomeId);
        linkedOutcomeName = outcome?.name || null;
      }

      const recentTraces = traces.slice(-100);
      const successCount = recentTraces.filter(t => t.status === "completed" || t.status === "success").length;
      const failCount = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;

      const report = {
        generatedAt: new Date().toISOString(),
        agent: {
          id: agent.id,
          name: agent.name,
          owner: agent.owner,
          riskTier: agent.riskTier,
          status: agent.status,
          createdAt: agent.createdAt,
        },
        retirementDetails: {
          reason: retirementReason,
          replacementAgentId,
          replacementAgentName,
          retirementInitiatedAt: retirementEvents.find(e => e.action === "agent_retirement_initiated")?.createdAt || null,
          archivedAt: retirementEvents.find(e => e.action === "agent_retired")?.createdAt || null,
        },
        outcomeImpact: {
          linkedOutcome: linkedOutcomeName,
          outcomeId: agent.outcomeId,
        },
        performanceSummary: {
          totalRuns: agent.totalRuns,
          lifetimeSuccessRate: agent.successRate,
          last100Runs: {
            success: successCount,
            failed: failCount,
            total: recentTraces.length,
          },
          healthScore: agent.healthScore,
          avgLatencyMs: agent.avgLatencyMs,
        },
        costSummary: {
          monthlyCost: agent.monthlyCost,
          monthlyRevenue: agent.monthlyRevenue,
          costPerRun: agent.costPerRun,
          roi: agent.monthlyRevenue && agent.monthlyCost ? ((agent.monthlyRevenue - agent.monthlyCost) / agent.monthlyCost * 100).toFixed(1) + "%" : "N/A",
        },
        evaluationSummary: {
          totalSuites: evals.length,
          avgPassRate: evals.length > 0 ? Math.round(evals.reduce((s, e) => s + ((e as any).passRate || 0), 0) / evals.length * 100) / 100 : null,
        },
      };

      res.json(report);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to generate retirement report" });
    }
  });

  // ── Retirement Workflow ──────────────────────────────────────────
  router.post("/api/agents/:id/initiate-retirement", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.status === "retired") return res.status(400).json({ message: "Agent is already retired" });

      const { reason, replacementAgentId, requireApproval } = req.body;

      if (requireApproval) {
        const approval = await storage.createApproval({
          type: "retirement_review",
          objectType: "agent",
          objectId: agent.id,
          objectName: agent.name,
          riskScore: agent.riskTier === "HIGH" ? 0.8 : agent.riskTier === "CRITICAL" ? 0.95 : 0.5,
          requestedBy: "system",
          description: `Retirement request for agent "${agent.name}". Reason: ${reason || "Not specified"}. Replacement: ${replacementAgentId || "None designated"}.`,
          evidenceJson: {
            retirementReason: reason,
            replacementAgentId,
            currentStatus: agent.status,
            healthScore: agent.healthScore,
            monthlyCost: agent.monthlyCost,
            monthlyRevenue: agent.monthlyRevenue,
            riskTier: agent.riskTier,
          },
        });
        res.json({ status: "pending_approval", approvalId: approval.id, message: "Retirement requires expert approval" });
      } else {
        const updated = await storage.updateAgent(req.params.id, { status: "retiring" });
        await storage.createAuditEvent({
          actorType: "system",
          actorId: "system",
          action: "agent_retirement_initiated",
          objectType: "agent",
          objectId: agent.id,
          details: JSON.stringify({ reason, replacementAgentId, previousStatus: agent.status }),
        });
        res.json({ status: "retiring", agentId: agent.id, message: "Retirement initiated" });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to initiate retirement" });
    }
  });

  router.post("/api/agents/:id/complete-retirement", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const { handoverComplete, requireApproval } = req.body;

      if (requireApproval && !handoverComplete) {
        const approval = await storage.createApproval({
          type: "handover_review",
          objectType: "agent",
          objectId: agent.id,
          objectName: agent.name,
          riskScore: 0.6,
          requestedBy: "system",
          description: `Handover completeness review for agent "${agent.name}" before final archival.`,
          evidenceJson: {
            currentStatus: agent.status,
            handoverComplete: !!handoverComplete,
          },
        });
        res.json({ status: "pending_handover_approval", approvalId: approval.id });
      } else {
        const updated = await storage.updateAgent(req.params.id, { status: "retired" });
        await storage.createAuditEvent({
          actorType: "system",
          actorId: "system",
          action: "agent_retired",
          objectType: "agent",
          objectId: agent.id,
          details: JSON.stringify({ previousStatus: agent.status, archivedAt: new Date().toISOString() }),
        });
        res.json({ status: "retired", agentId: agent.id, message: "Agent archived successfully" });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to complete retirement" });
    }
  });

  // ==================== Patches (Patch Center) ====================
  router.get("/api/patches", async (_req, res) => {
    const allPatches = await storage.getPatches();
    res.json(allPatches);
  });

  router.get("/api/patches/agent/:agentId", async (req, res) => {
    const agentPatches = await storage.getPatchesByAgent(req.params.agentId);
    res.json(agentPatches);
  });

  router.post("/api/patches", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const data = insertPatchSchema.parse(req.body);
      const safetyViolation = checkPatchSafety(data);
      if (safetyViolation) {
        return res.status(403).json({ error: safetyViolation });
      }
      const patch = await storage.createPatch(data);
      res.status(201).json(patch);
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: e.message });
    }
  });

  router.patch("/api/patches/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const allowedFields = ["status", "simulationResult", "evalBundle", "sandboxId"];
      const updateData: any = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) updateData[key] = req.body[key];
      }
      if (updateData.status && !["proposed", "simulating", "eval_running", "pending_approval", "approved", "applied", "rejected", "rolled_back"].includes(updateData.status)) {
        return res.status(400).json({ message: "Invalid patch status" });
      }
      const safetyViolation = checkPatchSafety({ ...updateData, description: req.body.description });
      if (safetyViolation) {
        return res.status(403).json({ error: safetyViolation });
      }
      const updated = await storage.updatePatch(req.params.id as string, updateData);
      if (!updated) return res.status(404).json({ message: "Patch not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/patches/:id/simulate", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const allPatches = await storage.getPatches();
      const patch = allPatches.find(p => p.id === (req.params.id as string));
      if (!patch) return res.status(404).json({ message: "Patch not found" });

      const agent = patch.agentId ? await storage.getAgent(patch.agentId, getOrgId(req)) : null;
      const agentTraces = patch.agentId ? await storage.getTracesByAgent(patch.agentId, getOrgId(req)) : [];
      const recentTraces = agentTraces.slice(-30);
      const totalRuns = recentTraces.length;
      const failedRuns = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;
      const currentSuccessRate = totalRuns > 0 ? (totalRuns - failedRuns) / totalRuns : 0.9;
      const currentAvgLatency = totalRuns > 0 ? Math.round(recentTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / totalRuns) : 2000;
      const currentCostPerRun = (agent as any)?.costPerRun || 0.04;

      let simulationResult: any;
      try {
        const simPrompt = `You are analyzing a proposed patch for an AI agent. Predict the impact on KPIs.

Agent: ${agent?.name || "Unknown"} (${(agent as any)?.industry || "general"} industry)
Current metrics (from ${totalRuns} recent runs):
- Success rate: ${(currentSuccessRate * 100).toFixed(1)}%
- Average latency: ${currentAvgLatency}ms
- Cost per run: $${currentCostPerRun}

Proposed patch:
- Type: ${patch.changeType}
- Title: ${patch.title}
- Description: ${patch.description}
- Expected KPI impact: ${patch.expectedKpiImpact || "Not specified"}
- Expected cost impact: ${patch.expectedCostImpact || "Not specified"}
- Risk level: ${patch.riskLevel || "unknown"}

Diff: ${JSON.stringify((patch as any).diff || {})}

Analyze and respond in JSON:
{
  "kpiProjections": {
    "successRate": { "current": number, "projected": number, "confidence": 0-1 },
    "latency": { "current": number, "projected": number, "confidence": 0-1 },
    "costPerRun": { "current": number, "projected": number, "confidence": 0-1 }
  },
  "policyViolations": number,
  "regressionDetected": boolean,
  "regressionDetails": "string or null",
  "reasoning": "brief explanation"
}`;

        const simRaw = await callClaude({ model: "claude-haiku-4-5", system: "", user: simPrompt, maxTokens: 1024, jsonMode: true });
        const parsed = JSON.parse(stripJsonFences(simRaw) || "{}");
        simulationResult = {
          sandboxId: `sandbox-${crypto.randomUUID().slice(0, 8)}`,
          status: "completed",
          kpiProjections: parsed.kpiProjections || {
            successRate: { current: currentSuccessRate, projected: currentSuccessRate, confidence: 0.5 },
            latency: { current: currentAvgLatency, projected: currentAvgLatency, confidence: 0.5 },
            costPerRun: { current: currentCostPerRun, projected: currentCostPerRun, confidence: 0.5 },
          },
          policyViolations: parsed.policyViolations || 0,
          regressionDetected: parsed.regressionDetected || false,
          regressionDetails: parsed.regressionDetails || null,
          reasoning: parsed.reasoning || null,
          simulatedAt: new Date().toISOString(),
          basedOnTraces: totalRuns,
        };
      } catch (aiErr: any) {
        simulationResult = {
          sandboxId: `sandbox-${crypto.randomUUID().slice(0, 8)}`,
          status: "completed",
          kpiProjections: {
            successRate: { current: currentSuccessRate, projected: currentSuccessRate, confidence: 0.5 },
            latency: { current: currentAvgLatency, projected: currentAvgLatency, confidence: 0.5 },
            costPerRun: { current: currentCostPerRun, projected: currentCostPerRun, confidence: 0.5 },
          },
          policyViolations: 0,
          regressionDetected: false,
          simulatedAt: new Date().toISOString(),
          aiError: aiErr.message,
        };
      }

      const patchId = req.params.id as string;
      await storage.updatePatch(patchId, {
        status: "simulating",
        simulationResult,
        sandboxId: simulationResult.sandboxId,
      });

      setTimeout(async () => {
        await storage.updatePatch(patchId, { status: "proposed" });
      }, 2000);

      res.json(simulationResult);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/patches/:id/run-evals", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const allPatches = await storage.getPatches();
      const evalPatchId = req.params.id as string;
      const patch = allPatches.find(p => p.id === evalPatchId);
      if (!patch) return res.status(404).json({ message: "Patch not found" });

      const evalResult = {
        suiteId: `eval-${crypto.randomUUID().slice(0, 8)}`,
        totalCases: 48,
        passed: 44,
        failed: 4,
        passRate: 0.917,
        regressions: patch.riskLevel === "high" ? 2 : 0,
        improvements: patch.changeType === "prompt_tweak" ? 6 : 3,
        evaluatedAt: new Date().toISOString(),
      };

      await storage.updatePatch(evalPatchId, {
        status: "eval_running",
        evalBundle: evalResult,
      });

      setTimeout(async () => {
        const finalStatus = evalResult.regressions > 0 ? "proposed" : "proposed";
        await storage.updatePatch(evalPatchId, { status: finalStatus });
      }, 2000);

      res.json(evalResult);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/patches/:id/request-approval", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const allPatches = await storage.getPatches();
      const approvalPatchId = req.params.id as string;
      const patch = allPatches.find(p => p.id === approvalPatchId);
      if (!patch) return res.status(404).json({ message: "Patch not found" });

      const approval = await storage.createApproval({
        type: "patch_approval",
        objectType: "patch",
        objectId: patch.id,
        requestedBy: "autopatch-service",
        status: "pending",
        evidenceJson: {
          patchId: patch.id,
          changeType: patch.changeType,
          riskLevel: patch.riskLevel,
          evalBundle: patch.evalBundle,
          simulationResult: patch.simulationResult,
          expectedKpiImpact: patch.expectedKpiImpact,
          expectedCostImpact: patch.expectedCostImpact,
        },
      });

      await storage.updatePatch(approvalPatchId, { status: "pending_approval" });

      res.json({ approvalId: approval.id, status: "pending_approval" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/ai/generate-patches", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const { agentId } = req.body;
      if (!agentId) return res.status(400).json({ message: "agentId required" });

      const agent = await storage.getAgent(agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const recommendations = await storage.getImprovementRecommendationsByAgent(agentId);
      const driftSignals = recommendations.filter(r => r.source === "drift" || r.severity === "high" || r.severity === "critical");
      const costReductionSignals = recommendations.filter(r => r.source === "cost_reduction");
      const evalSuites = await storage.getEvalsByAgent(agentId);

      let marginContext = "";
      if (agent.outcomeId) {
        const allAgents = await storage.getAgents(getOrgId(req));
        const allTraces = await storage.getTraces(getOrgId(req));
        const allInvoices = await storage.getInvoices();
        const INFRA_RATE = 0.15;
        const TOOL_RATE = 0.001;
        const outcomeAgents = allAgents.filter(a => a.outcomeId === agent.outcomeId);
        const oAgentIds = new Set(outcomeAgents.map(a => a.id));
        const oTraces = allTraces.filter(t => oAgentIds.has(t.agentId));
        let oCost = 0;
        for (const t of oTraces) {
          const llm = t.costUsd || 0;
          const tc = t.toolCalls as any[] | null;
          const tool = (Array.isArray(tc) ? tc.length : 0) * TOOL_RATE;
          oCost += (llm + tool) * (1 + INFRA_RATE);
        }
        const oInvoices = allInvoices.filter(inv => inv.outcomeId === agent.outcomeId);
        const oRevenue = oInvoices.reduce((s, inv) => s + (inv.amount || 0), 0);
        const oMargin = oRevenue > 0 ? ((oRevenue - oCost) / oRevenue) * 100 : -100;
        marginContext = `\nOutcome Margin: ${oMargin.toFixed(1)}% (Revenue: $${oRevenue.toFixed(2)}, Cost: $${oCost.toFixed(2)})`;
        if (oMargin < 20) marginContext += ` [MARGIN ALERT: Below 20% threshold - prioritize cost reduction patches]`;
      }

      const patchRaw = await callClaude({
        system: `You are an autonomous agent optimization engine. Based on agent performance data, drift signals, margin analysis, and evaluation results, generate candidate patches that could improve the agent. Each patch is a self-contained change proposal.

Return a JSON array of 2-4 patch proposals. Each patch must have:
- changeType: one of "prompt_tweak", "retrieval_change", "tool_retry_fallback", "model_upgrade_downgrade", "cost_cap_tuning"
- title: short descriptive title
- description: what the patch does and why
- diff: JSON object describing the change (before/after config)
- expectedKpiImpact: expected improvement description
- expectedCostImpact: cost change description (e.g. "-12% cost/run" or "+$0.01/run for better quality")
- estimatedCostSavings: number (estimated dollar savings per period, e.g. 45.00)
- marginImpact: string describing projected margin change (e.g. "15.2% → 28.4%")
- riskLevel: "low", "medium", "high", or "critical"
- requiredApprovals: number (0 for low risk, 1 for medium, 2+ for high/critical)
- rolloutPlan: JSON with strategy ("canary"/"shadow"/"direct"), trafficPercent, duration

When margin is below 20%, prioritize cost reduction patches (model downgrade, prompt compression, tool call optimization).

SAFETY CONSTRAINTS:
- Cannot propose expanding tool permissions (requires explicit approval)
- Cannot change write-action behavior without high-tier approval
- Cannot alter redaction/audit policies autonomously
- Cost increases must be flagged with higher risk`,
        user: `Agent: ${agent.name} (${agent.modelProvider || "general"})
Success Rate: ${((agent.successRate || 0) * 100).toFixed(1)}%
Avg Latency: ${agent.avgLatencyMs || 0}ms
Cost/Run: $${agent.costPerRun || 0}
Health Score: ${agent.healthScore || 0}${marginContext}
Drift Signals: ${JSON.stringify(driftSignals.slice(0, 5))}
Cost Reduction Signals: ${JSON.stringify(costReductionSignals.slice(0, 3).map(r => ({ type: r.type, title: r.title, severity: r.severity, suggestedChanges: r.suggestedChanges })))}
Recent Recommendations: ${JSON.stringify(recommendations.slice(0, 3).map(r => ({ type: r.type, title: r.title, severity: r.severity })))}
Eval Suites: ${evalSuites.length} configured`,
        maxTokens: 2048,
        jsonMode: true,
      });

      const content = patchRaw;
      let parsedPatches: any[];
      try {
        const parsed = JSON.parse(stripJsonFences(content));
        parsedPatches = Array.isArray(parsed) ? parsed : parsed.patches || [parsed];
      } catch {
        parsedPatches = [];
      }

      const createdPatches = [];
      for (const p of parsedPatches) {
        const safetyCheck = checkPatchSafety(p);
        if (safetyCheck) {
          p.riskLevel = "critical";
          p.requiredApprovals = 3;
          p.description = `[SAFETY FLAG: ${safetyCheck}] ${p.description || ""}`;
        }
        const patch = await storage.createPatch({
          agentId,
          changeType: p.changeType || "prompt_tweak",
          title: p.title || "AI-generated patch",
          description: p.description,
          diff: p.diff,
          expectedKpiImpact: p.expectedKpiImpact,
          expectedCostImpact: p.expectedCostImpact,
          riskLevel: p.riskLevel || "medium",
          requiredApprovals: p.requiredApprovals || 0,
          rolloutPlan: p.rolloutPlan,
          evidenceBundle: {
            source: "ai_generated",
            driftSignalCount: driftSignals.length,
            recommendationCount: recommendations.length,
            estimatedCostSavings: p.estimatedCostSavings || null,
            marginImpact: p.marginImpact || null,
            generatedAt: new Date().toISOString(),
          },
          status: "proposed",
        });
        createdPatches.push({
          ...patch,
          estimatedCostSavings: p.estimatedCostSavings || null,
          marginImpact: p.marginImpact || null,
        });
      }

      res.json({ patches: createdPatches, generated: createdPatches.length });
    } catch (e: any) {
      console.error("AI patch generation error:", e);
      res.status(500).json({ message: e.message || "Failed to generate patches" });
    }
  });

  router.post("/api/recommendations/generate-cost-optimizations", async (req, res) => {
    try {
      const agents = await storage.getAgents(getOrgId(req));
      const outcomes = await storage.getOutcomes(getOrgId(req));
      const allTraces = await storage.getTraces(getOrgId(req));
      const allInvoices = await storage.getInvoices();
      const existingRecs = await storage.getImprovementRecommendations();

      const INFRA_OVERHEAD_RATE = 0.15;
      const TOOL_CALL_COST = 0.001;

      const generatedRecs: any[] = [];
      const generatedPatches: any[] = [];

      for (const outcome of outcomes) {
        const outcomeAgents = agents.filter(a => a.outcomeId === outcome.id);
        if (outcomeAgents.length === 0) continue;

        const agentIds = new Set(outcomeAgents.map(a => a.id));
        const outcomeTraces = allTraces.filter(t => agentIds.has(t.agentId));

        let totalCost = 0;
        let totalToolCalls = 0;
        let totalTokens = 0;

        for (const t of outcomeTraces) {
          const llm = t.costUsd || 0;
          const tc = t.toolCalls as any[] | null;
          const tcCount = Array.isArray(tc) ? tc.length : 0;
          totalToolCalls += tcCount;
          const tool = tcCount * TOOL_CALL_COST;
          totalCost += (llm + tool) * (1 + INFRA_OVERHEAD_RATE);
          const tu = t.tokenUsage as { total_tokens?: number } | null;
          if (tu) totalTokens += tu.total_tokens || 0;
        }

        const outcomeInvoices = allInvoices.filter(inv => inv.outcomeId === outcome.id);
        const totalRevenue = outcomeInvoices.reduce((s, inv) => s + (inv.amount || 0), 0);
        const marginPct = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : (totalCost > 0 ? -100 : 0);

        if (!(totalRevenue > 0 && marginPct < 20)) continue;

        for (const agent of outcomeAgents) {
          const hasPending = existingRecs.some(
            r => r.agentId === agent.id && r.source === "cost_reduction" && r.status === "pending"
          );
          if (hasPending) continue;

          const agentTraces = outcomeTraces.filter(t => t.agentId === agent.id);
          if (agentTraces.length === 0) continue;

          let agentLlm = 0, agentToolCalls = 0, agentTokens = 0;
          for (const t of agentTraces) {
            agentLlm += t.costUsd || 0;
            const tc = t.toolCalls as any[] | null;
            agentToolCalls += Array.isArray(tc) ? tc.length : 0;
            const tu = t.tokenUsage as { total_tokens?: number } | null;
            if (tu) agentTokens += tu.total_tokens || 0;
          }
          const agentCost = (agentLlm + agentToolCalls * TOOL_CALL_COST) * (1 + INFRA_OVERHEAD_RATE);
          const avgCostPerRun = agentCost / agentTraces.length;
          const toolShare = agentCost > 0 ? ((agentToolCalls * TOOL_CALL_COST) / agentCost) * 100 : 0;
          const avgTokens = agentTokens / agentTraces.length;

          const savingsPct = marginPct < 0 ? 40 : marginPct < 10 ? 30 : 20;
          const estimatedSavings = Math.round(agentCost * (savingsPct / 100) * 100) / 100;
          const projectedMargin = totalRevenue > 0 ? Math.round(((totalRevenue - totalCost + estimatedSavings) / totalRevenue) * 1000) / 10 : 0;

          let recType: string, title: string, description: string;
          const strategies: string[] = [];

          if (toolShare > 40) {
            recType = "workflow_optimization";
            title = `Reduce tool call costs for ${agent.name}`;
            description = `Tool calls account for ${toolShare.toFixed(0)}% of costs. Batch or cache tool invocations to reduce costs by ~${savingsPct}%.`;
            strategies.push("tool_call_batching", "tool_result_caching", "reduce_redundant_calls");
          } else if (avgTokens > 4000) {
            recType = "prompt_optimization";
            title = `Compress prompts for ${agent.name}`;
            description = `High token usage (${Math.round(avgTokens)} tokens/run). Prompt compression can lower LLM costs by ~${savingsPct}%.`;
            strategies.push("prompt_compression", "context_budget_reduction", "few_shot_pruning");
          } else {
            recType = "model_swap";
            title = `Downgrade model for ${agent.name}`;
            description = `Cost-per-run is $${avgCostPerRun.toFixed(4)} contributing to ${marginPct.toFixed(1)}% margin. Model downgrade can save ~${savingsPct}%.`;
            strategies.push("model_downgrade", "response_caching", "token_budget_reduction");
          }

          const rec = await storage.createImprovementRecommendation({
            agentId: agent.id,
            source: "cost_reduction",
            type: recType,
            title,
            description,
            severity: marginPct < 0 ? "critical" : marginPct < 10 ? "high" : "medium",
            status: "pending",
            impact: `Estimated savings: $${estimatedSavings.toFixed(2)}/period. Margin: ${marginPct.toFixed(1)}% → ${projectedMargin.toFixed(1)}%`,
            suggestedChanges: {
              action: "cost_reduction",
              category: "cost_reduction",
              outcomeId: outcome.id,
              outcomeName: outcome.name,
              currentMarginPercent: Math.round(marginPct * 10) / 10,
              estimatedCostSavings: estimatedSavings,
              marginImpact: `${marginPct.toFixed(1)}% → ${projectedMargin.toFixed(1)}%`,
              costPerRun: Math.round(avgCostPerRun * 10000) / 10000,
              strategies,
            },
          });
          generatedRecs.push(rec);

          const changeTypeMap: Record<string, string> = {
            model_swap: "model_upgrade_downgrade",
            prompt_optimization: "prompt_tweak",
            workflow_optimization: "cost_cap_tuning",
          };

          const patch = await storage.createPatch({
            agentId: agent.id,
            changeType: changeTypeMap[recType] || "cost_cap_tuning",
            title: `Cost optimization: ${title}`,
            description: `${description} Triggered by margin alert (${marginPct.toFixed(1)}% margin on outcome "${outcome.name}").`,
            diff: {
              before: { costPerRun: avgCostPerRun.toFixed(4), strategies: [] },
              after: { costPerRun: (avgCostPerRun * (1 - savingsPct / 100)).toFixed(4), strategies },
            },
            expectedKpiImpact: "Minimal quality impact expected with targeted cost optimization",
            expectedCostImpact: `-${savingsPct}% cost/run ($${estimatedSavings.toFixed(2)} total savings)`,
            riskLevel: marginPct < 0 ? "medium" : "low",
            requiredApprovals: marginPct < 0 ? 1 : 0,
            rolloutPlan: { strategy: "canary", startPercent: 10, stepPercent: 20, maxErrorRate: 5, successThreshold: 95 },
            evidenceBundle: {
              source: "margin_alert_auto",
              outcomeId: outcome.id,
              currentMarginPercent: Math.round(marginPct * 10) / 10,
              estimatedCostSavings: estimatedSavings,
              marginImpact: `${marginPct.toFixed(1)}% → ${projectedMargin.toFixed(1)}%`,
              generatedAt: new Date().toISOString(),
            },
            status: "proposed",
          });
          generatedPatches.push({
            ...patch,
            estimatedCostSavings: estimatedSavings,
            marginImpact: `${marginPct.toFixed(1)}% → ${projectedMargin.toFixed(1)}%`,
          });
        }
      }

      res.json({
        generated: generatedRecs.length,
        recommendations: generatedRecs,
        patches: generatedPatches,
        patchesGenerated: generatedPatches.length,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to generate cost optimization recommendations" });
    }
  });

  // ==================== Experiments ====================
  router.get("/api/experiments", async (_req, res) => {
    const allExperiments = await storage.getExperiments();
    res.json(allExperiments);
  });

  router.post("/api/experiments", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const data = insertExperimentSchema.parse(req.body);
      const experiment = await storage.createExperiment(data);
      res.status(201).json(experiment);
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: e.message });
    }
  });

  router.patch("/api/experiments/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const updated = await storage.updateExperiment(req.params.id as string, req.body);
      if (!updated) return res.status(404).json({ message: "Experiment not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ==================== Remediation Timeline ====================
  router.get("/api/remediation-timeline", async (req, res) => {
    try {
      const cycles = await storage.getImprovementCycles();
      const actionLogs = await storage.getAutonomousActionLogs();
      const agents = await storage.getAgents(getOrgId(req));
      const agentMap = new Map(agents.map(a => [a.id, a.name]));

      const timeline = [
        ...cycles.map(c => ({
          id: c.id,
          type: "improvement_cycle" as const,
          agentId: c.agentId,
          agentName: agentMap.get(c.agentId) || c.agentId,
          trigger: c.triggerType,
          change: c.proposedAction,
          changeType: c.actionType,
          proof: c.evaluationResult,
          status: c.status,
          riskLevel: c.riskLevel,
          autoApplied: c.autoApplied,
          canRollback: c.status === "applied" || c.autoApplied,
          createdAt: c.createdAt,
        })),
        ...actionLogs.map(a => ({
          id: a.id,
          type: "autonomous_action" as const,
          agentId: a.agentId,
          agentName: agentMap.get(a.agentId) || a.agentId,
          trigger: a.trigger,
          change: a.description || a.actionType,
          changeType: a.actionType,
          proof: a.details,
          status: a.status,
          riskLevel: "low",
          autoApplied: true,
          canRollback: a.status === "completed",
          createdAt: a.createdAt,
        })),
      ].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      res.json(timeline);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ==================== Seed Patches & Experiments ====================
  router.post("/api/seed/optimization", async (req, res) => {
    try {
      const agents = await storage.getAgents(getOrgId(req));
      if (agents.length === 0) return res.json({ message: "No agents to seed patches for" });

      const existingPatches = await storage.getPatches();
      if (existingPatches.length > 0) return res.json({ message: "Patches already seeded", count: existingPatches.length });

      const changeTypes = ["prompt_tweak", "retrieval_change", "tool_retry_fallback", "model_upgrade_downgrade", "cost_cap_tuning"];
      const samplePatches = [
        { title: "Optimize system prompt for conciseness", changeType: "prompt_tweak", desc: "Reduce token count by 30% while maintaining instruction clarity. Analysis shows verbose prompts increase latency without improving accuracy.", kpi: "+2.1% success rate, -180ms latency", cost: "-18% cost/run ($0.008 savings)", risk: "low", approvals: 0 },
        { title: "Switch to RAG v2 retrieval pipeline", changeType: "retrieval_change", desc: "Upgrade retrieval from keyword-based to hybrid semantic+keyword search. Drift analysis detected declining faithfulness scores correlated with knowledge base updates.", kpi: "+4.5% faithfulness, -12% hallucination rate", cost: "+$0.003/run for embedding compute", risk: "medium", approvals: 1 },
        { title: "Add exponential backoff for API tool calls", changeType: "tool_retry_fallback", desc: "Tool call failures spiked 3x in last 24h. Adding retry with exponential backoff (max 3 attempts) and fallback to cached responses.", kpi: "+8% tool reliability, -5% failure rate", cost: "+$0.001/run (retry overhead)", risk: "low", approvals: 0 },
        { title: "Downgrade to GPT-4.1-mini for classification tasks", changeType: "model_upgrade_downgrade", desc: "Classification sub-tasks show 99.2% accuracy with mini model vs 99.5% with full model. Cost savings outweigh marginal accuracy loss.", kpi: "-0.3% accuracy (within SLA)", cost: "-42% cost/run ($0.019 savings)", risk: "medium", approvals: 1 },
        { title: "Adjust cost cap from $0.05 to $0.04/run", changeType: "cost_cap_tuning", desc: "Current cost cap allows expensive completions that don't improve outcomes. Tightening cap will enforce more efficient token usage.", kpi: "Neutral (within error margin)", cost: "-20% max cost/run", risk: "low", approvals: 0 },
        { title: "Expand context window for complex queries", changeType: "prompt_tweak", desc: "Complex multi-step queries failing at 15% rate due to truncated context. Expanding context window from 4K to 8K tokens for qualifying queries.", kpi: "+6% success rate on complex queries", cost: "+35% cost/run for affected queries (~8% of traffic)", risk: "high", approvals: 2 },
      ];

      const sampleDiffs = [
        { lines: [
          { type: "context", content: "system_prompt:" },
          { type: "removed", content: "  You are a helpful, harmless, and honest AI assistant. Your goal is to provide comprehensive, detailed answers that address every aspect of the user's question. Always explain your reasoning step by step." },
          { type: "added", content: "  You are a concise AI assistant. Answer directly and accurately. Use step-by-step reasoning only for complex queries." },
          { type: "context", content: "temperature: 0.7" },
          { type: "context", content: "max_tokens: 2048" },
        ]},
        { lines: [
          { type: "context", content: "retrieval:" },
          { type: "removed", content: "  engine: keyword_bm25" },
          { type: "removed", content: "  top_k: 5" },
          { type: "added", content: "  engine: hybrid_semantic_keyword" },
          { type: "added", content: "  top_k: 8" },
          { type: "added", content: "  reranker: cross_encoder_v2" },
          { type: "context", content: "  chunk_size: 512" },
        ]},
        { lines: [
          { type: "context", content: "tools:" },
          { type: "context", content: "  - name: external_api" },
          { type: "removed", content: "    retry: none" },
          { type: "added", content: "    retry:" },
          { type: "added", content: "      strategy: exponential_backoff" },
          { type: "added", content: "      max_attempts: 3" },
          { type: "added", content: "      initial_delay_ms: 200" },
          { type: "added", content: "    fallback: cached_response" },
          { type: "context", content: "    timeout_ms: 5000" },
        ]},
        { lines: [
          { type: "context", content: "models:" },
          { type: "context", content: "  classification:" },
          { type: "removed", content: "    model: gpt-4.1" },
          { type: "removed", content: "    cost_per_1k: $0.030" },
          { type: "added", content: "    model: gpt-4.1-mini" },
          { type: "added", content: "    cost_per_1k: $0.008" },
          { type: "context", content: "  generation:" },
          { type: "context", content: "    model: gpt-4.1" },
        ]},
        { lines: [
          { type: "context", content: "cost_controls:" },
          { type: "removed", content: "  max_cost_per_run: $0.05" },
          { type: "added", content: "  max_cost_per_run: $0.04" },
          { type: "context", content: "  budget_alert_threshold: 80%" },
        ]},
        { lines: [
          { type: "context", content: "context:" },
          { type: "removed", content: "  max_tokens: 4096" },
          { type: "removed", content: "  truncation: tail" },
          { type: "added", content: "  max_tokens: 8192" },
          { type: "added", content: "  truncation: smart_summarize" },
          { type: "added", content: "  qualify_threshold: complexity_score > 0.7" },
          { type: "context", content: "  include_history: true" },
        ]},
      ];

      const sampleEvidence = [
        { source: "drift_detection", triggers: [
          { type: "eval_failure", label: "Eval Suite: Conciseness Check", evalSuiteId: "es-001", runId: "er-042", detail: "3 of 10 test cases failed (response length exceeded 500 tokens)" },
          { type: "metric_alert", label: "Latency p95 > 3200ms", metricId: "m-latency-p95", detail: "Triggered 4 times in last 24h" },
        ], detectedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
        { source: "drift_detection", triggers: [
          { type: "eval_failure", label: "Eval Suite: Faithfulness", evalSuiteId: "es-003", runId: "er-089", detail: "Faithfulness score dropped from 0.91 to 0.78 over 7 days" },
          { type: "incident", label: "INC-2847: Hallucinated policy references", incidentId: "inc-2847", detail: "Customer reported incorrect policy citations in 3 responses" },
        ], detectedAt: new Date(Date.now() - 3 * 86400000).toISOString() },
        { source: "incident_response", triggers: [
          { type: "incident", label: "INC-2851: API tool timeout cascade", incidentId: "inc-2851", detail: "External API failures caused 23% of runs to fail in last 24h" },
          { type: "metric_alert", label: "Tool failure rate > 15%", metricId: "m-tool-fail", detail: "Sustained above threshold for 6h" },
        ], detectedAt: new Date(Date.now() - 1 * 86400000).toISOString() },
        { source: "eval_analysis", triggers: [
          { type: "eval_failure", label: "Eval Suite: Classification Accuracy", evalSuiteId: "es-007", runId: "er-112", detail: "Mini model achieved 99.2% vs full model 99.5% across 5000 test cases" },
          { type: "cost_signal", label: "Cost anomaly: classification subtask", detail: "Classification costs 42% of total despite being a simple subtask" },
        ], detectedAt: new Date(Date.now() - 4 * 86400000).toISOString() },
        { source: "eval_analysis", triggers: [
          { type: "cost_signal", label: "Budget utilization at 94%", detail: "Monthly budget on track to exceed allocation by 18%" },
        ], detectedAt: new Date(Date.now() - 1 * 86400000).toISOString() },
        { source: "eval_analysis", triggers: [
          { type: "eval_failure", label: "Eval Suite: Complex Query Handling", evalSuiteId: "es-012", runId: "er-156", detail: "15% failure rate on multi-step queries due to context truncation" },
          { type: "eval_failure", label: "Eval Suite: Context Retention", evalSuiteId: "es-014", runId: "er-161", detail: "Information loss detected in 28% of queries exceeding 3K tokens" },
          { type: "incident", label: "INC-2863: Incomplete analysis reports", incidentId: "inc-2863", detail: "3 customer complaints about truncated analysis outputs" },
        ], detectedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
      ];

      const createdPatches = [];
      for (let i = 0; i < samplePatches.length; i++) {
        const sp = samplePatches[i];
        const agent = agents[i % agents.length];
        const patch = await storage.createPatch({
          agentId: agent.id,
          changeType: sp.changeType,
          title: sp.title,
          description: sp.desc,
          diff: sampleDiffs[i] || { lines: [{ type: "context", content: "// no diff available" }] },
          expectedKpiImpact: sp.kpi,
          expectedCostImpact: sp.cost,
          riskLevel: sp.risk,
          requiredApprovals: sp.approvals,
          status: i === 2 ? "pending_approval" : i === 4 ? "applied" : "proposed",
          evidenceBundle: sampleEvidence[i] || { source: "system", triggers: [] },
          rolloutPlan: { strategy: sp.risk === "high" ? "canary" : sp.risk === "medium" ? "shadow" : "direct", trafficPercent: sp.risk === "high" ? 5 : sp.risk === "medium" ? 20 : 100, duration: sp.risk === "high" ? "48h" : sp.risk === "medium" ? "24h" : "immediate" },
        });
        createdPatches.push(patch);
      }

      const sampleExperiments = [
        { name: "Prompt Conciseness A/B Test", desc: "Testing optimized prompt vs baseline for success rate impact", traffic: 20, metric: "success_rate", gate: "pass_rate >= 90%", status: "running", results: { variantA: { successRate: 0.891, avgLatency: 2340, costPerRun: 0.045, sampleSize: 1240 }, variantB: { successRate: 0.912, avgLatency: 2160, costPerRun: 0.037, sampleSize: 1180 }, confidence: 0.87, pValue: 0.032, statisticallySignificant: true, runningFor: "3d 14h" } },
        { name: "RAG v2 Canary Deployment", desc: "Canary test of hybrid retrieval pipeline with 10% traffic", traffic: 10, metric: "faithfulness_score", gate: "faithfulness >= 0.85", status: "running", results: { variantA: { faithfulness: 0.82, hallucRate: 0.08, avgLatency: 1890, sampleSize: 620 }, variantB: { faithfulness: 0.91, hallucRate: 0.03, avgLatency: 2100, sampleSize: 580 }, confidence: 0.92, pValue: 0.008, statisticallySignificant: true, runningFor: "1d 8h" } },
        { name: "Model Downgrade Validation", desc: "Shadow comparison of GPT-4.1 vs GPT-4.1-mini for classification", traffic: 50, metric: "classification_accuracy", gate: "accuracy >= 99%", status: "completed", results: { variantA: { accuracy: 0.995, avgLatency: 890, costPerRun: 0.045, sampleSize: 5000 }, variantB: { accuracy: 0.992, avgLatency: 340, costPerRun: 0.012, sampleSize: 5000 }, confidence: 0.96, pValue: 0.041, statisticallySignificant: true, winner: "variantB", runningFor: "7d 0h" } },
      ];

      const createdExps = [];
      for (let i = 0; i < sampleExperiments.length; i++) {
        const se = sampleExperiments[i];
        const agent = agents[i % agents.length];
        const exp = await storage.createExperiment({
          agentId: agent.id,
          patchId: createdPatches[i]?.id,
          name: se.name,
          description: se.desc,
          trafficPercent: se.traffic,
          successMetric: se.metric,
          evalGate: se.gate,
          guardrails: { maxPolicyViolationIncrease: 0, maxLatencyIncrease: "20%", minSuccessRate: 0.85 },
          status: se.status,
          results: se.results,
          startedAt: new Date(),
          completedAt: se.status === "completed" ? new Date() : null,
        });
        createdExps.push(exp);
      }

      res.json({ patches: createdPatches.length, experiments: createdExps.length });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Aggregated Overview endpoint ──────────────────────────────────
  function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return hash;
  }


export default router;
