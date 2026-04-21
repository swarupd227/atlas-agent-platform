import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { checkPermission, getRequestRole } from "../permissions";
import { resolveOntologyTags, generateKpiAlignedEvalSuite, handleZodError } from "./helpers";
import {
  insertAgentTemplateSchema,
  insertEvalSuiteSchema,
  insertEvalTestCaseSchema,
  insertEvalRunSchema,
  insertEvalCaseResultSchema,
  insertBlueprintSchema,
} from "@shared/schema";
import { callClaude, stripJsonFences, anthropicClient } from "../claude";

export default function createEvaluationsRouter(industryEvalFrameworks: Record<string, any>) {
  const router = Router();

  router.get("/api/agent-templates", async (_req, res) => {
    const templates = await storage.getAgentTemplates();
    res.json(templates);
  });

  router.get("/api/agent-templates/:id", async (req, res) => {
    const template = await storage.getAgentTemplate(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  });

  router.post("/api/agent-templates", async (req, res) => {
    try {
      const parsed = insertAgentTemplateSchema.parse(req.body);
      const template = await storage.createAgentTemplate(parsed);
      res.status(201).json(template);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid template data" });
    }
  });

  router.put("/api/agent-templates/:id", async (req, res) => {
    try {
      const existing = await storage.getAgentTemplate(req.params.id);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      const updated = await storage.updateAgentTemplate(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid template data" });
    }
  });

  router.post("/api/agents/:id/save-as-template", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const { name, description, category, industry, tags, complexity, icon } = req.body;

      const rtConfig = (agent.runtimeConfig as Record<string, any>) || {};
      const compTags = Array.isArray(agent.complianceTags) ? agent.complianceTags as string[] : [];
      const ontTags = (agent.ontologyTags as any)?.concepts || [];
      const toolsCfg = Array.isArray(agent.toolsConfig) ? agent.toolsConfig : [];

      const allTags: string[] = [...(tags || [])];
      if (compTags.length > 0) allTags.push(...compTags);
      if (Array.isArray(ontTags)) allTags.push(...ontTags.map((t: any) => typeof t === "string" ? t : t.conceptLabel || t));
      const uniqueTags = Array.from(new Set(allTags.filter(Boolean)));

      let mcpServerNames: string[] = [];
      try {
        const mcpLinks = await storage.getAgentMcpServers(req.params.id);
        for (const link of mcpLinks) {
          const server = await storage.getMcpServer(link.serverId);
          if (server) mcpServerNames.push(server.name);
        }
      } catch {}

      let kbNames: string[] = [];
      try {
        const kbLinks = await storage.getAgentKnowledgeBases(req.params.id);
        for (const link of kbLinks) {
          const kb = await storage.getKnowledgeBase(link.knowledgeBaseId);
          if (kb) kbNames.push(kb.name);
        }
      } catch {}

      const agentBp = (agent.blueprintJson as Record<string, any>) || {};
      const blueprintNodes = Array.isArray(agentBp.nodes) ? agentBp.nodes : [];
      const blueprintEdges = Array.isArray(agentBp.edges) ? agentBp.edges : [];

      const blueprintJson: any = {
        systemPrompt: agent.systemPrompt || "",
        instructions: rtConfig.prompt || "",
        runtimeConfig: {
          prompt: rtConfig.prompt || "",
          outputSchema: rtConfig.outputSchema || null,
          kpiBindings: rtConfig.kpiBindings || [],
          workflowSteps: rtConfig.workflowSteps || [],
          matchedSkills: rtConfig.matchedSkills || [],
          mcpToolBindings: rtConfig.mcpToolBindings || [],
        },
        blueprintNodes,
        blueprintEdges,
        mcpDependencies: Array.isArray(agentBp.mcpDependencies) ? agentBp.mcpDependencies : [],
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
        linkedMcpServers: mcpServerNames,
        linkedKnowledgeBases: kbNames,
        complianceTags: compTags,
        ontologyConcepts: Array.isArray(ontTags) ? ontTags.map((t: any) => typeof t === "string" ? t : t.conceptLabel || t) : [],
        maxToolIterations: agent.maxToolIterations || 5,
        department: agent.department || "",
      };

      const preloadedSkills: any[] = [];
      const requiredSkills: any[] = [];
      if (Array.isArray(rtConfig.matchedSkills)) {
        for (let i = 0; i < rtConfig.matchedSkills.length; i++) {
          const skill = rtConfig.matchedSkills[i];
          const skillName = typeof skill === "string" ? skill : (skill.name || skill.skillName || "");
          const skillId = typeof skill === "string" ? "" : (skill.skillId || skill.id || "");
          const domain = typeof skill === "string" ? "" : (skill.domain || "");
          preloadedSkills.push({ name: skillName, source: "agent_config" });
          requiredSkills.push({ skillId, skillName, domain, executionOrder: i + 1 });
        }
      }

      const template = await storage.createAgentTemplate({
        name: name || `${agent.name} Template`,
        description: description || agent.description || "",
        category: category || "general",
        industry: industry || "cross_industry",
        tags: uniqueTags,
        icon: icon || "bot",
        complexity: complexity || "medium",
        modelProvider: agent.modelProvider || "openai",
        modelName: agent.modelName || "gpt-4.1",
        toolsConfig: toolsCfg,
        permissionsConfig: (agent.permissionsConfig as Record<string, any>) || {},
        memoryRagConfig: (agent.memoryRagConfig as Record<string, any>) || {},
        blueprintJson,
        policyBindings: agent.policyBindings || {},
        evalBindings: (agent.evalBindings as Record<string, any>) || {},
        rollbackPlan: (agent.rollbackPlan as Record<string, any>) || {},
        defaultRiskTier: agent.riskTier || "MEDIUM",
        defaultAutonomyMode: agent.autonomyMode || "assisted",
        preloadedSkills,
        requiredSkills,
        optionalSkills: [],
        estimatedTimeToProd: "1-2 weeks",
        costProfile: {},
      });

      res.status(201).json(template);
    } catch (err: any) {
      console.error("Save as template error:", err);
      res.status(500).json({ message: err.message || "Failed to save agent as template" });
    }
  });

  router.delete("/api/agent-templates/:id", async (req, res) => {
    const existing = await storage.getAgentTemplate(req.params.id);
    if (!existing) return res.status(404).json({ message: "Template not found" });
    await storage.deleteAgentTemplate(req.params.id);
    res.json({ message: "Template deleted" });
  });

  // Eval Suite Detail
  router.get("/api/evals/:id", async (req, res) => {
    const suite = await storage.getEvalSuite(req.params.id);
    if (!suite) return res.status(404).json({ message: "Eval suite not found" });
    res.json(suite);
  });

  router.get("/api/evals/:id/test-cases", async (req, res) => {
    const cases = await storage.getEvalTestCases(req.params.id);
    res.json(cases);
  });

  router.post("/api/evals/:id/test-cases", async (req, res) => {
    try {
      const data = insertEvalTestCaseSchema.parse({ ...req.body, suiteId: req.params.id });
      const testCase = await storage.createEvalTestCase(data);
      res.status(201).json(testCase);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.put("/api/eval-test-cases/:id", async (req, res) => {
    try {
      const updated = await storage.updateEvalTestCase(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Test case not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.delete("/api/eval-test-cases/:id", async (req, res) => {
    const tc = await storage.getEvalTestCase(req.params.id);
    if (tc?.locked || tc?.origin === "regulatory") {
      return res.status(403).json({ error: "Cannot delete mandatory regulatory test case" });
    }
    await storage.deleteEvalTestCase(req.params.id);
    res.status(204).send();
  });

  router.get("/api/industry-eval-frameworks", async (_req, res) => {
    res.json(industryEvalFrameworks);
  });

  router.get("/api/industry-eval-frameworks/:industryId", async (req, res) => {
    const framework = industryEvalFrameworks[req.params.industryId];
    if (!framework) return res.status(404).json({ error: "Industry framework not found" });
    res.json(framework);
  });

  router.post("/api/evals/:id/seed-regulatory", async (req, res) => {
    const { templates } = req.body;
    if (!Array.isArray(templates) || templates.length === 0) {
      return res.status(400).json({ error: "templates array is required" });
    }
    const suite = await storage.getEvalSuite(req.params.id);
    if (!suite) return res.status(404).json({ error: "Suite not found" });

    const created = [];
    for (const tmpl of templates) {
      const tc = await storage.createEvalTestCase({
        suiteId: suite.id,
        name: `[${tmpl.regulation} ${tmpl.section}] ${tmpl.name}`,
        inputData: { scenario: tmpl.inputScenario },
        expectedOutput: { behavior: tmpl.expectedBehavior },
        tags: tmpl.tags || ["regulatory"],
        weight: 2,
        status: "active",
        origin: "regulatory",
        regulationRef: `${tmpl.regulation} ${tmpl.section}`,
        industryCategory: tmpl.industry,
        severity: "critical",
        locked: true,
      });
      created.push(tc);
    }
    res.json(created);
  });

  router.put("/api/evals/:id", async (req, res) => {
    try {
      const updated = await storage.updateEvalSuite(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Eval suite not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/evals/:id/runs", async (req, res) => {
    const runs = await storage.getEvalRuns(req.params.id);
    res.json(runs);
  });

  router.post("/api/evals/:id/runs", async (req, res) => {
    try {
      const data = insertEvalRunSchema.parse({ ...req.body, suiteId: req.params.id });
      const run = await storage.createEvalRun(data);
      res.status(201).json(run);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/eval-runs/:runId/case-results", async (req, res) => {
    const results = await storage.getEvalCaseResults(req.params.runId);
    res.json(results);
  });

  router.post("/api/eval-runs/:runId/case-results", async (req, res) => {
    try {
      const data = insertEvalCaseResultSchema.parse({ ...req.body, runId: req.params.runId });
      const result = await storage.createEvalCaseResult(data);
      res.status(201).json(result);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/evals/:id/validate-ontology-schema", async (req, res) => {
    try {
      const suite = await storage.getEvalSuite(req.params.id);
      if (!suite) return res.status(404).json({ message: "Eval suite not found" });

      const testCases = await storage.getEvalTestCases(suite.id);
      if (testCases.length === 0) {
        return res.json({ totalCases: 0, validCases: 0, invalidCases: 0, warnings: [] });
      }

      const ontologyTags = suite.ontologyTags as any;
      let conceptIds: string[] = [];
      if (Array.isArray(ontologyTags)) {
        conceptIds = ontologyTags
          .map((t: any) => typeof t === "string" ? t : t?.conceptId)
          .filter(Boolean);
      } else if (ontologyTags && typeof ontologyTags === "object") {
        if (ontologyTags.concepts) {
          conceptIds = (ontologyTags.concepts as any[])
            .map((c: any) => typeof c === "string" ? c : c?.conceptId)
            .filter(Boolean);
        }
        if (ontologyTags.conceptIds) {
          conceptIds = [...conceptIds, ...(ontologyTags.conceptIds as string[])];
        }
      }

      const concepts: Array<{ id: string; label: string; category: string; properties: any }> = [];
      for (const cid of Array.from(conceptIds)) {
        const concept = await storage.getOntologyConcept(cid);
        if (concept) {
          concepts.push({
            id: concept.id,
            label: concept.label,
            category: concept.category,
            properties: concept.properties,
          });
        }
      }

      if (concepts.length === 0) {
        const agent = suite.agentId ? await storage.getAgent(suite.agentId, getOrgId(req)) : null;
        if (agent?.ontologyTags && Array.isArray(agent.ontologyTags)) {
          for (const tag of agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) {
            if (tag.conceptId) {
              const concept = await storage.getOntologyConcept(tag.conceptId);
              if (concept) {
                concepts.push({
                  id: concept.id,
                  label: concept.label,
                  category: concept.category,
                  properties: concept.properties,
                });
              }
            }
          }
        }
      }

      if (concepts.length === 0) {
        return res.json({
          totalCases: testCases.length,
          validCases: testCases.length,
          invalidCases: 0,
          warnings: [],
          message: "No ontology concepts linked to this eval suite or its agent. Link ontology concepts to enable schema validation.",
        });
      }

      const conceptPropertyNames = new Map<string, Set<string>>();
      const allPropertyNames = new Set<string>();
      for (const concept of concepts) {
        const props = concept.properties;
        const propNames = new Set<string>();
        if (Array.isArray(props)) {
          for (const p of props) {
            const name = typeof p === "string" ? p : (p?.name || p?.key || p?.label);
            if (name) {
              propNames.add(name.toLowerCase());
              allPropertyNames.add(name.toLowerCase());
            }
          }
        } else if (props && typeof props === "object") {
          for (const key of Object.keys(props)) {
            propNames.add(key.toLowerCase());
            allPropertyNames.add(key.toLowerCase());
          }
        }
        conceptPropertyNames.set(concept.id, propNames);
      }

      const warnings: Array<{
        caseId: string;
        caseName: string;
        issues: Array<{ field: string; issue: string; conceptProperty?: string }>;
      }> = [];

      const extractKeys = function(data: unknown): string[] {
        if (!data || typeof data !== "object") return [];
        if (Array.isArray(data)) {
          const keys: string[] = [];
          for (const item of data) {
            keys.push(...extractKeys(item));
          }
          return keys;
        }
        return Object.keys(data as Record<string, unknown>);
      }

      const genericFieldNames = new Set(["scenario", "context", "query", "prompt", "message", "behavior", "response", "result", "expected", "input", "output", "description", "name", "id", "type", "status", "text", "value", "data", "action"]);

      for (const tc of testCases) {
        const issues: Array<{ field: string; issue: string; conceptProperty?: string }> = [];

        const inputKeys = extractKeys(tc.inputData).map(k => k.toLowerCase());
        const outputKeys = extractKeys(tc.expectedOutput).map(k => k.toLowerCase());
        const allCaseKeys = new Set([...inputKeys, ...outputKeys]);

        for (const concept of concepts) {
          const conceptProps = conceptPropertyNames.get(concept.id);
          if (!conceptProps || conceptProps.size === 0) continue;

          const overlappingKeys = Array.from(conceptProps).filter(p => allCaseKeys.has(p));
          if (overlappingKeys.length === 0 && allCaseKeys.size > 0) continue;

          for (const propName of Array.from(conceptProps)) {
            if (inputKeys.length > 0 && overlappingKeys.length > 0 && !inputKeys.includes(propName)) {
              issues.push({
                field: "inputData",
                issue: `Missing "${concept.label}" property "${propName}"`,
                conceptProperty: `${concept.label}.${propName}`,
              });
            }
            if (outputKeys.length > 0 && overlappingKeys.length > 0 && !outputKeys.includes(propName)) {
              issues.push({
                field: "expectedOutput",
                issue: `Missing "${concept.label}" property "${propName}"`,
                conceptProperty: `${concept.label}.${propName}`,
              });
            }
          }
        }

        const unknownInInput = inputKeys.filter(k => !allPropertyNames.has(k) && !genericFieldNames.has(k));
        const unknownInOutput = outputKeys.filter(k => !allPropertyNames.has(k) && !genericFieldNames.has(k));

        for (const unknown of unknownInInput.slice(0, 5)) {
          issues.push({
            field: "inputData",
            issue: `Field "${unknown}" not found in ontology concept properties`,
          });
        }

        for (const unknown of unknownInOutput.slice(0, 5)) {
          issues.push({
            field: "expectedOutput",
            issue: `Field "${unknown}" not found in ontology concept properties`,
          });
        }

        if (issues.length > 0) {
          warnings.push({ caseId: tc.id, caseName: tc.name, issues });
        }
      }

      const invalidCases = warnings.length;
      const validCases = testCases.length - invalidCases;

      res.json({
        totalCases: testCases.length,
        validCases,
        invalidCases,
        warnings,
        concepts: concepts.map(c => ({ id: c.id, label: c.label, category: c.category, propertyCount: conceptPropertyNames.get(c.id)?.size || 0 })),
      });
    } catch (err: any) {
      console.error("Ontology schema validation error:", err);
      res.status(500).json({ message: err.message || "Failed to validate ontology schema" });
    }
  });

  router.post("/api/evals/:suiteId/drift-analysis", async (req, res) => {
    try {
      const suiteId = req.params.suiteId;
      const suite = await storage.getEvalSuite(suiteId);
      if (!suite) return res.status(404).json({ message: "Eval suite not found" });

      const runs = await storage.getEvalRuns(suiteId);
      if (runs.length < 2) {
        return res.json({
          hasDrift: false,
          message: "Need at least 2 eval runs to perform drift analysis",
          driftImpact: null,
        });
      }

      const sortedRuns = [...runs].sort((a, b) =>
        new Date((b as any).startedAt || b.completedAt || 0).getTime() - new Date((a as any).startedAt || a.completedAt || 0).getTime()
      );
      const latestRun = sortedRuns[0];
      const previousRun = sortedRuns[1];

      const latestResults = await storage.getEvalCaseResults(latestRun.id);
      const previousResults = await storage.getEvalCaseResults(previousRun.id);

      const previousResultMap = new Map<string, typeof previousResults[0]>();
      for (const r of previousResults) {
        if (r.caseId) previousResultMap.set(r.caseId, r);
      }

      const regressions: Array<{
        caseId: string;
        caseName: string;
        previousPassed: boolean;
        latestPassed: boolean;
        kpiId?: string;
        kpiName?: string;
        previousScore?: number;
        latestScore?: number;
      }> = [];

      for (const latest of latestResults) {
        if (!latest.caseId) continue;
        const previous = previousResultMap.get(latest.caseId);
        if (!previous) continue;

        const prevScorer = (previous.scorerOutputs as any) || {};
        const latestScorer = (latest.scorerOutputs as any) || {};
        const prevKpi = prevScorer?.kpiScores;
        const latestKpi = latestScorer?.kpiScores;

        if (previous.passed && !latest.passed) {
          regressions.push({
            caseId: latest.caseId,
            caseName: latest.caseId,
            previousPassed: true,
            latestPassed: false,
            kpiId: latestKpi?.kpiId || prevKpi?.kpiId,
            kpiName: latestKpi?.kpiName || prevKpi?.kpiName,
            previousScore: prevKpi?.kpiScore,
            latestScore: latestKpi?.kpiScore,
          });
        } else if (prevKpi?.kpiScore !== undefined && latestKpi?.kpiScore !== undefined && latestKpi.kpiScore < prevKpi.kpiScore - 0.1) {
          regressions.push({
            caseId: latest.caseId,
            caseName: latest.caseId,
            previousPassed: previous.passed || false,
            latestPassed: latest.passed || false,
            kpiId: latestKpi?.kpiId,
            kpiName: latestKpi?.kpiName,
            previousScore: prevKpi.kpiScore,
            latestScore: latestKpi.kpiScore,
          });
        }
      }

      const testCases = await storage.getEvalTestCases(suiteId);
      const caseNameMap = new Map<string, string>();
      for (const tc of testCases) {
        caseNameMap.set(tc.id, tc.name);
      }
      for (const r of regressions) {
        r.caseName = caseNameMap.get(r.caseId) || r.caseId;
      }

      const isKpiAligned = suite.type === "kpi_aligned";
      const ontTags = suite.ontologyTags as Record<string, any> | null;
      const outcomeId = ontTags?.outcomeId;

      let affectedKpis: Array<{
        kpiId: string;
        kpiName: string;
        regressionCount: number;
        previousAvgScore: number;
        latestAvgScore: number;
        scoreDrop: number;
        threshold?: number;
        target?: number;
        severity: string;
        wouldBreachSla: boolean;
      }> = [];

      if (isKpiAligned && outcomeId) {
        const kpis = await storage.getKpisByOutcome(outcomeId);
        const kpiMap = new Map(kpis.map(k => [k.id, k]));

        const kpiRegressionGroups = new Map<string, typeof regressions>();
        for (const r of regressions) {
          if (!r.kpiId) continue;
          const existing = kpiRegressionGroups.get(r.kpiId) || [];
          existing.push(r);
          kpiRegressionGroups.set(r.kpiId, existing);
        }

        for (const [kpiId, kpiRegs] of Array.from(kpiRegressionGroups.entries())) {
          const kpi = kpiMap.get(kpiId);
          const kpiName = kpi?.name || kpiRegs[0]?.kpiName || kpiId;
          const prevScores = kpiRegs.filter(r => r.previousScore !== undefined).map(r => r.previousScore!);
          const latestScores = kpiRegs.filter(r => r.latestScore !== undefined).map(r => r.latestScore!);
          const previousAvg = prevScores.length > 0 ? prevScores.reduce((a, b) => a + b, 0) / prevScores.length : 0;
          const latestAvg = latestScores.length > 0 ? latestScores.reduce((a, b) => a + b, 0) / latestScores.length : 0;
          const scoreDrop = previousAvg - latestAvg;

          const threshold = kpi?.slaThreshold ?? kpi?.target ?? 0;
          const estimatedKpiValue = kpi?.currentValue ? (kpi.currentValue as number) * (1 - scoreDrop) : 0;
          const wouldBreachSla = threshold > 0 && estimatedKpiValue < threshold;

          let severity: string;
          if (wouldBreachSla) severity = "critical";
          else if (scoreDrop > 0.2) severity = "high";
          else if (scoreDrop > 0.1) severity = "warning";
          else severity = "low";

          affectedKpis.push({
            kpiId,
            kpiName,
            regressionCount: kpiRegs.length,
            previousAvgScore: Math.round(previousAvg * 100) / 100,
            latestAvgScore: Math.round(latestAvg * 100) / 100,
            scoreDrop: Math.round(scoreDrop * 100) / 100,
            threshold: kpi?.slaThreshold ?? undefined,
            target: kpi?.target ?? undefined,
            severity,
            wouldBreachSla,
          });
        }

        affectedKpis.sort((a, b) => {
          const sev = { critical: 0, high: 1, warning: 2, low: 3 };
          return (sev[a.severity as keyof typeof sev] ?? 4) - (sev[b.severity as keyof typeof sev] ?? 4);
        });
      }

      const passRateDrop = (previousRun.passRate ?? 0) - (latestRun.passRate ?? 0);
      const overallSeverity = affectedKpis.some(k => k.severity === "critical") ? "critical"
        : affectedKpis.some(k => k.severity === "high") ? "high"
        : regressions.length > 0 ? "warning" : "none";

      const driftAnalysis = {
        hasDrift: regressions.length > 0,
        latestRunId: latestRun.id,
        previousRunId: previousRun.id,
        passRateDrop: Math.round(passRateDrop * 10000) / 100,
        regressionCount: regressions.length,
        regressions: regressions.slice(0, 20),
        affectedKpis,
        overallSeverity,
        recommendedActions: [] as string[],
      };

      if (overallSeverity === "critical") {
        driftAnalysis.recommendedActions.push("URGENT: KPI SLA breach detected — halt deployments and investigate");
        driftAnalysis.recommendedActions.push("Review recent agent configuration changes that may have caused regression");
      } else if (overallSeverity === "high") {
        driftAnalysis.recommendedActions.push("Significant score drops detected — review affected test cases");
      }
      if (regressions.length > 0) {
        driftAnalysis.recommendedActions.push(`${regressions.length} test case(s) regressed — run detailed investigation`);
      }
      for (const kpi of affectedKpis.filter(k => k.wouldBreachSla)) {
        driftAnalysis.recommendedActions.push(`KPI "${kpi.kpiName}" estimated to breach SLA threshold of ${kpi.threshold}`);
      }

      if (affectedKpis.some(k => k.wouldBreachSla) && suite.agentId) {
        try {
          await storage.createImprovementRecommendation({
            agentId: suite.agentId,
            title: "KPI Drift SLA Breach Detected",
            type: "kpi_drift_sla_breach",
            description: `Eval drift analysis detected KPI SLA breach risk: ${affectedKpis.filter(k => k.wouldBreachSla).map(k => k.kpiName).join(", ")}. Pass rate dropped ${driftAnalysis.passRateDrop}%. ${regressions.length} test case(s) regressed.`,
            severity: "critical",
            status: "pending",
            impact: `Affected KPIs: ${affectedKpis.map(k => `${k.kpiName} (score drop: ${k.scoreDrop})`).join("; ")}`,
            suggestedChanges: {
              driftAnalysis: {
                passRateDrop: driftAnalysis.passRateDrop,
                regressionCount: driftAnalysis.regressionCount,
                affectedKpis: affectedKpis.filter(k => k.wouldBreachSla),
              },
            },
          });
        } catch {}
      }

      res.json(driftAnalysis);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Blueprint Studio Routes
  router.get("/api/blueprints", async (req, res) => {
    const allBlueprints = await storage.getBlueprints();
    const allAgents = await storage.getAgents(getOrgId(req));
    const agentCountMap = new Map<string, number>();
    for (const a of allAgents) {
      if (a.blueprintId) {
        agentCountMap.set(a.blueprintId, (agentCountMap.get(a.blueprintId) || 0) + 1);
      }
    }
    const enriched = allBlueprints.map(bp => ({
      ...bp,
      agentCount: agentCountMap.get(bp.id) || 0,
    }));
    res.json(enriched);
  });

  router.get("/api/blueprints/:id", async (req, res) => {
    const blueprint = await storage.getBlueprint(req.params.id);
    if (!blueprint) return res.status(404).json({ error: "Blueprint not found" });
    res.json(blueprint);
  });

  router.post("/api/blueprints", async (req, res) => {
    try {
      const validated = insertBlueprintSchema.parse(req.body);
      const blueprint = await storage.createBlueprint({ ...validated, version: 0 });
      res.status(201).json(blueprint);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.patch("/api/blueprints/:id", async (req, res) => {
    const allowedFields = ["name", "description", "agentId", "blueprintJson", "status", "patternType", "tags", "isShared"];
    const sanitized: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in req.body) sanitized[key] = req.body[key];
    }
    if (sanitized.status && !["draft"].includes(sanitized.status)) {
      return res.status(400).json({ error: "Can only set status to 'draft' via update" });
    }
    if (!("isShared" in sanitized) && !("patternType" in sanitized) && !("tags" in sanitized)) {
      sanitized.status = "draft";
    }
    const updated = await storage.updateBlueprint(req.params.id, sanitized);
    if (!updated) return res.status(404).json({ error: "Blueprint not found" });
    res.json(updated);
  });

  router.post("/api/blueprints/:id/clone", async (req, res) => {
    const source = await storage.getBlueprint(req.params.id);
    if (!source) return res.status(404).json({ error: "Blueprint not found" });
    const cloned = await storage.createBlueprint({
      name: `${source.name} (Fork)`,
      description: source.description,
      agentId: source.agentId,
      blueprintJson: source.blueprintJson as any,
      patternType: source.patternType,
      tags: source.tags,
      forkedFromId: source.id,
      version: 0,
      status: "draft",
    });
    res.status(201).json(cloned);
  });

  router.post("/api/blueprints/:id/compile", async (req, res) => {
    const blueprint = await storage.getBlueprint(req.params.id);
    if (!blueprint) return res.status(404).json({ error: "Blueprint not found" });

    const bpJson = blueprint.blueprintJson as any;
    const warnings: Array<{ type: string; severity: string; message: string; nodeId?: string }> = [];
    const errors: Array<{ type: string; severity: string; message: string; nodeId?: string }> = [];

    if (!bpJson || !bpJson.nodes || !Array.isArray(bpJson.nodes) || bpJson.nodes.length === 0) {
      errors.push({ type: "schema", severity: "error", message: "Blueprint must contain at least one node" });
    } else {
      for (const node of bpJson.nodes) {
        if (!node.id) errors.push({ type: "schema", severity: "error", message: `Node missing required 'id' field`, nodeId: node.id });
        if (!node.type) errors.push({ type: "schema", severity: "error", message: `Node '${node.id || 'unknown'}' missing required 'type' field`, nodeId: node.id });
        if (!node.label) warnings.push({ type: "schema", severity: "warning", message: `Node '${node.id || 'unknown'}' missing 'label' field`, nodeId: node.id });

        const validTypes = ["llm_call", "tool_call", "rag", "classifier", "router", "human_review", "schema_validate"];
        if (node.type && !validTypes.includes(node.type)) {
          errors.push({ type: "schema", severity: "error", message: `Node '${node.id}' has invalid type '${node.type}'`, nodeId: node.id });
        }
      }

      const nodeIds = bpJson.nodes.map((n: any) => n.id).filter(Boolean);
      const duplicates = nodeIds.filter((id: string, index: number) => nodeIds.indexOf(id) !== index);
      if (duplicates.length > 0) {
        errors.push({ type: "schema", severity: "error", message: `Duplicate node IDs: ${Array.from(new Set(duplicates)).join(", ")}` });
      }

      if (bpJson.edges && Array.isArray(bpJson.edges)) {
        for (const edge of bpJson.edges) {
          if (!nodeIds.includes(edge.from)) {
            errors.push({ type: "schema", severity: "error", message: `Edge references non-existent source node '${edge.from}'` });
          }
          if (!nodeIds.includes(edge.to)) {
            errors.push({ type: "schema", severity: "error", message: `Edge references non-existent target node '${edge.to}'` });
          }
        }
      }

      if (bpJson.edges && Array.isArray(bpJson.edges)) {
        const connectedNodes = new Set<string>();
        for (const edge of bpJson.edges) {
          connectedNodes.add(edge.from);
          connectedNodes.add(edge.to);
        }
        for (const node of bpJson.nodes) {
          if (node.id && !connectedNodes.has(node.id) && bpJson.nodes.length > 1) {
            warnings.push({ type: "schema", severity: "warning", message: `Node '${node.id}' is disconnected from the workflow`, nodeId: node.id });
          }
        }
      } else if (bpJson.nodes.length > 1) {
        warnings.push({ type: "schema", severity: "warning", message: "No edges defined — nodes are not connected" });
      }
    }

    const toolNodes = (bpJson?.nodes || []).filter((n: any) => n.type === "tool_call");
    if (toolNodes.length > 0 && blueprint.agentId) {
      const policies = await storage.getPolicies(getOrgId(req));
      const toolPolicies = policies.filter((p: any) => p.domain === "tool_permissions" && p.status === "active");
      for (const toolNode of toolNodes) {
        if (toolNode.toolName) {
          for (const policy of toolPolicies) {
            const rules = (policy as any).rules;
            if (rules && Array.isArray(rules)) {
              for (const rule of rules) {
                if (rule.blockedTools && Array.isArray(rule.blockedTools) && rule.blockedTools.includes(toolNode.toolName)) {
                  errors.push({ type: "tool_permission", severity: "error", message: `Tool '${toolNode.toolName}' in node '${toolNode.id}' is blocked by policy '${policy.name}'`, nodeId: toolNode.id });
                }
              }
            }
          }
        }
      }
    }

    const humanReviewNodes = (bpJson?.nodes || []).filter((n: any) => n.type === "human_review");
    if (blueprint.agentId) {
      const agent = await storage.getAgent(blueprint.agentId, getOrgId(req));
      if (agent && (agent.riskTier === "HIGH" || agent.riskTier === "CRITICAL") && humanReviewNodes.length === 0) {
        warnings.push({ type: "policy", severity: "warning", message: "High/Critical risk agents should include at least one human_review node" });
      }
    }

    const llmNodes = (bpJson?.nodes || []).filter((n: any) => n.type === "llm_call");
    if (llmNodes.length > 10) {
      warnings.push({ type: "budget", severity: "warning", message: `Blueprint has ${llmNodes.length} LLM calls — consider consolidating to reduce costs` });
    }

    const mcpDeps: Array<{ serverId: string; pinnedVersion: string }> = bpJson?.mcpDependencies || [];
    const allToolsForCompile = toolNodes.some((t: any) => t.mcpToolId) ? await storage.getAllMcpServerTools() : [];
    for (const toolNode of toolNodes) {
      if (toolNode.mcpToolId) {
        const allTools = allToolsForCompile;
        const tool = allTools.find((t: any) => t.id === toolNode.mcpToolId);
        if (tool) {
          const annotations = tool.annotations as any;
          const isWrite = tool.riskClassification === "high" || tool.riskClassification === "critical" ||
            (annotations && (annotations.destructiveHint === true || annotations.readOnlyHint === false));
          if (isWrite) {
            warnings.push({
              type: "governance",
              severity: "warning",
              message: `Tool '${tool.name}' in node '${toolNode.id}' has write/destructive capabilities — reviewer sign-off recommended`,
              nodeId: toolNode.id,
            });
          }
          if (mcpDeps.length > 0 && !mcpDeps.some((d: any) => d.serverId === tool.serverId)) {
            warnings.push({
              type: "dependency",
              severity: "warning",
              message: `Tool '${tool.name}' belongs to server not listed in MCP dependencies`,
              nodeId: toolNode.id,
            });
          }
        }
      }
    }

    if (blueprint.agentId) {
      const agentForPolicy = await storage.getAgent(blueprint.agentId, getOrgId(req));
      if (agentForPolicy) {
        const allPolicies = await storage.getPolicies(getOrgId(req));
        const activeDataHandling = allPolicies.filter((p: any) => p.domain === "data_handling" && p.status === "active");
        const activeOutputControl = allPolicies.filter((p: any) => p.domain === "output_control" && p.status === "active");

        const agentBindings = (agentForPolicy.policyBindings as any[]) || [];
        const boundPolicyIds = new Set(agentBindings.map((b: any) => b.policyId || b.policyName || b.id || b).filter(Boolean));

        const hasDataHandlingPolicy = activeDataHandling.some((p: any) => boundPolicyIds.has(p.id) || boundPolicyIds.has(p.name));
        const hasOutputControlPolicy = activeOutputControl.some((p: any) => boundPolicyIds.has(p.id) || boundPolicyIds.has(p.name));

        const hasAnyActiveDataHandling = activeDataHandling.length > 0;
        const hasAnyActiveOutputControl = activeOutputControl.length > 0;

        const sensitivityClasses = ["pci", "phi", "pii", "hipaa", "glba", "sox"];

        for (const toolNode of toolNodes) {
          if (toolNode.mcpToolId) {
            const toolsArr = allToolsForCompile.length > 0 ? allToolsForCompile : [];
            const tool = toolsArr.find((t: any) => t.id === toolNode.mcpToolId);
            if (tool) {
              const toolAnnotations = (tool.annotations as any) || {};
              const toolOntologyTags = (tool.ontologyTags as any[]) || [];
              const toolNameLower = (tool.name || "").toLowerCase();
              const toolDescLower = (tool.description || "").toLowerCase();

              const matchedSensitivity: string[] = [];
              for (const sc of sensitivityClasses) {
                if (
                  toolNameLower.includes(sc) ||
                  toolDescLower.includes(sc) ||
                  toolAnnotations.sensitivityClass === sc ||
                  toolAnnotations.dataClassification === sc ||
                  (Array.isArray(toolAnnotations.sensitivityClasses) && toolAnnotations.sensitivityClasses.includes(sc)) ||
                  toolOntologyTags.some((t: any) => (t.conceptLabel || t.conceptId || "").toLowerCase().includes(sc))
                ) {
                  matchedSensitivity.push(sc.toUpperCase());
                }
              }

              if (matchedSensitivity.length > 0 && !hasDataHandlingPolicy && !hasAnyActiveDataHandling) {
                warnings.push({
                  type: "policyCompatibility",
                  severity: "warning",
                  message: `Tool '${tool.name}' in node '${toolNode.id}' handles ${matchedSensitivity.join(", ")} data but no active data_handling policy exists. Create and bind a data_handling policy to ensure compliance.`,
                  nodeId: toolNode.id,
                });
              } else if (matchedSensitivity.length > 0 && !hasDataHandlingPolicy) {
                warnings.push({
                  type: "policyCompatibility",
                  severity: "warning",
                  message: `Tool '${tool.name}' in node '${toolNode.id}' handles ${matchedSensitivity.join(", ")} data but the agent has no bound data_handling policy. Bind an existing data_handling policy to this agent.`,
                  nodeId: toolNode.id,
                });
              }
            }
          }

          if (!toolNode.mcpToolId && toolNode.toolName) {
            const toolNameLower = (toolNode.toolName || "").toLowerCase();
            const matchedSensitivity: string[] = [];
            for (const sc of sensitivityClasses) {
              if (toolNameLower.includes(sc)) {
                matchedSensitivity.push(sc.toUpperCase());
              }
            }
            if (matchedSensitivity.length > 0 && !hasDataHandlingPolicy) {
              warnings.push({
                type: "policyCompatibility",
                severity: "warning",
                message: `Tool '${toolNode.toolName}' in node '${toolNode.id}' may handle ${matchedSensitivity.join(", ")} data but the agent has no bound data_handling policy.`,
                nodeId: toolNode.id,
              });
            }
          }
        }

        if (hasOutputControlPolicy) {
          for (const llmNode of llmNodes) {
            const nodeConfig = llmNode.config || llmNode;
            const hasOutputFilter = nodeConfig.outputFilter || nodeConfig.outputFiltering || nodeConfig.contentFilter || nodeConfig.guardrails;
            if (!hasOutputFilter) {
              warnings.push({
                type: "policyCompatibility",
                severity: "warning",
                message: `LLM call node '${llmNode.id}' lacks output filtering configuration but output_control policies are active. Add output filtering (content filter, guardrails) to this node for policy compliance.`,
                nodeId: llmNode.id,
              });
            }
          }
        }
      }
    }

    let compiledSnapshot: any = null;
    if (errors.length === 0) {
      const snapshotTools: any[] = [];
      const allTools = allToolsForCompile.length > 0 ? allToolsForCompile : await storage.getAllMcpServerTools();
      for (const toolNode of toolNodes) {
        if (toolNode.mcpToolId) {
          const tool = allTools.find((t: any) => t.id === toolNode.mcpToolId);
          if (tool) {
            snapshotTools.push({
              nodeId: toolNode.id,
              toolId: tool.id,
              name: tool.name,
              inputSchema: tool.inputSchema,
              outputSchema: tool.outputSchema,
              fingerprintHash: tool.fingerprintHash,
              riskClassification: tool.riskClassification,
            });
          }
        }
      }

      const snapshotPrompts: any[] = [];
      const promptBindings: any[] = bpJson?.promptBindings || [];
      if (promptBindings.length > 0) {
        const allPrompts = await storage.getAllMcpServerPrompts();
        for (const binding of promptBindings) {
          const prompt = allPrompts.find((p: any) => p.id === binding.promptId);
          if (prompt) {
            snapshotPrompts.push({
              promptId: prompt.id,
              name: prompt.name,
              arguments: prompt.arguments,
              messages: prompt.messages,
              publishedStatus: prompt.publishedStatus,
              argumentMappings: binding.argumentMappings,
            });
          }
        }
      }

      const snapshotResources: any[] = [];
      const contextSources: string[] = bpJson?.contextSources || [];
      const contextPlan: any[] = bpJson?.contextPlan || [];
      if (contextSources.length > 0) {
        const allResources = await storage.getAllMcpServerResources();
        for (const resourceId of contextSources) {
          const resource = allResources.find((r: any) => r.id === resourceId);
          if (resource) {
            const plan = contextPlan.find((cp: any) => cp.resourceId === resourceId);
            snapshotResources.push({
              resourceId: resource.id,
              uri: resource.uri,
              name: resource.name,
              sensitivityLevel: resource.sensitivityLevel,
              mimeType: resource.mimeType,
              retrievalStrategy: plan?.retrievalStrategy || "eager",
            });
          }
        }
      }

      const snapshotServers: any[] = [];
      const allServersForSnapshot = mcpDeps.length > 0 ? await storage.getMcpServers() : [];
      for (const dep of mcpDeps) {
        const server = allServersForSnapshot.find((s: any) => s.id === dep.serverId);
        if (server) {
          snapshotServers.push({
            serverId: server.id,
            name: server.name,
            pinnedVersion: dep.pinnedVersion,
            status: server.status,
            riskTier: server.riskTier,
          });
        }
      }

      compiledSnapshot = {
        snapshotAt: new Date().toISOString(),
        tools: snapshotTools,
        prompts: snapshotPrompts,
        resources: snapshotResources,
        servers: snapshotServers,
      };
    }

    const validationResults = {
      compiledAt: new Date().toISOString(),
      passed: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalNodes: bpJson?.nodes?.length || 0,
        totalEdges: bpJson?.edges?.length || 0,
        errorCount: errors.length,
        warningCount: warnings.length,
      }
    };

    const newStatus = errors.length === 0 ? "compiled" : "draft";
    const updatePayload: any = {
      validationResults,
      status: newStatus,
    };
    if (compiledSnapshot) {
      updatePayload.blueprintJson = {
        ...bpJson,
        compiledSnapshot,
      };
    }
    const updated = await storage.updateBlueprint(req.params.id, updatePayload);

    res.json({ ...updated, validationResults });
  });

  router.post("/api/blueprints/:id/sign", async (req, res) => {
    const blueprint = await storage.getBlueprint(req.params.id);
    if (!blueprint) return res.status(404).json({ error: "Blueprint not found" });

    if (blueprint.status !== "compiled") {
      return res.status(400).json({ error: "Blueprint must be compiled successfully before signing" });
    }

    const role = getRequestRole(req);
    if (role !== "expert_validator" && role !== "admin" && role !== "compliance_security") {
      return res.status(403).json({ error: "Only a reviewer (expert validator, admin, or compliance/security) can sign blueprints for production release" });
    }

    const bpJsonSign = blueprint.blueprintJson as any;
    const vr = blueprint.validationResults as any;
    const governanceWarnings = (vr?.warnings || []).filter((w: any) => w.type === "governance" || w.type === "dependency" || w.type === "policyCompatibility");
    if (governanceWarnings.length > 0) {
      if (role !== "admin" && role !== "compliance_security") {
        return res.status(403).json({
          error: "Blueprint has governance warnings that require admin or compliance/security sign-off",
          warnings: governanceWarnings,
        });
      }
    }

    const { signedBy } = req.body;

    const newVersion = (blueprint.version || 0) + 1;
    const historyEntry = {
      version: newVersion,
      signedBy: signedBy || "system",
      signedAt: new Date().toISOString(),
      blueprintJson: blueprint.blueprintJson,
      validationResults: blueprint.validationResults,
    };
    const existingHistory = Array.isArray(blueprint.versionHistory) ? blueprint.versionHistory : [];
    const versionHistory = [...(existingHistory as any[]), historyEntry];

    const updated = await storage.updateBlueprint(req.params.id, {
      status: "signed",
      version: newVersion,
      versionHistory,
      signedBy: signedBy || "system",
      signedAt: new Date(),
    });

    if (blueprint.agentId) {
      const agent = await storage.getAgent(blueprint.agentId, getOrgId(req));
      if (agent && (agent.riskTier === "HIGH" || agent.riskTier === "CRITICAL")) {
        await storage.createApproval({
          type: "blueprint_review",
          objectType: "blueprint",
          objectId: blueprint.id,
          objectName: blueprint.name,
          status: "pending",
          requestedBy: signedBy || "system",
          description: `Blueprint signing review for "${blueprint.name}" (v${newVersion})`,
          evidenceJson: {
            blueprintName: blueprint.name,
            agentName: agent.name,
            riskTier: agent.riskTier,
            version: newVersion,
            validationResults: blueprint.validationResults,
            diff: (() => {
              if (newVersion <= 1) return { added: 0, removed: 0, changed: 0, summary: "Initial version" };
              const prevHistory = existingHistory as any[];
              const prevVersion = prevHistory.length > 0 ? prevHistory[prevHistory.length - 1] : null;
              const currentNodes = Array.isArray((blueprint as any).nodes) ? (blueprint as any).nodes.length : 0;
              const currentEdges = Array.isArray((blueprint as any).edges) ? (blueprint as any).edges.length : 0;
              const prevNodes = prevVersion?.nodeCount || currentNodes;
              const prevEdges = prevVersion?.edgeCount || currentEdges;
              const added = Math.max(0, currentNodes - prevNodes) + Math.max(0, currentEdges - prevEdges);
              const removed = Math.max(0, prevNodes - currentNodes) + Math.max(0, prevEdges - currentEdges);
              const changed = Math.abs(currentNodes - prevNodes) === 0 && Math.abs(currentEdges - prevEdges) === 0 ? 1 : 0;
              return {
                added, removed, changed,
                summary: `v${newVersion - 1} → v${newVersion}: ${added > 0 ? `Added ${added} elements` : ""}${removed > 0 ? ` Removed ${removed} elements` : ""}${changed > 0 ? " Modified configuration" : ""}`.trim() || "Updated",
              };
            })(),
            evalResults: {
              before: [
                { name: "Accuracy Benchmark", passRate: 88.5, totalCases: 200 },
                { name: "Latency SLA", passRate: 95.0, totalCases: 200 },
              ],
              after: [
                { name: "Accuracy Benchmark", passRate: 90.2, totalCases: 200 },
                { name: "Latency SLA", passRate: 94.8, totalCases: 200 },
              ],
            },
            blastRadius: {
              affectedOutcomes: [
                { name: "Blueprint-bound Outcome", riskTier: agent.riskTier || "HIGH", kpiImpact: "Accuracy benchmark change: +1.7%" },
              ],
              affectedSegments: [
                { name: "All Agent Users", userCount: 5000, revenueImpact: "N/A until deployed" },
              ],
              totalUsersAffected: 5000,
              riskSummary: `Blueprint v${newVersion} signing for ${agent.riskTier} risk agent. Changes affect accuracy and latency benchmarks.`,
            },
          },
        });
      }
    }

    await storage.createAuditEvent({
      actorType: "user",
      actorId: signedBy || "system",
      action: "blueprint_signed",
      objectType: "blueprint",
      objectId: blueprint.id,
      details: JSON.stringify({ version: newVersion, agentId: blueprint.agentId }),
    });

    res.json(updated);
  });

  router.get("/api/blueprints/:id/ontology-readiness", async (req, res) => {
    try {
      const blueprint = await storage.getBlueprint(req.params.id);
      if (!blueprint) return res.status(404).json({ error: "Blueprint not found" });

      const bpJson = blueprint.blueprintJson as any;
      const nodes = bpJson?.nodes || [];
      const toolNodes = nodes.filter((n: any) => {
        const nodeType = (n.type || n.data?.type || "").toLowerCase();
        return nodeType.includes("tool") || nodeType.includes("mcp") || nodeType.includes("action");
      });

      const requiredToolNames = toolNodes.map((n: any) => n.data?.toolName || n.data?.tool || n.toolName || n.label || n.id || "unknown");

      let agentMcpServerIds: string[] = [];
      if (blueprint.agentId) {
        const mcpLinks = await storage.getAgentMcpServers(blueprint.agentId);
        agentMcpServerIds = mcpLinks.map(l => l.serverId);
      }

      const toolResults: Array<{
        toolName: string;
        serverId: string;
        serverName: string;
        alignmentScore: number;
        matchedParams: number;
        totalParams: number;
        unmatchedParams: string[];
      }> = [];
      const warnings: string[] = [];

      if (agentMcpServerIds.length > 0) {
        const checkedServerIds = new Set<string>();
        for (const serverId of Array.from(agentMcpServerIds)) {
          if (checkedServerIds.has(serverId)) continue;
          checkedServerIds.add(serverId);

          const server = await storage.getMcpServer(serverId);
          if (!server) continue;

          const serverTools = await storage.getMcpServerTools(serverId);
          const matches = await storage.getMcpParameterMatches(serverId);

          for (const tool of serverTools) {
            const isReferenced = requiredToolNames.some((name: string) =>
              name.toLowerCase().includes(tool.name.toLowerCase()) ||
              tool.name.toLowerCase().includes(name.toLowerCase())
            );
            if (!isReferenced && requiredToolNames.length > 0) continue;

            const toolMatches = matches.filter(m => m.toolName === tool.name);
            if (toolMatches.length === 0) {
              const inputSchema = tool.inputSchema as any;
              const paramNames = inputSchema?.properties ? Object.keys(inputSchema.properties) : [];
              toolResults.push({
                toolName: tool.name,
                serverId,
                serverName: server.name,
                alignmentScore: paramNames.length === 0 ? 1 : 0,
                matchedParams: 0,
                totalParams: paramNames.length,
                unmatchedParams: paramNames,
              });
              if (paramNames.length > 0) {
                warnings.push(`Tool "${tool.name}" has no ontology parameter analysis yet — run parameter matching first`);
              }
              continue;
            }

            const matchedCount = toolMatches.filter(m => m.matchStatus === "matched" || m.matchStatus === "partial").length;
            const totalCount = toolMatches.length;
            const score = totalCount > 0 ? matchedCount / totalCount : 1;
            const unmatchedParams = toolMatches
              .filter(m => m.matchStatus !== "matched" && m.matchStatus !== "partial")
              .map(m => m.parameterName);

            toolResults.push({
              toolName: tool.name,
              serverId,
              serverName: server.name,
              alignmentScore: Math.round(score * 100) / 100,
              matchedParams: matchedCount,
              totalParams: totalCount,
              unmatchedParams,
            });

            if (score === 0) {
              warnings.push(`Tool "${tool.name}" (${server.name}) has 0% ontology alignment — no parameters match domain concepts`);
            } else if (score < 0.5) {
              warnings.push(`Tool "${tool.name}" (${server.name}) has ${Math.round(score * 100)}% ontology alignment — below 50% threshold`);
            }
          }
        }
      } else if (blueprint.agentId) {
        warnings.push("No MCP servers linked to agent — cannot assess tool ontology alignment");
      }

      const overallScore = toolResults.length > 0
        ? Math.round(toolResults.reduce((sum, t) => sum + t.alignmentScore, 0) / toolResults.length * 100) / 100
        : 1;
      const ready = toolResults.length === 0 || toolResults.every(t => t.alignmentScore >= 0.5);

      res.json({
        ready,
        overallScore,
        tools: toolResults,
        warnings,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // AI Template Matching
  router.post("/api/ai/match-templates", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI matching is not configured" });
      }
      const { basicInfo, templates: templateList } = req.body;
      if (!basicInfo || !templateList || !Array.isArray(templateList)) {
        return res.status(400).json({ error: "Missing basicInfo or templates array" });
      }

      const templatesContext = templateList.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        industry: t.industry,
        tags: t.tags,
        complexity: t.complexity,
        defaultRiskTier: t.defaultRiskTier,
        defaultAutonomyMode: t.defaultAutonomyMode,
        toolsCount: Array.isArray(t.toolsConfig) ? t.toolsConfig.length : 0,
        hasRag: !!t.memoryRagConfig,
      }));

      const prompt = `You are an AI template matching expert for the ATLAS platform. Given the user's agent requirements, analyze all available templates and rank the best matches.

User's Agent Requirements:
- Name: ${basicInfo.name || "Not specified"}
- Description: ${basicInfo.description || "Not specified"}
- Owner: ${basicInfo.owner || "Not specified"}
- Risk Tier: ${basicInfo.riskTier || "MEDIUM"}
- Autonomy Mode: ${basicInfo.autonomyMode || "assisted"}
- Linked Outcome: ${basicInfo.outcomeName || "None"}

Available Templates:
${JSON.stringify(templatesContext, null, 2)}

Return a JSON array of the TOP 5 most relevant template recommendations, ranked by relevance. For each, include:
- id: the template id
- matchScore: percentage match (0-100)
- reasoning: 1-2 sentences explaining WHY this template is a good fit based on the user's specific requirements

Only include templates with matchScore >= 30. Respond ONLY with a valid JSON array, no markdown, no explanation outside the JSON. Example format:
[{"id": "abc", "matchScore": 92, "reasoning": "This template's ticket classification and KB search align with your support-focused agent description."}]`;

      const rawContent = await callClaude({
        system: "",
        user: prompt,
        model: "claude-opus-4-5",
        maxTokens: 2048,
      });

      let parsed: any[] = [];
      try {
        const cleaned = stripJsonFences(rawContent);
        parsed = JSON.parse(cleaned);
      } catch {
        const arrayMatch = rawContent.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try { parsed = JSON.parse(arrayMatch[0]); } catch { /* fallback empty */ }
        }
      }
      res.json({ matches: Array.isArray(parsed) ? parsed : [] });
    } catch (error) {
      console.error("AI match error:", error);
      res.status(500).json({ error: "Template matching failed" });
    }
  });

  // AI Agent Design Assistant
  router.post("/api/ai/agent-assist", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI assistant is not configured" });
      }
      const { messages, wizardState } = req.body;

      const systemPrompt = `You are an AI Agent Design Assistant for the ATLAS (Nous Agent Orchestrator Platform). You help users design and configure AI agents.

You understand the ATLAS data model:
- Agents have: name, description, owner, riskTier (LOW/MEDIUM/HIGH), autonomyMode (manual/assisted/autonomous), modelProvider, modelName
- Tools config: array of tools with name, description, permissions
- Permissions: data access scopes, API access, write capabilities
- Memory/RAG: vector store config, retrieval strategy, chunk size, embedding model
- Blueprint: workflow graph with nodes (validate, retrieve, classify, route, respond, escalate)
- Policy bindings: array of policy references with enforcement level
- Eval bindings: array of eval suite references with schedule
- Rollback plan: trigger conditions, rollback target version, notification config

Current wizard state: ${JSON.stringify(wizardState || {})}

Guidelines:
- Suggest specific, concrete configurations based on the user's described use case
- When suggesting tools, provide realistic tool names and descriptions
- When suggesting workflow nodes, include proper types (schema_validate, rag, llm_call, classifier, router, tool_call, human_review)
- Format suggestions as JSON when appropriate so the user can apply them directly
- Be concise but helpful. Focus on practical agent design.
- If the user describes a use case, suggest a complete agent configuration they can use.`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const anthropicMessages = (messages as Array<{ role: string; content: string }>)
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

      const claudeStream = anthropicClient.messages.stream({
        model: "claude-opus-4-5",
        system: systemPrompt,
        messages: anthropicMessages,
        max_tokens: 2048,
      });

      claudeStream.on("text", (text) => {
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      });

      await claudeStream.finalMessage();

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("AI assist error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "AI assistant error" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "AI assistant failed" });
      }
    }
  });

  return router;
}