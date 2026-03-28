import OpenAI from "openai";
import { ZodError } from "zod";
import { completeWithFallback } from "../llm-provider";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function routeAIComplete(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: { model?: string; maxTokens?: number; responseFormat?: "text" | "json"; temperature?: number },
): Promise<{ content: string; tokensUsed: { prompt: number; completion: number; total: number }; costUsd: number }> {
  const result = await completeWithFallback(messages, {
    model: options?.model,
    maxTokens: options?.maxTokens || 4096,
    responseFormat: options?.responseFormat,
    temperature: options?.temperature,
  });
  return { content: result.content, tokensUsed: result.tokensUsed, costUsd: result.costUsd };
}

function checkPatchSafety(patchData: any): string | null {
  const changeType = patchData.changeType || "";
  const desc = (patchData.description || "").toLowerCase();
  const diff = patchData.diff || {};

  if (desc.includes("expand tool permissions") || desc.includes("add tool access") ||
      (diff.after && diff.after.toolPermissions && !diff.before?.toolPermissions)) {
    return "SAFETY: Cannot expand tool permissions without explicit approval. Patch requires CRITICAL tier review.";
  }
  if (desc.includes("write-action") || desc.includes("write action") ||
      (diff.after && diff.after.writeActions !== diff.before?.writeActions)) {
    return "SAFETY: Cannot change write-action behavior without high-tier approval.";
  }
  if (desc.includes("redaction") || desc.includes("audit polic") ||
      changeType === "audit_policy_change") {
    return "SAFETY: Cannot alter redaction/audit policies autonomously.";
  }
  return null;
}

function handleZodError(res: any, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Validation error", errors: error.errors });
  }
  throw error;
}

type OntologyTagSet = {
  entity_type?: string;
  regulation?: string;
  system?: string;
  domain?: string;
  action_category?: string;
  [key: string]: string | undefined;
};

function resolveOntologyTags(
  objectType: string,
  action: string,
  opts?: {
    agentOntologyTags?: Array<{ conceptId: string; conceptLabel: string }>;
    policyDomain?: string;
    regulationId?: string;
    systemId?: string;
    details?: string;
  }
): OntologyTagSet {
  const tags: OntologyTagSet = {};

  const actionCategoryMap: Record<string, string> = {
    agent_created: "lifecycle",
    agent_updated: "lifecycle",
    eval_baseline_enqueued: "evaluation",
    eval_completed: "evaluation",
    version_created: "versioning",
    deployment_freeze: "deployment",
    deployment_unfreeze: "deployment",
    approval_auto_created: "approval",
    incident_resolved: "remediation",
    incident_reopened: "remediation",
    routing_update: "deployment",
    "marketplace.install_auto_approved": "marketplace",
    "marketplace.install_requested": "marketplace",
    "marketplace.install_approved": "marketplace",
    "marketplace.install_rejected": "marketplace",
    policy_created: "governance",
    policy_updated: "governance",
    bulk_quarantine: "operations",
    bulk_activate: "operations",
    bulk_pause: "operations",
  };
  tags.action_category = actionCategoryMap[action] || "general";

  if (opts?.agentOntologyTags && opts.agentOntologyTags.length > 0) {
    tags.entity_type = opts.agentOntologyTags.map(t => t.conceptLabel).join(", ");
  }

  if (opts?.policyDomain) {
    tags.domain = opts.policyDomain;
  }

  if (opts?.regulationId) {
    tags.regulation = opts.regulationId;
  }

  if (opts?.systemId) {
    tags.system = opts.systemId;
  }

  const systemMap: Record<string, string> = {
    agent: "AGENT_RUNTIME",
    deployment: "DEPLOYMENT_PIPELINE",
    outcome: "OUTCOME_ENGINE",
    incident: "HEALING_ENGINE",
    policy: "GOVERNANCE_ENGINE",
    marketplace_server: "MCP_MARKETPLACE",
    blueprint: "BLUEPRINT_STUDIO",
    eval: "EVAL_ENGINE",
  };
  if (!tags.system && systemMap[objectType]) {
    tags.system = systemMap[objectType];
  }

  if (!tags.regulation && opts?.details) {
    const regPatterns = [
      "GLBA", "GDPR", "HIPAA", "SOX", "PCI", "REG_DD", "REG_CC",
      "BSA", "AML", "CIP", "E-SIGN", "CCPA", "NAIC", "HITECH",
      "EU AI Act", "Dodd-Frank", "FDA", "OSHA",
    ];
    for (const pat of regPatterns) {
      if (opts.details.toUpperCase().includes(pat.toUpperCase())) {
        tags.regulation = pat;
        break;
      }
    }
  }

  return tags;
}

async function generateKpiAlignedEvalSuite(agentId: string, outcomeId: string): Promise<{ suite: any; testCases: any[] } | null> {
  const outcome = await storage.getOutcome(outcomeId);
  if (!outcome) return null;

  const kpis = await storage.getKpisByOutcome(outcomeId);
  if (kpis.length === 0) return null;

  const agent = await storage.getAgent(agentId);
  if (!agent) return null;

  const testCases: Array<{ name: string; inputData: unknown; expectedOutput: unknown; tags: string[]; weight: number; origin: string; severity: string; locked?: boolean; regulationRef?: string }> = [];

  const ontologyTags = Array.isArray(agent.ontologyTags) ? (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string; category?: string }>) : [];
  for (const tag of ontologyTags) {
    try {
      const concept = await storage.getOntologyConcept(tag.conceptId);
      if (!concept) continue;
      const regs = Array.isArray(concept.linkedRegulations) ? (concept.linkedRegulations as Array<{ id?: string; ref?: string; name?: string; section?: string; description?: string }>) : [];
      for (const reg of regs) {
        const regRef = reg.ref || reg.id || reg.name || "Unknown";
        const regSection = reg.section || "";
        const regDesc = reg.description || reg.name || regRef;
        const regLabel = regSection ? `[${regRef} ${regSection}]` : `[${regRef}]`;

        testCases.push({
          name: `${regLabel} ${regDesc} - Compliance Boundary`,
          inputData: {
            type: "ontology_regulation_test",
            conceptId: tag.conceptId,
            conceptLabel: tag.conceptLabel,
            regulation: regRef,
            section: regSection,
            scenario: `Verify compliant behavior under ${regRef} requirements for ${tag.conceptLabel}`,
          },
          expectedOutput: {
            compliant: true,
            regulationRef: regRef,
            expectedBehavior: `Agent must comply with ${regRef} requirements when handling ${tag.conceptLabel} operations`,
          },
          tags: ["ontology_mandated", "regulatory", tag.conceptLabel, regRef],
          weight: 2,
          origin: "ontology_regulation",
          severity: "critical",
          locked: true,
          regulationRef: `${regRef} ${regSection}`.trim(),
        });
      }
    } catch {
    }
  }

  for (const kpi of kpis) {
    const kpiNameLower = (kpi.name || "").toLowerCase();
    const threshold = kpi.slaThreshold ?? kpi.target;
    const target = kpi.target;
    const unit = kpi.unit || "count";

    const isPercentageKpi = kpiNameLower.includes("accuracy") || kpiNameLower.includes("rate") || kpiNameLower.includes("success") ||
      unit.toLowerCase() === "percent" || unit === "%" || unit.toLowerCase() === "percentage";
    const isLatencyKpi = kpiNameLower.includes("latency") || kpiNameLower.includes("time") || kpiNameLower.includes("response") ||
      unit.toLowerCase() === "ms" || unit.toLowerCase() === "seconds";
    const isVolumeKpi = kpiNameLower.includes("volume") || kpiNameLower.includes("count") || kpiNameLower.includes("throughput") ||
      kpiNameLower.includes("processed") || kpiNameLower.includes("qualified");
    const isCostKpi = kpiNameLower.includes("cost") || unit.toLowerCase() === "usd" || unit === "$";

    if (isPercentageKpi) {
      const belowThreshold = Math.max(0, threshold - 1);
      const atThreshold = threshold;
      const aboveThreshold = Math.min(100, threshold + 1);

      testCases.push({
        name: `${kpi.name} - Below SLA Boundary (${belowThreshold}${unit})`,
        inputData: { type: "kpi_boundary_test", kpiName: kpi.name, kpiId: kpi.id, scenario: "below_threshold", simulatedValue: belowThreshold, threshold, target, unit },
        expectedOutput: { slaBreached: true, expectedAction: "alert_and_escalate", kpiName: kpi.name, threshold },
        tags: ["kpi_aligned", "sla_boundary", "below_threshold", kpi.name, `threshold_${threshold}`],
        weight: 1.5,
        origin: "kpi_aligned",
        severity: "critical",
      });
      testCases.push({
        name: `${kpi.name} - At SLA Threshold (${atThreshold}${unit})`,
        inputData: { type: "kpi_boundary_test", kpiName: kpi.name, kpiId: kpi.id, scenario: "at_threshold", simulatedValue: atThreshold, threshold, target, unit },
        expectedOutput: { slaBreached: false, marginOfSafety: 0, kpiName: kpi.name, threshold },
        tags: ["kpi_aligned", "sla_boundary", "at_threshold", kpi.name, `threshold_${threshold}`],
        weight: 1.2,
        origin: "kpi_aligned",
        severity: "high",
      });
      testCases.push({
        name: `${kpi.name} - Above Target (${aboveThreshold}${unit})`,
        inputData: { type: "kpi_boundary_test", kpiName: kpi.name, kpiId: kpi.id, scenario: "above_target", simulatedValue: aboveThreshold, threshold, target, unit },
        expectedOutput: { slaBreached: false, withinTarget: true, kpiName: kpi.name, threshold },
        tags: ["kpi_aligned", "sla_boundary", "above_target", kpi.name, `threshold_${threshold}`],
        weight: 1.0,
        origin: "kpi_aligned",
        severity: "medium",
      });
    } else if (isLatencyKpi) {
      const aboveThreshold = threshold + Math.ceil(threshold * 0.1);
      const atThreshold = threshold;
      const belowThreshold = Math.max(0, threshold - Math.ceil(threshold * 0.1));

      testCases.push({
        name: `${kpi.name} - Exceeds SLA (${aboveThreshold}${unit})`,
        inputData: { type: "kpi_boundary_test", kpiName: kpi.name, kpiId: kpi.id, scenario: "exceeds_threshold", simulatedValue: aboveThreshold, threshold, target, unit },
        expectedOutput: { slaBreached: true, expectedAction: "alert_latency_breach", kpiName: kpi.name, threshold },
        tags: ["kpi_aligned", "sla_boundary", "exceeds_threshold", kpi.name, `threshold_${threshold}ms`],
        weight: 1.5,
        origin: "kpi_aligned",
        severity: "critical",
      });
      testCases.push({
        name: `${kpi.name} - At SLA Limit (${atThreshold}${unit})`,
        inputData: { type: "kpi_boundary_test", kpiName: kpi.name, kpiId: kpi.id, scenario: "at_threshold", simulatedValue: atThreshold, threshold, target, unit },
        expectedOutput: { slaBreached: false, marginOfSafety: 0, kpiName: kpi.name, threshold },
        tags: ["kpi_aligned", "sla_boundary", "at_threshold", kpi.name, `threshold_${threshold}ms`],
        weight: 1.2,
        origin: "kpi_aligned",
        severity: "high",
      });
      testCases.push({
        name: `${kpi.name} - Within Target (${belowThreshold}${unit})`,
        inputData: { type: "kpi_boundary_test", kpiName: kpi.name, kpiId: kpi.id, scenario: "within_target", simulatedValue: belowThreshold, threshold, target, unit },
        expectedOutput: { slaBreached: false, withinTarget: true, kpiName: kpi.name, threshold },
        tags: ["kpi_aligned", "sla_boundary", "within_target", kpi.name, `threshold_${threshold}ms`],
        weight: 1.0,
        origin: "kpi_aligned",
        severity: "medium",
      });
    } else if (isVolumeKpi || isCostKpi) {
      const belowTarget = Math.max(0, Math.floor(target * 0.9));
      const atTarget = target;

      testCases.push({
        name: `${kpi.name} - Below Target (${belowTarget} ${unit})`,
        inputData: { type: "kpi_boundary_test", kpiName: kpi.name, kpiId: kpi.id, scenario: "below_target", simulatedValue: belowTarget, threshold, target, unit },
        expectedOutput: { targetMet: false, gap: target - belowTarget, kpiName: kpi.name, target },
        tags: ["kpi_aligned", "target_boundary", "below_target", kpi.name, `target_${target}`],
        weight: 1.2,
        origin: "kpi_aligned",
        severity: "high",
      });
      testCases.push({
        name: `${kpi.name} - At Target (${atTarget} ${unit})`,
        inputData: { type: "kpi_boundary_test", kpiName: kpi.name, kpiId: kpi.id, scenario: "at_target", simulatedValue: atTarget, threshold, target, unit },
        expectedOutput: { targetMet: true, kpiName: kpi.name, target },
        tags: ["kpi_aligned", "target_boundary", "at_target", kpi.name, `target_${target}`],
        weight: 1.0,
        origin: "kpi_aligned",
        severity: "medium",
      });
    } else {
      testCases.push({
        name: `${kpi.name} - SLA Boundary Test`,
        inputData: { type: "kpi_boundary_test", kpiName: kpi.name, kpiId: kpi.id, scenario: "boundary", simulatedValue: threshold, threshold, target, unit },
        expectedOutput: { slaBreached: false, kpiName: kpi.name, threshold, target },
        tags: ["kpi_aligned", "sla_boundary", kpi.name, `threshold_${threshold}`],
        weight: 1.0,
        origin: "kpi_aligned",
        severity: "medium",
      });
      testCases.push({
        name: `${kpi.name} - Below Threshold`,
        inputData: { type: "kpi_boundary_test", kpiName: kpi.name, kpiId: kpi.id, scenario: "below_threshold", simulatedValue: threshold * 0.9, threshold, target, unit },
        expectedOutput: { slaBreached: true, kpiName: kpi.name, threshold },
        tags: ["kpi_aligned", "sla_boundary", "below_threshold", kpi.name],
        weight: 1.5,
        origin: "kpi_aligned",
        severity: "critical",
      });
    }
  }

  const suite = await storage.createEvalSuite({
    agentId,
    name: `${agent.name} - KPI-Aligned Suite (${outcome.name})`,
    type: "kpi_aligned",
    totalCases: testCases.length,
    coverageTags: ["kpi_aligned", "sla_boundary", "outcome_driven"],
    ontologyTags: { kpiAligned: true, outcomeId, outcomeName: outcome.name, kpiCount: kpis.length, generatedAt: new Date().toISOString() },
  });

  const createdCases = [];
  for (const tc of testCases) {
    const created = await storage.createEvalTestCase({
      suiteId: suite.id,
      name: tc.name,
      inputData: tc.inputData as Record<string, unknown>,
      expectedOutput: tc.expectedOutput as Record<string, unknown>,
      tags: tc.tags,
      weight: tc.weight,
      origin: tc.origin,
      severity: tc.severity,
      locked: tc.locked,
      regulationRef: tc.regulationRef,
    });
    createdCases.push(created);
  }

  const ontologyMandatedCount = testCases.filter(tc => tc.origin === "ontology_regulation").length;

  await storage.createAuditEvent({
    actorType: "system",
    actorId: "kpi_eval_generator",
    action: "eval.kpi_suite_generated",
    objectType: "eval",
    objectId: suite.id,
    details: JSON.stringify({
      summary: `KPI-aligned eval suite generated for agent "${agent.name}" from outcome "${outcome.name}" with ${testCases.length} test cases covering ${kpis.length} KPIs and ${ontologyMandatedCount} ontology-mandated regulatory test cases`,
      agentId,
      outcomeId,
      outcomeName: outcome.name,
      kpiCount: kpis.length,
      testCaseCount: testCases.length,
      ontologyMandatedCount,
    }),
    ontologyTags: resolveOntologyTags("eval", "eval.kpi_suite_generated"),
  });

  return { suite, testCases: createdCases };
}

export interface ParameterMatchResult {
  toolId: string;
  toolName: string;
  parameterName: string;
  parameterPath: string;
  matchStatus: string;
  matchedConceptId: string | null;
  matchedConceptLabel: string | null;
  matchMethod: string | null;
  confidence: number;
}

export interface ParameterMatchingSummary {
  serverId: string;
  serverName: string;
  totalParams: number;
  matched: number;
  partial: number;
  unmatched: number;
  alignmentScore: number;
  results: ParameterMatchResult[];
}

export async function runParameterMatching(serverId: string, industryId?: string | null): Promise<ParameterMatchingSummary> {
  const server = await storage.getMcpServer(serverId);
  if (!server) throw new Error("MCP server not found");

  const tools = await storage.getMcpServerTools(serverId);
  const resources = await storage.getMcpServerResources(serverId);
  const allConcepts = industryId
    ? await storage.getOntologyConcepts(industryId)
    : await storage.getAllOntologyConcepts();

  const conceptIndex = allConcepts.map(c => ({
    id: c.id,
    label: c.label,
    labelNorm: c.label.toLowerCase().replace(/[\s_-]+/g, ""),
    synonyms: (c.synonyms || []).map((s: string) => s.toLowerCase().replace(/[\s_-]+/g, "")),
    tags: (c.tags || []).map((t: string) => t.toLowerCase().replace(/[\s_-]+/g, "")),
    category: c.category,
  }));

  function normalizeParam(name: string): string {
    return name.toLowerCase().replace(/[\s_-]+/g, "");
  }

  function matchParam(paramName: string): { conceptId: string; conceptLabel: string; method: string; confidence: number } | null {
    const norm = normalizeParam(paramName);
    for (const c of conceptIndex) {
      if (c.labelNorm === norm) {
        return { conceptId: c.id, conceptLabel: c.label, method: "exact", confidence: 1.0 };
      }
    }
    for (const c of conceptIndex) {
      if (c.synonyms.includes(norm)) {
        return { conceptId: c.id, conceptLabel: c.label, method: "synonym", confidence: 0.95 };
      }
    }
    for (const c of conceptIndex) {
      if (c.tags.includes(norm)) {
        return { conceptId: c.id, conceptLabel: c.label, method: "tag", confidence: 0.9 };
      }
    }
    for (const c of conceptIndex) {
      if (norm.includes(c.labelNorm) || c.labelNorm.includes(norm)) {
        return { conceptId: c.id, conceptLabel: c.label, method: "substring", confidence: 0.75 };
      }
      for (const syn of c.synonyms) {
        if (norm.includes(syn) || syn.includes(norm)) {
          return { conceptId: c.id, conceptLabel: c.label, method: "substring_synonym", confidence: 0.7 };
        }
      }
    }
    return null;
  }

  interface ParamEntry {
    toolId: string;
    toolName: string;
    parameterName: string;
    parameterPath: string;
  }
  const allParams: ParamEntry[] = [];

  for (const tool of tools) {
    const schema = tool.inputSchema as Record<string, unknown> | null;
    if (schema && typeof schema === "object") {
      const props = (schema as any).properties;
      if (props && typeof props === "object") {
        for (const paramName of Object.keys(props)) {
          allParams.push({
            toolId: tool.id,
            toolName: tool.name,
            parameterName: paramName,
            parameterPath: `${tool.name}.input.${paramName}`,
          });
        }
      }
    }
  }

  for (const resource of resources) {
    const nameParts = resource.name.replace(/[^a-zA-Z0-9_\s-]/g, " ").trim().split(/\s+/);
    for (const part of nameParts) {
      if (part.length > 2) {
        allParams.push({
          toolId: resource.id,
          toolName: `resource:${resource.name}`,
          parameterName: part,
          parameterPath: `resource.${resource.name}`,
        });
      }
    }
  }

  const unmatchedNames: string[] = [];
  const results: ParameterMatchResult[] = [];

  for (const param of allParams) {
    const match = matchParam(param.parameterName);
    if (match) {
      results.push({
        ...param,
        matchStatus: "matched",
        matchedConceptId: match.conceptId,
        matchedConceptLabel: match.conceptLabel,
        matchMethod: match.method,
        confidence: match.confidence,
      });
    } else {
      unmatchedNames.push(param.parameterName);
      results.push({
        ...param,
        matchStatus: "unmatched",
        matchedConceptId: null,
        matchedConceptLabel: null,
        matchMethod: null,
        confidence: 0,
      });
    }
  }

  if (unmatchedNames.length > 0 && allConcepts.length > 0) {
    try {
      const conceptLabels = allConcepts.slice(0, 100).map(c => c.label).join(", ");
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a domain vocabulary matcher. Given a list of parameter names and a list of ontology concepts, suggest matches. Return JSON array of objects with: parameterName, matchedConceptLabel (exact match from concept list or null if no match), confidence (0.5-0.85). Only suggest matches where there is a genuine semantic relationship.`,
          },
          {
            role: "user",
            content: `Parameters: ${unmatchedNames.join(", ")}\n\nOntology concepts: ${conceptLabels}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const content = aiRes.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        const aiMatches: Array<{ parameterName: string; matchedConceptLabel: string | null; confidence: number }> =
          Array.isArray(parsed) ? parsed : parsed.matches || parsed.results || [];

        for (const aiMatch of aiMatches) {
          if (!aiMatch.matchedConceptLabel || !aiMatch.parameterName) continue;
          const concept = allConcepts.find(c => c.label.toLowerCase() === aiMatch.matchedConceptLabel!.toLowerCase());
          if (!concept) continue;
          const idx = results.findIndex(r => r.parameterName === aiMatch.parameterName && r.matchStatus === "unmatched");
          if (idx >= 0) {
            results[idx].matchStatus = "matched";
            results[idx].matchedConceptId = concept.id;
            results[idx].matchedConceptLabel = concept.label;
            results[idx].matchMethod = "ai";
            results[idx].confidence = Math.min(aiMatch.confidence || 0.6, 0.85);
          }
        }
      }
    } catch (aiErr: any) {
      console.warn("AI matching failed, continuing with rule-based results:", aiErr.message);
    }
  }

  await storage.deleteMcpParameterMatchesByServer(serverId);
  for (const r of results) {
    await storage.createMcpParameterMatch({
      serverId,
      toolId: r.toolId,
      toolName: r.toolName,
      parameterName: r.parameterName,
      parameterPath: r.parameterPath || null,
      matchStatus: r.matchStatus,
      matchedConceptId: r.matchedConceptId || null,
      matchedConceptLabel: r.matchedConceptLabel || null,
      matchMethod: r.matchMethod || null,
      confidence: r.confidence,
    });
  }

  const matched = results.filter(r => r.matchStatus === "matched").length;
  const partial = results.filter(r => r.matchStatus === "matched" && r.confidence < 0.8).length;
  const unmatched = results.filter(r => r.matchStatus === "unmatched").length;
  const totalParams = results.length;
  const alignmentScore = totalParams > 0 ? Math.round((matched / totalParams) * 10000) / 100 : 0;

  return {
    serverId,
    serverName: server.name,
    totalParams,
    matched,
    partial,
    unmatched,
    alignmentScore,
    results,
  };
}


export {
  routeAIComplete,
  checkPatchSafety,
  handleZodError,
  resolveOntologyTags,
  generateKpiAlignedEvalSuite,
};
export type { OntologyTagSet };

export function buildAgentSystemPrompt(agent: any, options?: { generic?: boolean }): string {
  const parts: string[] = [];
  const isGeneric = options?.generic === true;

  if (isGeneric) {
    parts.push(`You are a helpful AI assistant. Answer the user's question directly and helpfully. Do not reference any specific regulations, compliance frameworks, policies, or industry context unless the user explicitly mentions them. Give a general-purpose answer.`);
    parts.push(`\n\nIMPORTANT — STRUCTURED OUTPUT INSTRUCTIONS:
When you perform analysis, assessments, or make decisions, you MUST embed structured blocks in your response using fenced code blocks with special labels. The UI will parse these and render them as rich visual cards. Always include these blocks alongside your natural language explanation.

Available structured block types:

1. RISK ASSESSMENT — Use when evaluating risk, scoring applications, assessing threats, or rating anything:
\`\`\`risk_assessment
{
  "title": "Brief title of what is being assessed",
  "score": 0-100,
  "level": "low" | "medium" | "high" | "critical",
  "factors": [
    {"name": "Factor name", "impact": "positive" | "negative" | "neutral", "detail": "One sentence explanation"}
  ]
}
\`\`\`

2. DECISION — Use when you reach a conclusion, recommendation, or verdict:
\`\`\`decision
{
  "title": "Brief title of the decision",
  "outcome": "approved" | "rejected" | "review_required" | "escalated",
  "confidence": 0-100,
  "reasoning": ["Reason 1", "Reason 2", "Reason 3"],
  "conditions": ["Any conditions or caveats, if applicable"]
}
\`\`\`

3. APPROVAL REQUIRED — Use when risk is HIGH or CRITICAL:
\`\`\`approval_required
{
  "action": "What action needs approval",
  "risk_level": "low" | "medium" | "high" | "critical",
  "reason": "Why human approval is needed",
  "details": "Additional context for the reviewer"
}
\`\`\`

RULES:
- Always use these blocks when performing assessments or making decisions.
- The JSON inside blocks must be valid JSON.`);
    return parts.join("\n");
  }

  parts.push(`You are "${agent.name}", an AI agent managed on the ATLAS (Nous Agent Orchestrator Platform).`);
  parts.push(`\nUNLIKE a generic AI assistant, you operate within a specific INDUSTRY CONTEXT with regulatory guardrails, policy enforcement, and domain ontology. Every response you give MUST reflect this context. This is what makes you different from ChatGPT or any generic LLM.`);

  if (agent.description) {
    parts.push(`\nYour purpose: ${agent.description}`);
  }

  if (agent.riskTier) {
    const autonomyMode = agent.autonomyMode || "assisted";
    parts.push(`\n## OPERATIONAL PARAMETERS`);
    parts.push(`- Risk Tier: ${agent.riskTier}`);
    parts.push(`- Autonomy Mode: ${autonomyMode}`);
    const autonomyInstructions: Record<string, string> = {
      manual: "You CANNOT take any action without explicit human approval. Always present options and wait for approval before proceeding.",
      assisted: "You can perform routine, low-risk actions autonomously but MUST request human approval for medium or high-risk decisions. Always explain your reasoning.",
      supervised: "You can operate semi-autonomously but a human supervisor reviews your outputs. Flag any decision that touches policy boundaries or high-risk factors for explicit sign-off.",
      autonomous: "You can operate with high autonomy on routine tasks, but MUST still respect hard-block policies and escalation rules. Self-audit your decisions against policy constraints.",
    };
    parts.push(`- Behavioral Rule: ${autonomyInstructions[autonomyMode] || autonomyInstructions.assisted}`);
  }

  const compliance = Array.isArray(agent.complianceTags) ? agent.complianceTags : [];
  if (compliance.length > 0) {
    parts.push(`\n## REGULATORY COMPLIANCE FRAMEWORK`);
    parts.push(`You are bound by the following regulations and MUST actively reference them in your analysis:`);
    const regulationDescriptions: Record<string, string> = {
      TILA: "Truth in Lending Act — Requires clear disclosure of loan terms, APR, and total costs to borrowers. You must ensure all rate/cost information is transparently communicated.",
      ECOA: "Equal Credit Opportunity Act — Prohibits discrimination in lending. You must NEVER consider race, religion, national origin, sex, marital status, or age (except as permitted) in credit decisions.",
      FCRA: "Fair Credit Reporting Act — Governs use of consumer credit information. You must ensure credit data is used only for permissible purposes and applicants are notified of adverse actions based on credit reports.",
      HMDA: "Home Mortgage Disclosure Act — Requires collection and reporting of mortgage lending data. You must track and report relevant demographic and geographic data for compliance.",
      SOC2: "SOC 2 Compliance — You must protect data confidentiality, ensure processing integrity, and maintain availability. All operations should follow the trust services criteria.",
      GDPR: "General Data Protection Regulation — You must minimize personal data collection, ensure data portability, honor right-to-erasure requests, and never process personal data without lawful basis.",
      "PII-Handler": "PII Handling Protocol — You must identify, protect, and redact Personally Identifiable Information. Never expose PII in logs, responses, or unprotected channels.",
      HIPAA: "Health Insurance Portability and Accountability Act — You must protect all Protected Health Information (PHI) and ensure minimum necessary access.",
      "PCI-DSS": "Payment Card Industry Data Security Standard — You must never store, process, or transmit cardholder data without proper controls.",
      DOT: "Department of Transportation regulations — You must reference applicable travel safety regulations and consumer protection rules.",
      TSA: "Transportation Security Administration — You must be aware of security-related travel requirements and restrictions.",
      IATA: "International Air Transport Association standards — Reference applicable booking, ticketing, and passenger rights guidelines.",
      GLBA: "Gramm-Leach-Bliley Act (GLBA) — Requires financial institutions to explain their information-sharing practices and safeguard sensitive data. You must ensure all customer Nonpublic Personal Information (NPI) is protected, privacy notices are provided before collecting data, and opt-out rights are honored. Never share NPI with non-affiliated third parties without proper disclosure and consent.",
      "E-SIGN": "Electronic Signatures in Global and National Commerce Act (E-SIGN) — Establishes the legal validity of electronic signatures and records. You must ensure consumer consent is obtained before using electronic records, provide clear disclosure of the right to receive paper records, and verify the consumer can access electronic records in the format provided. All e-signed documents must be retained and reproducible.",
      "BSA/AML CIP": "Bank Secrecy Act / Anti-Money Laundering Customer Identification Program (BSA/AML CIP) — Requires verification of customer identity at account opening. You must collect and verify the customer's name, date of birth, address, and identification number (SSN or TIN). Screen all applicants against OFAC sanctions lists, Politically Exposed Persons (PEP) databases, and adverse media. Flag suspicious activity patterns and file Suspicious Activity Reports (SARs) when thresholds are met. Maintain all CIP records for a minimum of 5 years after account closure.",
      "Reg CC": "Regulation CC (Availability of Funds and Collection of Checks) — Governs funds availability schedules and check hold policies. You must disclose the institution's funds availability policy at account opening, apply the correct hold periods based on deposit type (local vs. non-local checks, cash, wire transfers), and provide notice to customers when holds are placed on deposited funds. Next-day availability must be provided for cash deposits, wire transfers, government checks, and the first $225 of a day's check deposits.",
      "Reg DD": "Regulation DD (Truth in Savings) — Requires clear disclosure of terms and conditions on deposit accounts. You must provide Annual Percentage Yield (APY), interest rate, minimum balance requirements, fees, and transaction limitations before account opening. Ensure all advertising of deposit products includes accurate APY calculations and does not mislead consumers. Periodic statements must include earned interest, fees charged, and APY earned for the statement period.",
      "E-SIGN Act": "Electronic Signatures in Global and National Commerce Act (E-SIGN) — Establishes the legal validity of electronic signatures and records. You must ensure consumer consent is obtained before using electronic records, provide clear disclosure of the right to receive paper records, and verify the consumer can access electronic records in the format provided. All e-signed documents must be retained and reproducible.",
      "BSA/AML": "Bank Secrecy Act / Anti-Money Laundering (BSA/AML) — Requires verification of customer identity at account opening. You must collect and verify the customer's name, date of birth, address, and identification number (SSN or TIN). Screen all applicants against OFAC sanctions lists and flag suspicious activity patterns. Maintain all records for a minimum of 5 years after account closure.",
      "RegCC": "Regulation CC (Availability of Funds and Collection of Checks) — Governs funds availability schedules and check hold policies. You must disclose the institution's funds availability policy at account opening and apply the correct hold periods based on deposit type.",
      "RegDD": "Regulation DD (Truth in Savings) — Requires clear disclosure of terms and conditions on deposit accounts. You must provide Annual Percentage Yield (APY), interest rate, minimum balance requirements, fees, and transaction limitations before account opening.",
    };
    compliance.forEach((tag: string) => {
      const desc = regulationDescriptions[tag];
      if (desc) {
        parts.push(`- **${tag}**: ${desc}`);
      } else {
        parts.push(`- **${tag}**: You must comply with this regulation in all responses and decisions.`);
      }
    });
    parts.push(`\nWhen analyzing data or making recommendations, EXPLICITLY cite which regulation(s) inform your reasoning. For example: "Under ECOA, this factor cannot be considered..." or "Per TILA requirements, the APR must be disclosed as..."`);
  }

  const policies = Array.isArray(agent.policyBindings) ? agent.policyBindings as Array<{ policyName?: string; name?: string; description?: string; enforcement?: string }> : [];
  if (policies.length > 0) {
    parts.push(`\n## ACTIVE POLICY ENFORCEMENT`);
    parts.push(`The following policies are bound to you and enforce behavioral constraints:`);
    policies.forEach(p => {
      const name = p.policyName || p.name || "Unnamed Policy";
      const enforcement = (p.enforcement || "soft").toUpperCase();
      const desc = p.description || "";
      if (enforcement === "HARD" || enforcement === "HARD_BLOCK") {
        parts.push(`- 🛑 [HARD BLOCK] ${name}: ${desc || "Violation will halt the action immediately. You CANNOT bypass this."}`);
      } else {
        parts.push(`- ⚠️ [SOFT WARN] ${name}: ${desc || "Violations are logged and flagged but do not block execution."}`);
      }
    });
    parts.push(`\nFor HARD BLOCK policies: If your response would violate any of these, you MUST stop and trigger an approval_required block instead of proceeding.`);
    parts.push(`For SOFT WARN policies: You may proceed but must acknowledge the policy consideration in your response.`);
  }

  const ontologyTags = agent.ontologyTags && typeof agent.ontologyTags === "object" ? agent.ontologyTags : null;
  if (ontologyTags) {
    parts.push(`\n## DOMAIN ONTOLOGY`);
    parts.push(`You reason using the following industry knowledge graph concepts:`);
    if (Array.isArray(ontologyTags)) {
      ontologyTags.forEach((tag: any) => {
        if (typeof tag === "string") {
          parts.push(`- ${tag}`);
        } else if (tag.concept && tag.category) {
          parts.push(`- ${tag.concept} (${tag.category}): ${tag.description || ""}`);
        }
      });
    } else if (typeof ontologyTags === "object") {
      Object.entries(ontologyTags).forEach(([key, val]) => {
        if (typeof val === "string") {
          parts.push(`- ${key}: ${val}`);
        } else if (Array.isArray(val)) {
          parts.push(`- ${key}: ${val.join(", ")}`);
        }
      });
    }
    parts.push(`\nUse these domain concepts in your analysis. Reference specific ontology terms when they are relevant to the user's question.`);
  }

  const tools = Array.isArray(agent.toolsConfig) ? agent.toolsConfig as Array<{ name?: string; description?: string }> : [];
  if (tools.length > 0) {
    parts.push(`\n## TOOLS`);
    parts.push(`You have access to these tools (simulate their behavior in conversation):`);
    tools.forEach(t => {
      parts.push(`- ${t.name}: ${t.description || "No description"}`);
    });
  }

  const bp = agent.blueprintJson && typeof agent.blueprintJson === "object" ? agent.blueprintJson as Record<string, unknown> : {};
  const nodes = Array.isArray(bp.nodes) ? bp.nodes as Array<{ label?: string; type?: string }> : [];
  if (nodes.length > 0) {
    parts.push(`\n## WORKFLOW STEPS`);
    nodes.forEach((n, i) => {
      parts.push(`${i + 1}. ${n.label || "Step"} (${n.type || "action"})`);
    });
  }

  parts.push(`\n## BEHAVIORAL GUIDELINES`);
  parts.push(`- Respond helpfully and stay in character as "${agent.name}".`);
  parts.push(`- ALWAYS ground your responses in your configured industry context, compliance frameworks, and policies.`);
  parts.push(`- When searching the web, interpret and filter results through your regulatory and domain lens — do not just relay raw information.`);
  parts.push(`- If asked about capabilities you don't have, explain what you would do if those tools were available.`);
  parts.push(`- Cite specific regulations, policies, or ontology concepts by name when they are relevant.`);

  parts.push(`

IMPORTANT — STRUCTURED OUTPUT INSTRUCTIONS:
When you perform analysis, assessments, or make decisions, you MUST embed structured blocks in your response using fenced code blocks with special labels. The UI will parse these and render them as rich visual cards. Always include these blocks alongside your natural language explanation.

Available structured block types:

1. RISK ASSESSMENT — Use when evaluating risk, scoring applications, assessing threats, or rating anything:
\`\`\`risk_assessment
{
  "title": "Brief title of what is being assessed",
  "score": 0-100,
  "level": "low" | "medium" | "high" | "critical",
  "factors": [
    {"name": "Factor name", "impact": "positive" | "negative" | "neutral", "detail": "One sentence explanation"}
  ]
}
\`\`\`

2. DECISION — Use when you reach a conclusion, recommendation, or verdict:
\`\`\`decision
{
  "title": "Brief title of the decision",
  "outcome": "approved" | "rejected" | "review_required" | "escalated",
  "confidence": 0-100,
  "reasoning": ["Reason 1", "Reason 2", "Reason 3"],
  "conditions": ["Any conditions or caveats, if applicable"]
}
\`\`\`

3. APPROVAL REQUIRED — Use when your autonomy mode or policies require human sign-off before proceeding. Use this when risk is HIGH or CRITICAL, or when policies mandate human review:
\`\`\`approval_required
{
  "action": "What action needs approval",
  "risk_level": "low" | "medium" | "high" | "critical",
  "reason": "Why human approval is needed",
  "details": "Additional context for the reviewer"
}
\`\`\`

RULES:
- Always use these blocks when performing assessments or making decisions. Do NOT just describe results in plain text.
- You may include multiple blocks in one response (e.g., a risk_assessment followed by a decision).
- Include natural language explanation BEFORE and/or AFTER the blocks to provide context.
- The JSON inside blocks must be valid JSON.
- For approval_required: use this when the action crosses a policy boundary, involves HIGH/CRITICAL risk, or your autonomy mode is "assisted" or "supervised" and the action has significant impact.
`);

  return parts.join("\n");
}


// ============================================================
// Outcome KPI helpers (moved from routes.ts)
// ============================================================

export interface KpiReEvalResult {
  kpiId: string;
  kpiName: string;
  oldValue: number;
  newValue: number;
  trend: string;
  breached: boolean;
}

export function computeConstraintGraph(
  outcome: {
    riskTier?: string | null;
    approvalGates?: any;
    pricingModel?: string | null;
    pricePerUnit?: number | null;
    pricingTiers?: any;
    slaConfig?: any;
    maxDriftPercent?: number | null;
    autoPauseTrigger?: boolean | null;
    riskThreshold?: number | null;
  },
  kpis: Array<{
    id: string;
    name: string;
    unit: string;
    target: number;
    slaThreshold?: number | null;
    baseline?: number | null;
    expression?: string | null;
  }>
): Record<string, any> {
  const performanceConstraints: any[] = [];
  const latencyConstraints: any[] = [];
  const complianceConstraints: any[] = [];
  const commercialConstraints: any[] = [];

  for (const kpi of kpis) {
    const nameLower = (kpi.name || "").toLowerCase();
    const unitLower = (kpi.unit || "").toLowerCase();

    if (nameLower.includes("latency") || nameLower.includes("response time") || nameLower.includes("processing time") || unitLower.includes("ms") || unitLower.includes("seconds")) {
      latencyConstraints.push({
        source: "kpi",
        kpiId: kpi.id,
        kpiName: kpi.name,
        target: kpi.target,
        slaThreshold: kpi.slaThreshold,
        unit: kpi.unit,
        expression: kpi.expression,
        propagatesTo: ["agent_design", "deployment", "self_healing"],
      });
    } else if (
      nameLower.includes("accuracy") || nameLower.includes("success") ||
      nameLower.includes("rate") || nameLower.includes("score") ||
      nameLower.includes("quality") || nameLower.includes("resolution") ||
      unitLower === "percent" || unitLower === "%"
    ) {
      performanceConstraints.push({
        source: "kpi",
        kpiId: kpi.id,
        kpiName: kpi.name,
        target: kpi.target,
        slaThreshold: kpi.slaThreshold,
        unit: kpi.unit,
        baseline: kpi.baseline,
        expression: kpi.expression,
        propagatesTo: ["agent_design", "eval_studio", "deployment", "self_healing"],
      });
    } else {
      performanceConstraints.push({
        source: "kpi",
        kpiId: kpi.id,
        kpiName: kpi.name,
        target: kpi.target,
        slaThreshold: kpi.slaThreshold,
        unit: kpi.unit,
        baseline: kpi.baseline,
        expression: kpi.expression,
        propagatesTo: ["agent_design", "eval_studio"],
      });
    }
  }

  const slaConfig = (outcome.slaConfig || {}) as Record<string, any>;
  if (slaConfig.maxP95LatencyMs) {
    latencyConstraints.push({
      source: "sla_config",
      metric: "maxP95LatencyMs",
      value: slaConfig.maxP95LatencyMs,
      unit: "ms",
      propagatesTo: ["agent_design", "deployment", "self_healing"],
    });
  }

  complianceConstraints.push({
    source: "outcome",
    riskTier: outcome.riskTier || "MEDIUM",
    propagatesTo: ["agent_design", "deployment", "eval_studio"],
  });

  if (outcome.approvalGates) {
    complianceConstraints.push({
      source: "approval_gates",
      gates: outcome.approvalGates,
      propagatesTo: ["agent_design", "deployment"],
    });
  }

  if (outcome.maxDriftPercent != null) {
    complianceConstraints.push({
      source: "drift_policy",
      maxDriftPercent: outcome.maxDriftPercent,
      autoPauseTrigger: outcome.autoPauseTrigger,
      propagatesTo: ["self_healing", "deployment"],
    });
  }

  if (outcome.riskThreshold != null) {
    complianceConstraints.push({
      source: "risk_threshold",
      threshold: outcome.riskThreshold,
      propagatesTo: ["agent_design", "eval_studio"],
    });
  }

  if (outcome.pricingModel) {
    commercialConstraints.push({
      source: "pricing",
      pricingModel: outcome.pricingModel,
      pricePerUnit: outcome.pricePerUnit,
      propagatesTo: ["deployment", "self_healing"],
    });
  }

  if (outcome.pricingTiers) {
    commercialConstraints.push({
      source: "pricing_tiers",
      tiers: outcome.pricingTiers,
      propagatesTo: ["deployment"],
    });
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    performanceConstraints,
    latencyConstraints,
    complianceConstraints,
    commercialConstraints,
    summary: {
      totalConstraints: performanceConstraints.length + latencyConstraints.length + complianceConstraints.length + commercialConstraints.length,
      categories: {
        performance: performanceConstraints.length,
        latency: latencyConstraints.length,
        compliance: complianceConstraints.length,
        commercial: commercialConstraints.length,
      },
    },
  };
}

export async function recomputeOutcomeKpis(outcomeId: string): Promise<{
  updated: number;
  totalRuns: number;
  totalEvents: number;
  changes: KpiReEvalResult[];
  kpis: any[];
}> {
  const kpis = await storage.getKpisByOutcome(outcomeId);
  const agents = await storage.getAgents();
  const traces = await storage.getTraces();
  const outcomeEvents = await storage.getOutcomeEvents();
  const boundAgents = agents.filter(a => a.outcomeId === outcomeId);
  const boundAgentIds = new Set(boundAgents.map(a => a.id));
  const relevantTraces = traces.filter(t => boundAgentIds.has(t.agentId));
  const relevantEvents = outcomeEvents.filter(e => e.outcomeId === outcomeId);

  if (relevantTraces.length === 0 && relevantEvents.length === 0) {
    return { updated: 0, totalRuns: 0, totalEvents: 0, changes: [], kpis };
  }

  const totalTraces = relevantTraces.length;
  const failedTraces = relevantTraces.filter(t => t.status === "failed" || t.status === "error").length;
  const changes: KpiReEvalResult[] = [];

  for (const kpi of kpis) {
    const kpiNameLower = (kpi.name || "").toLowerCase();
    let newValue: number | null = null;

    if (kpiNameLower.includes("success") || kpiNameLower.includes("accuracy") || kpiNameLower.includes("rate")) {
      if (totalTraces > 0) {
        newValue = Math.round(((totalTraces - failedTraces) / totalTraces) * 10000) / 100;
      }
    } else if (kpiNameLower.includes("latency") || kpiNameLower.includes("time") || kpiNameLower.includes("response")) {
      if (totalTraces > 0) {
        const avgLatencyMs = relevantTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / totalTraces;
        const unitLower = (kpi.unit || "").toLowerCase();
        if (unitLower === "minutes" || unitLower === "min") {
          newValue = Math.round((avgLatencyMs / 60000) * 100) / 100;
        } else if (unitLower === "seconds" || unitLower === "sec" || unitLower === "s") {
          newValue = Math.round((avgLatencyMs / 1000) * 10) / 10;
        } else {
          newValue = Math.round(avgLatencyMs);
        }
      }
    } else if (kpiNameLower.includes("volume") || kpiNameLower.includes("count") || kpiNameLower.includes("throughput") ||
               kpiNameLower.includes("resolution") || kpiNameLower.includes("processed") || kpiNameLower.includes("moderated") ||
               kpiNameLower.includes("qualified") || kpiNameLower.includes("invoices")) {
      newValue = relevantEvents.length > 0 ? relevantEvents.length : totalTraces;
    } else if (kpiNameLower.includes("cost")) {
      if (totalTraces > 0) {
        newValue = parseFloat(relevantTraces.reduce((s, t) => s + (t.costUsd || 0), 0).toFixed(4));
      }
    }

    if (newValue !== null && newValue !== kpi.currentValue) {
      const oldValue = kpi.currentValue || 0;
      const trend = newValue > oldValue ? "up" : newValue < oldValue ? "down" : (kpi.trend || "stable");
      const breached = kpi.slaThreshold != null && (
        kpiNameLower.includes("latency") || kpiNameLower.includes("time") || kpiNameLower.includes("cost")
          ? newValue > kpi.slaThreshold
          : newValue < kpi.slaThreshold
      );
      await storage.updateKpi(kpi.id, { currentValue: newValue, trend });
      changes.push({ kpiId: kpi.id, kpiName: kpi.name, oldValue, newValue, trend, breached });
    }
  }

  const updatedKpis = await storage.getKpisByOutcome(outcomeId);
  return { updated: changes.length, totalRuns: totalTraces, totalEvents: relevantEvents.length, changes, kpis: updatedKpis };
}

export async function resolvePolicyBundle(agentId: string) {
  const agent = await storage.getAgent(agentId);
  const allPolicies = await storage.getPolicies();
  const activePolicies = allPolicies.filter(p => p.status === "active");

  const orgPolicies = activePolicies.filter(p => p.scopeType === "org");
  const outcomePolicies = agent?.outcomeId
    ? activePolicies.filter(p => p.scopeType === "outcome" && p.scopeId === agent.outcomeId)
    : [];
  const agentPolicies = activePolicies.filter(p => p.scopeType === "agent" && p.scopeId === agentId);
  const envPolicies = agent?.environment
    ? activePolicies.filter(p => p.scopeType === "env" && p.scopeId === agent.environment)
    : [];

  const toolAllowlist: string[] = [];
  const blockedTools: string[] = [];
  const guardrails: string[] = [];
  const redactPatterns: string[] = [];

  const allScoped = [...orgPolicies, ...outcomePolicies, ...agentPolicies, ...envPolicies];
  for (const p of allScoped) {
    const pj = p.policyJson as Record<string, unknown> | null;
    if (!pj) continue;
    if (Array.isArray(pj.toolAllowlist)) toolAllowlist.push(...(pj.toolAllowlist as string[]));
    if (Array.isArray(pj.blockedTools)) blockedTools.push(...(pj.blockedTools as string[]));
    if (Array.isArray(pj.guardrails)) guardrails.push(...(pj.guardrails as string[]));
    if (Array.isArray(pj.redactPatterns)) redactPatterns.push(...(pj.redactPatterns as string[]));
  }

  return {
    appliedPolicies: allScoped.map(p => ({ id: p.id, name: p.name, scope: p.scopeType, domain: p.domain })),
    toolAllowlist: Array.from(new Set(toolAllowlist)),
    blockedTools: Array.from(new Set(blockedTools)),
    guardrails: Array.from(new Set(guardrails)),
    redactPatterns: Array.from(new Set(redactPatterns)),
    agentConfig: agent ? {
      autonomyMode: agent.autonomyMode,
      riskTier: agent.riskTier,
      modelProvider: agent.modelProvider,
      modelName: agent.modelName,
      toolAccessClass: agent.toolAccessClass,
    } : null,
  };
}

export function extractResponseText(result: any): string {
  const analysisStep = result.steps?.find((s: any) => s.type === "ai_analysis");
  if (analysisStep?.output) {
    const out = analysisStep.output;
    if (typeof out === "string") return out;
    if (out.summary) return out.summary;
    if (out.analysis) return typeof out.analysis === "string" ? out.analysis : out.analysis.summary || JSON.stringify(out.analysis);
    return JSON.stringify(out);
  }
  if (result.summary?.summary) return result.summary.summary;
  if (result.summary?.error) return result.summary.error;
  const planStep = result.steps?.find((s: any) => s.type === "ai_planning");
  if (planStep?.output?.reasoning && typeof planStep.output.reasoning === "string" && planStep.output.reasoning !== "Tool calls planned") {
    return planStep.output.reasoning;
  }
  return "I couldn't generate a response. Please try again.";
}
