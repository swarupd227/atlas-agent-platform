import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, runtimeEvents } from "./agent-runtime";
import {
  OTC_AGT_009_NAME, OTC_AGT_006_NAME,
  OTC_CASH_EVAL_SUITE_NAME,
  makeOtcCashMcpServerDefs,
  OTC_CASH_KB_DEFS,
  OTC_CASH_AGENT_DEFS,
  OTC_CASH_POLICY_DEFS,
  OTC_CASH_SKILLS,
  OTC_CASH_BLUEPRINTS,
  OTC_CASH_ONTOLOGY_CONCEPTS,
  OTC_CASH_SYSTEM_PROMPTS,
} from "./otc-cash-application-shared-defs";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const OTC_CASH_MCP_SERVERS = makeOtcCashMcpServerDefs(BASE_URL);

// ─── Module-level caches ──────────────────────────────────────────────────────
let _setupDone = false;
const _agentIdByName:   Record<string, string> = {};
const _skillIdByName:   Record<string, string> = {};
const _mcpIdByName:     Record<string, string> = {};
const _deployIdByAgent: Record<string, string> = {};

// ─── Pipeline steps ───────────────────────────────────────────────────────────
const PIPELINE_STEPS = [
  {
    agentName: OTC_AGT_009_NAME,
    agentCode:  "OTC-AGT-009",
    label:      "Payment Ingestion & Intelligent Auto-Matching",
    maxIter:    6,
    taskPrompt: `You are NovaTech's Cash Application & Reconciliation Agent (OTC-AGT-009).

SITUATION: It is month-end. March 28, 2026. NovaTech's treasury team has received today's payment batch for month-end close.

MISSION: Run the Cash Application Command Center — ingest the payment batch, achieve 94%+ auto-match rate, and identify exceptions for resolution.

EXECUTE THESE STEPS IN ORDER:
1. Call ingest_daily_payment_batch — capture all 387 payments ($42.3M) across wire, ACH, check, and EDI 820 channels
2. Call run_auto_matching — apply intelligent matching algorithm; target ≥94% match rate
3. Call identify_exceptions — return the prioritised exception queue; note GlobalTech Corp as HIGH COMPLEXITY ($2.3M / 47 invoices)
4. Call get_bank_reconciliation — confirm March 2026 bank rec status (target 98%+ matched)

IMPORTANT: After completing all 4 tool calls, output a JSON summary:
{"status":"BATCH_PROCESSED","total_amount":42313847,"payments":387,"match_rate_pct":94.1,"auto_matched_usd":39826847,"exceptions":14,"high_complexity_exception":"GlobalTech Corp $2,300,847","bank_rec_pct":98.7,"next_step":"RESOLVE_GLOBALTECH"}`,
  },
  {
    agentName: OTC_AGT_009_NAME,
    agentCode:  "OTC-AGT-009",
    label:      "Complex Payment Resolution — GlobalTech $2.3M",
    maxIter:    7,
    taskPrompt: `You are NovaTech's Cash Application & Reconciliation Agent (OTC-AGT-009).

HANDOFF FROM PREVIOUS STEP: Payment batch processed. 94.1% auto-match rate achieved. Exception queue identified GlobalTech Corp as Priority 1 — HIGH COMPLEXITY.

GLOBALTECH PAYMENT: Wire #WF-20260328-7742, $2,300,847.00, EDI 820 remittance attached, covers 47 open invoices with 3 deductions and an overpayment.

MISSION: Resolve the GlobalTech complex payment — the kind that takes 4–6 hours manually. Do it in seconds.

EXECUTE THESE STEPS IN ORDER:
1. Call parse_edi_remittance — extract the full remittance from GlobalTech's EDI 820 (47 invoice refs, 3 deduction codes)
2. Call match_payment_to_invoices — apply $2,300,847 to all 47 open GlobalTech invoices (target 99%+ confidence)
3. Call analyze_deductions — identify and detail all 3 deductions: freight claim (-$28,500), early pay discount (-$14,200), quantity short (-$7,400)
4. Call validate_deduction_details — issue VALID/INVESTIGATE rulings with evidence for each deduction
5. Call apply_payment_resolution — prepare the complete resolution package for one-click controller approval

EXCEPTION SUB-SCENARIOS TO NOTE IN YOUR ANALYSIS:
- Vertex Systems ACH $487,200: customer reference mismatch resolved via fuzzy PO cross-reference (auto-confirm available)
- Regional Supply Co $127K check: no remittance data, contact customer for allocation guidance
- EDI 820 parse: one payment had partial remittance — flagged but GlobalTech is clean

IMPORTANT: After completing all 5 tool calls, output a JSON summary:
{"status":"RESOLVED","payment_ref":"WF-20260328-7742","invoices_matched":47,"match_confidence_pct":99.2,"deductions_accepted":2,"accepted_amount":42700,"deduction_investigated":1,"investigate_amount":7400,"overpayment_credit":38100,"ar_reduction":2370000,"next_agent":"OTC-AGT-006"}`,
  },
  {
    agentName: OTC_AGT_006_NAME,
    agentCode:  "OTC-AGT-006",
    label:      "AR Posting, Deduction Validation & Invoice Closure",
    maxIter:    6,
    taskPrompt: `You are NovaTech's Billing & Collections Agent (OTC-AGT-006).

HANDOFF FROM OTC-AGT-009: GlobalTech Corp payment resolution package prepared.
- $2,262,747 matched to 47 invoices (all will close)
- 2 deductions VALID: freight claim $28,500 + early pay discount $14,200 = $42,700 accepted
- 1 deduction INVESTIGATE: quantity short $7,400 (carrier trace pending)
- $38,100 overpayment to credit to account
- Treasury controller one-click approval obtained

MISSION: Execute the AR posting, close all 47 invoices, and report the balance impact.

EXECUTE THESE STEPS IN ORDER:
1. Call validate_deduction_against_policy — confirm policy authority for all 3 deductions per NovaTech deduction matrix
2. Call post_ar_entries — post journal entries: debit Bank, credit AR 47 invoices, post deduction GL entries, credit memo entry
3. Call generate_credit_memo — issue CM-2026-0328-GT for $38,100 overpayment credit
4. Call close_invoice_batch — mark all 47 invoices CLOSED-PAID, update GlobalTech AR balance ($3.1M → $0.73M)
5. Call get_ar_aging_impact — confirm AR aging improvement and DSO impact

IMPORTANT: After completing all 5 tool calls, output a JSON summary:
{"status":"POSTED","posting_id":"JE-2026-CA-0328-GT","invoices_closed":47,"total_posted_usd":2262747,"deductions_posted_usd":42700,"credit_memo":"CM-2026-0328-GT","credit_amount":38100,"globaltech_ar_before":3100000,"globaltech_ar_after":730000,"dso_improvement_days":4.2,"bank_rec_ready":true}`,
  },
];

// ─── Ensure deployment helper ─────────────────────────────────────────────────
async function _ensureDeployment(agentId: string, agentName: string): Promise<string> {
  if (_deployIdByAgent[agentName]) return _deployIdByAgent[agentName];

  const allDeploys = await storage.getDeployments().catch((): Awaited<ReturnType<typeof storage.getDeployments>> => []);
  const existing = allDeploys.find(d => d.agentId === agentId && d.status !== "terminated");
  if (existing) {
    _deployIdByAgent[agentName] = existing.id;
    return existing.id;
  }

  const mcpServerName = OTC_CASH_AGENT_DEFS.find(d => d.name === agentName)?.mcpServerName;
  const mcpId = mcpServerName ? _mcpIdByName[mcpServerName] : undefined;

  const deploy = await storage.createDeployment({
    agentId,
    status:      "active",
    environment: "dev",
    deployedAt:  new Date(),
    config:      { mcpServerId: mcpId ?? null },
  });

  await storage.updateAgent(agentId, { status: "active" });
  _deployIdByAgent[agentName] = deploy.id;
  return deploy.id;
}

// ─── Cache refresh ────────────────────────────────────────────────────────────
async function _refreshCaches(): Promise<void> {
  const [allServers, allAgents] = await Promise.all([
    storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []),
    storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []),
  ]);
  for (const sd of OTC_CASH_MCP_SERVERS) {
    const s = allServers.find(x => x.name === sd.name);
    if (s) _mcpIdByName[sd.name] = s.id;
  }
  for (const def of OTC_CASH_AGENT_DEFS) {
    const a = allAgents.find(x => x.name === def.name);
    if (a) _agentIdByName[def.name] = a.id;
  }
}

// ─── Agent provisioning ───────────────────────────────────────────────────────
export async function ensureOtcCashAgents(): Promise<void> {
  if (_setupDone) { await _refreshCaches(); return; }

  // 1. Knowledge Bases
  const kbIdByName: Record<string, string> = {};
  const allKbs = await storage.getKnowledgeBases().catch((): Awaited<ReturnType<typeof storage.getKnowledgeBases>> => []);
  for (const kbDef of OTC_CASH_KB_DEFS) {
    let kb = allKbs.find(k => k.name === kbDef.name);
    if (!kb) {
      kb = await storage.createKnowledgeBase({
        name:                kbDef.name,
        description:         kbDef.description,
        industry:            "manufacturing",
        status:              "active",
        embeddingModel:      "text-embedding-3-small",
        embeddingDimensions: 1536,
        chunkSize:           512,
        chunkOverlap:        50,
      });
    }
    kbIdByName[kbDef.name] = kb.id;
  }

  // 2. MCP Servers + Tools
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const sd of OTC_CASH_MCP_SERVERS) {
    let server = allServers.find(s => s.name === sd.name);
    if (!server) {
      server = await storage.createMcpServer({
        name:          sd.name,
        description:   sd.description,
        transportType: "streamable-http",
        url:           sd.url,
        status:        "registered",
        riskTier:      "MEDIUM",
        allowlisted:   true,
        addedBy:       "otc-cash-application-live-demo",
        capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
        serverInfo:    { vendor: "NovaTech Industries / ATLAS Demo", version: "1.0.0" },
      });
    } else if (server.url !== sd.url) {
      await storage.updateMcpServer(server.id, { url: sd.url });
    }
    _mcpIdByName[sd.name] = server.id;

    const existingTools = await storage.getMcpServerTools(server.id).catch((): Awaited<ReturnType<typeof storage.getMcpServerTools>> => []);
    const existingNames = new Set(existingTools.map(t => t.name));
    for (const tool of sd.tools) {
      if (existingNames.has(tool.name)) continue;
      await storage.createMcpServerTool({
        serverId:           server.id,
        name:               tool.name,
        description:        tool.description,
        inputSchema:        { type: "object", properties: {}, required: [] },
        annotations:        { endpoint: tool.endpoint, method: tool.method },
        enabled:            true,
        riskClassification: "low",
      });
    }
  }

  // 3. Skills
  const allSkills = await storage.getSkills().catch((): Awaited<ReturnType<typeof storage.getSkills>> => []);
  for (const skillDef of OTC_CASH_SKILLS) {
    let skill = allSkills.find(s => s.name === skillDef.name);
    if (!skill) {
      const agentLabel = skillDef.agentKey === "cashApplication" ? "OTC-AGT-009" : "OTC-AGT-006";
      skill = await storage.createSkill({
        name:         skillDef.name,
        description:  skillDef.description,
        domain:       skillDef.domain,
        industry:     skillDef.industry,
        version:      skillDef.version,
        author:       "NovaTech Order-to-Cash Engineering",
        trustTier:    "platform-provided",
        complexity:   "intermediate",
        status:       "active",
        tags:         [...skillDef.tags],
        contextMode:  "summary",
        markdownBody: `## ${skillDef.name}\n\n${skillDef.description}\n\nThis skill is applied by ${agentLabel} during the AI-Powered Cash Application pipeline. Domain: ${skillDef.domain.replace(/_/g, " ")}.`,
        yamlFrontmatter: {
          skillId:   `otc-cash-${skillDef.name.toLowerCase().replace(/\s+/g, "-")}`,
          trustTier: "platform-provided",
          industry:  "manufacturing",
          version:   "1.0",
          tags:      [...skillDef.tags],
        },
        allowedTools: [],
      });
    }
    _skillIdByName[skillDef.name] = skill.id;
  }

  // 4. Policies
  const allPolicies = await storage.getPolicies().catch((): Awaited<ReturnType<typeof storage.getPolicies>> => []);
  for (const polDef of OTC_CASH_POLICY_DEFS) {
    if (!allPolicies.find(p => p.name === polDef.name)) {
      await storage.createPolicy({
        name:        polDef.name,
        domain:      polDef.domain,
        description: polDef.description,
        status:      "active",
        version:     1,
        scopeType:   "org",
        policyJson:  polDef.policyJson,
      });
    }
  }

  // 5. Ontology Concepts
  const allConcepts = await storage.getOntologyConcepts("manufacturing").catch((): Awaited<ReturnType<typeof storage.getOntologyConcepts>> => []);
  const existingLabels = new Set(allConcepts.map(c => c.label));
  const { randomUUID } = await import("crypto");
  for (const concept of OTC_CASH_ONTOLOGY_CONCEPTS) {
    if (existingLabels.has(concept.name)) continue;
    await storage.createOntologyConcept({
      id:            randomUUID(),
      industryId:    "manufacturing",
      ontologyName:  "NovaTech Order-to-Cash",
      label:         concept.name,
      category:      concept.domain,
      description:   concept.description,
      tags:          [concept.domain, "cash_application", "accounts_receivable"],
      properties:    [],
      relationships: [],
      synonyms:      [],
      source:        "industry-standard",
    });
  }

  // 6. Blueprints
  const allBPs = await storage.getBlueprints().catch((): Awaited<ReturnType<typeof storage.getBlueprints>> => []);
  const bpIdByKey: Record<string, string> = {};
  for (const bpDef of OTC_CASH_BLUEPRINTS) {
    let bp = allBPs.find(b => b.name === bpDef.name);
    if (!bp) {
      bp = await storage.createBlueprint({
        name:        bpDef.name,
        description: bpDef.description,
        version:     1,
        status:      "active",
        patternType: "pipeline",
        blueprintJson: {
          industry:      "manufacturing",
          workflowSteps: bpDef.steps.map(s => `Step ${s.order}: ${s.label} — ${s.description}`),
          requiredTools: bpDef.steps.map(s => s.description.match(/`([^`]+)`/)?.[1] ?? ""),
          outputFormat:  "JSON cash application resolution summary + audit trail",
        },
      });
    }
    const bpKey = bpDef.name.includes("Ingestion") ? "cashApplication_match"
                : bpDef.name.includes("Complex")   ? "cashApplication_resolve"
                :                                     "billingCollections";
    bpIdByKey[bpKey] = bp.id;
  }

  // 7. Agents
  const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);
  const POLICY_BINDINGS = OTC_CASH_POLICY_DEFS.map(p => ({ policyName: p.name, enforcement: "hard" as const }));

  for (const def of OTC_CASH_AGENT_DEFS) {
    let agent = allAgents.find(a => a.name === def.name);
    const skillIds = def.skillNames
      .map(sn => _skillIdByName[sn])
      .filter(Boolean)
      .map(skillId => ({ skillId }));
    const bpKey = def.key === "cashApplication" ? "cashApplication_match" : "billingCollections";
    const bpId = bpIdByKey[bpKey];
    const systemPrompt = OTC_CASH_SYSTEM_PROMPTS[def.externalId] ??
      `You are ${def.name}, a NovaTech AI agent for the Cash Application pipeline. Use your tools to process payments, match invoices, validate deductions, and post AR entries.`;

    if (!agent) {
      agent = await storage.createAgent({
        name:              def.name,
        description:       def.description,
        industry:          "manufacturing",
        department:        def.department,
        systemPrompt,
        status:            "active",
        autonomyMode:      "assisted",
        riskTier:          "HIGH",
        model:             "claude-opus-4-5",
        temperature:       0.2,
        maxTokens:         4096,
        complianceTags:    [...def.complianceTags],
        ontologyTags:      [...def.ontologyTags],
        preloadedSkills:   skillIds,
        policyBindings:    POLICY_BINDINGS,
        blueprintId:       bpId ?? null,
        tags:              ["otc", "cash_application", "month_end", "financial", def.externalId.toLowerCase()],
      });
    } else {
      await storage.updateAgent(agent.id, { systemPrompt });
    }

    _agentIdByName[def.name] = agent.id;

    // Link KB
    const kbName = def.kbName;
    const kbId = kbIdByName[kbName];
    if (kbId) {
      const existingLinks = await storage.getAgentKnowledgeBases(agent.id).catch(() => []);
      const alreadyLinked = existingLinks.some(l => l.knowledgeBaseId === kbId);
      if (!alreadyLinked) {
        await storage.createAgentKnowledgeBase({
          agentId:         agent.id,
          knowledgeBaseId: kbId,
          priority:        1,
          retrievalConfig: { topK: 5, scoreThreshold: 0.7 },
        }).catch(() => {});
      }
    }

    // Create eval suite (one per agent)
    const allEvals = await storage.getEvalSuites().catch((): Awaited<ReturnType<typeof storage.getEvalSuites>> => []);
    const evalName = `${OTC_CASH_EVAL_SUITE_NAME} — ${def.externalId}`;
    if (!allEvals.find(e => e.name === evalName)) {
      const evalSuite = await storage.createEvalSuite({
        name:        evalName,
        description: `Regression eval suite for ${def.name} (${def.externalId}). Tests auto-match accuracy, deduction classification, AR posting correctness, and SOX control adherence.`,
        agentId:     agent.id,
        industry:    "manufacturing",
        evalType:    "regression",
        schedule:    "weekly:Wednesday:06:00 UTC",
        status:      "active",
      });

      // Create test cases
      const testCases = def.key === "cashApplication" ? [
        { name: "Payment Batch Ingestion",   input: "Ingest month-end payment batch of 387 payments totalling $42.3M",             expectedOutput: "Batch ingested with channel breakdown and total confirmed",                                         category: "functional"  },
        { name: "Auto-Match Rate Target",    input: "Run auto-matching on $42.3M batch",                                           expectedOutput: "Match rate ≥90%; funnel breakdown with Perfect/High-Confidence/Low-Confidence/Unmatched tiers",  category: "performance" },
        { name: "Deduction Classification",  input: "Analyse freight claim FRGT-DMG -$28,500 with POD damage notation",            expectedOutput: "Classified as VALID freight claim; recommend accept and file carrier claim",                      category: "accuracy"    },
        { name: "EDI 820 Parse",             input: "Parse EDI 820 remittance with 47 invoice references and 3 deduction codes",   expectedOutput: "All 47 invoices extracted, deduction codes parsed, overpayment identified",                      category: "functional"  },
        { name: "Exception Prioritisation",  input: "Identify top exception by value and complexity",                               expectedOutput: "GlobalTech Corp $2.3M flagged as HIGH COMPLEXITY; sorted before lower-value exceptions",          category: "accuracy"    },
      ] : [
        { name: "Policy Authority Check",    input: "Validate freight claim $28,500 against deduction policy matrix",              expectedOutput: "AUTO_APPROVE ruling per Section 4.2 (≤$50K with POD evidence)",                                  category: "functional"  },
        { name: "AR Posting Accuracy",       input: "Post $2,262,747 cash receipt against 47 GlobalTech invoices",                 expectedOutput: "Journal entries correctly posted: debit Bank, credit AR 47 invoices, deduction GL entries",       category: "accuracy"    },
        { name: "Invoice Closure",           input: "Close 47 paid invoices and update customer AR balance",                       expectedOutput: "47 invoices CLOSED-PAID; GlobalTech AR reduces from $3.1M to $0.73M",                           category: "functional"  },
        { name: "Credit Memo Generation",    input: "Generate credit memo for $38,100 overpayment",                                expectedOutput: "CM-2026-0328-GT issued; applied to customer account; approval reference logged",                 category: "functional"  },
        { name: "SOX Control Compliance",    input: "Verify dual-approval requirement for AR postings >$1M",                       expectedOutput: "Controller e-approval captured; SOX-CA-001 control logged in audit trail",                      category: "compliance"  },
      ];

      for (const tc of testCases) {
        await storage.createEvalTestCase({
          suiteId:        evalSuite.id,
          name:           tc.name,
          input:          tc.input,
          expectedOutput: tc.expectedOutput,
          category:       tc.category,
          weight:         1,
          enabled:        true,
        }).catch(() => {});
      }
    }
  }

  _setupDone = true;
}

// ─── Get agent run history (for Agent Registry traces) ───────────────────────
export async function getOtcCashAgentRuns(_req: Request, res: Response): Promise<void> {
  try {
    await _refreshCaches();
    const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);
    const cashAgents = allAgents.filter(a => a.name === OTC_AGT_009_NAME || a.name === OTC_AGT_006_NAME);

    const runs = await Promise.all(
      cashAgents.map(async (agent) => {
        const agentRuns = await storage.getAgentRuntimeRuns(agent.id).catch(() => []);
        return {
          agentId:   agent.id,
          agentName: agent.name,
          agentCode: agent.name === OTC_AGT_009_NAME ? "OTC-AGT-009" : "OTC-AGT-006",
          runs:      agentRuns.slice(-20),
        };
      })
    );
    res.json({ agents: runs });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch agent runs" });
  }
}

// ─── Demo reset ───────────────────────────────────────────────────────────────
export async function resetOtcCashDemo(_req: Request, res: Response): Promise<void> {
  _setupDone = false;
  Object.keys(_agentIdByName).forEach(k => delete _agentIdByName[k]);
  Object.keys(_deployIdByAgent).forEach(k => delete _deployIdByAgent[k]);
  res.json({ reset: true });
}

// ─── Headless pipeline runner (smoke test) ───────────────────────────────────
export interface OtcCashPipelineResult {
  success: boolean;
  steps: Array<{ agentCode: string; agentName: string; success: boolean; toolCallCount: number; message: string }>;
  error?: string;
}

export async function runOtcCashPipeline(): Promise<OtcCashPipelineResult> {
  await ensureOtcCashAgents();
  const steps: OtcCashPipelineResult["steps"] = [];

  for (const step of PIPELINE_STEPS) {
    const agentId = _agentIdByName[step.agentName];
    if (!agentId) {
      steps.push({ agentCode: step.agentCode, agentName: step.agentName, success: false, toolCallCount: 0, message: `Agent not found: ${step.agentName}` });
      return { success: false, steps, error: `Agent not found: ${step.agentName}` };
    }

    const deployId = await _ensureDeployment(agentId, `${step.agentName}-${step.agentCode}-${step.label.slice(0, 20)}`);
    let result: { success: boolean; message?: string; steps?: any[] };
    try {
      result = await runAgentOnce(deployId, step.taskPrompt, step.maxIter);
    } catch (err: any) {
      steps.push({ agentCode: step.agentCode, agentName: step.agentName, success: false, toolCallCount: 0, message: err?.message ?? "Unknown error" });
      return { success: false, steps, error: `${step.agentCode} threw: ${err?.message ?? "unknown"}` };
    }

    const toolCallCount = (result.steps ?? []).filter((s: any) => s.type === "api_call").length;
    steps.push({ agentCode: step.agentCode, agentName: step.agentName, success: result.success, toolCallCount, message: result.message?.slice(0, 500) ?? "" });

    if (!result.success) return { success: false, steps, error: `${step.agentCode} failed: ${result.message?.slice(0, 200)}` };
  }

  return { success: true, steps };
}

// ─── SSE Live-Run Handler ─────────────────────────────────────────────────────
export async function otcCashLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sse = (event: string, data: object) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  let aborted = false;
  const keepalive = setInterval(() => {
    if (aborted) { clearInterval(keepalive); return; }
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); }
  }, 15_000);

  const activeDeployIds = new Set<string>();
  const deployToAgent  = new Map<string, string>();

  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted || !activeDeployIds.has(evt.deploymentId)) return;
    const agentName = deployToAgent.get(evt.deploymentId) ?? "unknown";
    const steps: any[] = evt.result?.steps ?? [];
    const toolSteps = steps.filter((s: any) => s.type === "api_call");
    if (toolSteps.length > 0) {
      for (const step of toolSteps) {
        sse("agent_event", {
          agentName,
          type: "tool_call_result",
          tool: step.mcpTool || step.name || "tool",
          data: { tool: step.mcpTool || step.name, success: step.status === "completed" || step.status === "passed" },
        });
      }
    } else {
      sse("agent_event", {
        agentName,
        type: "analysis_step",
        data: { steps: steps.length, success: evt.result?.success },
      });
    }
  };

  runtimeEvents.on("agent_execution", onRuntimeEvent);
  req.on("close", () => {
    aborted = true;
    clearInterval(keepalive);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
  });

  const agentResults: Record<string, string> = {};
  // Use per-step unique keys to allow OTC-AGT-009 to appear twice in pipeline
  const deployKeyForStep: Record<number, string> = {};

  try {
    sse("run_start", {
      message:  "MONTH-END CASH APPLICATION — March 2026. $42.3M in payments received across 387 transactions. Initiating Atlas AI-Powered Cash Application Command Center…",
      scenario: "OTC-SCN-004",
      period:   "March 2026",
    });

    sse("setup", { message: "Provisioning OTC-AGT-009 (Cash Application) and OTC-AGT-006 (Billing & Collections)…" });
    await ensureOtcCashAgents();

    const ids = {
      agt009: _agentIdByName[OTC_AGT_009_NAME],
      agt006: _agentIdByName[OTC_AGT_006_NAME],
    };

    if (!ids.agt009 || !ids.agt006) {
      sse("error", { message: "One or more agents failed to provision. Check server logs." });
      res.end(); return;
    }

    sse("setup", {
      message:  `Agents ready — OTC-AGT-009 ✓ · OTC-AGT-006 ✓`,
      agentIds: ids,
    });

    // Sequential pipeline: AGT-009 (step 1) → AGT-009 (step 2) → AGT-006 (step 3)
    for (let stepIdx = 0; stepIdx < PIPELINE_STEPS.length; stepIdx++) {
      if (aborted) break;
      const step = PIPELINE_STEPS[stepIdx];

      const agentId = _agentIdByName[step.agentName];
      if (!agentId) {
        sse("agent_error", { agentName: step.agentName, message: "Agent not found — skipping" });
        continue;
      }

      // Give each pipeline step a unique deployment key so AGT-009 step 1 and step 2
      // get the same deployment ID (real behaviour) but SSE events are distinguished by label
      const deployKey = `${step.agentName}-step${stepIdx}`;
      if (!deployKeyForStep[stepIdx]) {
        const deployId = await _ensureDeployment(agentId, step.agentName);
        deployKeyForStep[stepIdx] = deployId;
      }
      const deployId = deployKeyForStep[stepIdx];

      activeDeployIds.add(deployId);
      deployToAgent.set(deployId, `${step.agentCode} — ${step.label}`);

      sse("agent_start", {
        agentName:    step.agentName,
        agentCode:    step.agentCode,
        agentId,
        deploymentId: deployId,
        label:        step.label,
        step:         stepIdx + 1,
        totalSteps:   PIPELINE_STEPS.length,
      });

      const result = await runAgentOnce(deployId, step.taskPrompt, step.maxIter);
      agentResults[`${step.agentCode}-step${stepIdx + 1}`] = result.message ?? "";

      activeDeployIds.delete(deployId);

      sse("agent_complete", {
        agentName:    step.agentName,
        agentCode:    step.agentCode,
        agentId,
        deploymentId: deployId,
        label:        step.label,
        success:      result.success,
        summary:      result.message?.slice(0, 2000) ?? "",
        step:         stepIdx + 1,
      });

      if (!result.success) {
        sse("agent_error", {
          agentName: step.agentName,
          agentCode: step.agentCode,
          message:   `${step.agentCode} Step ${stepIdx + 1} failed: ${result.message?.slice(0, 200) ?? "unknown error"} — aborting pipeline`,
        });
        break;
      }
    }

    if (!aborted) {
      sse("pipeline_complete", {
        message:   "Cash Application Command Center pipeline complete. 94.1% auto-match rate achieved. GlobalTech $2.3M / 47 invoices resolved in seconds. AR reduced by $2.37M.",
        scenario:  "OTC-SCN-004",
        agentSummaries: agentResults,
        metrics: {
          total_payments:        387,
          total_amount:          42_313_847,
          match_rate_pct:        94.1,
          auto_matched_usd:      39_826_847,
          globaltech_invoices:   47,
          deductions_accepted:   2,
          accepted_usd:          42_700,
          ar_reduction:          2_370_000,
          bank_rec_pct:          98.7,
          time_to_close_mins:    1.2,
        },
      });
    }
  } catch (err: unknown) {
    sse("error", { message: err instanceof Error ? err.message : "Unexpected pipeline error" });
  } finally {
    clearInterval(keepalive);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    try { if (!aborted) res.end(); } catch {}
  }
}
