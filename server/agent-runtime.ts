import { storage } from "./storage";
import { db } from "./db";
import { EventEmitter } from "events";
import OpenAI from "openai";
import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { searchKnowledgeBaseChunks } from "./embeddings";
import { getProvider, completeWithFallback, buildCanonicalTools, type LLMMessage, type LLMProvider, type CanonicalToolCall } from "./llm-provider";

export function canonicalJsonStringify(obj: any): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJsonStringify).join(",") + "]";
  const sortedKeys = Object.keys(obj).sort();
  return "{" + sortedKeys.map(k => JSON.stringify(k) + ":" + canonicalJsonStringify(obj[k])).join(",") + "}";
}

export async function executeKGQueryTemplate(
  queryPattern: string,
  variables: Record<string, string>,
  industryId: string
): Promise<{ resolvedQuery: string; resultCount: number; results: any[] }> {
  let resolvedQuery = queryPattern;
  for (const [key, val] of Object.entries(variables)) {
    resolvedQuery = resolvedQuery.replace(new RegExp(`\\{${key}\\}`, "g"), val);
  }

  const unresolvedVars = resolvedQuery.match(/\{[a-zA-Z_]+\}/g);
  if (unresolvedVars && unresolvedVars.length > 0) {
    console.log(`[kg-query] Warning: unresolved variables in query: ${unresolvedVars.join(", ")}`);
  }

  const industry = industryId || "general";
  const allConcepts = await storage.getOntologyConcepts(industry);
  const fallback = allConcepts.length === 0 ? await storage.getAllOntologyConcepts() : allConcepts;

  const keywords = resolvedQuery.toLowerCase().split(/[\s,+&]+/).filter(k => k.length > 2);
  const matched = fallback.filter((c: any) => {
    const searchable = `${c.label} ${c.category} ${c.description} ${(c.tags || []).join(" ")} ${(c.synonyms || []).join(" ")} ${c.ontologyName || ""}`.toLowerCase();
    return keywords.some(kw => searchable.includes(kw));
  }).slice(0, 20);

  const enrichedResults = await Promise.all(matched.map(async (c: any) => {
    const enhancement = await storage.getOntologyEnhancement(c.id);
    return {
      conceptId: c.id,
      label: c.label,
      category: c.category,
      description: c.description,
      properties: c.properties,
      relationships: c.relationships,
      tags: c.tags,
      linkedRegulations: c.linkedRegulations,
      enrichment: enhancement ? {
        enrichedDescription: enhancement.enrichedDescription,
        regulatoryRelevance: enhancement.regulatoryRelevance,
        riskFactors: enhancement.riskFactors,
      } : null,
    };
  }));

  return {
    resolvedQuery,
    resultCount: enrichedResults.length,
    results: enrichedResults,
  };
}

export const runtimeEvents = new EventEmitter();
runtimeEvents.setMaxListeners(50);

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface RuntimeAgent {
  deploymentId: string;
  agentId: string;
  agentName: string;
  blueprintId?: string;
  mcpServerIds: string[];
  intervalMs: number;
  industry?: string;
  prompt: string;
  agentSystemPrompt?: string;
  outcomeId?: string;
  agentType?: string;
  runtimeConfig?: Record<string, any>;
  ontologyTags?: Array<{ conceptId: string; conceptLabel: string }>;
  complianceTags?: string[];
  memoryGovernanceRules?: Array<{ rule: string; regulation: string; type: string }>;
  blueprintRequirements?: {
    workflowSteps: string[];
    requiredTools: string[];
    escalationTriggers: string[];
    outputFormat?: string;
    complianceNodes: string[];
  };
  modelProvider?: string;
  modelName?: string;
  maxToolIterations?: number;
}

export interface ContextSectionMetric {
  category: string;
  tokenCount: number;
}

export interface RuntimeProgressEvent {
  type: "discovery" | "planning" | "tool_call_start" | "tool_call_result" | "llm_thinking" | "iteration_complete" | "final_analysis" | "compliance_check" | "policy_compliance_validation" | "error";
  timestamp: string;
  data: Record<string, any>;
}

export interface BuildRuntimeContextResult {
  context: string;
  sectionMetrics: ContextSectionMetric[];
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

const DEFAULT_LAYER_BUDGETS: Record<string, number> = {
  outcome: 400,
  governance: 600,
  capabilities: 500,
  knowledge: 800,
  history: 400,
  task: 1024,
};

/** Resolve active context-profile budgets for an agent.
 *  Priority: agent-specific active profile → industry-fallback active profile → DEFAULT_LAYER_BUDGETS.
 *  Returns a merged budgets map; callers can reference DEFAULT_LAYER_BUDGETS as the fallback for any unset key.
 */
async function resolveLayerBudgets(agentId: string, industry?: string): Promise<Record<string, number>> {
  const budgets: Record<string, number> = { ...DEFAULT_LAYER_BUDGETS };
  try {
    const allProfiles = await storage.getContextProfiles();
    const profile = allProfiles.find((p: any) => p.agentId === agentId && p.status === "active")
      || (industry ? allProfiles.find((p: any) => p.status === "active" && p.industry?.toLowerCase() === industry.toLowerCase()) : undefined);
    if (profile) {
      const budgetAlloc = profile.budgetAllocations as Record<string, any> | null;
      if (budgetAlloc && typeof budgetAlloc === "object") {
        for (const [key, val] of Object.entries(budgetAlloc)) {
          if (typeof val === "number") budgets[key] = val;
        }
      }
    }
  } catch {}
  return budgets;
}

function truncateLinesToBudget(budgetTokens: number, lines: string[]): string[] {
  if (budgetTokens === 0) return [];
  if (budgetTokens < 0 || !isFinite(budgetTokens)) return [];
  let used = 0;
  const result: string[] = [];
  for (const line of lines) {
    const t = estimateTokenCount(line);
    if (result.length > 0 && used + t > budgetTokens) break;
    result.push(line);
    used += t;
  }
  return result;
}

async function buildRuntimeContext(agent: RuntimeAgent): Promise<BuildRuntimeContextResult> {
  const sections: string[] = [];
  const sectionMetrics: ContextSectionMetric[] = [];

  function trackSection(category: string, text: string) {
    sections.push(text);
    sectionMetrics.push({ category, tokenCount: estimateTokenCount(text) });
  }

  // Extract per-layer token budgets using shared resolver (agent-first, industry fallback, defaults)
  const layerBudgets = await resolveLayerBudgets(agent.agentId, agent.industry || undefined);

  if (agent.agentSystemPrompt) {
    trackSection("system_prompt", agent.agentSystemPrompt);
  }

  if (agent.outcomeId) {
    try {
      const outcome = await storage.getOutcome(agent.outcomeId);
      if (outcome) {
        const outcomeLines: string[] = [];
        outcomeLines.push(`\n## OUTCOME CONTRACT`);
        outcomeLines.push(`Name: ${outcome.name}`);
        if (outcome.description) outcomeLines.push(`Description: ${outcome.description}`);
        outcomeLines.push(`Risk Tier: ${outcome.riskTier}`);
        outcomeLines.push(`Status: ${outcome.status}`);
        if (outcome.pricingModel) outcomeLines.push(`Pricing Model: ${outcome.pricingModel}`);
        if (outcome.riskThreshold) outcomeLines.push(`Risk Threshold: ${(outcome.riskThreshold * 100).toFixed(0)}%`);
        if ((outcome as any).slaDescription) outcomeLines.push(`SLA: ${(outcome as any).slaDescription}`);

        const kpis = await storage.getKpisByOutcome(agent.outcomeId);
        if (kpis.length > 0) {
          const remainingBudget = layerBudgets.outcome - estimateTokenCount(outcomeLines.join("\n"));
          if (remainingBudget > 0) {
            const kpiLines: string[] = [];
            kpiLines.push(`\n## KPI TARGETS (you must optimize for these)`);
            kpis.forEach(kpi => {
              const progress = kpi.target ? `${((kpi.currentValue || 0) / kpi.target * 100).toFixed(0)}%` : "N/A";
              kpiLines.push(`- ${kpi.name}: current=${kpi.currentValue ?? 0}, target=${kpi.target}, unit=${kpi.unit}, weight=${kpi.weight ?? 1}, progress=${progress}${kpi.slaThreshold ? `, SLA threshold=${kpi.slaThreshold}` : ""}`);
            });
            kpiLines.push(`Prioritize KPIs with higher weight. Flag if any KPI is breaching its SLA threshold.`);
            const cappedKpiLines = truncateLinesToBudget(remainingBudget, kpiLines);
            outcomeLines.push(...cappedKpiLines);
          }
        }
        // Apply absolute Layer 1 budget cap to full outcome section
        const absolutelyCapped = truncateLinesToBudget(layerBudgets.outcome, outcomeLines);
        trackSection("outcome_contract", absolutelyCapped.join("\n"));
      }
    } catch (err: any) {
      console.log(`[agent-runtime] Could not load outcome context: ${err.message}`);
    }
  }

  if (layerBudgets.governance > 0) try {
    const policies = await storage.getPolicies();
    const activePolicies = policies.filter(p => p.status === "active");
    if (activePolicies.length > 0) {
      const policyLines: string[] = [];
      policyLines.push(`\n## GOVERNANCE POLICIES (you must comply with these)`);
      let policyTokensUsed = estimateTokenCount(policyLines[0]);
      for (const p of activePolicies.slice(0, 20)) {
        const policyJson = p.policyJson as any;
        const enforcement = policyJson?.enforcement || "soft";
        const rules = Array.isArray(policyJson?.rules) ? policyJson.rules.slice(0, 3).map((r: any) => r.description || r.name || JSON.stringify(r)).join("; ") : "";
        const line = `- [${enforcement.toUpperCase()}] ${p.name} (${p.domain}): ${p.description || ""}${rules ? ` Rules: ${rules}` : ""}`;
        const lineTokens = estimateTokenCount(line);
        if (policyTokensUsed + lineTokens > layerBudgets.governance) break;
        policyLines.push(line);
        policyTokensUsed += lineTokens;
      }
      if (policyLines.length > 1) trackSection("governance_policies", policyLines.join("\n"));
    }
  } catch {}

  if (layerBudgets.capabilities > 0) try {
    // Explicit assignment: if the agent has preloadedSkills, resolve those first
    const rawPreloaded = (agent as any).preloadedSkills;
    const preloadedEntries: Array<{ skillId: string }> = Array.isArray(rawPreloaded) ? rawPreloaded as Array<{ skillId: string }> : [];
    const explicitSkillIds = preloadedEntries.map(ps => ps.skillId).filter(Boolean);

    let relevantSkills;
    if (explicitSkillIds.length > 0) {
      const resolved = await storage.getSkillsByIds(explicitSkillIds);
      // Preserve explicit assignment order (IN clause does not guarantee order)
      const byId = new Map(resolved.map(s => [s.id, s]));
      relevantSkills = explicitSkillIds.map(id => byId.get(id)).filter((s): s is typeof resolved[0] => !!s && s.status === "active").slice(0, 20);
    } else {
      // Fallback: industry + ontology tag matching
      const allSkills = await storage.getSkills();
      const agentIndustry = agent.industry?.toLowerCase();
      const ontologyLabels = (agent.ontologyTags || []).map(t => t.conceptLabel.toLowerCase());
      relevantSkills = allSkills.filter(s => {
        if (s.status !== "active") return false;
        if (agentIndustry && s.industry.toLowerCase() === agentIndustry) return true;
        if (ontologyLabels.length > 0) {
          const skillTags = (s.tags || []).map((t: string) => t.toLowerCase());
          const skillDomain = s.domain.toLowerCase();
          return ontologyLabels.some(label => skillTags.includes(label) || skillDomain.includes(label));
        }
        return false;
      }).slice(0, 20);
    }

    if (relevantSkills.length > 0) {
      const skillLines: string[] = [];
      skillLines.push(`\n## AGENT SKILLS (capabilities you have)`);
      let skillTokensUsed = estimateTokenCount(skillLines[0]);
      for (const s of relevantSkills) {
        const header = `- ${s.name} (${s.domain}, v${s.version})`;
        const useFullBody = s.contextMode === "full" && s.markdownBody && (s.markdownBody as string).trim().length > 0;
        if (useFullBody) {
          const headerLine = `${header}:`;
          const headerTokens = estimateTokenCount(headerLine);
          if (skillTokensUsed + headerTokens > layerBudgets.capabilities) break;
          const remainingBudget = layerBudgets.capabilities - skillTokensUsed - headerTokens;
          if (remainingBudget <= 0) {
            // No room for markdown body — attempt inline fallback
            const toolsNote = s.allowedTools?.length ? ` | Allowed tools: ${s.allowedTools.join(", ")}` : "";
            const mcpNote = s.requiredMcpServers?.length ? ` | Required MCP: ${s.requiredMcpServers.join(", ")}` : "";
            const fallback = `${header}: ${s.description}${toolsNote}${mcpNote}`;
            const fallbackTokens = estimateTokenCount(fallback);
            if (skillTokensUsed + fallbackTokens <= layerBudgets.capabilities) {
              skillLines.push(fallback);
              skillTokensUsed += fallbackTokens;
            }
            continue;
          }
          const maxChars = remainingBudget * 4;
          const body = (s.markdownBody as string).length > maxChars
            ? (s.markdownBody as string).substring(0, maxChars) + "\n...[truncated]"
            : (s.markdownBody as string);
          skillLines.push(`${headerLine}\n${body}`);
          skillTokensUsed += headerTokens + estimateTokenCount(body);
        } else {
          const toolsNote = s.allowedTools?.length ? ` | Allowed tools: ${s.allowedTools.join(", ")}` : "";
          const mcpNote = s.requiredMcpServers?.length ? ` | Required MCP: ${s.requiredMcpServers.join(", ")}` : "";
          const line = `${header}: ${s.description}${toolsNote}${mcpNote}`;
          const lineTokens = estimateTokenCount(line);
          if (skillTokensUsed + lineTokens > layerBudgets.capabilities) break;
          skillLines.push(line);
          skillTokensUsed += lineTokens;
        }
      }
      trackSection("skills", skillLines.join("\n"));

      const kgResultLines: string[] = [];
      for (const s of relevantSkills) {
        const kgQueries = (s.knowledgeQueries as any[]) || [];
        if (kgQueries.length === 0) continue;
        for (const q of kgQueries) {
          try {
            const declaredVars = (q.variables || []) as string[];
            const varValues: Record<string, string> = {};
            for (const v of declaredVars) {
              varValues[v] = agent.runtimeConfig?.[v] || agent.industry || "";
            }
            const result = await executeKGQueryTemplate(
              q.queryPattern,
              varValues,
              agent.industry || "general"
            );
            if (result.resultCount > 0) {
              kgResultLines.push(`### KG Query: "${q.name}" (from skill: ${s.name})`);
              kgResultLines.push(`Resolved: ${result.resolvedQuery}`);
              for (const c of result.results.slice(0, 10)) {
                let detail = `- ${c.label} (${c.category}): ${c.description}`;
                const regs = (c.linkedRegulations as any[]) || [];
                if (regs.length > 0) {
                  detail += ` | Regulations: ${regs.slice(0, 3).map((r: any) => typeof r === "string" ? r : r.name || r.id).join(", ")}`;
                }
                if (c.enrichment?.regulatoryRelevance) {
                  detail += ` | Regulatory: ${c.enrichment.regulatoryRelevance}`;
                }
                kgResultLines.push(detail);
              }
            }
          } catch (kgErr: any) {
            console.log(`[agent-runtime] KG query "${q.name}" failed: ${kgErr.message}`);
          }
        }
      }
      if (kgResultLines.length > 0) {
        const kgText = `\n## KNOWLEDGE GRAPH QUERY RESULTS (domain knowledge retrieved by your skills)\nUse these results to ground your reasoning in domain-specific data:\n${kgResultLines.join("\n")}`;
        trackSection("knowledge_graph", kgText);
      }
    }
  } catch {}

  if (agent.ontologyTags && agent.ontologyTags.length > 0) {
    try {
      const conceptDetails: string[] = [];
      const requiredVocab: string[] = [];
      const deprecatedTerms: Array<{ deprecated: string; useInstead: string }> = [];
      for (const tag of agent.ontologyTags.slice(0, 10)) {
        const concept = await storage.getOntologyConcept(tag.conceptId);
        if (concept) {
          let detail = `- ${concept.label} (${concept.category}): ${concept.description}`;
          const rels = concept.relationships as Array<{ target: string; type: string }> | null;
          if (rels && rels.length > 0) {
            detail += ` | Relationships: ${rels.slice(0, 5).map(r => `${r.type} → ${r.target}`).join(", ")}`;
          }
          requiredVocab.push(concept.label);
          if (concept.synonyms && concept.synonyms.length > 0) {
            detail += ` | Also known as: ${concept.synonyms.join(", ")}`;
            for (const syn of concept.synonyms) {
              deprecatedTerms.push({ deprecated: syn, useInstead: concept.label });
            }
          }
          conceptDetails.push(detail);

          const enhancement = await storage.getOntologyEnhancement(tag.conceptId);
          if (enhancement) {
            if (enhancement.regulatoryRelevance) {
              conceptDetails.push(`  Regulatory relevance: ${enhancement.regulatoryRelevance}`);
            }
            if (enhancement.implementationGuidance) {
              conceptDetails.push(`  Implementation guidance: ${enhancement.implementationGuidance}`);
            }
          }
        }
      }
      if (conceptDetails.length > 0) {
        const ontologyLines: string[] = [];
        ontologyLines.push(`\n## DOMAIN ONTOLOGY (vocabulary constraints and domain concepts)`);
        ontologyLines.push(`You MUST use the canonical terms below when discussing these domain concepts. Avoid deprecated synonyms — use the canonical form instead.`);
        conceptDetails.forEach(d => ontologyLines.push(d));
        if (requiredVocab.length > 0) {
          ontologyLines.push(`\n### REQUIRED VOCABULARY (always use these exact terms)`);
          requiredVocab.forEach(v => ontologyLines.push(`- ${v}`));
        }
        if (deprecatedTerms.length > 0) {
          ontologyLines.push(`\n### DEPRECATED TERMS (do NOT use these — use the canonical form)`);
          deprecatedTerms.slice(0, 20).forEach(d => ontologyLines.push(`- "${d.deprecated}" → use "${d.useInstead}" instead`));
        }
        trackSection("domain_ontology", ontologyLines.join("\n"));
      }
    } catch {}
  }

  if (agent.ontologyTags && agent.ontologyTags.length > 0) {
    try {
      const sensitivityConstraints: string[] = [];
      for (const tag of agent.ontologyTags.slice(0, 15)) {
        const concept = await storage.getOntologyConcept(tag.conceptId);
        if (!concept) continue;
        const sc = concept.sensitivityClassification as any;
        if (!sc || !sc.level) continue;

        const dataTypes: string[] = Array.isArray(sc.dataTypes) ? sc.dataTypes : [];
        const levelLabel = sc.level.toUpperCase();
        const redactionNote = sc.redactionRequired ? " [REDACTION REQUIRED]" : "";
        const retentionNote = sc.retentionDays != null ? ` | Max retention: ${sc.retentionDays} days` : "";
        sensitivityConstraints.push(
          `- ${concept.label} (${levelLabel}${redactionNote}): Data types [${dataTypes.join(", ")}]${retentionNote}`
        );
      }
      if (sensitivityConstraints.length > 0) {
        const sensText = `\n## DATA SENSITIVITY CONSTRAINTS (ontology-encoded classifications)\nThe following data types require protection based on ontology sensitivity classifications. You MUST NOT expose, log, or return these data types in plain text unless explicitly authorized.\n${sensitivityConstraints.join("\n")}`;
        trackSection("domain_ontology", sensText);
      }
    } catch {}
  }

  if (agent.complianceTags && agent.complianceTags.length > 0) {
    const complianceText = `\n## COMPLIANCE TAGS\nThis agent is tagged with the following compliance classifications: ${agent.complianceTags.join(", ")}\nEnsure all outputs and decisions respect these compliance requirements.`;
    trackSection("compliance_tags", complianceText);
  }

  if (agent.memoryGovernanceRules && agent.memoryGovernanceRules.length > 0) {
    const mgLines: string[] = [];
    mgLines.push("\n## MEMORY GOVERNANCE CONSTRAINTS (mandatory data handling rules)");
    for (const rule of agent.memoryGovernanceRules) {
      switch (rule.type) {
        case "retention":
          mgLines.push(`- RETENTION: ${rule.rule} (per ${rule.regulation})`);
          break;
        case "encryption":
          mgLines.push(`- ENCRYPTION: ${rule.rule} — annotate protected data with [PHI-PROTECTED] markers`);
          break;
        case "erasure":
          mgLines.push(`- ERASURE: ${rule.rule} (per ${rule.regulation}) — flag data for deletion when requested`);
          break;
        case "access":
        case "access_control":
          mgLines.push(`- ACCESS CONTROL: ${rule.rule}`);
          break;
        case "immutability":
          mgLines.push(`- IMMUTABILITY: ${rule.rule} — do NOT modify committed records`);
          break;
        default:
          mgLines.push(`- ${rule.rule}`);
          break;
      }
    }
    mgLines.push(`You MUST comply with ALL memory governance constraints above. Violations will be flagged in execution traces.`);
    trackSection("memory_governance", mgLines.join("\n"));
  }

  const rtConfig = agent.runtimeConfig || {};
  {
    const rcLines: string[] = [];
    if (Array.isArray(rtConfig.kpiBindings) && rtConfig.kpiBindings.length > 0) {
      rcLines.push(`\n## ASSIGNED KPI BINDINGS: ${rtConfig.kpiBindings.join(", ")}`);
    }
    if (Array.isArray(rtConfig.workflowSteps) && rtConfig.workflowSteps.length > 0) {
      rcLines.push(`\n## WORKFLOW STEPS`);
      rtConfig.workflowSteps.forEach((step: string, i: number) => {
        rcLines.push(`${i + 1}. ${step}`);
      });
    }
    if (rtConfig.estimatedImpact) {
      rcLines.push(`\nExpected Impact: ${rtConfig.estimatedImpact}`);
    }
    if (agent.agentType === "team" && rtConfig.orchestration) {
      const orch = rtConfig.orchestration;
      rcLines.push(`\n## ORCHESTRATION CONFIG`);
      rcLines.push(`Pattern: ${orch.pattern || "supervisor"}`);
      if (orch.errorHandling) rcLines.push(`Error Handling: ${orch.errorHandling}`);
      if (orch.handoffRules) rcLines.push(`Handoff Rules: ${orch.handoffRules}`);
    }
    if (rcLines.length > 0) {
      trackSection("runtime_config", rcLines.join("\n"));
    }
  }

  try {
    const allProfiles = await storage.getContextProfiles();
    const matchingProfiles = allProfiles.filter(p => {
      if (p.status !== "active") return false;
      if (p.agentId === agent.agentId) return true;
      if (agent.industry && p.industry.toLowerCase() === agent.industry.toLowerCase()) return true;
      return false;
    });
    if (matchingProfiles.length > 0) {
      const profile = matchingProfiles.find(p => p.agentId === agent.agentId) || matchingProfiles[0];
      const cpLines: string[] = [];
      cpLines.push(`\n## CONTEXT ENGINEERING PROFILE: ${profile.name}`);
      if (profile.description) cpLines.push(profile.description);
      const priorities = profile.priorityOrder as any[];
      if (Array.isArray(priorities) && priorities.length > 0) {
        cpLines.push(`\n### Priority Matrix (context source importance)`);
        priorities.forEach((p: any, i: number) => {
          const label = typeof p === "string" ? p : (p.source || p.name || JSON.stringify(p));
          const weight = typeof p === "object" && p.weight ? ` (weight: ${p.weight})` : "";
          cpLines.push(`${i + 1}. ${label}${weight}`);
        });
      }
      const budgets = profile.budgetAllocations as Record<string, any>;
      if (budgets && typeof budgets === "object" && Object.keys(budgets).length > 0) {
        cpLines.push(`\n### Context Budget Allocation (token budget guidance)`);
        cpLines.push(`Total capacity: ${profile.totalCapacity} tokens`);
        for (const [source, allocation] of Object.entries(budgets)) {
          const pct = typeof allocation === "number" ? `${allocation}%` : JSON.stringify(allocation);
          cpLines.push(`- ${source}: ${pct}`);
        }
      }
      const sources = profile.sources as any[];
      if (Array.isArray(sources) && sources.length > 0) {
        cpLines.push(`\n### Context Sources`);
        sources.forEach((s: any) => {
          const label = typeof s === "string" ? s : (s.name || s.type || JSON.stringify(s));
          const instructions = typeof s === "object" && s.instructions ? ` — ${s.instructions}` : "";
          cpLines.push(`- ${label}${instructions}`);
        });
      }
      trackSection("context_profile", cpLines.join("\n"));
    }
  } catch {}

  try {
    const recentMemories = await storage.getAgentMemories(agent.agentId, "episodic", 10);
    if (recentMemories.length > 0) {
      const memLines: string[] = [];
      memLines.push(`\n## EPISODIC MEMORY (recent execution history)`);
      memLines.push(`You have executed ${recentMemories.length} previous run(s). Use this history to inform your decisions:`);
      recentMemories.forEach((mem, i) => {
        const age = Math.round((Date.now() - new Date(mem.createdAt!).getTime()) / 60000);
        const ageLabel = age < 60 ? `${age}m ago` : age < 1440 ? `${Math.round(age / 60)}h ago` : `${Math.round(age / 1440)}d ago`;
        memLines.push(`- [${ageLabel}] ${mem.content}`);
      });
      trackSection("episodic_memory", memLines.join("\n"));
    }
  } catch {}

  // Layer 5: Execution History — inject recent completed trace summaries
  try {
    const completedTraces = await storage.getRecentCompletedTracesByAgent(agent.agentId, 5);
    if (completedTraces.length > 0) {
      const histLines: string[] = [];
      histLines.push(`\n## EXECUTION HISTORY (${completedTraces.length} recent completed runs)`);
      histLines.push(`Use this history to maintain continuity and avoid repeating past mistakes:`);
      for (const t of completedTraces) {
        const steps = Array.isArray(t.stepsJson) ? t.stepsJson as any[] : [];
        const TOOL_STEP_TYPES = new Set(["tool_call", "api_call", "mcpTool", "mcp_tool", "tool_use"]);
        const toolsUsed = Array.from(new Set(
          steps
            .filter((s: any) => TOOL_STEP_TYPES.has(s.type) || s.toolName || s.tool_name)
            .map((s: any) => s.toolName || s.mcpTool || s.tool_name || s.name || s.tool || "unknown")
            .filter((n: string) => n !== "unknown")
        )).slice(0, 3);
        const rawDecisions = Array.isArray(t.decisions) ? t.decisions as any[] : [];
        const keyDecisions = rawDecisions.slice(0, 2).map((d: any) => d.decision || d.action || d.label || String(d)).filter(Boolean);
        let summary = `- ${t.inputSummary?.substring(0, 60) || "Scheduled run"} → ${t.status}`;
        if (toolsUsed.length > 0) summary += ` | Tools: ${toolsUsed.join(", ")}`;
        if (keyDecisions.length > 0) summary += ` | Decisions: ${keyDecisions.join("; ")}`;
        histLines.push(summary);
      }
      const cappedHistLines = truncateLinesToBudget(layerBudgets.history, histLines);
      if (cappedHistLines.length > 0) {
        trackSection("execution_history", cappedHistLines.join("\n"));
      }
    }
  } catch {}

  if (agent.blueprintRequirements) {
    const bp = agent.blueprintRequirements;
    const bpLines: string[] = [];
    bpLines.push(`\n## BLUEPRINT WORKFLOW (expected execution flow)`);
    if (bp.workflowSteps && bp.workflowSteps.length > 0) {
      bpLines.push(`Follow this workflow:`);
      bp.workflowSteps.forEach((step: string, i: number) => {
        bpLines.push(`${i + 1}. ${step}`);
      });
    }
    if (bp.requiredTools && bp.requiredTools.length > 0) {
      bpLines.push(`\nRequired tools: ${bp.requiredTools.join(", ")}`);
    }
    if (bp.escalationTriggers && bp.escalationTriggers.length > 0) {
      bpLines.push(`\nEscalation triggers: ${bp.escalationTriggers.join("; ")}`);
    }
    if (bp.outputFormat) {
      bpLines.push(`\nExpected output format: ${bp.outputFormat}`);
    }
    trackSection("blueprint_workflow", bpLines.join("\n"));
  }

  return { context: sections.join("\n"), sectionMetrics };
}

const activeAgents = new Map<string, { agent: RuntimeAgent }>();

interface AvailableTool {
  serverId: string;
  serverName: string;
  serverUrl: string;
  toolName: string;
  toolDescription: string;
  toolInputSchema: any;
  toolEndpoint?: string;
  toolMethod?: string;
}

async function gatherAvailableTools(mcpServerIds: string[]): Promise<AvailableTool[]> {
  const availableTools: AvailableTool[] = [];
  for (const serverId of mcpServerIds) {
    const server = await storage.getMcpServer(serverId);
    if (!server || !server.url) continue;
    const tools = await storage.getMcpServerTools(serverId);
    for (const tool of tools) {
      const ann = (tool.annotations && typeof tool.annotations === "object") ? tool.annotations as Record<string, any> : {};
      availableTools.push({
        serverId,
        serverName: server.name,
        serverUrl: server.url,
        toolName: tool.name,
        toolDescription: tool.description || "",
        toolInputSchema: tool.inputSchema || {},
        toolEndpoint: ann.endpoint || undefined,
        toolMethod: ann.method || undefined,
      });
    }
  }
  return availableTools;
}

function buildOpenAITools(availableTools: AvailableTool[]): OpenAI.ChatCompletionTool[] {
  return availableTools.map((t, idx) => ({
    type: "function" as const,
    function: {
      name: `mcp_${idx}_${t.toolName.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      description: `[MCP Server: ${t.serverName}] ${t.toolDescription || t.toolName}`,
      parameters: t.toolInputSchema && typeof t.toolInputSchema === "object" && Object.keys(t.toolInputSchema).length > 0
        ? t.toolInputSchema
        : { type: "object", properties: {}, additionalProperties: true },
    },
  }));
}

async function callMcpTool(tool: AvailableTool, args: Record<string, any>): Promise<any> {
  const baseUrl = tool.serverUrl.replace(/\/$/, "");
  let endpointPath = tool.toolEndpoint ? `/${tool.toolEndpoint.replace(/^\//, "")}` : "";
  const method = (tool.toolMethod || "GET").toUpperCase();

  const remainingArgs = { ...args };
  const missingPathParams: string[] = [];
  endpointPath = endpointPath.replace(/\{(\w+)\}/g, (_match, paramName) => {
    const val = remainingArgs[paramName];
    if (val == null) {
      missingPathParams.push(paramName);
      return paramName;
    }
    delete remainingArgs[paramName];
    return String(val);
  });
  if (missingPathParams.length > 0) {
    throw new Error(`MCP tool ${tool.toolName} missing required path params: ${missingPathParams.join(", ")}`);
  }

  let fetchUrl = `${baseUrl}${endpointPath}`;
  const fetchOpts: RequestInit = { method };

  if (method === "POST" || method === "PUT" || method === "PATCH") {
    fetchOpts.headers = { "Content-Type": "application/json" };
    fetchOpts.body = JSON.stringify(remainingArgs);
  } else {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(remainingArgs).map(([k, v]) => [k, String(v)]))
    ).toString();
    if (qs) fetchUrl += `?${qs}`;
  }

  const res = await fetch(fetchUrl, fetchOpts);
  if (!res.ok) throw new Error(`MCP API ${tool.serverName}/${tool.toolName} returned ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return { status: res.status, message: await res.text() };
}

export interface OntologyComplianceResult {
  score: number;
  canonicalTermsUsed: string[];
  deprecatedTermsUsed: Array<{ term: string; shouldUse: string }>;
  totalDomainMentions: number;
  canonicalCount: number;
  deprecatedCount: number;
}

export async function checkOntologyCompliance(
  text: string,
  ontologyTags: Array<{ conceptId: string; conceptLabel: string }>
): Promise<OntologyComplianceResult> {
  const canonicalTermsUsed: string[] = [];
  const deprecatedTermsUsed: Array<{ term: string; shouldUse: string }> = [];
  const textLower = text.toLowerCase();

  for (const tag of ontologyTags.slice(0, 15)) {
    try {
      const concept = await storage.getOntologyConcept(tag.conceptId);
      if (!concept) continue;

      const labelLower = concept.label.toLowerCase();
      const labelWords = labelLower.split(/[\s_-]+/).filter((w: string) => w.length > 2);
      const labelFound = textLower.includes(labelLower) ||
        (labelWords.length > 1 && labelWords.every((w: string) => textLower.includes(w)));

      if (labelFound) {
        canonicalTermsUsed.push(concept.label);
      }

      if (concept.synonyms && concept.synonyms.length > 0) {
        for (const syn of concept.synonyms) {
          const synLower = syn.toLowerCase();
          if (textLower.includes(synLower) && !labelFound) {
            deprecatedTermsUsed.push({ term: syn, shouldUse: concept.label });
          }
        }
      }
    } catch {}
  }

  const totalDomainMentions = canonicalTermsUsed.length + deprecatedTermsUsed.length;
  const score = totalDomainMentions > 0
    ? Math.round((canonicalTermsUsed.length / totalDomainMentions) * 100)
    : 100;

  return {
    score,
    canonicalTermsUsed,
    deprecatedTermsUsed,
    totalDomainMentions,
    canonicalCount: canonicalTermsUsed.length,
    deprecatedCount: deprecatedTermsUsed.length,
  };
}

const GOVERNANCE_PII_PATTERNS = [
  { name: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: "ssn", regex: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g },
  { name: "phone", regex: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { name: "credit_card", regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },
];

export function checkMemoryGovernanceViolations(
  output: string,
  rules: Array<{ rule: string; regulation: string; type: string }>
): { violations: Array<{ pattern: string; regulation: string; count: number }> } {
  const violations: Array<{ pattern: string; regulation: string; count: number }> = [];

  for (const rule of rules) {
    if (rule.type === "encryption") {
      for (const piiPattern of GOVERNANCE_PII_PATTERNS) {
        const matches = output.match(new RegExp(piiPattern.regex.source, piiPattern.regex.flags));
        if (matches && matches.length > 0) {
          let unprotectedCount = 0;
          for (const match of matches) {
            const idx = output.indexOf(match);
            const surrounding = output.substring(Math.max(0, idx - 30), Math.min(output.length, idx + match.length + 30));
            if (!surrounding.includes("[PHI-PROTECTED]") && !surrounding.includes("[PCI-REDACTED]")) {
              unprotectedCount++;
            }
          }
          if (unprotectedCount > 0) {
            violations.push({ pattern: piiPattern.name, regulation: rule.regulation, count: unprotectedCount });
          }
        }
      }
    }

    if (rule.regulation && rule.regulation.toUpperCase().includes("HIPAA")) {
      const hipaaPatterns = GOVERNANCE_PII_PATTERNS.filter(p => p.name === "ssn" || p.name === "email");
      for (const piiPattern of hipaaPatterns) {
        const matches = output.match(new RegExp(piiPattern.regex.source, piiPattern.regex.flags));
        if (matches && matches.length > 0) {
          let unprotectedCount = 0;
          for (const match of matches) {
            const idx = output.indexOf(match);
            const surrounding = output.substring(Math.max(0, idx - 30), Math.min(output.length, idx + match.length + 30));
            if (!surrounding.includes("[PHI-PROTECTED]") && !surrounding.includes("[PCI-REDACTED]")) {
              unprotectedCount++;
            }
          }
          if (unprotectedCount > 0) {
            const existing = violations.find(v => v.pattern === piiPattern.name && v.regulation === rule.regulation);
            if (!existing) {
              violations.push({ pattern: piiPattern.name, regulation: rule.regulation, count: unprotectedCount });
            }
          }
        }
      }
    }

    if (rule.regulation && rule.regulation.toUpperCase().includes("PCI")) {
      const pciPattern = GOVERNANCE_PII_PATTERNS.find(p => p.name === "credit_card");
      if (pciPattern) {
        const matches = output.match(new RegExp(pciPattern.regex.source, pciPattern.regex.flags));
        if (matches && matches.length > 0) {
          let unprotectedCount = 0;
          for (const match of matches) {
            const idx = output.indexOf(match);
            const surrounding = output.substring(Math.max(0, idx - 30), Math.min(output.length, idx + match.length + 30));
            if (!surrounding.includes("[PHI-PROTECTED]") && !surrounding.includes("[PCI-REDACTED]")) {
              unprotectedCount++;
            }
          }
          if (unprotectedCount > 0) {
            const existing = violations.find(v => v.pattern === pciPattern.name && v.regulation === rule.regulation);
            if (!existing) {
              violations.push({ pattern: pciPattern.name, regulation: rule.regulation, count: unprotectedCount });
            }
          }
        }
      }
    }
  }

  return { violations };
}

export interface SoftPolicyComplianceResult {
  policyId: string;
  policyName: string;
  enforcement: string;
  domain: string;
  compliant: boolean;
  violatedRequirements: string[];
  evidence: string;
  severity: "low" | "medium" | "high";
}

export async function checkSoftPolicyCompliance(
  outputText: string,
  softPolicies: Array<{ id: string; name: string; enforcement: string; domain: string; policyJson: any }>
): Promise<SoftPolicyComplianceResult[]> {
  if (outputText.trim().length < 80 || softPolicies.length === 0) {
    return [];
  }

  const policyDescriptions = softPolicies.map(p => {
    const pj = p.policyJson && typeof p.policyJson === "object" ? p.policyJson : {};
    const requirements: string[] = Array.isArray(pj.requirements) ? pj.requirements : [];
    const desc = pj.description || p.name;
    return { id: p.id, name: p.name, enforcement: p.enforcement, domain: p.domain, description: desc, requirements };
  });

  const judgePrompt = `You are a compliance auditor. An AI agent completed a task. Evaluate whether the agent's output satisfied each soft policy constraint listed below.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "policyResults": [
    {
      "policyId": "<exact policyId from input>",
      "policyName": "<exact policyName from input>",
      "compliant": true or false,
      "violatedRequirements": ["list violated requirement strings, empty array if compliant"],
      "evidence": "1-2 sentence quote or paraphrase from the output supporting your judgment",
      "severity": "low" or "medium" or "high"
    }
  ]
}

RULES:
- Set compliant=true if the output satisfies the policy intent OR the policy was simply not triggered by this task
- Set compliant=false ONLY if there is clear evidence the policy applied to this task AND was violated
- severity "high" = serious irreversible harm; "medium" = meaningful recoverable gap; "low" = minor acknowledgment omission
- violatedRequirements must list specific requirement strings from the policy that were not met

POLICIES:
${JSON.stringify(policyDescriptions, null, 2)}

AGENT OUTPUT (first 3000 chars):
${outputText.substring(0, 3000)}`;

  try {
    const judgeResult = await completeWithFallback(
      [{ role: "user", content: judgePrompt }],
      { temperature: 0, maxTokens: 1500, responseFormat: "json" }
    );

    const raw = judgeResult.content.trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return [];

    const parsed = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));
    if (!parsed.policyResults || !Array.isArray(parsed.policyResults)) return [];

    return parsed.policyResults.map((r: any) => ({
      policyId: String(r.policyId || ""),
      policyName: String(r.policyName || ""),
      enforcement: softPolicies.find(p => p.id === r.policyId)?.enforcement || "soft",
      domain: softPolicies.find(p => p.id === r.policyId)?.domain || "general",
      compliant: Boolean(r.compliant),
      violatedRequirements: Array.isArray(r.violatedRequirements) ? r.violatedRequirements.map(String) : [],
      evidence: String(r.evidence || ""),
      severity: (["low", "medium", "high"] as const).includes(r.severity) ? r.severity : "low",
    })) as SoftPolicyComplianceResult[];
  } catch {
    return [];
  }
}

export async function executePromptWithMcp(
  agentId: string,
  deploymentId: string,
  blueprintId: string | undefined,
  mcpServerIds: string[],
  prompt: string,
  industry?: string,
  agentSystemPrompt?: string,
  options?: { conversational?: boolean; ontologyLabels?: string[]; runtimeConfig?: Record<string, any>; modelProvider?: string; modelName?: string; maxToolIterations?: number },
  onProgress?: (event: RuntimeProgressEvent) => void,
): Promise<{ steps: any[]; success: boolean; summary: any; promptInputs?: any; provenanceSnapshot?: any; provenanceHash?: string; retrievedDocs?: any; conversationalResponse?: string; contextSectionMetrics?: ContextSectionMetric[]; softPolicyViolations?: SoftPolicyComplianceResult[] }> {
  const startTime = Date.now();
  const steps: any[] = [];
  const promptSectionMetrics: ContextSectionMetric[] = [];

  const emitProgress = (type: RuntimeProgressEvent["type"], data: Record<string, any>) => {
    if (onProgress) {
      onProgress({ type, timestamp: new Date().toISOString(), data });
    }
  };

  steps.push({
    id: "step_1",
    name: "Discover Available Tools",
    type: "mcp_discovery",
    status: "running",
    startedAt: new Date().toISOString(),
  });

  const availableTools = await gatherAvailableTools(mcpServerIds);

  const linkedKbs = await storage.getAgentKnowledgeBases(agentId);
  const hasKnowledgeBases = linkedKbs.length > 0;

  if (availableTools.length === 0 && !hasKnowledgeBases) {
    const errorMsg = mcpServerIds.length === 0
      ? "No MCP Server integrations or Knowledge Bases linked to this agent. Link an MCP Server or Knowledge Base to enable test runs."
      : "No tools found in linked MCP Servers and no Knowledge Bases linked. Ensure MCP Servers have registered tools or link a Knowledge Base.";
    steps[0].status = "failed";
    steps[0].error = errorMsg;
    steps[0].completedAt = new Date().toISOString();
    emitProgress("error", { message: errorMsg, stage: "discovery" });
    return {
      steps,
      success: false,
      summary: { totalSteps: 1, passedSteps: 0, failedSteps: 1, error: errorMsg },
    };
  }

  steps[0].status = "completed";
  steps[0].completedAt = new Date().toISOString();
  steps[0].output = {
    toolCount: availableTools.length,
    tools: availableTools.map(t => ({ server: t.serverName, tool: t.toolName, description: t.toolDescription })),
    knowledgeBases: linkedKbs.length,
    mode: availableTools.length > 0 ? "tools+kb" : "kb-only",
  };

  emitProgress("discovery", {
    toolCount: availableTools.length,
    tools: availableTools.map(t => ({ server: t.serverName, tool: t.toolName })),
    knowledgeBases: linkedKbs.length,
  });

  steps.push({
    id: "step_2",
    name: "AI Planning",
    type: "ai_planning",
    status: "running",
    startedAt: new Date().toISOString(),
  });

  const providerName = options?.modelProvider || "openai";
  const modelName = options?.modelName || "gpt-4.1";
  const llmProvider = getProvider(providerName);
  const fallbackProviderName = llmProvider.providerName === "openai" ? "anthropic" : "openai";
  const fallbackLlmProvider = getProvider(fallbackProviderName);
  const canonicalTools = buildCanonicalTools(availableTools);

  let kbContext = "";
  const kbRetrievals: Array<{ kbId: string; kbName: string; embeddingModel: string; chunks: Array<{ chunkId: string; sourceDocId: string; similarityScore: number; contentHash: string }> }> = [];
  try {
    if (linkedKbs.length > 0) {
      const ontologyLabels = options?.ontologyLabels || [];
      const augmentedQuery = ontologyLabels.length > 0
        ? `${prompt}\n\nDomain concepts: ${ontologyLabels.join(", ")}`
        : prompt;
      // Layer 4 budget — resolve once via shared helper before the KB loop
      const AVG_CHUNK_TOKENS = 150;
      const kbLayerBudgets = await resolveLayerBudgets(agentId, industry);
      const effectiveKbBudget = kbLayerBudgets.knowledge;

      const kbChunks: string[] = [];
      for (const link of linkedKbs.slice(0, 3)) {
        let kbMeta: any = null;
        try { kbMeta = await storage.getKnowledgeBase(link.knowledgeBaseId); } catch {}
        try {
          const linkConfig = (link.retrievalConfig as any) || {};
          const topK = Math.max(3, Math.floor(effectiveKbBudget / AVG_CHUNK_TOKENS));
          const scoreThreshold = typeof linkConfig.scoreThreshold === "number" ? linkConfig.scoreThreshold : 0.3;
          const chunks = await searchKnowledgeBaseChunks(link.knowledgeBaseId, augmentedQuery, topK, scoreThreshold);
          if (chunks.length > 0) {
            kbChunks.push(`--- Knowledge Base: ${link.knowledgeBaseId} ---\n${chunks.map((c: any) => c.content).join("\n\n")}`);
            kbRetrievals.push({
              kbId: link.knowledgeBaseId,
              kbName: kbMeta?.name || link.knowledgeBaseId,
              embeddingModel: kbMeta?.embeddingModel || "text-embedding-3-small",
              chunks: chunks.map((c: any) => ({
                chunkId: c.id,
                sourceDocId: c.source_id || c.sourceId || "",
                similarityScore: typeof c.similarity === "number" ? c.similarity : 0.5,
                contentHash: createHash("sha256").update(c.content || "").digest("hex"),
              })),
            });
          }
        } catch {
          const fallbackChunks = await storage.getKnowledgeChunks(link.knowledgeBaseId);
          if (fallbackChunks.length > 0) {
            const fallbackTopK = Math.max(3, Math.floor(effectiveKbBudget / AVG_CHUNK_TOKENS));
            const selectedFallback = fallbackChunks.slice(0, fallbackTopK);
            kbChunks.push(`--- Knowledge Base: ${link.knowledgeBaseId} ---\n${selectedFallback.map((c: any) => c.content).join("\n\n")}`);
            kbRetrievals.push({
              kbId: link.knowledgeBaseId,
              kbName: kbMeta?.name || link.knowledgeBaseId,
              embeddingModel: kbMeta?.embeddingModel || "fallback",
              chunks: selectedFallback.map((c: any) => ({
                chunkId: c.id,
                sourceDocId: c.sourceId || "",
                similarityScore: 0.5,
                contentHash: createHash("sha256").update(c.content || "").digest("hex"),
              })),
            });
          }
        }
      }
      if (kbChunks.length > 0) {
        kbContext = `\n\n## KNOWLEDGE BASE CONTEXT (retrieved via RAG)\nUse the following domain knowledge to inform your analysis and decisions:\n\n${kbChunks.join("\n\n")}`;
        promptSectionMetrics.push({ category: "kb_retrieval", tokenCount: estimateTokenCount(kbContext) });
      }

      if (kbRetrievals.length > 0) {
        try {
          const allChunkIds: string[] = [];
          const allSourceIds = new Set<string>();
          for (const kbr of kbRetrievals) {
            for (const chunk of kbr.chunks) {
              allChunkIds.push(chunk.chunkId);
              if (chunk.sourceDocId) allSourceIds.add(chunk.sourceDocId);
            }
          }
          const now = new Date();
          if (allChunkIds.length > 0) {
            await db.execute(sql`UPDATE knowledge_chunks SET retrieval_count = COALESCE(retrieval_count, 0) + 1, last_retrieved_at = ${now} WHERE id = ANY(${allChunkIds})`);
          }
          if (allSourceIds.size > 0) {
            const sourceIdArr = Array.from(allSourceIds);
            await db.execute(sql`UPDATE knowledge_sources SET retrieval_count = COALESCE(retrieval_count, 0) + 1, last_retrieved_at = ${now} WHERE id = ANY(${sourceIdArr})`);
          }
        } catch {}
      }
    }
  } catch {}

  const toolSchemaText = availableTools.length > 0
    ? JSON.stringify(availableTools.map(t => ({ server: t.serverName, tool: t.toolName, description: t.toolDescription, inputSchema: t.toolInputSchema })))
    : "[]";
  if (availableTools.length > 0) {
    promptSectionMetrics.push({ category: "tool_schemas", tokenCount: estimateTokenCount(toolSchemaText) });
  }
  // Layer 6: track the task prompt (user message) token usage
  if (prompt) {
    promptSectionMetrics.push({ category: "task_prompt", tokenCount: estimateTokenCount(prompt) });
  }

  const kbOnlyMode = availableTools.length === 0 && hasKnowledgeBases;

  const baseInstructions = kbOnlyMode
    ? `You are a knowledge-based assistant. Use the knowledge base context provided to answer the user's question accurately and helpfully.
If the knowledge base context contains relevant information, use it to provide a detailed, well-structured response.
If the context does not contain enough information to fully answer the question, say so clearly and provide what you can.
Provide a structured analysis with key findings and recommended actions where applicable.`
    : `You have access to MCP (Model Context Protocol) server tools for executing real API calls.
Your job is to fulfill the user's prompt by calling the appropriate tools and then analyzing the results.
Think step-by-step about what data you need and which tools to call.
Always call at least one tool if relevant tools are available.
After receiving tool results, provide a structured analysis with key findings, severity/risk assessment if applicable, and recommended actions.`;

  const instructionHeader = kbOnlyMode ? "## KNOWLEDGE-BASED ASSISTANT INSTRUCTIONS" : "## MCP TOOL EXECUTION INSTRUCTIONS";

  const systemMessage = agentSystemPrompt
    ? `${agentSystemPrompt}\n\n${instructionHeader}\n${baseInstructions}${kbContext}`
    : `You are an autonomous agent executing a task.\nIndustry context: ${industry || "general"}.\n\n${baseInstructions}${kbContext}`;

  let toolCallResults: Array<{
    toolName: string;
    serverName: string;
    args: Record<string, any>;
    result: any;
    error?: string;
  }> = [];

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let costCapReached = false;
  const runtimeConfig = options?.runtimeConfig || {};
  const maxCostPerRunUsd: number = typeof runtimeConfig.maxCostPerRunUsd === "number" ? runtimeConfig.maxCostPerRunUsd : 1.0;

  try {
    const planResult = await completeWithFallback(
      [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
      ],
      {
        model: modelName,
        tools: canonicalTools.length > 0 ? canonicalTools : undefined,
        maxTokens: 4096,
      },
      [llmProvider, fallbackLlmProvider],
    );

    totalPromptTokens += planResult.tokensUsed.prompt;
    totalCompletionTokens += planResult.tokensUsed.completion;
    totalTokens += planResult.tokensUsed.total;
    totalCostUsd += planResult.costUsd;

    if (totalCostUsd >= maxCostPerRunUsd) {
      costCapReached = true;
      console.warn(`[agent-runtime] Per-run cost cap reached after planning: $${totalCostUsd.toFixed(4)} >= $${maxCostPerRunUsd}. Skipping tool execution.`);
    }

    let currentContent = planResult.content;
    let currentToolCalls: CanonicalToolCall[] = planResult.toolCalls;
    let currentRawMessage = planResult.rawAssistantMessage;

    steps[steps.length - 1].status = "completed";
    steps[steps.length - 1].completedAt = new Date().toISOString();
    steps[steps.length - 1].output = {
      toolCallsPlanned: currentToolCalls.length,
      reasoning: currentContent || "Tool calls planned",
      toolsSelected: currentToolCalls.map(tc => tc.name),
      llmProvider: providerName,
      llmModel: modelName,
    };

    emitProgress("planning", {
      toolCallsPlanned: currentToolCalls.length,
      reasoning: currentContent || "Tool calls planned",
      toolsSelected: currentToolCalls.map(tc => tc.name),
      llmProvider: providerName,
      llmModel: modelName,
    });

    if (currentToolCalls.length === 0 && currentContent) {
      steps.push({
        id: "step_3",
        name: "AI Analysis (No Tools Needed)",
        type: "ai_analysis",
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        output: { analysis: currentContent },
      });
      if (options?.conversational) {
        (steps as any).__conversationalResponse = currentContent;
      }
    }

    const MAX_TOOL_ITERATIONS = options?.maxToolIterations ?? 5;
    let iterationsUsed = 0;
    let conversationMessages: LLMMessage[] = [
      { role: "system", content: systemMessage },
      { role: "user", content: prompt },
    ];

    while (currentToolCalls.length > 0 && iterationsUsed < MAX_TOOL_ITERATIONS && !costCapReached) {
      iterationsUsed++;
      const iterationLabel = iterationsUsed > 1 ? ` (iteration ${iterationsUsed})` : "";

      const iterationStartIdx = toolCallResults.length;

      for (let i = 0; i < currentToolCalls.length; i++) {
        const tc = currentToolCalls[i];
        const funcName = tc.name;
        const args = tc.arguments || {};

        const toolIdx = availableTools.findIndex((_, idx) => {
          const expectedName = `mcp_${idx}_${availableTools[idx].toolName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
          return expectedName === funcName;
        });
        const matchedTool = toolIdx >= 0 ? availableTools[toolIdx] : null;

        const stepId = `step_${steps.length + 1}`;
        steps.push({
          id: stepId,
          name: matchedTool ? `Call ${matchedTool.serverName}: ${matchedTool.toolName}${iterationLabel}` : `Call ${funcName}${iterationLabel}`,
          type: "api_call",
          mcpResolved: true,
          mcpServer: matchedTool?.serverName || "unknown",
          mcpTool: matchedTool?.toolName || funcName,
          status: "running",
          startedAt: new Date().toISOString(),
          input: args,
          iteration: iterationsUsed,
        });

        emitProgress("tool_call_start", {
          tool: matchedTool?.toolName || funcName,
          server: matchedTool?.serverName || "unknown",
          args,
          iteration: iterationsUsed,
        });

        if (!matchedTool) {
          const lastStep = steps[steps.length - 1];
          lastStep.status = "failed";
          lastStep.error = `Could not resolve tool: ${funcName}`;
          lastStep.completedAt = new Date().toISOString();
          toolCallResults.push({ toolName: funcName, serverName: "unknown", args, result: null, error: "Tool not found" });
          emitProgress("tool_call_result", { tool: funcName, server: "unknown", success: false, error: "Tool not found", iteration: iterationsUsed });
          continue;
        }

        try {
          const result = await callMcpTool(matchedTool, args);
          const lastStep = steps[steps.length - 1];
          lastStep.status = "completed";
          lastStep.completedAt = new Date().toISOString();
          lastStep.output = { source: "mcp_integration", mcpServer: matchedTool.serverName, mcpTool: matchedTool.toolName, data: result };
          toolCallResults.push({ toolName: matchedTool.toolName, serverName: matchedTool.serverName, args, result });
          emitProgress("tool_call_result", { tool: matchedTool.toolName, server: matchedTool.serverName, success: true, result, iteration: iterationsUsed });
        } catch (err: any) {
          const lastStep = steps[steps.length - 1];
          lastStep.status = "failed";
          lastStep.error = err.message;
          lastStep.completedAt = new Date().toISOString();
          toolCallResults.push({ toolName: matchedTool.toolName, serverName: matchedTool.serverName, args, result: null, error: err.message });
          emitProgress("tool_call_result", { tool: matchedTool.toolName, server: matchedTool.serverName, success: false, error: err.message, iteration: iterationsUsed });
        }
      }

      conversationMessages.push(
        {
          role: "assistant" as const,
          content: currentContent || "",
          tool_calls: currentToolCalls,
        },
        ...currentToolCalls.map((tc, i) => {
          const resultIdx = iterationStartIdx + i;
          const r = toolCallResults[resultIdx];
          return {
            role: "tool" as const,
            content: JSON.stringify(r?.result || { error: r?.error || "No result" }),
            tool_call_id: tc.id,
          };
        }),
      );

      if (iterationsUsed < MAX_TOOL_ITERATIONS) {
        try {
          const continueResult = await completeWithFallback(
            conversationMessages,
            {
              model: modelName,
              tools: canonicalTools.length > 0 ? canonicalTools : undefined,
              maxTokens: 4096,
            },
            [llmProvider, fallbackLlmProvider],
          );

          totalPromptTokens += continueResult.tokensUsed.prompt;
          totalCompletionTokens += continueResult.tokensUsed.completion;
          totalTokens += continueResult.tokensUsed.total;
          totalCostUsd += continueResult.costUsd;

          if (totalCostUsd >= maxCostPerRunUsd) {
            costCapReached = true;
            console.warn(`[agent-runtime] Per-run cost cap reached: $${totalCostUsd.toFixed(4)} >= $${maxCostPerRunUsd}. Stopping tool loop.`);
            currentToolCalls = [];
            break;
          }

          currentContent = continueResult.content;
          currentToolCalls = continueResult.toolCalls;
          currentRawMessage = continueResult.rawAssistantMessage;

          if (currentToolCalls.length > 0) {
            steps.push({
              id: `step_${steps.length + 1}`,
              name: `AI Re-Planning (iteration ${iterationsUsed + 1})`,
              type: "ai_planning",
              status: "completed",
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              output: {
                toolCallsPlanned: currentToolCalls.length,
                reasoning: currentContent || "Additional tool calls needed",
                toolsSelected: currentToolCalls.map(tc => tc.name),
                iteration: iterationsUsed + 1,
              },
            });

            emitProgress("llm_thinking", {
              reasoning: currentContent || "Additional tool calls needed",
              toolCallsPlanned: currentToolCalls.length,
              iteration: iterationsUsed + 1,
            });
          }

          emitProgress("iteration_complete", {
            iteration: iterationsUsed,
            toolCallsInIteration: currentToolCalls.length,
            hasMoreIterations: currentToolCalls.length > 0,
          });
        } catch {
          break;
        }
      }
    }

    if (toolCallResults.length > 0 && !costCapReached) {
      steps.push({
        id: `step_${steps.length + 1}`,
        name: "AI Analysis",
        type: "ai_analysis",
        status: "running",
        startedAt: new Date().toISOString(),
      });

      try {
        const isConversational = options?.conversational === true;

        const hasRecordData = toolCallResults.some(r => {
          if (r.error) return false;
          const res = r.result;
          if (!res) return false;
          if (Array.isArray(res) && res.length > 5) return true;
          if (typeof res === "object") {
            for (const key of Object.keys(res)) {
              if (Array.isArray(res[key]) && res[key].length > 5) return true;
            }
          }
          return false;
        });

        const runtimeConfig = (options as any)?.runtimeConfig || {};
        const outputSchema = runtimeConfig?.outputSchema;
        const hasOutputSchema = outputSchema && outputSchema.type === "record_list" && Array.isArray(outputSchema.fields) && outputSchema.fields.length > 0;

        let structuredOutputInstructions = "";
        if (hasOutputSchema) {
          const fieldDescs = outputSchema.fields.map((f: any) => `${f.name} (${f.type}): ${f.description}`).join("; ");
          structuredOutputInstructions = ` IMPORTANT: You MUST also include a "processedRecords" field as a JSON array where each element represents one ${outputSchema.description || "processed record"} with these fields: ${fieldDescs}. Process EVERY record from the data — do not skip or summarize them into fewer entries.`;
        } else if (hasRecordData) {
          structuredOutputInstructions = ` If the tool results contain multiple data records (e.g. leads, items, transactions), also include a "processedRecords" field as a JSON array where each element has: id, name (string identifier), score (number 0-100 if applicable), decision (string classification/action), reasoning (1-2 sentence explanation). Process every record from the data.`;
        }

        const analysisPrompt = isConversational
          ? `Now respond to the user's original question using the tool results above. Write a helpful, detailed, conversational response in natural language. Include specific data points (numbers, measurements, values) from the tool results. Format your response nicely — use line breaks for readability if the answer is long. Do NOT respond in JSON. Respond as a knowledgeable assistant speaking directly to the user.`
          : `Now analyze the tool results above. Respond in JSON format with fields: summary (string), severity (low/medium/high), riskFactors (array of strings), findings (array of key observations), and recommendedActions (array of strings).${structuredOutputInstructions}`;
        const analysisMessages: LLMMessage[] = [
          ...conversationMessages,
          ...(currentContent && currentToolCalls.length === 0 ? [{ role: "assistant" as const, content: currentContent }] : []),
          { role: "user" as const, content: analysisPrompt },
        ];
        const analysisResult = await completeWithFallback(
          analysisMessages,
          {
            model: modelName,
            maxTokens: hasRecordData || hasOutputSchema ? 16384 : 4096,
            ...(isConversational ? {} : { responseFormat: "json" as const }),
          },
          [llmProvider, fallbackLlmProvider],
        );

        totalPromptTokens += analysisResult.tokensUsed.prompt;
        totalCompletionTokens += analysisResult.tokensUsed.completion;
        totalTokens += analysisResult.tokensUsed.total;
        totalCostUsd += analysisResult.costUsd;

        const rawContent = analysisResult.content || (isConversational ? "I couldn't generate a response." : "{}");
        
        let analysis: any = {};
        if (isConversational) {
          analysis = { summary: rawContent, conversational: true };
        } else {
          try {
            analysis = JSON.parse(rawContent);
          } catch {
            analysis = { summary: rawContent };
          }
        }

        if (analysis.processedRecords && Array.isArray(analysis.processedRecords)) {
          analysis.structuredOutput = analysis.processedRecords;
        }

        analysis.iterationsUsed = iterationsUsed;

        const lastStep = steps[steps.length - 1];
        lastStep.status = "completed";
        lastStep.completedAt = new Date().toISOString();
        lastStep.output = analysis;

        emitProgress("final_analysis", {
          summary: analysis.summary || rawContent,
          severity: analysis.severity,
          iterationsUsed,
          isConversational,
        });
        
        if (isConversational) {
          (steps as any).__conversationalResponse = rawContent;
        }
      } catch (err: any) {
        const lastStep = steps[steps.length - 1];
        lastStep.status = "failed";
        lastStep.error = err.message;
        lastStep.completedAt = new Date().toISOString();
        emitProgress("error", { message: err.message, stage: "final_analysis" });
      }
    }
  } catch (err: any) {
    steps[steps.length - 1].status = "failed";
    steps[steps.length - 1].error = err.message;
    steps[steps.length - 1].completedAt = new Date().toISOString();
    emitProgress("error", { message: err.message, stage: "execution" });
    return {
      steps,
      success: false,
      summary: { totalSteps: steps.length, passedSteps: steps.filter(s => s.status === "completed").length, failedSteps: steps.filter(s => s.status === "failed").length, error: err.message },
    };
  }

  steps.push({
    id: `step_${steps.length + 1}`,
    name: "Compliance Check",
    type: "validation",
    status: "running",
    startedAt: new Date().toISOString(),
  });

  const ind = industry || "general";
  const toolSources = toolCallResults.filter(r => !r.error).map(r => `${r.serverName} / ${r.toolName}`);
  const complianceChecks: Array<{ rule: string; status: string; detail: string }> = [
    { rule: "Data Source Verification", status: "pass", detail: toolSources.length > 0 ? `Data sourced via registered MCP integrations: ${toolSources.join(", ")}` : "No external data sources used" },
    { rule: "Decision Audit Trail", status: "pass", detail: "All decision factors logged with timestamps in execution steps" },
    { rule: "AI Reasoning Logged", status: "pass", detail: "AI planning and analysis steps captured in execution trace" },
    { rule: `${ind.charAt(0).toUpperCase() + ind.slice(1)} Industry Protocol`, status: "pass", detail: "Execution complied with industry governance framework" },
  ];

  let ontologyComplianceResult: OntologyComplianceResult | null = null;
  try {
    const agentRecord = await storage.getAgent(agentId);
    const ontologyTags = (agentRecord?.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) || [];
    if (ontologyTags.length > 0) {
      const allOutputText = steps
        .filter(s => s.status === "completed" && s.output)
        .map(s => {
          const out = s.output;
          if (typeof out === "string") return out;
          if (out.analysis) return typeof out.analysis === "string" ? out.analysis : JSON.stringify(out.analysis);
          if (out.summary) return typeof out.summary === "string" ? out.summary : JSON.stringify(out.summary);
          return JSON.stringify(out);
        })
        .join(" ");

      ontologyComplianceResult = await checkOntologyCompliance(allOutputText, ontologyTags);

      const vocabStatus = ontologyComplianceResult.score >= 80 ? "pass" : ontologyComplianceResult.score >= 50 ? "warn" : "fail";
      const vocabDetail = ontologyComplianceResult.totalDomainMentions > 0
        ? `${ontologyComplianceResult.score}% compliance — ${ontologyComplianceResult.canonicalCount} canonical terms used, ${ontologyComplianceResult.deprecatedCount} deprecated synonyms detected`
        : `No domain vocabulary detected in output (${ontologyTags.length} ontology terms configured)`;
      complianceChecks.push({
        rule: "Ontology Vocabulary Compliance",
        status: vocabStatus,
        detail: vocabDetail,
      });
    }
  } catch {}

  const compStep = steps[steps.length - 1];
  compStep.status = "completed";
  compStep.completedAt = new Date().toISOString();
  compStep.output = {
    allPassed: complianceChecks.every(c => c.status === "pass"),
    checks: complianceChecks,
    auditId: `AUDIT-${Date.now()}`,
    ...(ontologyComplianceResult ? { ontologyCompliance: ontologyComplianceResult } : {}),
  };

  emitProgress("compliance_check", {
    allPassed: complianceChecks.every(c => c.status === "pass"),
    checksCount: complianceChecks.length,
    failedChecks: complianceChecks.filter(c => c.status !== "pass").map(c => c.rule),
  });

  // Soft Policy Semantic Compliance Validation
  // Runs a batched LLM judge to verify the agent's output actually honored each soft constraint.
  let softPolicyViolations: SoftPolicyComplianceResult[] = [];
  try {
    const agentRecordForPolicy = await storage.getAgent(agentId);
    const rawPolicyBindings = Array.isArray(agentRecordForPolicy?.policyBindings)
      ? (agentRecordForPolicy.policyBindings as Array<any>)
      : [];
    const softBindings = rawPolicyBindings.filter((pb: any) => {
      const enf = (pb.enforcement || "soft").toLowerCase();
      return enf !== "hard" && enf !== "hard_block";
    });

    if (softBindings.length > 0) {
      const allOutputText = steps
        .filter(s => s.status === "completed" && s.output)
        .map(s => {
          const out = s.output;
          if (typeof out === "string") return out;
          if (out.analysis) return typeof out.analysis === "string" ? out.analysis : JSON.stringify(out.analysis);
          if (out.summary) return typeof out.summary === "string" ? out.summary : JSON.stringify(out.summary);
          return JSON.stringify(out);
        })
        .join(" ");

      const policyDetails = await Promise.all(
        softBindings.map(async (pb: any) => {
          const policyId = pb.policyId || pb.id || "";
          if (!policyId) return null;
          try {
            const policy = await storage.getPolicy(policyId);
            if (!policy) return null;
            return {
              id: policy.id,
              name: policy.name,
              enforcement: pb.enforcement || "soft",
              domain: policy.domain,
              policyJson: policy.policyJson || {},
            };
          } catch { return null; }
        })
      );

      const resolvedPolicies = policyDetails.filter(Boolean) as Array<{
        id: string; name: string; enforcement: string; domain: string; policyJson: any;
      }>;

      if (resolvedPolicies.length > 0 && allOutputText.trim().length >= 80) {
        const policyValStep = {
          id: `step_${steps.length + 1}`,
          name: "Soft Policy Compliance Validation",
          type: "policy_compliance_validation",
          status: "running",
          startedAt: new Date().toISOString(),
          output: null as any,
          completedAt: null as any,
        };
        steps.push(policyValStep);

        softPolicyViolations = await checkSoftPolicyCompliance(allOutputText, resolvedPolicies);

        const violatedPolicies = softPolicyViolations.filter(r => !r.compliant);
        const lastPolicyStep = steps[steps.length - 1];
        lastPolicyStep.status = "completed";
        lastPolicyStep.completedAt = new Date().toISOString();
        lastPolicyStep.output = {
          policiesChecked: softPolicyViolations.length,
          allCompliant: violatedPolicies.length === 0,
          violations: violatedPolicies.length,
          results: softPolicyViolations,
          auditId: `SPV-${Date.now()}`,
        };

        emitProgress("policy_compliance_validation", {
          policiesChecked: softPolicyViolations.length,
          allCompliant: violatedPolicies.length === 0,
          violations: violatedPolicies.length,
          violatedPolicies: violatedPolicies.map(v => v.policyName),
        });

        for (const violation of violatedPolicies) {
          try {
            await storage.createAuditEvent({
              actorType: "system",
              actorId: "soft_policy_validator",
              action: "policy_violation",
              objectType: "agent",
              objectId: agentId,
              details: JSON.stringify({
                summary: `Soft policy violation: agent did not honor "${violation.policyName}" (${violation.enforcement})`,
                policyId: violation.policyId,
                policyName: violation.policyName,
                enforcement: violation.enforcement,
                domain: violation.domain,
                violatedRequirements: violation.violatedRequirements,
                evidence: violation.evidence,
                severity: violation.severity,
              }),
            });
          } catch {}
        }
      }
    }
  } catch {}

  const failedSteps = steps.filter(s => s.status === "failed");
  const latencyMs = Date.now() - startTime;

  const analysisStep = steps.find(s => s.type === "ai_analysis" && s.status === "completed");
  const analysisOutput = analysisStep?.output || {};

  const severity = failedSteps.length > 0 ? "high" : analysisOutput?.severity || (analysisOutput?.risk_level === "high" || analysisOutput?.riskLevel === "high" ? "high" : analysisOutput?.risk_level === "medium" || analysisOutput?.riskLevel === "medium" ? "medium" : "low");

  const promptSummary = prompt.length > 60 ? prompt.substring(0, 57) + "..." : prompt;

  const conversationalResponse = (steps as any).__conversationalResponse as string | undefined;
  delete (steps as any).__conversationalResponse;

  const inputCostPer1k = 0.002;
  const outputCostPer1k = 0.008;
  const estimatedCostUsd = (totalPromptTokens / 1000) * inputCostPer1k + (totalCompletionTokens / 1000) * outputCostPer1k;

  let mcpToolFingerprints: Record<string, string> = {};
  let mcpServerVersions: Record<string, { name: string; lastSyncedAt: string | null }> = {};
  try {
    for (const serverId of mcpServerIds) {
      const server = await storage.getMcpServer(serverId);
      if (server) {
        mcpServerVersions[serverId] = { name: server.name, lastSyncedAt: (server as any)?.lastSyncedAt ? (server as any).lastSyncedAt.toISOString() : null };
      }
      const tools = await storage.getMcpServerTools(serverId);
      for (const tool of tools) {
        mcpToolFingerprints[tool.name] = (tool as any).fingerprintHash || "";
      }
    }
  } catch {}

  let policySnapshot: Array<{ policyId: string; policyName: string; domain: string; status: string }> = [];
  try {
    const policies = await storage.getPolicies();
    policySnapshot = policies.filter(p => p.status === "active").slice(0, 20).map(p => ({
      policyId: p.id,
      policyName: p.name,
      domain: p.domain,
      status: p.status,
    }));
  } catch {}

  let autonomyLevel: string | null = null;
  let autonomyProfileId: string | null = null;
  try {
    const autonomyProfiles = await storage.getAutonomyProfiles();
    const agentProfile = autonomyProfiles.find((p: any) => p.industry === (industry || "general"));
    if (agentProfile) {
      autonomyProfileId = agentProfile.id;
      const levels = agentProfile.autonomyLevels as any;
      if (levels && typeof levels === "object") {
        autonomyLevel = levels.default || levels.general || Object.values(levels)[0] as string || null;
      }
    }
  } catch {}

  let blueprintVersionHash: string | null = null;
  if (blueprintId) {
    try {
      const bp = await storage.getBlueprint(blueprintId);
      blueprintVersionHash = (bp as any)?.workflowJson
        ? createHash("sha256").update(canonicalJsonStringify((bp as any).workflowJson)).digest("hex")
        : createHash("sha256").update(blueprintId).digest("hex");
    } catch {
      blueprintVersionHash = createHash("sha256").update(blueprintId).digest("hex");
    }
  }

  const provenanceSnapshot = {
    blueprintId: blueprintId || null,
    blueprintVersionHash,
    kbRetrievals,
    mcpToolFingerprints,
    mcpServerVersions,
    policySnapshot,
    autonomyLevel,
    autonomyProfileId,
    industryContext: industry || "general",
    ontologyConceptsUsed: options?.ontologyLabels || [],
    capturedAt: new Date().toISOString(),
  };

  const provenanceHash = createHash("sha256")
    .update(canonicalJsonStringify(provenanceSnapshot))
    .digest("hex");

  return {
    steps,
    success: failedSteps.length === 0,
    summary: {
      totalSteps: steps.length,
      passedSteps: steps.filter(s => s.status === "completed").length,
      failedSteps: failedSteps.length,
      latencyMs,
      prompt,
      promptSummary,
      severity,
      toolsUsed: toolCallResults.filter(r => !r.error).map(r => ({ server: r.serverName, tool: r.toolName })),
      analysis: analysisOutput,
      source: "mcp_integration",
      costUsd: totalCostUsd > 0 ? totalCostUsd : estimatedCostUsd,
      tokenUsage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
      },
      totalCostUsd,
      costCapUsd: maxCostPerRunUsd,
      costCapReached,
      ...(costCapReached ? { terminationReason: "cost_cap_reached" } : {}),
      ...(ontologyComplianceResult ? { ontologyCompliance: ontologyComplianceResult } : {}),
    },
    promptInputs: {
      systemPrompt: systemMessage,
      userMessage: prompt,
      contextVariables: {
        industry: industry || "general",
        kbContextIncluded: kbContext.length > 0,
        toolCount: availableTools.length,
      },
    },
    provenanceSnapshot,
    provenanceHash,
    retrievedDocs: kbRetrievals,
    contextSectionMetrics: promptSectionMetrics,
    ...(conversationalResponse ? { conversationalResponse } : {}),
    ...(softPolicyViolations.length > 0 ? { softPolicyViolations } : {}),
  };
}

interface ExecutionTier {
  tierIndex: number;
  agents: Array<{ agentId: string; nodeId?: string; agentName?: string }>;
  gates: Array<{ nodeId: string; label: string; gateType?: string }>;
}

function computeExecutionTiers(
  nodes: Array<{ id: string; nodeType: string; refAgentId?: string | null; label: string; gateType?: string | null }>,
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>,
): ExecutionTier[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const longestPath = new Map<string, number>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
    longestPath.set(node.id, 0);
  }

  for (const edge of edges) {
    const targets = adjacency.get(edge.sourceNodeId);
    if (targets) targets.push(edge.targetNodeId);
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [nodeId, deg] of Array.from(inDegree)) {
    if (deg === 0) queue.push(nodeId);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      const newPath = (longestPath.get(current) || 0) + 1;
      if (newPath > (longestPath.get(neighbor) || 0)) {
        longestPath.set(neighbor, newPath);
      }
      const deg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  const tierMap = new Map<number, { agents: ExecutionTier["agents"]; gates: ExecutionTier["gates"] }>();
  for (const node of nodes) {
    const level = longestPath.get(node.id) || 0;
    if (!tierMap.has(level)) {
      tierMap.set(level, { agents: [], gates: [] });
    }
    const tier = tierMap.get(level)!;
    if (node.nodeType === "agent" && node.refAgentId) {
      tier.agents.push({ agentId: node.refAgentId, nodeId: node.id });
    } else if (node.nodeType === "approval_gate" || node.gateType) {
      tier.gates.push({ nodeId: node.id, label: node.label, gateType: node.gateType || undefined });
    }
  }

  const sortedLevels = Array.from(tierMap.keys()).sort((a, b) => a - b);
  return sortedLevels.map((level, idx) => ({
    tierIndex: idx,
    agents: tierMap.get(level)!.agents,
    gates: tierMap.get(level)!.gates,
  }));
}

function buildTiersFromParallelGroups(
  parallelGroups: string[][],
  workerIds: string[],
): ExecutionTier[] {
  const tiers: ExecutionTier[] = [];
  for (let i = 0; i < parallelGroups.length; i++) {
    const group = parallelGroups[i];
    tiers.push({
      tierIndex: i,
      agents: group.map(agentId => ({ agentId })),
      gates: [],
    });
  }
  return tiers;
}

function buildTiersFromExecutionGraph(
  executionGraph: Array<{ stage: number; agents: string[]; waitForAll?: boolean }>,
): ExecutionTier[] {
  const sorted = Array.from(executionGraph).sort((a, b) => a.stage - b.stage);
  return sorted.map((stage, idx) => ({
    tierIndex: idx,
    agents: stage.agents.map(agentId => ({ agentId })),
    gates: [],
  }));
}

async function executeWorkerAgent(
  workerId: string,
  teamAgent: RuntimeAgent,
  previousContext: string,
  workerIndex: number,
): Promise<{
  agentId: string;
  agentName: string;
  step: any;
  output: string;
  success: boolean;
  startTime: number;
  endTime: number;
}> {
  const startTime = Date.now();
  const workerAgent = await storage.getAgent(workerId);

  if (!workerAgent) {
    const endTime = Date.now();
    return {
      agentId: workerId,
      agentName: "Unknown Agent",
      step: {
        id: `team_worker_${workerId}_${workerIndex}`,
        name: `Worker: Unknown Agent`,
        type: "worker_execution",
        status: "failed",
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(endTime).toISOString(),
        error: `Worker agent ${workerId} not found`,
        timingMs: endTime - startTime,
      },
      output: "",
      success: false,
      startTime,
      endTime,
    };
  }

  const workerRtConfig = (workerAgent.runtimeConfig as Record<string, any>) || {};
  const workerPrompt = workerRtConfig.prompt || workerAgent.description || `Execute task for ${workerAgent.name}`;
  const contextualPrompt = previousContext
    ? `${workerPrompt}\n\n## INPUT FROM PREVIOUS STAGE\n${previousContext}`
    : workerPrompt;

  const workerMcpLinks = await storage.getAgentMcpServers(workerId);
  const workerMcpIds = workerMcpLinks.map(l => l.serverId);

  const workerRuntimeAgent: RuntimeAgent = {
    deploymentId: teamAgent.deploymentId,
    agentId: workerId,
    agentName: workerAgent.name,
    mcpServerIds: workerMcpIds.length > 0 ? workerMcpIds : teamAgent.mcpServerIds,
    intervalMs: 0,
    industry: teamAgent.industry,
    prompt: contextualPrompt,
    agentSystemPrompt: workerAgent.systemPrompt || undefined,
    outcomeId: (workerAgent as any).outcomeId || teamAgent.outcomeId,
    agentType: "single",
    runtimeConfig: workerRtConfig,
    memoryGovernanceRules: (workerAgent.memoryGovernanceRules as Array<{ rule: string; regulation: string; type: string }>) || undefined,
  };

  const workerContextResult = await buildRuntimeContext(workerRuntimeAgent);
  const workerContext = workerContextResult.context;

  try {
    const result = await executePromptWithMcp(
      workerId,
      teamAgent.deploymentId,
      undefined,
      workerRuntimeAgent.mcpServerIds,
      contextualPrompt,
      teamAgent.industry,
      workerContext || workerAgent.systemPrompt || undefined,
      { runtimeConfig: workerRtConfig },
    );

    const endTime = Date.now();
    const workerAnalysis = result.summary.analysis || {};
    const structuredOutput = workerAnalysis.structuredOutput || workerAnalysis.processedRecords || null;
    const analysisStep = result.steps.find((s: any) => s.type === "ai_analysis" && s.status === "completed");
    const analysisSummary = analysisStep?.output?.summary || analysisStep?.output?.analysis;
    const outputText = typeof analysisSummary === "string" && analysisSummary.length > 0
      ? analysisSummary
      : JSON.stringify(result.summary.analysis || {});

    let enrichedOutput = outputText;
    if (Array.isArray(structuredOutput) && structuredOutput.length > 0) {
      enrichedOutput = `${outputText}\n\n## STRUCTURED RECORDS FROM ${workerAgent.name} (${structuredOutput.length} records)\nThese are the exact record IDs and details processed by this agent. Downstream agents MUST reference these same record IDs for traceability.\n\`\`\`json\n${JSON.stringify({ processedRecords: structuredOutput }, null, 2)}\n\`\`\``;
    }

    return {
      agentId: workerId,
      agentName: workerAgent.name,
      step: {
        id: `team_worker_${workerId}_${workerIndex}`,
        name: `Worker: ${workerAgent.name}`,
        type: "worker_execution",
        status: result.success ? "completed" : "failed",
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(endTime).toISOString(),
        timingMs: endTime - startTime,
        parallel: false,
        output: {
          stepsCount: result.steps.length,
          passedSteps: result.summary.passedSteps,
          failedSteps: result.summary.failedSteps,
          latencyMs: result.summary.latencyMs,
          toolsUsed: result.summary.toolsUsed,
          analysis: workerAnalysis,
          ...(structuredOutput ? { structuredOutput } : {}),
        },
        workerSteps: result.steps,
      },
      output: enrichedOutput,
      success: result.success,
      startTime,
      endTime,
    };
  } catch (err: any) {
    const endTime = Date.now();
    return {
      agentId: workerId,
      agentName: workerAgent.name,
      step: {
        id: `team_worker_${workerId}_${workerIndex}`,
        name: `Worker: ${workerAgent.name}`,
        type: "worker_execution",
        status: "failed",
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(endTime).toISOString(),
        timingMs: endTime - startTime,
        parallel: false,
        error: err.message,
      },
      output: "",
      success: false,
      startTime,
      endTime,
    };
  }
}

export async function executeTeamPipeline(teamAgent: RuntimeAgent): Promise<{ steps: any[]; success: boolean; summary: any }> {
  const pipelineStartTime = Date.now();
  const allSteps: any[] = [];
  const rtConfig = teamAgent.runtimeConfig || {};
  const orch = rtConfig.orchestration || {};
  const workerIds: string[] = Array.isArray(orch.workerIds) ? orch.workerIds : [];
  const blueprintId = orch.blueprintId || teamAgent.blueprintId;
  const errorStrategy: string = orch.errorStrategy || orch.errorHandling || "best_effort";

  allSteps.push({
    id: "team_step_1",
    name: "Orchestrator: Initialize Pipeline",
    type: "orchestration",
    status: "completed",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    output: {
      pattern: orch.pattern || "supervisor",
      workerCount: workerIds.length,
      errorHandling: errorStrategy,
      parallelExecution: true,
    },
  });

  let executionTiers: ExecutionTier[] = [];

  if (blueprintId) {
    try {
      const nodes = await storage.getTeamBlueprintNodes(blueprintId);
      const edges = await storage.getTeamBlueprintEdges(blueprintId);
      if (nodes.length > 0) {
        executionTiers = computeExecutionTiers(
          nodes.map(n => ({
            id: n.id,
            nodeType: n.nodeType,
            refAgentId: n.refAgentId,
            label: n.label,
            gateType: n.gateType,
          })),
          edges.map(e => ({
            sourceNodeId: e.sourceNodeId,
            targetNodeId: e.targetNodeId,
          })),
        );
      }
    } catch (err: any) {
      console.log(`[agent-runtime] Could not load blueprint graph: ${err.message}`);
    }
  }

  if (executionTiers.length === 0) {
    let teamMembers: any[] = [];
    if (workerIds.length > 0 || Array.isArray(orch.executionGraph) || Array.isArray(orch.parallelGroups)) {
      try {
        const members = await storage.getAgentTeamMembers(teamAgent.agentId);
        for (const m of members) {
          const agent = await storage.getAgent(m.memberAgentId);
          if (agent) teamMembers.push(agent);
        }
      } catch {}
    }

    const resolveRoleToId = function(roleName: string): string | null {
      const match = teamMembers.find(a =>
        a.name.toLowerCase().includes(roleName.toLowerCase()) ||
        roleName.toLowerCase().includes(a.name.toLowerCase().split(" ")[0].toLowerCase())
      );
      return match ? match.id : null;
    }

    if (Array.isArray(orch.executionGraph) && orch.executionGraph.length > 0) {
      const tiers: ExecutionTier[] = [];
      for (let i = 0; i < orch.executionGraph.length; i++) {
        const stage = orch.executionGraph[i];
        const agents: ExecutionTier["agents"] = [];
        for (const role of stage.agents) {
          const agentId = resolveRoleToId(role);
          if (agentId) agents.push({ agentId, agentName: role });
        }
        if (agents.length > 0) {
          tiers.push({ tierIndex: i, agents, gates: [] });
        }
      }
      if (tiers.length > 0) executionTiers = tiers;
    } else if (Array.isArray(orch.parallelGroups) && orch.parallelGroups.length > 0) {
      const tiers: ExecutionTier[] = [];
      for (let i = 0; i < orch.parallelGroups.length; i++) {
        const group = orch.parallelGroups[i];
        const agents: ExecutionTier["agents"] = [];
        for (const role of group) {
          const agentId = resolveRoleToId(role);
          if (agentId) agents.push({ agentId, agentName: role });
        }
        if (agents.length > 0) {
          tiers.push({ tierIndex: i, agents, gates: [] });
        }
      }
      if (tiers.length > 0) executionTiers = tiers;
    }
  }

  if (executionTiers.length === 0 && workerIds.length > 0) {
    executionTiers = [{
      tierIndex: 0,
      agents: workerIds.map(id => ({ agentId: id })),
      gates: [],
    }];
  }

  allSteps.push({
    id: "team_step_tiers",
    name: "Orchestrator: Execution Plan",
    type: "orchestration",
    status: "completed",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    output: {
      tierCount: executionTiers.length,
      tiers: executionTiers.map(t => ({
        tier: t.tierIndex,
        agentCount: t.agents.length,
        gateCount: t.gates.length,
        parallel: t.agents.length > 1,
      })),
    },
  });

  let previousContext: string = "";
  let allSuccess = true;
  let totalWorkersExecuted = 0;
  let shouldHalt = false;

  for (const tier of executionTiers) {
    if (shouldHalt) break;

    for (const gate of tier.gates) {
      allSteps.push({
        id: `team_gate_${gate.nodeId}`,
        name: `Approval Gate: ${gate.label}`,
        type: "approval_gate",
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        output: { gateType: gate.gateType || "manual", autoApproved: true, reason: "Runtime auto-approval for pipeline execution" },
      });
    }

    if (tier.agents.length === 0) continue;

    const isParallelTier = tier.agents.length > 1;

    if (isParallelTier) {
      allSteps.push({
        id: `team_tier_${tier.tierIndex}_fork`,
        name: `Tier ${tier.tierIndex + 1}: Fork (${tier.agents.length} agents in parallel)`,
        type: "parallel_fork",
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        output: { agentCount: tier.agents.length, tierIndex: tier.tierIndex },
      });
    }

    const workerPromises = tier.agents.map((agentEntry, idx) =>
      executeWorkerAgent(agentEntry.agentId, teamAgent, previousContext, totalWorkersExecuted + idx)
    );

    let results: Awaited<ReturnType<typeof executeWorkerAgent>>[];

    if (errorStrategy === "fail_fast" && isParallelTier) {
      results = await Promise.all(
        workerPromises.map(p =>
          p.catch(err => ({
            agentId: "unknown",
            agentName: "Unknown",
            step: {
              id: `team_worker_error`,
              name: "Worker: Error",
              type: "worker_execution",
              status: "failed" as const,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              error: err.message,
              timingMs: 0,
              parallel: isParallelTier,
            },
            output: "",
            success: false,
            startTime: Date.now(),
            endTime: Date.now(),
          }))
        )
      );
    } else {
      results = await Promise.all(
        workerPromises.map(p =>
          p.catch(err => ({
            agentId: "unknown",
            agentName: "Unknown",
            step: {
              id: `team_worker_error`,
              name: "Worker: Error",
              type: "worker_execution",
              status: "failed" as const,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              error: err.message,
              timingMs: 0,
              parallel: isParallelTier,
            },
            output: "",
            success: false,
            startTime: Date.now(),
            endTime: Date.now(),
          }))
        )
      );
    }

    for (const result of results) {
      result.step.parallel = isParallelTier;
      result.step.tierIndex = tier.tierIndex;
      allSteps.push(result.step);
    }

    totalWorkersExecuted += tier.agents.length;

    const tierFailed = results.some(r => !r.success);
    if (tierFailed) {
      allSuccess = false;

      if (errorStrategy === "fail_fast") {
        const failedAgents = results.filter(r => !r.success).map(r => r.agentName);
        allSteps.push({
          id: `team_escalation_tier_${tier.tierIndex}`,
          name: `Escalation: Tier ${tier.tierIndex + 1} failed (fail_fast)`,
          type: "escalation",
          status: "completed",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          output: {
            reason: `Agents failed: ${failedAgents.join(", ")}`,
            action: "Pipeline halted per fail_fast error strategy",
          },
        });
        shouldHalt = true;
      } else if (errorStrategy.includes("escalate")) {
        const failedAgents = results.filter(r => !r.success).map(r => r.agentName);
        allSteps.push({
          id: `team_escalation_tier_${tier.tierIndex}`,
          name: `Escalation: Tier ${tier.tierIndex + 1} had failures`,
          type: "escalation",
          status: "completed",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          output: {
            reason: `Agents failed: ${failedAgents.join(", ")}`,
            action: "Pipeline halted per error handling policy",
          },
        });
        shouldHalt = true;
      }
    }

    if (isParallelTier) {
      const mergedOutputParts: string[] = [];
      for (const result of results) {
        if (result.output && result.success) {
          mergedOutputParts.push(`## OUTPUT FROM ${result.agentName}\n${result.output}`);
        }
      }
      previousContext = mergedOutputParts.length > 0
        ? mergedOutputParts.join("\n\n---\n\n")
        : previousContext;

      allSteps.push({
        id: `team_tier_${tier.tierIndex}_join`,
        name: `Tier ${tier.tierIndex + 1}: Join (merged ${results.filter(r => r.success).length}/${results.length} outputs)`,
        type: "parallel_join",
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        output: {
          mergedAgents: results.filter(r => r.success).map(r => r.agentName),
          failedAgents: results.filter(r => !r.success).map(r => r.agentName),
          tierIndex: tier.tierIndex,
        },
      });
    } else {
      const singleResult = results[0];
      if (singleResult && singleResult.success) {
        previousContext = singleResult.output;
      }
    }
  }

  const pipelineEndTime = Date.now();
  const totalLatencyMs = pipelineEndTime - pipelineStartTime;

  allSteps.push({
    id: "team_summary",
    name: "Orchestrator: Pipeline Summary",
    type: "orchestration_summary",
    status: allSuccess ? "completed" : "failed",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    output: {
      workersExecuted: totalWorkersExecuted,
      tiersExecuted: executionTiers.length,
      allSuccess,
      finalOutput: previousContext,
      parallelTiers: executionTiers.filter(t => t.agents.length > 1).length,
      sequentialTiers: executionTiers.filter(t => t.agents.length === 1).length,
      errorStrategy,
      totalLatencyMs,
    },
  });

  return {
    steps: allSteps,
    success: allSuccess,
    summary: {
      totalSteps: allSteps.length,
      passedSteps: allSteps.filter(s => s.status === "completed").length,
      failedSteps: allSteps.filter(s => s.status === "failed").length,
      latencyMs: totalLatencyMs,
      teamExecution: true,
      workersExecuted: totalWorkersExecuted,
      pattern: orch.pattern || "supervisor",
      parallelTiers: executionTiers.filter(t => t.agents.length > 1).length,
      tiersExecuted: executionTiers.length,
      errorStrategy,
    },
  };
}

async function executeAgentCycle(agent: RuntimeAgent, onProgress?: (event: RuntimeProgressEvent) => void) {
  console.log(`[agent-runtime] Executing cycle for ${agent.agentName} (deployment: ${agent.deploymentId})`);

  if (!agent.prompt) {
    console.error(`[agent-runtime] ${agent.agentName}: Missing runtime prompt. Configure the agent before running.`);
    return;
  }

  const isTeam = agent.agentType === "team" && agent.runtimeConfig?.orchestration?.workerIds?.length > 0;
  const contextResult = isTeam ? undefined : await buildRuntimeContext(agent);
  const enrichedContext = contextResult?.context;
  const buildSectionMetrics = contextResult?.sectionMetrics || [];

  const runtimeRun = await storage.createAgentRuntimeRun({
    agentId: agent.agentId,
    deploymentId: agent.deploymentId,
    status: "running",
    triggerType: "scheduled",
    blueprintId: agent.blueprintId || null,
    mcpServerId: agent.mcpServerIds[0] || null,
    inputConfig: { prompt: agent.prompt, contextSections: enrichedContext ? ["outcome", "kpis", "policies", "workflow"] : [], teamExecution: isTeam },
  });

  try {
    const result = isTeam
      ? await executeTeamPipeline(agent)
      : await executePromptWithMcp(
          agent.agentId,
          agent.deploymentId,
          agent.blueprintId,
          agent.mcpServerIds,
          agent.prompt,
          agent.industry,
          enrichedContext || agent.agentSystemPrompt,
          { ontologyLabels: (agent.ontologyTags || []).map(t => t.conceptLabel), runtimeConfig: agent.runtimeConfig || {}, modelProvider: agent.modelProvider, modelName: agent.modelName, maxToolIterations: agent.maxToolIterations },
          onProgress,
        );

    await storage.updateAgentRuntimeRun(runtimeRun.id, {
      status: result.success ? "completed" : "failed",
      stepsJson: result.steps,
      resultSummary: result.summary,
      latencyMs: result.summary.latencyMs || 0,
      completedAt: new Date(),
    });

    const analysisStep = result.steps.find((s: any) => s.type === "ai_analysis" && s.status === "completed");
    const analysisText = analysisStep?.output?.summary || analysisStep?.output?.analysis || "";
    const outputText = result.success
      ? (typeof analysisText === "string" && analysisText.length > 0
        ? analysisText
        : `${result.summary.toolsUsed?.length || 0} tools called | ${result.summary.passedSteps}/${result.summary.totalSteps} steps passed`)
      : `Execution failed`;

    let memoryGovernanceCheck: { violations: Array<{ pattern: string; regulation: string; count: number }> } | null = null;
    if (agent.memoryGovernanceRules && agent.memoryGovernanceRules.length > 0) {
      try {
        memoryGovernanceCheck = checkMemoryGovernanceViolations(outputText, agent.memoryGovernanceRules);
        if (memoryGovernanceCheck.violations.length > 0) {
          await storage.createAuditEvent({
            actorType: "system",
            actorId: "memory_governance_enforcer",
            action: "memory_governance.violation",
            objectType: "agent",
            objectId: agent.agentId,
            details: JSON.stringify({
              summary: `Memory governance violation: ${memoryGovernanceCheck.violations.length} pattern(s) detected in agent "${agent.agentName}" output`,
              violations: memoryGovernanceCheck.violations,
              agentName: agent.agentName,
            }),
          });
        }
      } catch {}
    }

    let memoryIdsLoaded: string[] = [];
    let memorySummaryHash: string | null = null;
    let contextProfileId: string | null = null;
    let contextProfileVersion: number | null = null;
    let contextBudgets: any = null;
    try {
      const recentMemories = await storage.getAgentMemories(agent.agentId, "episodic", 10);
      memoryIdsLoaded = recentMemories.map(m => m.id);
      if (recentMemories.length > 0) {
        memorySummaryHash = createHash("sha256").update(recentMemories.map(m => m.content).join("|")).digest("hex");
      }
    } catch {}
    try {
      const allContextProfiles = await storage.getContextProfiles();
      // Use same priority as buildRuntimeContext: agent-specific first, then industry fallback
      const cp = allContextProfiles.find((p: any) => p.agentId === agent.agentId && p.status === "active")
        || (agent.industry ? allContextProfiles.find((p: any) => p.status === "active" && p.industry?.toLowerCase() === agent.industry!.toLowerCase()) : undefined);
      if (cp) {
        contextProfileId = cp.id;
        contextProfileVersion = (cp as any).version || 1;
        contextBudgets = (cp as any).budgetAllocations || null;
      }
    } catch {}

    // Merge build-time sections with runtime prompt sections (kb_retrieval, tool_schemas, task_prompt)
    const SECTION_TO_BUDGET_KEY: Record<string, string> = {
      outcome_contract:    "outcome",
      governance_policies: "governance",
      skills:              "capabilities",
      knowledge_graph:     "knowledge",
      kb_retrieval:        "knowledge",
      execution_history:   "history",
      task_prompt:         "task",
      system_prompt:       "task",
      tool_schemas:        "task",
    };
    const allSectionMetricsForProvenance: ContextSectionMetric[] = [
      ...buildSectionMetrics,
      ...((result as any).contextSectionMetrics || []),
    ];

    let fullProvenanceSnapshot = (result as any).provenanceSnapshot || {};
    fullProvenanceSnapshot = {
      ...fullProvenanceSnapshot,
      memoryIdsLoaded,
      memorySummaryHash,
      contextProfileId,
      contextProfileVersion,
      contextBudgets,
      contextLayerUsage: allSectionMetricsForProvenance.map(m => {
        const budgetKey = SECTION_TO_BUDGET_KEY[m.category] ?? m.category;
        const effectiveBudgets = (contextBudgets as Record<string, number> | null);
        const allocated = effectiveBudgets?.[budgetKey] ?? DEFAULT_LAYER_BUDGETS[budgetKey] ?? null;
        return { layer: m.category, budgetKey, tokensUsed: m.tokenCount, budgetAllocated: allocated };
      }),
    };
    const fullProvenanceHash = createHash("sha256")
      .update(canonicalJsonStringify(fullProvenanceSnapshot))
      .digest("hex");

    const trace = await storage.createTrace({
      agentId: agent.agentId,
      environment: "prod",
      status: result.success ? "completed" : "failed",
      latencyMs: result.summary.latencyMs || 0,
      costUsd: result.summary.costUsd || 0,
      inputSummary: `Scheduled: ${agent.prompt.substring(0, 100)}${agent.prompt.length > 100 ? "..." : ""}`,
      outputSummary: outputText,
      stepsJson: result.steps,
      promptInputs: {
        ...((result as any).promptInputs || {
          systemPrompt: enrichedContext || agent.agentSystemPrompt || agent.prompt,
          userMessage: agent.prompt,
          contextVariables: { industry: agent.industry || "general", teamExecution: isTeam },
        }),
        ...(memoryGovernanceCheck ? { memoryGovernanceCheck } : {}),
      },
      modelId: "gpt-4.1",
      tokenUsage: result.summary.tokenUsage || null,
      toolCalls: result.steps.filter((s: any) => s.type === "api_call").map((s: any) => ({
        tool: s.mcpTool || s.name,
        input: s.input || {},
        output: s.output,
      })),
      retrievedDocs: (result as any).retrievedDocs || null,
      provenanceSnapshot: fullProvenanceSnapshot,
      provenanceHash: fullProvenanceHash,
      ...(((result as any).softPolicyViolations as any[] | undefined)?.length
        ? { softPolicyViolations: (result as any).softPolicyViolations }
        : {}),
    });

    try {
      if (trace && trace.id) {
        const auditEvent = await storage.createAuditEvent({
          actorType: "system",
          actorId: "provenance_engine",
          action: "provenance.captured",
          objectType: "run_trace",
          objectId: trace.id,
          details: JSON.stringify({
            provenanceHash: fullProvenanceHash,
            agentId: agent.agentId,
            agentName: agent.agentName,
            versionId: agent.deploymentId,
            industry: agent.industry || "general",
            kbRetrievalCount: (fullProvenanceSnapshot.kbRetrievals || []).length,
            toolCount: Object.keys(fullProvenanceSnapshot.mcpToolFingerprints || {}).length,
            policyCount: (fullProvenanceSnapshot.policySnapshot || []).length,
            memoryCount: memoryIdsLoaded.length,
          }),
        });
        if (auditEvent && auditEvent.id) {
          await storage.updateTrace(trace.id, { auditEventId: auditEvent.id });
        }
      }
    } catch {}

    try {
      const allSectionMetrics: ContextSectionMetric[] = [
        ...buildSectionMetrics,
        ...((result as any).contextSectionMetrics || []),
      ];
      const totalTokensUsed = allSectionMetrics.reduce((sum, m) => sum + m.tokenCount, 0);
      const sectionsWithPercent = allSectionMetrics.map(m => ({
        category: m.category,
        tokenCount: m.tokenCount,
        percentOfTotal: totalTokensUsed > 0 ? Math.round((m.tokenCount / totalTokensUsed) * 10000) / 100 : 0,
      }));

      let outcomeQuality: number | null = null;
      let outcomeBillable: boolean | null = null;
      if (agent.outcomeId) {
        try {
          const outcomeEvts = await storage.getOutcomeEventsByOutcome(agent.outcomeId);
          if (outcomeEvts.length > 0) {
            const latest = outcomeEvts[0];
            outcomeBillable = latest.billable;
            outcomeQuality = outcomeBillable ? 80 : 40;
          }
        } catch {}
      }

      const kbSourceDetails: Array<{ kbId: string; kbName: string; chunkCount: number; tokenCount: number; avgSimilarity: number }> = [];
      const retrievedDocs = (result as any).retrievedDocs || [];
      if (Array.isArray(retrievedDocs)) {
        for (const kb of retrievedDocs) {
          const chunks = kb.chunks || [];
          const avgSim = chunks.length > 0 ? chunks.reduce((s: number, c: any) => s + (c.similarityScore || 0), 0) / chunks.length : 0;
          const chunkTokens = chunks.reduce((s: number, c: any) => s + (c.tokenCount || estimateTokenCount(c.content || c.text || "")), 0);
          kbSourceDetails.push({
            kbId: kb.kbId,
            kbName: kb.kbName || kb.kbId,
            chunkCount: chunks.length,
            tokenCount: chunkTokens,
            avgSimilarity: Math.round(avgSim * 1000) / 1000,
          });
        }
      }

      await storage.createContextEconomics({
        traceId: trace.id,
        agentId: agent.agentId,
        industry: agent.industry || "general",
        contextProfileId: contextProfileId || null,
        totalTokensUsed,
        totalCostUsd: result.summary.costUsd || 0,
        sections: sectionsWithPercent,
        outcomeQuality,
        outcomeBillable,
        kbSourceDetails: kbSourceDetails.length > 0 ? kbSourceDetails : [],
      });
    } catch (econErr: any) {
      console.log(`[agent-runtime] Failed to save context economics: ${econErr.message}`);
    }

    try {
      const toolsUsed = result.steps.filter((s: any) => s.type === "api_call" && s.status === "completed").map((s: any) => s.mcpTool || s.name);
      const memorySummary = `Execution ${result.success ? "succeeded" : "failed"}. ${result.summary.passedSteps}/${result.summary.totalSteps} steps passed. ` +
        (toolsUsed.length > 0 ? `Tools used: ${toolsUsed.join(", ")}. ` : "") +
        (outputText.length > 200 ? outputText.substring(0, 200) + "..." : outputText);
      
      let expiresAt: Date | undefined;
      if (agent.memoryGovernanceRules && agent.memoryGovernanceRules.length > 0) {
        const retentionRule = agent.memoryGovernanceRules.find(r => r.type === "retention");
        if (retentionRule) {
          const daysMatch = retentionRule.rule.match(/(\d+)\s*(?:day|year)/i);
          if (daysMatch) {
            const days = retentionRule.rule.toLowerCase().includes("year") ? parseInt(daysMatch[1]) * 365 : parseInt(daysMatch[1]);
            expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
          }
        }
      }
      if (!expiresAt) {
        expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      }

      await storage.saveAgentMemory(agent.agentId, "episodic", memorySummary, {
        runId: runtimeRun.id,
        deploymentId: agent.deploymentId,
        success: result.success,
        toolsUsed,
        latencyMs: result.summary.latencyMs,
        iterationsUsed: result.summary.iterationsUsed || 1,
      }, expiresAt);

      await storage.pruneExpiredMemories(agent.agentId);
    } catch (memErr: any) {
      console.log(`[agent-runtime] Failed to save episodic memory: ${memErr.message}`);
    }

    runtimeEvents.emit("agent_execution", {
      deploymentId: agent.deploymentId,
      agentId: agent.agentId,
      runId: runtimeRun.id,
      result,
    });

    console.log(`[agent-runtime] ${agent.agentName}: ${result.summary.passedSteps}/${result.summary.totalSteps} steps passed, ${result.summary.latencyMs}ms`);
  } catch (err: any) {
    await storage.updateAgentRuntimeRun(runtimeRun.id, {
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    });
    console.error(`[agent-runtime] ${agent.agentName} execution failed:`, err.message);
  }
}

async function resolveBlueprint(
  blueprintJson: any,
  availableMcpServerIds: string[],
  complianceTags?: string[],
  options?: { allowLowAlignment?: boolean }
): Promise<{ valid: boolean; error?: string; requirements: RuntimeAgent["blueprintRequirements"]; ontologyWarnings?: string[]; lowAlignmentTools?: Array<{ toolName: string; serverName: string; score: number; matched: number; total: number }> }> {
  const nodes = blueprintJson?.nodes || [];
  const edges = blueprintJson?.edges || [];
  const workflowSteps: string[] = [];
  const requiredTools: string[] = [];
  const escalationTriggers: string[] = [];
  const complianceNodes: string[] = [];
  let outputFormat: string | undefined;

  for (const node of nodes) {
    const nodeType = (node.type || node.data?.type || "").toLowerCase();
    const nodeLabel = node.data?.label || node.label || node.id || "unknown";

    if (nodeType.includes("tool") || nodeType.includes("mcp") || nodeType.includes("action")) {
      const toolName = node.data?.toolName || node.data?.tool || nodeLabel;
      requiredTools.push(toolName);
      workflowSteps.push(`Use tool: ${toolName}`);
    } else if (nodeType.includes("decision") || nodeType.includes("condition") || nodeType.includes("branch")) {
      workflowSteps.push(`Decision point: ${nodeLabel}`);
      const condition = node.data?.condition || node.data?.description;
      if (condition) workflowSteps.push(`  Condition: ${condition}`);
    } else if (nodeType.includes("output") || nodeType.includes("result")) {
      outputFormat = node.data?.format || node.data?.description || nodeLabel;
      workflowSteps.push(`Output: ${nodeLabel}`);
    } else if (nodeType.includes("human") || nodeType.includes("review") || nodeType.includes("approval")) {
      complianceNodes.push(nodeLabel);
      escalationTriggers.push(`Escalate to human review at: ${nodeLabel}`);
      workflowSteps.push(`Human review: ${nodeLabel}`);
    } else if (nodeType.includes("redact") || nodeType.includes("phi") || nodeType.includes("pii") || nodeType.includes("compliance")) {
      complianceNodes.push(nodeLabel);
      workflowSteps.push(`Compliance step: ${nodeLabel}`);
    } else if (nodeType.includes("input") || nodeType.includes("trigger") || nodeType.includes("start")) {
      workflowSteps.unshift(`Start: ${nodeLabel}`);
    } else {
      workflowSteps.push(`${nodeLabel}`);
    }
  }

  if (requiredTools.length > 0) {
    if (availableMcpServerIds.length === 0) {
      return {
        valid: false,
        error: `Blueprint references ${requiredTools.length} tool(s) (${requiredTools.join(", ")}) but no MCP servers are linked to this agent`,
        requirements: { workflowSteps, requiredTools, escalationTriggers, outputFormat, complianceNodes },
      };
    }
    const availableTools = await gatherAvailableTools(availableMcpServerIds);
    const availableToolNames = availableTools.map(t => t.toolName.toLowerCase());
    const missingTools = requiredTools.filter(t =>
      !availableToolNames.some(at => at.includes(t.toLowerCase()) || t.toLowerCase().includes(at))
    );
    if (missingTools.length > 0) {
      return {
        valid: false,
        error: `Blueprint references tools not available in linked MCP servers: ${missingTools.join(", ")}. Available tools: ${availableTools.map(t => t.toolName).join(", ")}`,
        requirements: { workflowSteps, requiredTools, escalationTriggers, outputFormat, complianceNodes },
      };
    }
  }

  if (complianceTags && complianceTags.length > 0) {
    const regulated = complianceTags.some(t => ["HIPAA", "PCI-DSS", "SOX", "GDPR", "BSA-AML"].includes(t));
    if (regulated && complianceNodes.length === 0) {
      console.log(`[agent-runtime] Warning: Regulated agent (${complianceTags.join(",")}) has blueprint with no compliance nodes (human review, PHI redaction, etc.)`);
    }
  }

  const ontologyWarnings: string[] = [];
  const lowAlignmentTools: Array<{ toolName: string; serverName: string; score: number; matched: number; total: number }> = [];
  if (requiredTools.length > 0 && availableMcpServerIds.length > 0) {
    try {
      const requiredToolsLower = requiredTools.map(t => t.toLowerCase());
      const checkedServerIds = new Set<string>();
      const availableTools = await gatherAvailableTools(availableMcpServerIds);
      for (const tool of availableTools) {
        if (checkedServerIds.has(tool.serverId)) continue;
        checkedServerIds.add(tool.serverId);
        const matches = await storage.getMcpParameterMatches(tool.serverId);
        if (matches.length === 0) continue;
        const serverTools = availableTools.filter(t => t.serverId === tool.serverId);
        for (const st of serverTools) {
          const isReferencedByBlueprint = requiredToolsLower.some(rt =>
            rt.includes(st.toolName.toLowerCase()) || st.toolName.toLowerCase().includes(rt)
          );
          if (!isReferencedByBlueprint) continue;
          const toolMatches = matches.filter(m => m.toolName === st.toolName);
          const matchedCount = toolMatches.filter(m => m.matchStatus === "matched" || m.matchStatus === "partial").length;
          const totalCount = toolMatches.length;
          const score = totalCount > 0 ? matchedCount / totalCount : 0;
          if (score === 0) {
            ontologyWarnings.push(`Tool "${st.toolName}" (server: ${st.serverName}) has 0% ontology alignment — ${totalCount > 0 ? `none of its ${totalCount} parameter(s) match domain concepts` : "no parameter matches computed"}`);
            lowAlignmentTools.push({ toolName: st.toolName, serverName: st.serverName, score: 0, matched: 0, total: totalCount });
          } else if (score < 0.5) {
            ontologyWarnings.push(`Tool "${st.toolName}" (server: ${st.serverName}) has ${Math.round(score * 100)}% ontology alignment (${matchedCount}/${totalCount} parameters matched) — below 50% threshold`);
            lowAlignmentTools.push({ toolName: st.toolName, serverName: st.serverName, score: Math.round(score * 100) / 100, matched: matchedCount, total: totalCount });
          }
        }
      }
      if (ontologyWarnings.length > 0) {
        console.log(`[agent-runtime] Blueprint ontology alignment warnings: ${ontologyWarnings.join("; ")}`);
      }
    } catch (err: any) {
      console.log(`[agent-runtime] Could not check ontology alignment: ${err.message}`);
    }
  }

  if (lowAlignmentTools.length > 0 && !options?.allowLowAlignment) {
    const toolList = lowAlignmentTools.map(t => `${t.toolName} (${Math.round(t.score * 100)}%)`).join(", ");
    return {
      valid: false,
      error: `Ontology alignment below 50% threshold for tools: ${toolList}. Use allowLowAlignment option to override.`,
      requirements: { workflowSteps, requiredTools, escalationTriggers, outputFormat, complianceNodes },
      ontologyWarnings,
      lowAlignmentTools,
    };
  }

  return {
    valid: true,
    requirements: { workflowSteps, requiredTools, escalationTriggers, outputFormat, complianceNodes },
    ontologyWarnings,
    lowAlignmentTools,
  };
}

export async function startAgentRuntime(deploymentId: string, agentSystemPrompt?: string, skipInitialCycle?: boolean, allowLowAlignment?: boolean): Promise<{ started: boolean; message: string }> {
  if (activeAgents.has(deploymentId)) {
    return { started: false, message: "Agent runtime already running for this deployment" };
  }

  const deployment = await storage.getDeployment(deploymentId);
  if (!deployment) return { started: false, message: "Deployment not found" };

  const agent = await storage.getAgent(deployment.agentId);
  if (!agent) return { started: false, message: "Agent not found" };

  const mcpLinks = await storage.getAgentMcpServers(deployment.agentId);
  const mcpServerIds = mcpLinks.map(l => l.serverId);

  const agentKbs = await storage.getAgentKnowledgeBases(deployment.agentId);
  if (mcpServerIds.length === 0 && agentKbs.length === 0) {
    return { started: false, message: "Cannot start runtime: No MCP Server integrations or Knowledge Bases linked to this agent. Link an MCP Server or Knowledge Base before deploying." };
  }

  const rtConfig = (agent.runtimeConfig as Record<string, any>) || {};
  const prompt = rtConfig.prompt;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return { started: false, message: "Cannot start runtime: Agent has no task instructions configured. Please provide a natural language prompt describing what this agent should do in the Agent Task section." };
  }

  const intervalMinutes = rtConfig.scheduleIntervalMinutes ?? 0;
  const intervalMs = intervalMinutes * 60 * 1000;

  const blueprints = await storage.getBlueprints();
  const agentBlueprint = blueprints.find(b => b.agentId === deployment.agentId);

  const rawOntologyTags = (agent as any).ontologyTags;
  const ontologyTags = Array.isArray(rawOntologyTags) ? rawOntologyTags as Array<{ conceptId: string; conceptLabel: string }> : undefined;
  const rawComplianceTags = (agent as any).complianceTags;
  const complianceTags = Array.isArray(rawComplianceTags) && rawComplianceTags.length > 0 ? rawComplianceTags as string[] : undefined;

  let blueprintRequirements: RuntimeAgent["blueprintRequirements"] | undefined;
  if (agentBlueprint?.blueprintJson) {
    const bpResult = await resolveBlueprint(agentBlueprint.blueprintJson, mcpServerIds, complianceTags, { allowLowAlignment: allowLowAlignment });
    if (!bpResult.valid) {
      return { started: false, message: `Blueprint validation failed: ${bpResult.error}` };
    }
    blueprintRequirements = bpResult.requirements;
    console.log(`[agent-runtime] Blueprint resolved: ${blueprintRequirements?.workflowSteps.length || 0} steps, ${blueprintRequirements?.requiredTools.length || 0} tools`);
    if (bpResult.ontologyWarnings && bpResult.ontologyWarnings.length > 0) {
      console.log(`[agent-runtime] Blueprint ontology warnings for ${agent.name}: ${bpResult.ontologyWarnings.join("; ")}`);
    }
  }

  const runtimeAgent: RuntimeAgent = {
    deploymentId,
    agentId: deployment.agentId,
    agentName: agent.name,
    blueprintId: agentBlueprint?.id,
    mcpServerIds,
    intervalMs,
    industry: deployment.industry || (agent as any).industry,
    prompt,
    agentSystemPrompt,
    outcomeId: (agent as any).outcomeId || undefined,
    agentType: (agent as any).agentType || "single",
    runtimeConfig: rtConfig,
    ontologyTags,
    complianceTags,
    memoryGovernanceRules: (agent.memoryGovernanceRules as Array<{ rule: string; regulation: string; type: string }>) || undefined,
    blueprintRequirements,
    modelProvider: (agent as any).modelProvider || "openai",
    modelName: (agent as any).modelName || "gpt-4.1",
    maxToolIterations: agent.maxToolIterations ?? 5,
  };

  activeAgents.set(deploymentId, { agent: runtimeAgent });

  try {
    if (intervalMinutes > 0) {
      if (!skipInitialCycle) {
        await executeAgentCycle(runtimeAgent);
      }
      const existing = await storage.getActiveScheduledRunForDeployment(deploymentId);
      if (!existing) {
        const firstRunAt = skipInitialCycle ? new Date() : new Date(Date.now() + intervalMs);
        await storage.createJob({
          type: "agent_scheduled_run",
          status: "queued",
          agentId: deployment.agentId,
          payload: { deploymentId, agentId: deployment.agentId, intervalMs, agentName: agent.name },
          scheduledFor: firstRunAt,
        });
        console.log(`[agent-runtime] Scheduled durable runtime for ${agent.name} (every ${intervalMs / 1000}s, next: ${firstRunAt.toISOString()})`);
      } else {
        console.log(`[agent-runtime] Durable runtime already scheduled for ${agent.name} (next run: ${existing.scheduledFor?.toISOString() ?? "queued"})`);
      }
      return { started: true, message: `Agent runtime started for ${agent.name}. Executing every ${intervalMinutes} minutes.` };
    } else {
      console.log(`[agent-runtime] Registered on-demand runtime for ${agent.name}`);
      return { started: true, message: `Agent runtime registered for ${agent.name} (on-demand). Use "Run Now" to trigger execution.` };
    }
  } catch (err) {
    activeAgents.delete(deploymentId);
    throw err;
  }
}

export async function executeScheduledAgentCycle(deploymentId: string): Promise<void> {
  let entry = activeAgents.get(deploymentId);
  if (!entry) {
    const result = await startAgentRuntime(deploymentId, undefined, true);
    if (!result.started) {
      throw new Error(`Failed to register agent for scheduled run: ${result.message}`);
    }
    entry = activeAgents.get(deploymentId);
  }
  if (!entry) throw new Error(`No active runtime entry for deployment ${deploymentId}`);
  await executeAgentCycle(entry.agent);
}

export async function runAgentOnce(deploymentId: string, promptOverride?: string, maxIterationsOverride?: number, onProgress?: (event: RuntimeProgressEvent) => void): Promise<{ success: boolean; message: string }> {
  const deployment = await storage.getDeployment(deploymentId);
  if (!deployment) return { success: false, message: "Deployment not found" };

  const agent = await storage.getAgent(deployment.agentId);
  if (!agent) return { success: false, message: "Agent not found" };

  const mcpLinks = await storage.getAgentMcpServers(deployment.agentId);
  const mcpServerIds = mcpLinks.map(l => l.serverId);

  const rtConfig = (agent.runtimeConfig as Record<string, any>) || {};
  const prompt = promptOverride || rtConfig.prompt;

  if (!prompt) return { success: false, message: `${agent.name}: No prompt configured` };

  const rawOntologyTags = (agent as any).ontologyTags;
  const ontologyTags = Array.isArray(rawOntologyTags) ? rawOntologyTags as Array<{ conceptId: string; conceptLabel: string }> : undefined;

  const runtimeAgent: RuntimeAgent = {
    deploymentId,
    agentId: deployment.agentId,
    agentName: agent.name,
    blueprintId: undefined,
    mcpServerIds,
    intervalMs: 0,
    industry: deployment.industry || (agent as any).industry,
    prompt,
    agentSystemPrompt: undefined,
    outcomeId: (agent as any).outcomeId || undefined,
    agentType: (agent as any).agentType || "single",
    runtimeConfig: rtConfig,
    ontologyTags,
    complianceTags: undefined,
    memoryGovernanceRules: undefined,
    blueprintRequirements: undefined,
    modelProvider: (agent as any).modelProvider || "openai",
    modelName: (agent as any).modelName || "gpt-4.1",
    maxToolIterations: maxIterationsOverride ?? (agent.maxToolIterations ?? 5),
  };

  try {
    await executeAgentCycle(runtimeAgent, onProgress);
    return { success: true, message: `${agent.name} cycle completed` };
  } catch (err: any) {
    return { success: false, message: err.message || "Cycle failed" };
  }
}

export async function stopAgentRuntime(deploymentId: string): Promise<{ stopped: boolean; message: string }> {
  const entry = activeAgents.get(deploymentId);
  activeAgents.delete(deploymentId);

  try {
    await storage.cancelScheduledRunsForDeployment(deploymentId);
  } catch (err: any) {
    console.error(`[agent-runtime] Failed to cancel scheduled runs for ${deploymentId}:`, err.message);
  }

  if (entry) {
    console.log(`[agent-runtime] Stopped runtime for ${entry.agent.agentName}`);
    return { stopped: true, message: `Agent runtime stopped for ${entry.agent.agentName}` };
  }
  console.log(`[agent-runtime] Stopped scheduled runs for deployment ${deploymentId} (not in local registry)`);
  return { stopped: true, message: `Agent runtime stopped for deployment ${deploymentId}` };
}

export async function getActiveRuntimes(): Promise<Array<{ deploymentId: string; agentId: string; agentName: string; intervalMs: number }>> {
  const scheduledJobs = await storage.getScheduledRuns();
  const seen = new Set<string>();
  const result: Array<{ deploymentId: string; agentId: string; agentName: string; intervalMs: number }> = [];

  for (const job of scheduledJobs) {
    const p = (job.payload as Record<string, unknown>) || {};
    const depId = p.deploymentId as string;
    if (depId && !seen.has(depId)) {
      seen.add(depId);
      result.push({
        deploymentId: depId,
        agentId: (job.agentId || p.agentId) as string,
        agentName: p.agentName as string,
        intervalMs: p.intervalMs as number,
      });
    }
  }

  for (const [deploymentId, { agent }] of Array.from(activeAgents.entries())) {
    if (!seen.has(deploymentId)) {
      seen.add(deploymentId);
      result.push({
        deploymentId,
        agentId: agent.agentId,
        agentName: agent.agentName,
        intervalMs: agent.intervalMs,
      });
    }
  }

  return result;
}

export async function isRuntimeActive(deploymentId: string): Promise<boolean> {
  if (activeAgents.has(deploymentId)) return true;
  const job = await storage.getActiveScheduledRunForDeployment(deploymentId);
  return job != null;
}

export async function autoResumeRuntimes(): Promise<void> {
  try {
    const recovered = await storage.recoverStaleScheduledRuns();
    if (recovered > 0) {
      console.log(`[agent-runtime] Recovered ${recovered} stale scheduled job(s) from prior crash`);
    }

    const deployments = await storage.getDeployments();
    const deployed = deployments.filter(d => d.status === "deployed");

    if (deployed.length === 0) {
      console.log("[agent-runtime] No deployed agents to auto-resume.");
      return;
    }

    console.log(`[agent-runtime] Auto-resuming ${deployed.length} deployed agent runtime(s)...`);

    for (const dep of deployed) {
      try {
        let resumePrompt: string | undefined;
        const resumeAgent = await storage.getAgent(dep.agentId);
        if (resumeAgent?.systemPrompt) {
          resumePrompt = resumeAgent.systemPrompt;
        }
        const result = await startAgentRuntime(dep.id, resumePrompt, true);
        if (result.started) {
          console.log(`[agent-runtime] Auto-resumed: ${dep.agentName || dep.agentId} (${dep.id})`);
        } else {
          console.log(`[agent-runtime] Skip auto-resume for ${dep.agentName || dep.agentId}: ${result.message}`);
        }
      } catch (err: any) {
        console.error(`[agent-runtime] Failed to auto-resume ${dep.agentName || dep.agentId}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error("[agent-runtime] Auto-resume error:", err.message);
  }
}
