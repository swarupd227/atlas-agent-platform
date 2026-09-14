/**
 * Propose an agent team for an outcome: gather the organization's templates,
 * skills, policies, connectors, agents and knowledge bases, rank what is
 * relevant, ask the model for an orchestrator, workers and a pipeline,
 * validate and enrich the plan, and save it as the outcome's draft proposal.
 *
 * Moved from POST /api/ai/propose-agents (server/routes/improvements.ts) so
 * the Astra Workspace can propose a team without an HTTP request. Progress,
 * errors and the result are reported through onEvent as the same events the
 * route streams: {type:"progress"}, {type:"error"}, {type:"done", result}.
 * The body keeps its original indentation because it holds the model prompts
 * as multi-line template strings.
 */
import OpenAI from "openai";
import { z } from "zod";
import { storage } from "./storage";
import { getDefaultOrgId } from "./auth";
import { parseProposalContent } from "./team-proposal-parse";

let openaiClient: OpenAI | null = null;
/** Created on first use, so importing this module needs no API key. */
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      // Prefer the Replit AI-gateway vars when present (legacy), otherwise fall
      // back to a direct OpenAI API key. baseURL undefined => api.openai.com.
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
    });
  }
  return openaiClient;
}

export interface ProposeTeamInput {
  outcomeContract?: any;
  kpis?: any[];
  feedback?: string;
  previousPlan?: any;
  industryContext?: { industryId?: string; subVertical?: string; frameworks?: any; jurisdictions?: any; departments?: any; [key: string]: any } | null;
  templateId?: string;
  processFlowSteps?: any[];
}

export type ProposeTeamEvent =
  | { type: "progress"; status: string; message: string; [key: string]: unknown }
  | { type: "error"; error: string; details?: string; timeout?: boolean }
  | { type: "done"; result: any };

export async function proposeTeam(
  input: ProposeTeamInput,
  opts: { orgId: string | undefined; onEvent: (event: ProposeTeamEvent) => void },
): Promise<void> {
    const sendEvent = (data: any) => opts.onEvent(data);
    try {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        sendEvent({ type: "error", error: "AI assistant is not configured" });
        return;
      }
      const { outcomeContract, kpis, feedback, previousPlan, industryContext, templateId, processFlowSteps } = input;

      sendEvent({ type: "progress", status: "gathering_context", message: "Gathering templates, skills, policies, and connected systems..." });
      const orgId = opts.orgId;
      const [templates, allSkills, allMcpServers, allPolicies, allAgents, ragPipelines, allKnowledgeBases] = await Promise.all([
        storage.getAgentTemplates(),
        storage.getSkills(orgId),
        // Only connectors this tenant can use -- the model proposes from this list.
        storage.getMcpServers(orgId ?? getDefaultOrgId()),
        storage.getPolicies(orgId),
        storage.getAgents(orgId),
        storage.getRagPipelines(),
        storage.getKnowledgeBases(orgId),
      ]);
      sendEvent({ type: "progress", status: "context_gathered", message: "Context gathered. Scoring relevance and building the plan..." });

      const preSelectedTemplate = templateId
        ? (templates as any[]).find((t) => t.id === templateId) ?? null
        : null;

      const industryId = industryContext?.industryId || outcomeContract?.industry || "general";
      let ontologyConcepts: any[] = [];
      let ontologyEnhancements: any[] = [];
      try {
        // Sub-vertical-scoped when the caller passed one (e.g. "Workers Compensation"
        // within Insurance) -- storage.getOntologyConcepts already unions industry-wide
        // concepts (subVerticals null/empty) with ones tagged to this specific
        // sub-vertical, and falls back to the plain industry-wide fetch when
        // subVertical is absent, so this is safe for callers that never set it.
        ontologyConcepts = await storage.getOntologyConcepts(industryId, industryContext?.subVertical);
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
      // (prevents cross-demo MCP tools — e.g. BlackRock IAM pipeline — from leaking into unrelated agent plans).
      // Also require at least 1 keyword match (score >= 1) so zero-relevance servers are never included.
      const rankedMcpServersWithScores = allMcpServers
        .filter(s => !s.industryId || s.industryId === industryId)
        .map(s => ({ server: s, score: relevanceScore(s) }))
        .filter(x => x.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      // Preserve scores so the mandatory-blueprint gate can use them later
      const mcpServerScoreMap = new Map<string, number>(rankedMcpServersWithScores.map(x => [x.server.name, x.score]));
      const rankedMcpServers = rankedMcpServersWithScores.map(x => x.server);
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

      // Must match resolveMatchedSkills' status filter in
      // create-team-from-proposals, which only binds active skills. Without the
      // status check here the prompt advertised draft and deprecated skills the
      // LLM would then dutifully name in matchedSkills, and every one of them
      // was silently dropped at bind time -- the agent shipped with an empty
      // Skills tab and nothing anywhere saying why. Offer only what can bind.
      const industrySkills = allSkills
        .filter(s => s.status === "active")
        .filter(s => s.industry === industryId || s.industry === "cross_industry")
        .sort((a, b) => relevanceScore(b) - relevanceScore(a))
        // Ranked once per OUTCOME, not per agent, so every agent on the team
        // sees the same candidates. 6 was fine when an industry had a handful
        // of skills; with a real library (Insurance now has 19) it means the
        // right skill for a given worker is often simply not offered -- a
        // Coverage Verification agent was handed straight-through-underwriting
        // because coverage-verification ranked 7th on overall outcome keywords.
        // Widening the window is the cheap mitigation; per-agent ranking is the
        // real fix and is a larger change.
        .slice(0, 14);
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
        // Carry the outcome-relevance score so the mandatory-blueprint gate can enforce a minimum
        const outcomeRelevanceScore = mcpServerScoreMap.get(serverName) ?? 0;
        return {
          server: serverName,
          serverDescription,
          declaredStageCount,
          declaredStages,
          coveredSystems,
          tools: toolSlice,
          outcomeRelevanceScore,
        };
      });

      // Pre-compute agent blueprint and coverage ground truth for injection into prompt.
      // MANDATORY-BLUEPRINT GUARD: require outcomeRelevanceScore >= 3 before a staged-pipeline
      // server can override the LLM's agent design.  A score < 3 means the server only shares
      // generic words (e.g. "service", "agent") with the outcome — not enough to justify locking
      // the plan into that server's IAM/financial/domain-specific pipeline stages.
      // This prevents cross-demo pollution (e.g. BlackRock IAM stages appearing in a
      // "Field Service Warranty Claim Recovery" outcome).
      const MANDATE_MIN_RELEVANCE = 3;
      interface StagedPipeline { server: string; count: number; stages: string[]; coveredSystems: string[] }
      const stagedPipelines: StagedPipeline[] = mcpToolSummary
        .filter(s =>
          s.declaredStageCount &&
          s.declaredStageCount >= 2 &&
          s.declaredStages.length >= 2 &&
          s.outcomeRelevanceScore >= MANDATE_MIN_RELEVANCE
        )
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

${processFlowSteps.map((s: any, i: number) => `Step ${i + 1} [${s.type || "action"}]: "${s.label}" — ${s.description || ""}${s.actor ? ` (Owner: ${s.actor})` : ""}${s.config?.skillName ? ` [REQUIRED SKILL: "${s.config.skillName}" — the business user explicitly bound this skill to this step; the agent handling it MUST include this exact name in matchedSkills]` : ""}${s.config?.kbName ? ` [REQUIRED KNOWLEDGE BASE: id="${s.config.kbId}" name="${s.config.kbName}" — the business user explicitly bound this KB to this step; the agent handling it MUST include this exact {id, name} in suggestedKnowledgeBases]` : ""}`).join("\n")}

IMPORTANT: Name agents using the business vocabulary above. Avoid generic names like "Worker Agent 1". Prefer names like "Invoice Validation Agent", "Risk Assessment Agent" etc., derived from the step labels above. Any step marked REQUIRED SKILL or REQUIRED KNOWLEDGE BASE is a business-user commitment, not a suggestion -- the resulting agent's matchedSkills / suggestedKnowledgeBases MUST include those exact values.
The orchestrator's own "workflowSteps" must include one non-empty bullet per step above, IN ORDER, including "expert_approval"/human-checkpoint steps -- those don't get a dedicated worker agent, so describe them from the orchestrator's perspective instead, e.g. "Route to human approval: <step label>". Never leave a workflowSteps entry blank.
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
      "isHumanCheckpoint": "boolean - true ONLY if this step is a MANUAL decision made by a real person (e.g. 'manager approval', 'compliance sign-off', 'underwriter review') that the outcome/description explicitly calls out as requiring a human, not an automated LLM judgment call. false for every other agent, including AI-judged decision/routing/scoring steps.",
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
    "edges": [{"from": "string", "to": "string", "label": "string", "type": "sequential | parallel | conditional", "branchCondition": "string | null - ONLY for type=conditional: the plain-English condition, e.g. 'invoice amount is more than $10,000'", "branchRule": {"field": "string - exact field name from the source agent's outputSchema.fields above", "operator": "> | < | >= | <= | == | != | contains | not_contains", "value": "string | number | boolean"} | null}],
    "parallelGroups": [["string - agent roles that execute concurrently"], ["string - next group after previous completes"]],
    "executionGraph": [{"stage": 0, "agents": ["string - agent roles in this tier"], "waitForAll": true}],
    "errorHandling": "string",
    "handoffRules": "string"
  }
}
\`\`\`

═══════════════════════════════════════════
CONDITIONAL EDGES (branchCondition / branchRule)
═══════════════════════════════════════════
Mark an edge "type": "conditional" whenever the handoff only happens under some condition (an approval threshold, a pass/fail check, a category split, etc). For every conditional edge, set "branchCondition" to a short plain-English sentence a business user would recognize.
Also try to set "branchRule" — a single deterministic comparison — whenever the condition is a numeric, boolean, or string comparison against a field the SOURCE agent's outputSchema.fields actually declares (e.g. {"field": "invoiceAmount", "operator": ">", "value": 10000}). This makes the branch auditable and reliable instead of re-evaluated by an LLM on every run.
Leave "branchRule" as null (branchCondition only) when the condition genuinely requires judgment the source agent's structured output can't answer directly (sentiment, open-ended quality, "looks suspicious", etc) — never invent a field name that isn't in that agent's outputSchema.

═══════════════════════════════════════════
HUMAN CHECKPOINTS (isHumanCheckpoint)
═══════════════════════════════════════════
When the outcome/description explicitly requires a real person to make a decision — "manager approval", "requires sign-off", "must be a human approval step, not an automated one", "underwriter must review" — propose a dedicated agent for that step and set its "isHumanCheckpoint" to true. This is different from an agent that automates a judgment call (e.g. a fraud-scoring or risk-tiering agent): those are false. A true human checkpoint agent should still get a minimal outputSchema (e.g. {approved: boolean}) describing what the human's decision produces, since downstream conditional edges route on that field, but its systemPrompt/workflowSteps should describe presenting the case for a human decision, not making the decision itself.

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
6. SKILL BINDING: Assign real skills from the Skills Library, matching each agent's specific job to the skill's description and domain -- do not give every agent the same skill. performanceScore is a measured eval pass rate where one exists; 0 means NOT YET EVALUATED, not "poor", so never prefer a scored skill over a better-matching unscored one on that basis alone.
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

      // Scale the request budget to the apparent size of the ask: a fixed
      // 120s / 7000-token ceiling works for small teams but silently times
      // out or truncates larger ones (confirmed empirically: ~13 agents
      // succeeds under the old fixed budget, ~22+ does not, every time).
      const estimatedAgentCount = (() => {
        if (stagedPipelines.length > 0) return stagedPipelines[0].count;
        if (Array.isArray(processFlowSteps) && processFlowSteps.length > 0) return processFlowSteps.length;
        const desc = String(outcomeContract?.description || "");
        const agentMentions = (desc.match(/\bAgent\b/g) || []).length;
        return Math.max(agentMentions, 4);
      })();
      const openAITimeoutMs = Math.min(240_000, Math.max(90_000, 90_000 + estimatedAgentCount * 5_000));
      const openAIMaxTokens = Math.min(16_000, Math.max(7_000, 2_000 + estimatedAgentCount * 500));

      async function callProposeAgentsOnce() {
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), openAITimeoutMs);
        try {
          return await getOpenAI().chat.completions.create({
            model: "gpt-4.1-mini",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMsg },
            ],
            max_tokens: openAIMaxTokens,
          }, { signal: abort.signal });
        } finally {
          clearTimeout(timeout);
        }
      }

      sendEvent({ type: "progress", status: "calling_ai", message: `Drafting your team with AI (up to ~${Math.round(openAITimeoutMs / 1000)}s for a plan this size)...`, estimatedAgentCount });

      let openAIResp: Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>>;
      try {
        openAIResp = await callProposeAgentsOnce();
      } catch (firstErr: any) {
        const isTransient = firstErr?.name === "AbortError" || firstErr?.code === "ERR_CANCELED" || (typeof firstErr?.status === "number" && firstErr.status >= 500);
        if (!isTransient) throw firstErr;
        // One automatic retry before surfacing a failure to the user — absorbs
        // a single slow/busy moment on the model provider's side instead of
        // making the user retype their description and try again themselves.
        console.warn(`[propose-agents] First attempt failed (${firstErr?.name || firstErr?.status}), retrying once (timeout=${openAITimeoutMs}ms, maxTokens=${openAIMaxTokens}, estimatedAgents=${estimatedAgentCount})...`);
        sendEvent({ type: "progress", status: "retrying", message: "First attempt was slow to respond — retrying once..." });
        try {
          openAIResp = await callProposeAgentsOnce();
        } catch (secondErr: any) {
          if (secondErr?.name === "AbortError" || secondErr?.code === "ERR_CANCELED") {
            sendEvent({
              type: "error",
              error: `This team description looks too large to draft in one request (roughly ${estimatedAgentCount} agents). Try describing a smaller team, or split it into stages and combine them afterward.`,
              timeout: true,
            });
            return;
          }
          throw secondErr;
        }
      }
      sendEvent({ type: "progress", status: "ai_responded", message: "AI response received. Validating and enriching the plan..." });
      const content = openAIResp.choices[0]?.message?.content ?? "";
      // finish_reason "length" is OpenAI's own signal that generation was cut
      // off by max_tokens (as opposed to a genuine formatting mistake) -- the
      // authoritative way to tell "this was too big to draft in one shot"
      // apart from any other JSON-parsing failure.
      const wasTruncatedByTokenLimit = openAIResp.choices[0]?.finish_reason === "length";
      const { ok: parsedOk, value: parsed } = parseProposalContent(content);
      if (!parsedOk) {
        // Honest, actionable failure instead of a bare empty plan: tell the
        // caller (and ultimately the user) whether this looks like a
        // too-large request, since that's the single most common real
        // cause and the old generic message told users to add MORE detail
        // -- the opposite of what usually helps.
        const hint = wasTruncatedByTokenLimit
          ? `This looks like it was too large to draft in one request (roughly ${estimatedAgentCount} agents estimated). Try describing a smaller team, or split it into stages and combine them afterward.`
          : "The AI response couldn't be parsed as a valid team plan. Try rephrasing the description, or try again.";
        sendEvent({ type: "done", result: { agents: [], orchestrator: null, pipeline: null, raw: content, error: hint, likelyTooLarge: wasTruncatedByTokenLimit } });
        return;
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
        sendEvent({ type: "error", error: "Agent plan generation failed: invalid response structure", details: agentPlanValidation.error.message });
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

      // Post-process: enforce explicit step-bound skills — the prompt instructs the
      // LLM to include a step's REQUIRED SKILL in matchedSkills, but that's a
      // request, not a guarantee. A business user's explicit skill choice must
      // never be silently dropped just because the LLM didn't comply, so verify
      // it landed somewhere and force it onto the orchestrator (or first worker,
      // if there's no orchestrator) when it didn't.
      if (Array.isArray(processFlowSteps)) {
        const requiredSkillNames = Array.from(new Set(
          processFlowSteps.map((s: any) => s?.config?.skillName).filter((n: any): n is string => typeof n === "string" && n.trim().length > 0)
        ));
        const allProposedAgents = [result.orchestrator, ...(Array.isArray(result.agents) ? result.agents : [])].filter(Boolean);
        for (const skillName of requiredSkillNames) {
          const alreadyPresent = allProposedAgents.some((a: any) =>
            Array.isArray(a.matchedSkills) && a.matchedSkills.some((n: any) => String(n).toLowerCase().trim() === skillName.toLowerCase().trim())
          );
          if (!alreadyPresent) {
            const target = result.orchestrator || (Array.isArray(result.agents) ? result.agents[0] : null);
            if (target) target.matchedSkills = [...(Array.isArray(target.matchedSkills) ? target.matchedSkills : []), skillName];
          }
        }

        // Same backstop for step-bound knowledge bases -- these already carry a
        // real KB id (set in the node inspector), so no fuzzy name matching is
        // needed, just an exact id check.
        const requiredKbs = Array.from(
          new Map(
            processFlowSteps
              .map((s: any) => (s?.config?.kbId && s?.config?.kbName) ? [s.config.kbId as string, s.config.kbName as string] : null)
              .filter((e: any): e is [string, string] => !!e)
          ).entries()
        );
        for (const [kbId, kbName] of requiredKbs) {
          const alreadyPresent = allProposedAgents.some((a: any) =>
            Array.isArray(a.suggestedKnowledgeBases) && a.suggestedKnowledgeBases.some((k: any) => k?.id === kbId)
          );
          if (!alreadyPresent) {
            const target = result.orchestrator || (Array.isArray(result.agents) ? result.agents[0] : null);
            if (target) target.suggestedKnowledgeBases = [...(Array.isArray(target.suggestedKnowledgeBases) ? target.suggestedKnowledgeBases : []), { id: kbId, name: kbName }];
          }
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
        const existingPolicies = await storage.getPolicies(orgId);
        const activePolicies = existingPolicies.filter(p => p.status === "active");
        const orgLevelPolicies = activePolicies.filter(p => p.scopeType === "org" || p.scopeType === "outcome");

        const allProposedAgents = [
          ...(result.orchestrator ? [result.orchestrator] : []),
          ...(Array.isArray(result.agents) ? result.agents : []),
        ];

        const tierOrder: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
        for (const agent of allProposedAgents) {
          const policyFlags: Array<{ severity: "warn" | "error"; message: string; policyId?: string; policyName?: string }> = [];
          for (const orgPolicy of orgLevelPolicies) {
            const pj = orgPolicy.policyJson as Record<string, any> | null;
            if (!pj) continue;
            if (Array.isArray(pj.blockedAutonomyModes) && pj.blockedAutonomyModes.includes(agent.autonomyMode)) {
              policyFlags.push({ severity: "error", message: `Proposed autonomy="${agent.autonomyMode}" is blocked by policy "${orgPolicy.name}"`, policyId: orgPolicy.id, policyName: orgPolicy.name });
            }
            if (pj.maxRiskTier) {
              const agentTierVal = tierOrder[agent.riskTier] || 2;
              const maxTierVal = tierOrder[pj.maxRiskTier] || 4;
              if (agentTierVal > maxTierVal) {
                policyFlags.push({ severity: "error", message: `Proposed riskTier="${agent.riskTier}" exceeds policy "${orgPolicy.name}" max="${pj.maxRiskTier}"`, policyId: orgPolicy.id, policyName: orgPolicy.name });
              }
            }
            if (Array.isArray(pj.blockedTools) && Array.isArray(agent.tools)) {
              const agentToolsLower = agent.tools.map((t: string) => t.toLowerCase());
              const blockedMatches = (pj.blockedTools as string[]).filter((bt: string) =>
                agentToolsLower.some((at: string) => at.includes(bt.toLowerCase()) || bt.toLowerCase().includes(at))
              );
              if (blockedMatches.length > 0) {
                policyFlags.push({ severity: "error", message: `Tools [${blockedMatches.join(", ")}] are blocked by policy "${orgPolicy.name}"`, policyId: orgPolicy.id, policyName: orgPolicy.name });
              }
            }
            // toolAccessClass conflict check
            if (pj.blockedToolAccessClasses && agent.toolAccessClass) {
              const blocked: string[] = Array.isArray(pj.blockedToolAccessClasses) ? pj.blockedToolAccessClasses : [];
              if (blocked.includes(agent.toolAccessClass)) {
                policyFlags.push({ severity: "error", message: `Proposed toolAccessClass="${agent.toolAccessClass}" is blocked by policy "${orgPolicy.name}"`, policyId: orgPolicy.id, policyName: orgPolicy.name });
              }
            }
            if (pj.requiresToolAccessClass && agent.toolAccessClass && pj.requiresToolAccessClass !== agent.toolAccessClass) {
              policyFlags.push({ severity: "warn", message: `Policy "${orgPolicy.name}" recommends toolAccessClass="${pj.requiresToolAccessClass}" but proposed="${agent.toolAccessClass}"`, policyId: orgPolicy.id, policyName: orgPolicy.name });
            }
          }
          agent.policyFlags = policyFlags;
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
        // "Shared" means shared within this organization, not across tenants.
        const allBlueprints = await storage.getBlueprints(orgId ?? getDefaultOrgId());
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

      sendEvent({ type: "progress", status: "finalizing", message: "Finalizing plan and saving proposal..." });

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

      sendEvent({ type: "done", result });
    } catch (error) {
      console.error("Agent proposal error:", error);
      sendEvent({ type: "error", error: "Failed to generate agent proposals" });
    }
}
