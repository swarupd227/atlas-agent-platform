import OpenAI from "openai";
import { ZodError } from "zod";
import { getDefaultProvider } from "../llm-provider";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function routeAIComplete(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: { model?: string; maxTokens?: number; responseFormat?: "text" | "json"; temperature?: number },
): Promise<{ content: string; tokensUsed: { prompt: number; completion: number; total: number }; costUsd: number }> {
  const provider = getDefaultProvider();
  const result = await provider.complete(messages, {
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
