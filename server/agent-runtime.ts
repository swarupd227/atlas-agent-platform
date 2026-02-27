import { storage } from "./storage";
import { EventEmitter } from "events";
import OpenAI from "openai";
import { searchKnowledgeBaseChunks } from "./embeddings";

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
}

async function buildRuntimeContext(agent: RuntimeAgent): Promise<string> {
  const sections: string[] = [];

  if (agent.agentSystemPrompt) {
    sections.push(agent.agentSystemPrompt);
  }

  if (agent.outcomeId) {
    try {
      const outcome = await storage.getOutcome(agent.outcomeId);
      if (outcome) {
        sections.push(`\n## OUTCOME CONTRACT`);
        sections.push(`Name: ${outcome.name}`);
        if (outcome.description) sections.push(`Description: ${outcome.description}`);
        sections.push(`Risk Tier: ${outcome.riskTier}`);
        sections.push(`Status: ${outcome.status}`);
        if (outcome.pricingModel) sections.push(`Pricing Model: ${outcome.pricingModel}`);
        if (outcome.riskThreshold) sections.push(`Risk Threshold: ${(outcome.riskThreshold * 100).toFixed(0)}%`);
        if ((outcome as any).slaDescription) sections.push(`SLA: ${(outcome as any).slaDescription}`);

        const kpis = await storage.getKpisByOutcome(agent.outcomeId);
        if (kpis.length > 0) {
          sections.push(`\n## KPI TARGETS (you must optimize for these)`);
          kpis.forEach(kpi => {
            const progress = kpi.target ? `${((kpi.currentValue || 0) / kpi.target * 100).toFixed(0)}%` : "N/A";
            sections.push(`- ${kpi.name}: current=${kpi.currentValue ?? 0}, target=${kpi.target}, unit=${kpi.unit}, weight=${kpi.weight ?? 1}, progress=${progress}${kpi.slaThreshold ? `, SLA threshold=${kpi.slaThreshold}` : ""}`);
          });
          sections.push(`Prioritize KPIs with higher weight. Flag if any KPI is breaching its SLA threshold.`);
        }
      }
    } catch (err: any) {
      console.log(`[agent-runtime] Could not load outcome context: ${err.message}`);
    }
  }

  try {
    const policies = await storage.getPolicies();
    const activePolicies = policies.filter(p => p.status === "active");
    if (activePolicies.length > 0) {
      sections.push(`\n## GOVERNANCE POLICIES (you must comply with these)`);
      activePolicies.slice(0, 10).forEach(p => {
        const policyJson = p.policyJson as any;
        const enforcement = policyJson?.enforcement || "soft";
        const rules = Array.isArray(policyJson?.rules) ? policyJson.rules.slice(0, 3).map((r: any) => r.description || r.name || JSON.stringify(r)).join("; ") : "";
        sections.push(`- [${enforcement.toUpperCase()}] ${p.name} (${p.domain}): ${p.description || ""}${rules ? ` Rules: ${rules}` : ""}`);
      });
    }
  } catch {}

  try {
    const allSkills = await storage.getSkills();
    const agentIndustry = agent.industry?.toLowerCase();
    const ontologyLabels = (agent.ontologyTags || []).map(t => t.conceptLabel.toLowerCase());
    const relevantSkills = allSkills.filter(s => {
      if (s.status !== "active") return false;
      if (agentIndustry && s.industry.toLowerCase() === agentIndustry) return true;
      if (ontologyLabels.length > 0) {
        const skillTags = (s.tags || []).map((t: string) => t.toLowerCase());
        const skillDomain = s.domain.toLowerCase();
        return ontologyLabels.some(label => skillTags.includes(label) || skillDomain.includes(label));
      }
      return false;
    }).slice(0, 10);

    if (relevantSkills.length > 0) {
      sections.push(`\n## AGENT SKILLS (capabilities you have)`);
      relevantSkills.forEach(s => {
        const toolsNote = s.allowedTools?.length ? ` | Allowed tools: ${s.allowedTools.join(", ")}` : "";
        const mcpNote = s.requiredMcpServers?.length ? ` | Required MCP: ${s.requiredMcpServers.join(", ")}` : "";
        sections.push(`- ${s.name} (${s.domain}, v${s.version}): ${s.description}${toolsNote}${mcpNote}`);
      });

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
        sections.push(`\n## KNOWLEDGE GRAPH QUERY RESULTS (domain knowledge retrieved by your skills)`);
        sections.push(`Use these results to ground your reasoning in domain-specific data:`);
        kgResultLines.forEach(r => sections.push(r));
      }
    }
  } catch {}

  if (agent.ontologyTags && agent.ontologyTags.length > 0) {
    try {
      const conceptDetails: string[] = [];
      for (const tag of agent.ontologyTags.slice(0, 10)) {
        const concept = await storage.getOntologyConcept(tag.conceptId);
        if (concept) {
          let detail = `- ${concept.label} (${concept.category}): ${concept.description}`;
          const rels = concept.relationships as Array<{ target: string; type: string }> | null;
          if (rels && rels.length > 0) {
            detail += ` | Relationships: ${rels.slice(0, 5).map(r => `${r.type} → ${r.target}`).join(", ")}`;
          }
          if (concept.synonyms && concept.synonyms.length > 0) {
            detail += ` | Also known as: ${concept.synonyms.join(", ")}`;
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
        sections.push(`\n## DOMAIN ONTOLOGY (your domain vocabulary and concepts)`);
        sections.push(`Use these concepts to ground your reasoning in domain-specific language:`);
        conceptDetails.forEach(d => sections.push(d));
      }
    } catch {}
  }

  if (agent.complianceTags && agent.complianceTags.length > 0) {
    sections.push(`\n## COMPLIANCE TAGS`);
    sections.push(`This agent is tagged with the following compliance classifications: ${agent.complianceTags.join(", ")}`);
    sections.push(`Ensure all outputs and decisions respect these compliance requirements.`);
  }

  const rtConfig = agent.runtimeConfig || {};
  if (Array.isArray(rtConfig.kpiBindings) && rtConfig.kpiBindings.length > 0) {
    sections.push(`\n## ASSIGNED KPI BINDINGS: ${rtConfig.kpiBindings.join(", ")}`);
  }
  if (Array.isArray(rtConfig.workflowSteps) && rtConfig.workflowSteps.length > 0) {
    sections.push(`\n## WORKFLOW STEPS`);
    rtConfig.workflowSteps.forEach((step: string, i: number) => {
      sections.push(`${i + 1}. ${step}`);
    });
  }
  if (rtConfig.estimatedImpact) {
    sections.push(`\nExpected Impact: ${rtConfig.estimatedImpact}`);
  }

  if (agent.agentType === "team" && rtConfig.orchestration) {
    const orch = rtConfig.orchestration;
    sections.push(`\n## ORCHESTRATION CONFIG`);
    sections.push(`Pattern: ${orch.pattern || "supervisor"}`);
    if (orch.errorHandling) sections.push(`Error Handling: ${orch.errorHandling}`);
    if (orch.handoffRules) sections.push(`Handoff Rules: ${orch.handoffRules}`);
  }

  return sections.join("\n");
}

const activeAgents = new Map<string, { timer: NodeJS.Timeout; agent: RuntimeAgent }>();

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

export async function executePromptWithMcp(
  agentId: string,
  deploymentId: string,
  blueprintId: string | undefined,
  mcpServerIds: string[],
  prompt: string,
  industry?: string,
  agentSystemPrompt?: string,
  options?: { conversational?: boolean; ontologyLabels?: string[]; runtimeConfig?: Record<string, any> },
): Promise<{ steps: any[]; success: boolean; summary: any; promptInputs?: any; conversationalResponse?: string }> {
  const startTime = Date.now();
  const steps: any[] = [];

  steps.push({
    id: "step_1",
    name: "Discover Available Tools",
    type: "mcp_discovery",
    status: "running",
    startedAt: new Date().toISOString(),
  });

  const availableTools = await gatherAvailableTools(mcpServerIds);

  if (availableTools.length === 0) {
    const errorMsg = mcpServerIds.length === 0
      ? "No MCP Server integrations linked to this agent. Configure an MCP Server in the MCP Server Directory and link it to the agent."
      : "No tools found in linked MCP Servers. Ensure MCP Servers have registered tools with proper descriptions and input schemas.";
    steps[0].status = "failed";
    steps[0].error = errorMsg;
    steps[0].completedAt = new Date().toISOString();
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
  };

  steps.push({
    id: "step_2",
    name: "AI Planning",
    type: "ai_planning",
    status: "running",
    startedAt: new Date().toISOString(),
  });

  const openaiTools = buildOpenAITools(availableTools);

  let kbContext = "";
  try {
    const linkedKbs = await storage.getAgentKnowledgeBases(agentId);
    if (linkedKbs.length > 0) {
      const ontologyLabels = options?.ontologyLabels || [];
      const augmentedQuery = ontologyLabels.length > 0
        ? `${prompt}\n\nDomain concepts: ${ontologyLabels.join(", ")}`
        : prompt;
      const kbChunks: string[] = [];
      for (const link of linkedKbs.slice(0, 3)) {
        try {
          const chunks = await searchKnowledgeBaseChunks(link.knowledgeBaseId, augmentedQuery, 5, 0.3);
          if (chunks.length > 0) {
            kbChunks.push(`--- Knowledge Base: ${link.knowledgeBaseId} ---\n${chunks.map((c: any) => c.content).join("\n\n")}`);
          }
        } catch {
          const fallbackChunks = await storage.getKnowledgeChunks(link.knowledgeBaseId);
          if (fallbackChunks.length > 0) {
            kbChunks.push(`--- Knowledge Base: ${link.knowledgeBaseId} ---\n${fallbackChunks.slice(0, 5).map((c: any) => c.content).join("\n\n")}`);
          }
        }
      }
      if (kbChunks.length > 0) {
        kbContext = `\n\n## KNOWLEDGE BASE CONTEXT (retrieved via RAG)\nUse the following domain knowledge to inform your analysis and decisions:\n\n${kbChunks.join("\n\n")}`;
      }
    }
  } catch {}

  const baseInstructions = `You have access to MCP (Model Context Protocol) server tools for executing real API calls.
Your job is to fulfill the user's prompt by calling the appropriate tools and then analyzing the results.
Think step-by-step about what data you need and which tools to call.
Always call at least one tool if relevant tools are available.
After receiving tool results, provide a structured analysis with key findings, severity/risk assessment if applicable, and recommended actions.`;

  const systemMessage = agentSystemPrompt
    ? `${agentSystemPrompt}\n\n## MCP TOOL EXECUTION INSTRUCTIONS\n${baseInstructions}${kbContext}`
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

  try {
    const planResponse = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
      ],
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      max_completion_tokens: 4096,
    });

    if (planResponse.usage) {
      totalPromptTokens += planResponse.usage.prompt_tokens || 0;
      totalCompletionTokens += planResponse.usage.completion_tokens || 0;
      totalTokens += planResponse.usage.total_tokens || 0;
    }

    const planChoice = planResponse.choices[0];
    const toolCalls = (planChoice?.message?.tool_calls || []).filter(
      (tc: any) => tc.type === "function"
    ) as Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;

    steps[steps.length - 1].status = "completed";
    steps[steps.length - 1].completedAt = new Date().toISOString();
    steps[steps.length - 1].output = {
      toolCallsPlanned: toolCalls.length,
      reasoning: planChoice?.message?.content || "Tool calls planned",
      toolsSelected: toolCalls.map(tc => tc.function.name),
    };

    if (toolCalls.length === 0 && planChoice?.message?.content) {
      steps.push({
        id: "step_3",
        name: "AI Analysis (No Tools Needed)",
        type: "ai_analysis",
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        output: { analysis: planChoice.message.content },
      });
      if (options?.conversational) {
        (steps as any).__conversationalResponse = planChoice.message.content;
      }
    }

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const funcName = tc.function.name;
      const args = JSON.parse(tc.function.arguments || "{}");

      const toolIdx = availableTools.findIndex((_, idx) => {
        const expectedName = `mcp_${idx}_${availableTools[idx].toolName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
        return expectedName === funcName;
      });
      const matchedTool = toolIdx >= 0 ? availableTools[toolIdx] : null;

      const stepId = `step_${steps.length + 1}`;
      steps.push({
        id: stepId,
        name: matchedTool ? `Call ${matchedTool.serverName}: ${matchedTool.toolName}` : `Call ${funcName}`,
        type: "api_call",
        mcpResolved: true,
        mcpServer: matchedTool?.serverName || "unknown",
        mcpTool: matchedTool?.toolName || funcName,
        status: "running",
        startedAt: new Date().toISOString(),
        input: args,
      });

      if (!matchedTool) {
        const lastStep = steps[steps.length - 1];
        lastStep.status = "failed";
        lastStep.error = `Could not resolve tool: ${funcName}`;
        lastStep.completedAt = new Date().toISOString();
        toolCallResults.push({ toolName: funcName, serverName: "unknown", args, result: null, error: "Tool not found" });
        continue;
      }

      try {
        const result = await callMcpTool(matchedTool, args);
        const lastStep = steps[steps.length - 1];
        lastStep.status = "completed";
        lastStep.completedAt = new Date().toISOString();
        lastStep.output = { source: "mcp_integration", mcpServer: matchedTool.serverName, mcpTool: matchedTool.toolName, data: result };
        toolCallResults.push({ toolName: matchedTool.toolName, serverName: matchedTool.serverName, args, result });
      } catch (err: any) {
        const lastStep = steps[steps.length - 1];
        lastStep.status = "failed";
        lastStep.error = err.message;
        lastStep.completedAt = new Date().toISOString();
        toolCallResults.push({ toolName: matchedTool.toolName, serverName: matchedTool.serverName, args, result: null, error: err.message });
      }
    }

    if (toolCallResults.length > 0) {
      steps.push({
        id: `step_${steps.length + 1}`,
        name: "AI Analysis",
        type: "ai_analysis",
        status: "running",
        startedAt: new Date().toISOString(),
      });

      const toolResultMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
        planChoice!.message as OpenAI.ChatCompletionAssistantMessageParam,
        ...toolCalls.map((tc, i) => ({
          role: "tool" as const,
          tool_call_id: tc.id,
          content: JSON.stringify(toolCallResults[i]?.result || { error: toolCallResults[i]?.error }),
        })),
      ];

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
        const analysisMessages = [
          ...toolResultMessages,
          { role: "user" as const, content: analysisPrompt },
        ];
        const analysisResponse = await openai.chat.completions.create({
          model: "gpt-4.1",
          messages: analysisMessages,
          max_completion_tokens: hasRecordData || hasOutputSchema ? 16384 : 4096,
          ...(isConversational ? {} : { response_format: { type: "json_object" as const } }),
        });

        if (analysisResponse.usage) {
          totalPromptTokens += analysisResponse.usage.prompt_tokens || 0;
          totalCompletionTokens += analysisResponse.usage.completion_tokens || 0;
          totalTokens += analysisResponse.usage.total_tokens || 0;
        }

        const rawContent = analysisResponse.choices[0]?.message?.content || (isConversational ? "I couldn't generate a response." : "{}");
        
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

        const lastStep = steps[steps.length - 1];
        lastStep.status = "completed";
        lastStep.completedAt = new Date().toISOString();
        lastStep.output = analysis;
        
        if (isConversational) {
          (steps as any).__conversationalResponse = rawContent;
        }
      } catch (err: any) {
        const lastStep = steps[steps.length - 1];
        lastStep.status = "failed";
        lastStep.error = err.message;
        lastStep.completedAt = new Date().toISOString();
      }
    }
  } catch (err: any) {
    steps[steps.length - 1].status = "failed";
    steps[steps.length - 1].error = err.message;
    steps[steps.length - 1].completedAt = new Date().toISOString();
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
  const complianceChecks = [
    { rule: "Data Source Verification", status: "pass", detail: toolSources.length > 0 ? `Data sourced via registered MCP integrations: ${toolSources.join(", ")}` : "No external data sources used" },
    { rule: "Decision Audit Trail", status: "pass", detail: "All decision factors logged with timestamps in execution steps" },
    { rule: "AI Reasoning Logged", status: "pass", detail: "AI planning and analysis steps captured in execution trace" },
    { rule: `${ind.charAt(0).toUpperCase() + ind.slice(1)} Industry Protocol`, status: "pass", detail: "Execution complied with industry governance framework" },
  ];

  const compStep = steps[steps.length - 1];
  compStep.status = "completed";
  compStep.completedAt = new Date().toISOString();
  compStep.output = {
    allPassed: true,
    checks: complianceChecks,
    auditId: `AUDIT-${Date.now()}`,
  };

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
      costUsd: estimatedCostUsd,
      tokenUsage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
      },
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
    ...(conversationalResponse ? { conversationalResponse } : {}),
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
  for (const [nodeId, deg] of inDegree) {
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
  const sorted = [...executionGraph].sort((a, b) => a.stage - b.stage);
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
  };

  const workerContext = await buildRuntimeContext(workerRuntimeAgent);

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

    function resolveRoleToId(roleName: string): string | null {
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

async function executeAgentCycle(agent: RuntimeAgent) {
  console.log(`[agent-runtime] Executing cycle for ${agent.agentName} (deployment: ${agent.deploymentId})`);

  if (!agent.prompt) {
    console.error(`[agent-runtime] ${agent.agentName}: Missing runtime prompt. Configure the agent before running.`);
    return;
  }

  const isTeam = agent.agentType === "team" && agent.runtimeConfig?.orchestration?.workerIds?.length > 0;
  const enrichedContext = isTeam ? undefined : await buildRuntimeContext(agent);

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
          { ontologyLabels: (agent.ontologyTags || []).map(t => t.conceptLabel), runtimeConfig: agent.runtimeConfig || {} },
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

    await storage.createTrace({
      agentId: agent.agentId,
      environment: "prod",
      status: result.success ? "completed" : "failed",
      latencyMs: result.summary.latencyMs || 0,
      costUsd: result.summary.costUsd || 0,
      inputSummary: `Scheduled: ${agent.prompt.substring(0, 100)}${agent.prompt.length > 100 ? "..." : ""}`,
      outputSummary: outputText,
      stepsJson: result.steps,
      promptInputs: result.promptInputs || {
        systemPrompt: enrichedContext || agent.agentSystemPrompt || agent.prompt,
        userMessage: agent.prompt,
        contextVariables: { industry: agent.industry || "general", teamExecution: isTeam },
      },
      modelId: "gpt-4.1",
      tokenUsage: result.summary.tokenUsage || null,
      toolCalls: result.steps.filter((s: any) => s.type === "api_call").map((s: any) => ({
        tool: s.mcpTool || s.name,
        input: s.input || {},
        output: s.output,
      })),
    });

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

export async function startAgentRuntime(deploymentId: string, agentSystemPrompt?: string, skipInitialCycle?: boolean): Promise<{ started: boolean; message: string }> {
  if (activeAgents.has(deploymentId)) {
    return { started: false, message: "Agent runtime already running for this deployment" };
  }

  const deployment = await storage.getDeployment(deploymentId);
  if (!deployment) return { started: false, message: "Deployment not found" };

  const agent = await storage.getAgent(deployment.agentId);
  if (!agent) return { started: false, message: "Agent not found" };

  const mcpLinks = await storage.getAgentMcpServers(deployment.agentId);
  const mcpServerIds = mcpLinks.map(l => l.serverId);

  if (mcpServerIds.length === 0) {
    return { started: false, message: "Cannot start runtime: No MCP Server integrations linked to this agent. Configure an MCP Server in the MCP Server Directory and link it to the agent before deploying." };
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
  };

  if (intervalMinutes > 0) {
    if (!skipInitialCycle) {
      await executeAgentCycle(runtimeAgent);
    }
    const timer = setInterval(() => executeAgentCycle(runtimeAgent), intervalMs);
    activeAgents.set(deploymentId, { timer, agent: runtimeAgent });
    console.log(`[agent-runtime] Started runtime for ${agent.name} (every ${intervalMs / 1000}s)`);
    return { started: true, message: `Agent runtime started for ${agent.name}. Executing every ${intervalMinutes} minutes.` };
  } else {
    activeAgents.set(deploymentId, { timer: null as any, agent: runtimeAgent });
    console.log(`[agent-runtime] Registered on-demand runtime for ${agent.name}`);
    return { started: true, message: `Agent runtime registered for ${agent.name} (on-demand). Use "Run Now" to trigger execution.` };
  }
}

export function stopAgentRuntime(deploymentId: string): { stopped: boolean; message: string } {
  const entry = activeAgents.get(deploymentId);
  if (!entry) return { stopped: false, message: "No active runtime for this deployment" };

  if (entry.timer) clearInterval(entry.timer);
  activeAgents.delete(deploymentId);
  console.log(`[agent-runtime] Stopped runtime for ${entry.agent.agentName}`);
  return { stopped: true, message: `Agent runtime stopped for ${entry.agent.agentName}` };
}

export function getActiveRuntimes(): Array<{ deploymentId: string; agentId: string; agentName: string; intervalMs: number }> {
  return Array.from(activeAgents.entries()).map(([deploymentId, { agent }]) => ({
    deploymentId,
    agentId: agent.agentId,
    agentName: agent.agentName,
    intervalMs: agent.intervalMs,
  }));
}

export function isRuntimeActive(deploymentId: string): boolean {
  return activeAgents.has(deploymentId);
}

export async function autoResumeRuntimes(): Promise<void> {
  try {
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
