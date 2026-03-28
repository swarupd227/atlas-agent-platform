import { Router } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { storage } from "../storage";
import { buildAgentSystemPrompt } from "./helpers";
import {
  executePromptWithMcp,
  startAgentRuntime,
  stopAgentRuntime,
  isRuntimeActive,
  getActiveRuntimes,
  executeTeamPipeline,
  type RuntimeAgent,
} from "../agent-runtime";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const router = Router();

  router.get("/api/shadow-traces", async (req, res) => {
    try {
      const traces = await storage.getShadowTraces();
      res.json(traces);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/shadow-traces/:id", async (req, res) => {
    try {
      const trace = await storage.getShadowTrace(req.params.id);
      if (!trace) return res.status(404).json({ error: "Not found" });
      res.json(trace);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/shadow-traces", async (req, res) => {
    try {
      const trace = await storage.createShadowTrace(req.body);
      res.json(trace);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch("/api/shadow-traces/:id", async (req, res) => {
    try {
      const updated = await storage.updateShadowTrace(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/api/shadow-traces/:id", async (req, res) => {
    try {
      const ok = await storage.deleteShadowTrace(req.params.id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/shadow-replay-sessions", async (req, res) => {
    try {
      const sessions = await storage.getShadowReplaySessions();
      res.json(sessions);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/shadow-replay-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getShadowReplaySession(req.params.id);
      if (!session) return res.status(404).json({ error: "Not found" });
      res.json(session);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/shadow-replay-sessions", async (req, res) => {
    try {
      const session = await storage.createShadowReplaySession(req.body);
      res.json(session);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch("/api/shadow-replay-sessions/:id", async (req, res) => {
    try {
      const updated = await storage.updateShadowReplaySession(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/api/shadow-replay-sessions/:id", async (req, res) => {
    try {
      const ok = await storage.deleteShadowReplaySession(req.params.id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/ai/generate-shadow-traces", async (req, res) => {
    try {
      const { industry, count = 3 } = req.body;
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI agent testing expert generating realistic production trace data for shadow replay testing. Generate traces that represent real agent interactions in production environments.

Return JSON with this structure:
{
  "traces": [
    {
      "agentName": "string - realistic agent name",
      "agentVersion": "string - semver like v2.1.3",
      "scenarioCategory": "string - e.g. KYC Verification, Clinical Triage, Quality Inspection, Claims Processing",
      "scenarioComplexity": "low|medium|high|extreme",
      "edgeCaseFrequency": "common|uncommon|rare|novel",
      "riskLevel": "low|medium|high|critical",
      "traceInput": {"query": "string", "context": {}, "parameters": {}},
      "traceOutput": {"response": "string", "actions": [], "confidence": number, "reasoning": "string"},
      "traceMetadata": {"latency_ms": number, "tokens_used": number, "model": "string", "tools_called": []},
      "regulatoryContext": [{"regulation": "string", "applicable": boolean, "requirement": "string"}],
      "duration": number_seconds,
      "tokenCount": number,
      "tags": ["string array of relevant tags"]
    }
  ]
}

Generate diverse, realistic traces with varying complexity, risk levels, and edge-case patterns. Include realistic input/output data specific to the industry domain.`
          },
          {
            role: "user",
            content: `Generate ${Math.min(count, 5)} realistic production traces for the ${industry || "financial_services"} industry. Make them diverse in scenario complexity and risk level. Return ONLY valid JSON.`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ error: "No response from AI" });
      const parsed = JSON.parse(content);
      const createdTraces = [];
      for (const t of (parsed.traces || [])) {
        const trace = await storage.createShadowTrace({
          industry: industry || "financial_services",
          agentName: t.agentName,
          agentVersion: t.agentVersion || "v1.0.0",
          scenarioCategory: t.scenarioCategory,
          scenarioComplexity: t.scenarioComplexity || "medium",
          edgeCaseFrequency: t.edgeCaseFrequency || "rare",
          riskLevel: t.riskLevel || "medium",
          traceInput: t.traceInput || {},
          traceOutput: t.traceOutput || {},
          traceMetadata: t.traceMetadata || {},
          regulatoryContext: t.regulatoryContext || [],
          duration: t.duration || 1.5,
          tokenCount: t.tokenCount || 500,
          status: "captured",
          tags: t.tags || [],
        } as any);
        createdTraces.push(trace);
      }
      res.json({ traces: createdTraces, count: createdTraces.length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/ai/shadow-replay-analyze", async (req, res) => {
    try {
      const { sessionId, industry } = req.body;
      const session = await storage.getShadowReplaySession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const traceIds = (session.traceIds || []) as string[];
      const traces = [];
      for (const tid of traceIds) {
        const t = await storage.getShadowTrace(tid);
        if (t) traces.push(t);
      }

      if (traces.length === 0) return res.status(400).json({ error: "No traces found for this session" });

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI agent evaluation expert performing shadow replay analysis. Compare baseline agent outputs with candidate agent outputs using industry-specific rubrics.

For ${industry || "financial_services"} industry, evaluate using these rubrics:
${industry === "healthcare" ? "- Clinical Accuracy (0-100): Correctness of clinical recommendations\n- Guideline Adherence (0-100): Following established clinical guidelines\n- Patient Safety (0-100): Risk to patient wellbeing\n- Documentation Quality (0-100): Completeness of clinical documentation" :
industry === "manufacturing" ? "- Safety Compliance (0-100): Adherence to safety standards\n- Quality Accuracy (0-100): Correctness of quality assessments\n- Process Adherence (0-100): Following standard operating procedures\n- Risk Assessment (0-100): Accuracy of risk identification" :
"- Regulatory Compliance (0-100): Adherence to financial regulations\n- Suitability Assessment (0-100): Appropriateness of recommendations\n- Risk Assessment Accuracy (0-100): Correctness of risk calculations\n- Audit Trail Quality (0-100): Completeness of decision documentation"}

Return JSON with this structure:
{
  "replayResults": [
    {
      "traceId": "string",
      "scenarioCategory": "string",
      "baselineOutput": "string summary",
      "candidateOutput": "string summary",
      "verdict": "equivalent|improved|regressed|different_but_acceptable",
      "rubricScores": {"dimension": score_0_100},
      "explanation": "string - why this verdict",
      "complianceStatus": "pass|fail|warning",
      "complianceDetails": [{"regulation": "string", "status": "pass|fail", "evidence": "string"}]
    }
  ],
  "semanticDiff": {
    "overallSimilarity": number_0_100,
    "behaviorChanges": ["string descriptions of behavioral changes"],
    "regressions": ["string descriptions of any regressions"],
    "improvements": ["string descriptions of improvements"]
  },
  "complianceResults": [
    {"regulation": "string", "tracesChecked": number, "passed": number, "failed": number, "evidence": ["string"]}
  ],
  "aggregateScores": {
    "overallScore": number_0_100,
    "rubricAverages": {"dimension": average_score},
    "recommendation": "approve|review|reject",
    "summary": "string - 2-3 sentence summary of replay results"
  }
}`
          },
          {
            role: "user",
            content: `Analyze shadow replay for session "${session.name}".
Candidate version: ${session.candidateAgentVersion}
Baseline version: ${session.baselineAgentVersion}
Comparison criteria: ${JSON.stringify(session.comparisonCriteria)}

Traces to replay (${traces.length} total):
${traces.map((t, i) => `Trace ${i + 1} (${t.id}): ${t.scenarioCategory} [${t.scenarioComplexity} complexity, ${t.riskLevel} risk]
Input: ${JSON.stringify(t.traceInput)}
Output: ${JSON.stringify(t.traceOutput)}`).join("\n\n")}

Perform semantic diff analysis with industry-specific rubrics. Return ONLY valid JSON.`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ error: "No response from AI" });
      const analysis = JSON.parse(content);

      const replayResults = analysis.replayResults || [];
      const passedTraces = replayResults.filter((r: any) => r.verdict === "equivalent" || r.verdict === "improved" || r.verdict === "different_but_acceptable").length;
      const failedTraces = replayResults.filter((r: any) => r.verdict === "regressed").length;
      const regressionCount = (analysis.semanticDiff?.regressions || []).length;

      const updated = await storage.updateShadowReplaySession(sessionId, {
        status: "completed",
        replayResults: replayResults,
        semanticDiff: analysis.semanticDiff || {},
        complianceResults: analysis.complianceResults || [],
        aggregateScores: analysis.aggregateScores || {},
        totalTraces: traces.length,
        passedTraces,
        failedTraces,
        regressionCount,
        completedAt: new Date(),
      } as any);

      res.json({ session: updated, analysis });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/live-agent-test", async (req, res) => {
    try {
      const { agentName, agentId, prompt, industry } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Provide a prompt describing what the agent should do" });
      }

      let mcpServerIds: string[] = [];
      let richPrompt: string | undefined;
      if (agentId) {
        const mcpLinks = await storage.getAgentMcpServers(agentId);
        mcpServerIds = mcpLinks.map(l => l.serverId);
        const testAgent = await storage.getAgent(agentId);
        if (testAgent) richPrompt = buildAgentSystemPrompt(testAgent);
      }

      const testAgentForIter = agentId ? await storage.getAgent(agentId) : null;
      const result = await executePromptWithMcp(
        agentId || "test",
        "test-run",
        undefined,
        mcpServerIds,
        prompt,
        industry,
        richPrompt,
        { maxToolIterations: testAgentForIter?.maxToolIterations ?? 5 },
      );

      res.json({
        success: result.success,
        agentName: agentName || "Agent",
        prompt,
        steps: result.steps,
        summary: result.summary,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/deployments/:id/run-pipeline", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id);
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });

      const stages = (deployment.pipelineStages as any[]) || [];
      if (stages.length === 0) return res.status(400).json({ message: "No pipeline stages configured" });

      const deployAgent = await storage.getAgent(deployment.agentId);
      const pipelineResults: Array<{ stage: string; type: string; status: string; findings: any }> = [];
      const updatedStages: any[] = [];
      let pipelineHalted = false;

      for (let index = 0; index < stages.length; index++) {
        const stage = stages[index];
        if (pipelineHalted) {
          updatedStages.push({ ...stage, status: "skipped", attestation: "Skipped: previous critical stage failed" });
          continue;
        }

        const stageType = (stage.type || stage.name || "").toLowerCase();
        let stageResult: { passed: boolean; findings: string[]; details: any } = { passed: true, findings: [], details: {} };

        try {
          if (stageType.includes("auto_verification") || stageType.includes("test") || stageType.includes("eval")) {
            const evalSuites = await storage.getEvalSuites();
            const agentSuites = evalSuites.filter(s => s.agentId === deployment.agentId);
            if (agentSuites.length === 0) {
              stageResult.findings.push("Warning: No eval suites configured for this agent");
              stageResult.details = { evalSuites: 0, warning: "No eval suites configured — consider adding eval test cases" };
            } else {
              let totalCases = 0;
              let passedCases = 0;
              for (const suite of agentSuites) {
                const runs = await storage.getEvalRuns(suite.id);
                const latestRun = runs.length > 0 ? runs[0] : null;
                if (latestRun) {
                  const results = await storage.getEvalCaseResults(latestRun.id);
                  totalCases += results.length;
                  passedCases += results.filter(r => r.passed).length;
                }
              }
              if (totalCases > 0) {
                const passRate = Math.round((passedCases / totalCases) * 100);
                stageResult.findings.push(`Eval results: ${passedCases}/${totalCases} test cases passed (${passRate}%)`);
                stageResult.details = { totalCases, passedCases, passRate, evalSuites: agentSuites.length };
                if (passRate < 50) {
                  stageResult.passed = false;
                  stageResult.findings.push(`FAILED: Pass rate ${passRate}% is below minimum threshold of 50%`);
                }
              } else {
                stageResult.findings.push("No eval runs found — run evaluations before deploying");
                stageResult.details = { evalSuites: agentSuites.length, totalCases: 0 };
              }
            }
          } else if (stageType.includes("security") || stageType.includes("scan")) {
            const secFindings: string[] = [];
            const mcpLinks = await storage.getAgentMcpServers(deployment.agentId);
            if (mcpLinks.length === 0) {
              secFindings.push("Warning: No MCP servers linked — agent has no tool access");
            }
            if (mcpLinks.length > 5) {
              secFindings.push(`Warning: Agent has access to ${mcpLinks.length} MCP servers — review for least-privilege`);
            }
            const agentIndustry = (deployAgent as any)?.industry || deployment.industry || "";
            const agentCompTags = (deployAgent as any)?.complianceTags || [];
            const regulatedIndustries = ["healthcare", "finance", "banking", "insurance", "government"];
            const isRegulated = regulatedIndustries.some(ri => agentIndustry.toLowerCase().includes(ri)) || agentCompTags.length > 0;
            if (isRegulated && (!agentCompTags || agentCompTags.length === 0)) {
              secFindings.push("Warning: Regulated industry agent missing compliance tags");
            }
            const rtCfg = (deployAgent?.runtimeConfig as any) || {};
            if (!rtCfg.prompt) {
              secFindings.push("Critical: Agent has no runtime prompt configured");
              stageResult.passed = false;
            }
            stageResult.findings = secFindings.length > 0 ? secFindings : ["Security scan passed — no issues found"];
            stageResult.details = { mcpServers: mcpLinks.length, isRegulated, complianceTags: agentCompTags, findings: secFindings.length };
          } else if (stageType.includes("compliance") || stageType.includes("check")) {
            const agentCompTags = (deployAgent as any)?.complianceTags || [];
            const memGovRules = (deployAgent?.memoryGovernanceRules as any[]) || [];
            let complianceScore = 100;
            const compFindings: string[] = [];
            if (agentCompTags.length === 0) {
              complianceScore -= 20;
              compFindings.push("No compliance tags assigned (-20 points)");
            }
            if (memGovRules.length === 0) {
              complianceScore -= 15;
              compFindings.push("No memory governance rules configured (-15 points)");
            } else {
              const hasRetention = memGovRules.some((r: any) => r.type === "retention");
              const hasEncryption = memGovRules.some((r: any) => r.type === "encryption");
              if (!hasRetention) { complianceScore -= 10; compFindings.push("Missing retention policy (-10 points)"); }
              if (!hasEncryption && agentCompTags.includes("HIPAA")) { complianceScore -= 15; compFindings.push("HIPAA agent missing encryption rule (-15 points)"); }
            }
            const policies = await storage.getPolicies();
            const activePolicies = policies.filter(p => p.status === "active");
            if (activePolicies.length === 0) {
              complianceScore -= 10;
              compFindings.push("No active governance policies (-10 points)");
            }
            stageResult.findings = compFindings.length > 0 ? compFindings : ["Full compliance — all checks passed"];
            stageResult.findings.push(`Compliance score: ${complianceScore}/100`);
            stageResult.details = { score: complianceScore, complianceTags: agentCompTags, memGovRules: memGovRules.length, activePolicies: activePolicies.length };
            if (complianceScore < 40) {
              stageResult.passed = false;
              stageResult.findings.push("FAILED: Compliance score below minimum threshold of 40");
            }
          } else if (stageType.includes("staging") || stageType.includes("test_run") || stageType.includes("smoke")) {
            const rtCfg = (deployAgent?.runtimeConfig as any) || {};
            if (!rtCfg.prompt) {
              stageResult.passed = false;
              stageResult.findings.push("Cannot run staging test — no runtime prompt configured");
            } else {
              const mcpLinks = await storage.getAgentMcpServers(deployment.agentId);
              const agentKbs = await storage.getAgentKnowledgeBases(deployment.agentId);
              if (mcpLinks.length === 0 && agentKbs.length === 0) {
                stageResult.passed = false;
                stageResult.findings.push("Cannot run staging test — no MCP servers or Knowledge Bases linked");
              } else {
                const capabilities = [mcpLinks.length > 0 ? `${mcpLinks.length} MCP server(s)` : null, agentKbs.length > 0 ? `${agentKbs.length} Knowledge Base(s)` : null].filter(Boolean).join(" and ");
                stageResult.findings.push(`Staging test: Agent configuration validated — prompt and ${capabilities} present`);
                stageResult.details = { prompt: rtCfg.prompt.substring(0, 100), mcpServers: mcpLinks.length, knowledgeBases: agentKbs.length, validConfig: true };
              }
            }
          } else {
            stageResult.findings.push(`Stage "${stage.name || stageType}" auto-verified`);
          }
        } catch (stageErr: any) {
          stageResult.passed = false;
          stageResult.findings.push(`Stage execution error: ${stageErr.message}`);
        }

        const isCritical = stage.critical === true || stageType.includes("security") || stageType.includes("compliance");
        if (!stageResult.passed && isCritical) {
          pipelineHalted = true;
        }

        pipelineResults.push({ stage: stage.name || stageType, type: stageType, status: stageResult.passed ? "passed" : "failed", findings: stageResult.details });
        updatedStages.push({
          ...stage,
          status: stageResult.passed ? "completed" : "failed",
          completedAt: new Date().toISOString(),
          completedBy: "pipeline-engine",
          attestation: stageResult.findings.join("; "),
          findings: stageResult.details,
        });
      }

      if (pipelineHalted) {
        const updated = await storage.updateDeployment(req.params.id, {
          pipelineStages: updatedStages,
          pipelineComplete: false,
          status: "pipeline_failed",
        });
        return res.json({
          ...updated,
          pipelineHalted: true,
          pipelineResults,
          runtimeStarted: false,
          runtimeMessage: "Pipeline halted — critical stage failed. Fix the issues and re-run the pipeline.",
        });
      }

      const allDeployments = await storage.getDeployments();
      const previouslyDeployed = allDeployments.filter(
        d => d.agentId === deployment.agentId && d.id !== req.params.id && d.status === "deployed"
      );
      for (const old of previouslyDeployed) {
        stopAgentRuntime(old.id);
        await storage.updateDeployment(old.id, { status: "superseded" });
      }

      const updated = await storage.updateDeployment(req.params.id, {
        pipelineStages: updatedStages,
        pipelineComplete: true,
        status: "deployed",
        deployedAt: new Date(),
      });

      if (deployAgent) {
        await storage.updateAgent(deployment.agentId, { status: "deployed" });
      }
      const richSystemPrompt = deployAgent ? buildAgentSystemPrompt(deployAgent) : undefined;
      const runtimeResult = await startAgentRuntime(req.params.id, richSystemPrompt);
      console.log(`[deploy] Agent runtime: ${runtimeResult.message}`);

      res.json({ ...updated, pipelineResults, runtimeStarted: runtimeResult.started, runtimeMessage: runtimeResult.message });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/deployments/:id/start-runtime", async (req, res) => {
    try {
      const dep = await storage.getDeployment(req.params.id);
      let richPrompt: string | undefined;
      let agent: any = null;
      if (dep) {
        agent = await storage.getAgent(dep.agentId);
        if (agent) richPrompt = buildAgentSystemPrompt(agent);
      }
      const result = await startAgentRuntime(req.params.id, richPrompt);
      if (dep && (result.started || result.message?.includes("already running"))) {
        if (dep.status === "pending" || dep.status === "inactive") {
          await storage.updateDeployment(req.params.id, {
            status: "deployed",
            ...(dep.deployedAt ? {} : { deployedAt: new Date() }),
          });
        }
        if (agent && agent.status !== "deployed") {
          await storage.updateAgent(dep.agentId, { status: "deployed" });
        }
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/deployments/:id/stop-runtime", async (req, res) => {
    try {
      const result = stopAgentRuntime(req.params.id);
      if (result.stopped) {
        await storage.updateDeployment(req.params.id, { status: "inactive" });
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/deployments/:id/runtime-status", async (req, res) => {
    try {
      const active = isRuntimeActive(req.params.id);
      const runs = await storage.getAgentRuntimeRuns();
      const deploymentRuns = runs.filter(r => r.deploymentId === req.params.id)
        .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())
        .slice(0, 20);
      res.json({ active, runs: deploymentRuns });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/agent-runtime/active", async (_req, res) => {
    try {
      const runtimes = await getActiveRuntimes();
      res.json(runtimes);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/agent-runtime/runs", async (req, res) => {
    try {
      const agentId = req.query.agentId as string | undefined;
      const runs = await storage.getAgentRuntimeRuns(agentId);
      const sorted = runs.sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()).slice(0, 50);
      res.json(sorted);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/agent-runtime/runs/:id", async (req, res) => {
    try {
      const run = await storage.getAgentRuntimeRun(req.params.id);
      if (!run) return res.status(404).json({ error: "Run not found" });
      res.json(run);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/deployments/:id/execute-now", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id);
      if (!deployment) return res.status(404).json({ error: "Deployment not found" });

      const agent = await storage.getAgent(deployment.agentId);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const mcpLinks = await storage.getAgentMcpServers(deployment.agentId);
      const mcpServerIds = mcpLinks.map(l => l.serverId);

      const rtConfig = (agent.runtimeConfig as Record<string, any>) || {};
      const prompt = req.body?.prompt || rtConfig.prompt;
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "No runtime prompt provided. Either pass a prompt in the request body or configure the agent's runtime prompt first." });
      }

      const runtimeRun = await storage.createAgentRuntimeRun({
        agentId: deployment.agentId,
        deploymentId: deployment.id,
        status: "running",
        triggerType: "manual",
        mcpServerId: mcpServerIds[0] || null,
        inputConfig: { prompt },
      });

      const execRichPrompt = buildAgentSystemPrompt(agent);
      const result = await executePromptWithMcp(
        deployment.agentId,
        deployment.id,
        undefined,
        mcpServerIds,
        prompt,
        deployment.industry || (agent as any).industry,
        execRichPrompt,
        { maxToolIterations: agent.maxToolIterations ?? 5 },
      );

      await storage.updateAgentRuntimeRun(runtimeRun.id, {
        status: result.success ? "completed" : "failed",
        stepsJson: result.steps,
        resultSummary: result.summary,
        latencyMs: result.summary.latencyMs || 0,
        completedAt: new Date(),
      });

      res.json({ run: { ...runtimeRun, status: result.success ? "completed" : "failed", stepsJson: result.steps, resultSummary: result.summary }, result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/agents/:id/deploy-and-run", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const mcpLinks = await storage.getAgentMcpServers(req.params.id);
      const mcpServerIds = mcpLinks.map((l: any) => l.serverId);

      const rtConfig = (agent.runtimeConfig as Record<string, any>) || {};
      const prompt = rtConfig.prompt || agent.systemPrompt || agent.description;
      if (!prompt) {
        return res.status(400).json({ error: "Agent has no task prompt, system prompt, or description configured. Cannot start runtime." });
      }

      if (!rtConfig.prompt && prompt) {
        await storage.updateAgent(req.params.id, {
          runtimeConfig: { ...rtConfig, prompt },
        });
      }

      const deployments = await storage.getDeployments();
      let deployment = deployments.find(d => d.agentId === req.params.id && (d.status === "deployed" || d.status === "pending"));

      if (!deployment) {
        const industry = (agent as any).industry || req.body.industry || "technology";
        deployment = await storage.createDeployment({
          agentId: req.params.id,
          agentName: agent.name,
          environment: "production",
          industry,
          status: "pending",
          version: agent.currentVersion || "1.0.0",
          // releaseNotes (not in schema): `Auto-deployment for ${agent.name}`,
          
        });
        const depVersion = deployment.version || agent.currentVersion || "1.0.0";
        await storage.ensureAgentVersion(req.params.id, depVersion, "active");
      }

      if (deployment.status !== "deployed") {
        const pipelineStages = Array.isArray(deployment.pipelineStages)
          ? (deployment.pipelineStages as any[]).map(s => ({ ...s, status: "passed", completedAt: new Date().toISOString(), attestation: "Auto-approved by Deploy & Run" }))
          : [];
        deployment = await storage.updateDeployment(deployment.id, {
          pipelineStages,
          pipelineComplete: true,
          status: "deployed",
          deployedAt: new Date(),
        }) as any;
        await storage.updateAgent(req.params.id, { status: "deployed" });
      }

      const richSystemPrompt = buildAgentSystemPrompt(agent);
      stopAgentRuntime(deployment!.id);
      const runtimeResult = await startAgentRuntime(deployment!.id, richSystemPrompt);

      res.json({
        deployment,
        runtimeStarted: runtimeResult.started,
        runtimeMessage: runtimeResult.message,
        agentStatus: "deployed",
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/agents/:id/run-test", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const rtConfig = (agent.runtimeConfig as Record<string, any>) || {};
      const isTeamAgent = agent.agentType === "team" && Array.isArray(rtConfig.orchestration?.workerIds) && rtConfig.orchestration.workerIds.length > 0;

      const mcpLinks = await storage.getAgentMcpServers(req.params.id);
      const mcpServerIds = mcpLinks.map((l: any) => l.serverId);

      const prompt = req.body?.prompt || rtConfig.prompt || agent.systemPrompt || agent.description;
      if (!prompt) {
        return res.status(400).json({ error: "Agent has no task prompt configured. Set a prompt in runtime config or provide one in the request." });
      }

      const richSystemPrompt = buildAgentSystemPrompt(agent);

      let result: { steps: any[]; success: boolean; summary: any; promptInputs?: any };

      if (isTeamAgent) {
        const teamRuntimeAgent: RuntimeAgent = {
          deploymentId: "test-run",
          agentId: req.params.id,
          agentName: agent.name,
          blueprintId: rtConfig.orchestration?.blueprintId || undefined,
          mcpServerIds,
          intervalMs: 0,
          industry: (agent as any).industry || undefined,
          prompt,
          agentSystemPrompt: richSystemPrompt,
          outcomeId: (agent as any).outcomeId || undefined,
          agentType: "team",
          runtimeConfig: rtConfig,
          ontologyTags: Array.isArray(agent.ontologyTags) ? (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) : [],
        };
        result = await executeTeamPipeline(teamRuntimeAgent);
      } else {
        const agentOntologyTags = Array.isArray(agent.ontologyTags) ? (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) : [];
        result = await executePromptWithMcp(
          req.params.id,
          "test-run",
          undefined,
          mcpServerIds,
          prompt,
          (agent as any).industry || undefined,
          richSystemPrompt,
          { ontologyLabels: agentOntologyTags.map(t => t.conceptLabel), maxToolIterations: agent.maxToolIterations ?? 5 },
        );
      }

      const toolCalls = result.steps
        .filter((s: any) => s.type === "api_call" && s.mcpResolved)
        .map((s: any) => ({ tool: s.mcpTool, server: s.mcpServer, input: s.input, output: s.output, status: s.status, error: s.error }));

      const testAnalysisStep = result.steps.find((s: any) => s.type === "ai_analysis" && s.status === "completed");
      const orchestrationSummary = result.steps.find((s: any) => s.type === "orchestration_summary")?.output?.finalOutput;
      const testAnalysisText = testAnalysisStep?.output?.summary || testAnalysisStep?.output?.analysis || orchestrationSummary || result.summary?.analysis?.summary || result.summary?.analysis?.analysis || "";

      await storage.createTrace({
        agentId: req.params.id,
        environment: "test",
        status: result.success ? "completed" : "failed",
        latencyMs: result.summary?.latencyMs || 0,
        inputSummary: isTeamAgent
          ? `Team Pipeline Test: ${agent.name} (${rtConfig.orchestration?.workerIds?.length || 0} workers)`
          : `Test Run: ${prompt.length > 120 ? prompt.substring(0, 117) + "..." : prompt}`,
        outputSummary: typeof testAnalysisText === "string" && testAnalysisText.length > 0 ? testAnalysisText : `${toolCalls.length} tools called | ${result.summary?.passedSteps}/${result.summary?.totalSteps} steps`,
        stepsJson: result.steps,
        modelId: "gpt-4.1",
        promptInputs: result.promptInputs || {
          systemPrompt: richSystemPrompt || prompt,
          userMessage: prompt,
          contextVariables: {
            industry: (agent as any).industry || "general",
            testRun: true,
            ...(isTeamAgent ? { teamExecution: true, workerCount: rtConfig.orchestration?.workerIds?.length || 0, pattern: rtConfig.orchestration?.pattern || "supervisor" } : {}),
          },
        },
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
      });

      res.json({
        success: result.success,
        summary: result.summary,
        steps: result.steps,
        ...(isTeamAgent ? { teamExecution: true, workersExecuted: result.summary?.workersExecuted || 0 } : {}),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/agents/:id/kpi-contributions", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      if (!agent.outcomeId) {
        return res.json({ outcomeId: null, kpis: [], agentContribution: 0, totalBoundAgents: 0 });
      }

      const kpis = await storage.getKpisByOutcome(agent.outcomeId);
      const traces = await storage.getTracesByAgent(req.params.id);
      const allAgents = await storage.getAgents();
      const boundAgents = allAgents.filter(a => a.outcomeId === agent.outcomeId);
      const successfulTraces = traces.filter(t => t.status === "completed" || t.status === "success");

      const kpiContributions = kpis.map(kpi => {
        const agentTraceCount = successfulTraces.length;
        const totalBoundAgentCount = boundAgents.length || 1;
        const successRate = traces.length > 0 ? successfulTraces.length / traces.length : 0;
        const agentShareOfTeam = 1 / totalBoundAgentCount;

        // Detect inverse / lower-is-better KPIs (incidents, time, latency, errors)
        const isInverse = kpi.targetOperator === "<=" || kpi.targetOperator === "<"
          || /time|latency|incident|error|fail/i.test(kpi.name || "");

        let agentContribution = 0;

        if (kpi.unit === "percent") {
          agentContribution = Math.round((kpi.target || 100) * successRate * agentShareOfTeam * 10) / 10;
        } else if (kpi.unit === "hours" || kpi.unit === "minutes") {
          // For time KPIs show this agent's actual measured latency in the KPI unit
          const avgLatencyMs = traces.length > 0 ? traces.reduce((s, t) => s + (t.latencyMs || 0), 0) / traces.length : 0;
          agentContribution = Math.round((kpi.unit === "hours" ? avgLatencyMs / 3600000 : avgLatencyMs / 60000) * 100) / 100;
        } else if (kpi.unit === "USD" || kpi.unit === "usd") {
          agentContribution = Math.round((kpi.target || 0) * successRate * agentShareOfTeam);
        } else if (isInverse) {
          // For inverse count/numeric KPIs (e.g. incidents): agent contributes 0 when successRate=1
          agentContribution = Math.round(Math.max(0, (1 - successRate)) * (kpi.target || 0) * 100) / 100;
        } else {
          agentContribution = Math.round((kpi.target || 0) * successRate * agentShareOfTeam * 100) / 100;
        }

        const currentValue = kpi.currentValue ?? 0;
        // Use DB-stored currentValue when available; otherwise estimate
        const estimatedCurrent = kpi.currentValue != null ? kpi.currentValue
          : isInverse ? agentContribution
          : Math.min(agentContribution * totalBoundAgentCount, kpi.target || 0);

        // Compute progress correctly for inverse vs normal KPIs
        let progressPct: number;
        if (isInverse) {
          // Lower-is-better: currentValue <= target is good (100%), currentValue > target is bad
          if (kpi.target == null) {
            progressPct = 100;
          } else if (kpi.target === 0) {
            progressPct = estimatedCurrent === 0 ? 100 : Math.max(0, Math.round(100 - estimatedCurrent * 100));
          } else if (estimatedCurrent <= kpi.target) {
            progressPct = 100; // at or ahead of target
          } else {
            progressPct = Math.max(0, Math.round((kpi.target / estimatedCurrent) * 1000) / 10);
          }
        } else {
          progressPct = kpi.target ? Math.min(100, Math.round((estimatedCurrent / kpi.target) * 1000) / 10) : 0;
        }

        const agentSharePct = isInverse
          ? 100 // this agent owns its own provisioning time
          : (estimatedCurrent > 0 ? Math.round((agentContribution / estimatedCurrent) * 1000) / 10 : 0);

        return {
          kpiId: kpi.id,
          kpiName: kpi.name,
          unit: kpi.unit,
          target: kpi.target,
          currentValue: Math.round(estimatedCurrent * 100) / 100,
          baseline: kpi.baseline || 0,
          weight: kpi.weight || 1,
          progressPct,
          agentContribution,
          agentSharePct: Math.min(100, agentSharePct),
          agentTraces: agentTraceCount,
          status: progressPct >= 100 ? "met" : progressPct >= 80 ? "on_track" : progressPct >= 50 ? "at_risk" : "behind",
        };
      });

      for (const kc of kpiContributions) {
        if (kc.currentValue > 0) {
          const kpiRecord = kpis.find(k => k.id === kc.kpiId);
          if (kpiRecord && (!kpiRecord.currentValue || kpiRecord.currentValue === 0)) {
            await storage.updateKpi(kc.kpiId, { currentValue: kc.currentValue });
          }
        }
      }

      const overallContribution = kpiContributions.length > 0
        ? Math.round(kpiContributions.reduce((sum, k) => sum + k.progressPct * (k.weight || 1), 0) / kpiContributions.reduce((sum, k) => sum + (k.weight || 1), 0) * 10) / 10
        : 0;

      res.json({
        outcomeId: agent.outcomeId,
        outcomeName: (await storage.getOutcome(agent.outcomeId))?.name || "Unknown",
        kpis: kpiContributions,
        overallContribution,
        totalBoundAgents: boundAgents.length,
        agentSuccessfulRuns: successfulTraces.length,
        agentTotalRuns: traces.length,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/agents/:id/computed-stats", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const rawTraces = await storage.getTracesByAgent(req.params.id);
      const traces = rawTraces.sort((a, b) => {
        const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        return ta - tb;
      });
      const totalRuns = traces.length;

      if (totalRuns === 0) {
        return res.json({
          healthScore: 0,
          successRate: 0,
          avgLatencyMs: 0,
          costPerRun: 0,
          totalRuns: 0,
          recentFailures: 0,
          hasData: false,
        });
      }

      const isSuccess = (s: string | null) => s === "completed" || s === "success";
      const isFailed = (s: string | null) => s === "failed" || s === "error";

      const successfulRuns = traces.filter(t => isSuccess(t.status));
      const failedRuns = traces.filter(t => isFailed(t.status));
      const successRate = successfulRuns.length / totalRuns;

      const tracesWithLatency = traces.filter(t => t.latencyMs && t.latencyMs > 0);
      const avgLatencyMs = tracesWithLatency.length > 0
        ? Math.round(tracesWithLatency.reduce((sum, t) => sum + (t.latencyMs || 0), 0) / tracesWithLatency.length)
        : 0;

      const estimateCost = (t: any): number => {
        if (t.costUsd && t.costUsd > 0) return t.costUsd;
        if (t.tokenUsage) {
          const tu = t.tokenUsage as any;
          const prompt = tu.promptTokens || tu.prompt_tokens || 0;
          const completion = tu.completionTokens || tu.completion_tokens || 0;
          return (prompt / 1000) * 0.002 + (completion / 1000) * 0.008;
        }
        const model = t.modelId || "gpt-4.1";
        if (model.includes("gpt-4")) return 0.035;
        if (model.includes("gpt-3.5")) return 0.005;
        return 0.02;
      };

      const costs = traces.map(t => estimateCost(t));
      const costPerRun = costs.reduce((sum, c) => sum + c, 0) / costs.length;

      const recentTraces = traces.slice(-10);
      const recentFailures = recentTraces.filter(t => isFailed(t.status)).length;
      const recentSuccessRate = recentTraces.length > 0
        ? recentTraces.filter(t => isSuccess(t.status)).length / recentTraces.length
        : 0;

      let healthScore = Math.round(
        (successRate * 40) +
        (recentSuccessRate * 30) +
        ((avgLatencyMs < 5000 ? 1 : avgLatencyMs < 15000 ? 0.7 : 0.4) * 20) +
        ((recentFailures === 0 ? 1 : recentFailures <= 2 ? 0.6 : 0.3) * 10)
      );
      healthScore = Math.max(0, Math.min(100, healthScore));

      await storage.updateAgent(req.params.id, {
        healthScore,
        successRate,
        avgLatencyMs,
        costPerRun,
        totalRuns,
      });

      res.json({
        healthScore,
        successRate,
        avgLatencyMs,
        costPerRun,
        totalRuns,
        recentFailures,
        totalCost: costs.reduce((sum, c) => sum + c, 0),
        hasData: true,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/agents/:id/runtime-status", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const deployments = await storage.getDeployments();
      const agentDeployments = deployments
        .filter(d => d.agentId === req.params.id)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      const activeDeployment = agentDeployments.find(d => d.status === "deployed");

      const runs = await storage.getAgentRuntimeRuns(req.params.id);
      const recentRuns = runs
        .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())
        .slice(0, 10);

      const rtConfig = (agent.runtimeConfig as Record<string, any>) || {};
      const isActive = activeDeployment ? isRuntimeActive(activeDeployment.id) : false;

      const mcpLinks = await storage.getAgentMcpServers(req.params.id);
      const hasPrompt = !!(rtConfig.prompt || agent.systemPrompt || agent.description);
      const hasMcpServers = mcpLinks.length > 0;
      const linkedKbs = await storage.getAgentKnowledgeBases(req.params.id);
      const hasKnowledgeBases = linkedKbs.length > 0;

      res.json({
        isActive,
        deploymentId: activeDeployment?.id || null,
        deploymentStatus: activeDeployment?.status || null,
        lastRun: recentRuns[0] || null,
        recentRuns,
        scheduleIntervalMinutes: rtConfig.scheduleIntervalMinutes || 0,
        readiness: {
          hasPrompt,
          hasMcpServers,
          hasKnowledgeBases,
          isDeployed: !!activeDeployment,
          canRun: hasPrompt && (hasMcpServers || hasKnowledgeBases),
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // === Canary Deployment Console Routes ===

  router.get("/api/canary-deployments", async (req, res) => {
    try {
      const deployments = await storage.getCanaryDeployments();
      res.json(deployments);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/canary-deployments/:id", async (req, res) => {
    try {
      const deployment = await storage.getCanaryDeployment(req.params.id);
      if (!deployment) return res.status(404).json({ error: "Not found" });
      res.json(deployment);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/canary-deployments", async (req, res) => {
    try {
      const deployment = await storage.createCanaryDeployment(req.body);
      res.json(deployment);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch("/api/canary-deployments/:id", async (req, res) => {
    try {
      const data = { ...req.body };
      if (data.lastPromotedAt && typeof data.lastPromotedAt === "string") {
        data.lastPromotedAt = new Date(data.lastPromotedAt);
      }
      if (data.completedAt && typeof data.completedAt === "string") {
        data.completedAt = new Date(data.completedAt);
      }
      const updated = await storage.updateCanaryDeployment(req.params.id, data);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/api/canary-deployments/:id", async (req, res) => {
    try {
      const result = await storage.deleteCanaryDeployment(req.params.id);
      res.json({ success: result });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/ai/canary-analyze", async (req, res) => {
    try {
      const { deploymentId, industry } = req.body;
      const deployment = deploymentId ? await storage.getCanaryDeployment(deploymentId) : null;

      const industryContext: Record<string, any> = {
        healthcare: {
          kpis: ["clinical_accuracy", "guideline_adherence", "patient_satisfaction", "escalation_rate"],
          safetyThresholds: { max_patient_exposure: 50, rollback_on_safety_event: true },
          rollbackRules: ["Rollback immediately if any patient safety event occurs", "Rollback if clinical accuracy drops below 95%", "Rollback if guideline adherence rate drops below 98%"],
          promotionRules: ["Promote only after 24h with zero safety events", "Require clinical accuracy >= 97% for promotion", "Minimum 100 interactions before promotion"],
        },
        financial_services: {
          kpis: ["trade_execution_accuracy", "compliance_violation_rate", "client_suitability_score", "risk_assessment_accuracy"],
          safetyThresholds: { max_aum_exposure: 1000000, compliance_floor: 99.9 },
          rollbackRules: ["Rollback if regulatory compliance rate drops below 99.9%", "Rollback if any trade execution error occurs", "Rollback if client suitability score drops below 90%"],
          promotionRules: ["Promote only after 48h with zero compliance violations", "Require suitability score >= 95% for promotion", "Minimum 500 interactions before promotion"],
        },
        manufacturing: {
          kpis: ["defect_detection_accuracy", "false_positive_rate", "mean_time_to_detection", "safety_compliance_rate"],
          safetyThresholds: { no_candidate_during_safety_critical: true, max_line_exposure: 2 },
          rollbackRules: ["Never route to candidate during safety-critical operations", "Rollback if defect detection accuracy drops below 99%", "Rollback if false positive rate exceeds 5%"],
          promotionRules: ["Promote only after 72h with zero safety incidents", "Require defect detection >= 99.5% for promotion", "Test on non-critical lines first"],
        },
        insurance: {
          kpis: ["claims_accuracy", "fraud_detection_rate", "processing_time", "customer_satisfaction"],
          safetyThresholds: { max_claim_exposure: 500000, fraud_detection_floor: 95 },
          rollbackRules: ["Rollback if claims accuracy drops below 98%", "Rollback if fraud detection rate drops below 95%"],
          promotionRules: ["Promote after 48h with zero claim errors", "Minimum 200 claims processed before promotion"],
        },
        retail: {
          kpis: ["recommendation_accuracy", "conversion_rate", "customer_satisfaction", "inventory_accuracy"],
          safetyThresholds: { max_revenue_exposure: 100000 },
          rollbackRules: ["Rollback if conversion rate drops more than 10%", "Rollback if customer satisfaction drops below 4.0"],
          promotionRules: ["Promote after 24h with stable metrics", "Minimum 1000 interactions before promotion"],
        },
      };

      const selectedIndustry = industry || deployment?.industry || "financial_services";
      const context = industryContext[selectedIndustry] || industryContext.financial_services;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert in canary deployment analysis for ${selectedIndustry} AI agents. Analyze the deployment metrics and provide recommendations.`
          },
          {
            role: "user",
            content: `Analyze this canary deployment and provide KPI metrics, blast radius assessment, and promotion/rollback recommendation.

Industry: ${selectedIndustry}
Industry KPIs: ${JSON.stringify(context.kpis)}
Safety Thresholds: ${JSON.stringify(context.safetyThresholds)}
Current Deployment: ${deployment ? JSON.stringify({ name: deployment.name, currentTraffic: deployment.currentTrafficPercent, status: deployment.status, candidate: deployment.candidateVersion, baseline: deployment.baselineVersion }) : 'New deployment being configured'}

Respond in JSON:
{
  "kpiBaseline": { [kpi]: { "value": number, "trend": "up"|"down"|"stable", "unit": string } },
  "kpiCandidate": { [kpi]: { "value": number, "trend": "up"|"down"|"stable", "unit": string } },
  "blastRadius": {
    "customers": number, "interactions": number, "revenue": number, "regulatoryScope": string,
    "stages": [{ "percent": number, "customers": number, "interactions": number, "revenue": number, "regulatoryScope": string }]
  },
  "recommendation": "promote"|"hold"|"rollback",
  "reasoning": string,
  "riskScore": number,
  "safetyGateStatus": [{ "gate": string, "passed": boolean, "detail": string }]
}`
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const analysis = JSON.parse(response.choices[0].message.content || "{}");

      if (deployment) {
        await storage.updateCanaryDeployment(deployment.id, {
          kpiBaseline: analysis.kpiBaseline || {},
          kpiCandidate: analysis.kpiCandidate || {},
          blastRadius: analysis.blastRadius || {},
        } as any);
      }

      res.json({ analysis, industryContext: context });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Healing Pipelines CRUD
export default router;