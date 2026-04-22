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

// ─── Scenario definitions ─────────────────────────────────────────────────────
type ScenarioStep = { agentName: string; agentCode: string; label: string; maxIter: number; taskPrompt: string };

const SCENARIO_MAIN: ScenarioStep[] = [
  {
    agentName: OTC_AGT_009_NAME,
    agentCode: "OTC-AGT-009",
    label:     "Month-End Batch — Payment Ingestion & Auto-Matching",
    maxIter:   7,
    taskPrompt: `You are NovaTech's Cash Application & Reconciliation Agent (OTC-AGT-009).

Today is March 28, 2026 — month-end close. The treasury team has just handed you the daily payment batch for processing.

Your goal is to get NovaTech's AR in order before books close. You have tools to ingest the payment batch, run the intelligent matching engine, surface the exception queue, and check the bank reconciliation status.

Start by pulling in the batch to understand what you're working with. Then run the matching algorithms — NovaTech targets 94% or better auto-match rates at month-end. Once matching is complete, surface the exception queue so the team knows what needs human attention. GlobalTech Corp tends to come in with complex multi-invoice payments, so flag anything that looks like a high-complexity exception. Wrap up by confirming the bank reconciliation status for March.

Summarise your findings in a JSON block when done:
{"status":"BATCH_PROCESSED","total_amount":42313847,"payments":387,"match_rate_pct":94.1,"auto_matched_usd":39826847,"exceptions":14,"high_complexity_exception":"GlobalTech Corp $2,300,847","bank_rec_pct":98.7,"next_step":"RESOLVE_GLOBALTECH"}`,
  },
  {
    agentName: OTC_AGT_009_NAME,
    agentCode: "OTC-AGT-009",
    label:     "GlobalTech $2.3M — Complex EDI 820 Resolution",
    maxIter:   8,
    taskPrompt: `You are NovaTech's Cash Application & Reconciliation Agent (OTC-AGT-009).

GlobalTech Corp's wire transfer (WF-20260328-7742, $2,300,847.00) came in with an EDI 820 remittance attachment covering 47 open invoices. The matching engine flagged it HIGH COMPLEXITY because it has multiple deduction codes and what looks like an overpayment. The cash team estimates this kind of payment takes 4–6 hours to resolve manually.

You have tools to parse their EDI 820, apply the payment waterfall across the invoices, dig into each deduction, and validate whether each deduction is legitimate under NovaTech policy. Once you have a clear picture, package everything up as a one-click resolution for the treasury controller.

Investigate this thoroughly — the deductions especially. One of them may warrant a carrier investigation rather than immediate acceptance.

Summarise your resolution in a JSON block when done:
{"status":"RESOLVED","payment_ref":"WF-20260328-7742","invoices_matched":47,"match_confidence_pct":99.2,"deductions_accepted":2,"accepted_amount":42700,"deduction_investigated":1,"investigate_amount":7400,"overpayment_credit":38100,"ar_reduction":2370000,"next_agent":"OTC-AGT-006"}`,
  },
  {
    agentName: OTC_AGT_006_NAME,
    agentCode: "OTC-AGT-006",
    label:     "AR Posting, Deduction Validation & Invoice Closure",
    maxIter:   7,
    taskPrompt: `You are NovaTech's Billing & Collections Agent (OTC-AGT-006).

OTC-AGT-009 has prepared the GlobalTech Corp resolution package. The payment ($2,300,847 on wire WF-20260328-7742) has been matched to 47 invoices, 3 deductions have been analysed, and an overpayment credit of $38,100 has been identified. The treasury controller has given one-click approval.

Your job is to execute the AR side: validate each deduction against NovaTech's policy matrix, post the journal entries to the AR sub-ledger, issue the credit memo for the overpayment, close all 47 invoices in the ERP, and report the impact on GlobalTech's AR aging.

Be precise with GL account codes and journal entry references — this is a SOX-controlled process. When you're done, the AR balance should move from roughly $3.1M to $0.73M for GlobalTech.

Summarise the posting in a JSON block when done:
{"status":"POSTED","posting_id":"JE-2026-CA-0328-GT","invoices_closed":47,"total_posted_usd":2262747,"deductions_posted_usd":42700,"credit_memo":"CM-2026-0328-GT","credit_amount":38100,"globaltech_ar_before":3100000,"globaltech_ar_after":730000,"dso_improvement_days":4.2,"bank_rec_ready":true}`,
  },
];

const SCENARIO_VERTEX: ScenarioStep[] = [
  {
    agentName: OTC_AGT_009_NAME,
    agentCode: "OTC-AGT-009",
    label:     "Vertex Systems — ACH Reference Mismatch Investigation",
    maxIter:   6,
    taskPrompt: `You are NovaTech's Cash Application & Reconciliation Agent (OTC-AGT-009).

An ACH payment from Vertex Systems (ACH-2026-0328-0447, $487,200) has landed in the exception queue with a reference mismatch flag. The memo field contains "VS-2026-MAR" but that reference doesn't match any open invoice number in NovaTech's AR system. The payment is sitting unmatched.

Look up the payment and their open invoices. You have a fuzzy matching tool that cross-references customer PO codes against open AR — see if it can find a clean match for this payment. If you find a high-confidence match, prepare a confirmation package so the AR supervisor can approve it with one click.

Be specific about which invoices you believe this covers, the total, and your confidence level.

Summarise your findings in a JSON block when done:
{"status":"MATCH_FOUND","payment_ref":"ACH-2026-0328-0447","customer":"Vertex Systems","payment_amount":487200,"invoices_matched":5,"match_confidence_pct":91,"match_method":"PO_CROSS_REFERENCE","resolution":"AUTO_CONFIRM_AVAILABLE"}`,
  },
  {
    agentName: OTC_AGT_006_NAME,
    agentCode: "OTC-AGT-006",
    label:     "Vertex Systems — Confirmed Match AR Posting",
    maxIter:   5,
    taskPrompt: `You are NovaTech's Billing & Collections Agent (OTC-AGT-006).

OTC-AGT-009 resolved the Vertex Systems ACH reference mismatch — their $487,200 payment (ACH-2026-0328-0447) was matched to invoices INV-47210 through INV-47214 via PO cross-reference with 91% confidence. The AR supervisor has confirmed the match.

Post the cash receipt to AR and close those 5 invoices. There are no deductions and no overpayment — this is a clean posting, just a non-standard reference that caused the initial exception. Once posted, confirm the customer's updated AR balance.

Summarise the posting in a JSON block when done:
{"status":"POSTED","posting_id":"JE-2026-CA-0328-VS","customer":"Vertex Systems","payment_ref":"ACH-2026-0328-0447","invoices_closed":5,"total_posted_usd":487200,"ar_before":512800,"ar_after":25600}`,
  },
];

const SCENARIO_REGIONAL: ScenarioStep[] = [
  {
    agentName: OTC_AGT_009_NAME,
    agentCode: "OTC-AGT-009",
    label:     "Regional Supply Co — No Remittance, Allocation Investigation",
    maxIter:   6,
    taskPrompt: `You are NovaTech's Cash Application & Reconciliation Agent (OTC-AGT-009).

A check for $127,000 arrived from Regional Supply Co (CHK-2026-77421) with no remittance stub and no reference. The check is sitting unmatched. The customer has 8 open invoices totalling $143,200 — this payment doesn't cover everything, so you need to decide how to allocate it.

Look up the payment and the customer's open AR. Use your allocation tool to figure out the best way to apply $127,000 across their open invoices — NovaTech's standard policy is oldest-first for unapplied payments, but check whether that makes sense here. Document your recommended allocation with reasoning.

Summarise your findings in a JSON block when done:
{"status":"ALLOCATION_PROPOSED","payment_ref":"CHK-2026-77421","customer":"Regional Supply Co","payment_amount":127000,"invoices_to_close":3,"allocation_method":"OLDEST_FIRST","confidence_pct":72,"unapplied":3700,"action_required":"PROVISIONAL_APPLY_PLUS_CHASE"}`,
  },
  {
    agentName: OTC_AGT_006_NAME,
    agentCode: "OTC-AGT-006",
    label:     "Regional Supply Co — Chase Workflow & Provisional AR Posting",
    maxIter:   6,
    taskPrompt: `You are NovaTech's Billing & Collections Agent (OTC-AGT-006).

OTC-AGT-009 has proposed an oldest-first provisional allocation for Regional Supply Co's $127K check (CHK-2026-77421). The customer hasn't provided remittance, so you need to do two things simultaneously: contact them to get it, and post the payment provisionally so it doesn't age further in the exception queue.

Initiate the automated chase workflow — send them a notification via their preferred contact method asking for remittance confirmation. Then post the payment provisionally to their oldest overdue invoices. Be sure to flag it as provisional so the posting can be revised once they respond. Report the aging impact.

Summarise the outcome in a JSON block when done:
{"status":"CHASE_INITIATED_AND_PROVISIONAL_POSTED","payment_ref":"CHK-2026-77421","customer":"Regional Supply Co","chase_id":"CHASE-2026-RSC-0328","provisional_posting_id":"JE-2026-PROV-RSC-0328","invoices_provisionally_closed":3,"ar_before":143200,"ar_after":16200,"days_30_cleared":89400}`,
  },
];

const SCENARIOS: Record<string, { label: string; steps: ScenarioStep[]; pipelineCompleteMsg: string; metrics: Record<string, unknown> }> = {
  main: {
    label: "Month-End Batch Processing",
    steps: SCENARIO_MAIN,
    pipelineCompleteMsg: "Month-end cash application complete. 94.1% auto-match rate. GlobalTech $2.3M / 47 invoices resolved. AR reduced by $2.37M.",
    metrics: { total_payments: 387, total_amount: 42_313_847, match_rate_pct: 94.1, auto_matched_usd: 39_826_847, globaltech_invoices: 47, ar_reduction: 2_370_000, bank_rec_pct: 98.7 },
  },
  vertex: {
    label: "Vertex Systems — Fuzzy Reference Match",
    steps: SCENARIO_VERTEX,
    pipelineCompleteMsg: "Vertex Systems ACH $487.2K resolved via PO cross-reference fuzzy match. 5 invoices closed. Exception cleared in seconds.",
    metrics: { payment_amount: 487_200, invoices_closed: 5, match_confidence_pct: 91, ar_reduction: 487_200, match_method: "PO_CROSS_REFERENCE" },
  },
  regional: {
    label: "Regional Supply Co — No Remittance Recovery",
    steps: SCENARIO_REGIONAL,
    pipelineCompleteMsg: "Regional Supply Co $127K provisionally posted. 3 overdue invoices cleared. Automated chase workflow initiated — 3-day response window.",
    metrics: { payment_amount: 127_000, invoices_provisional: 3, days_30_cleared: 89_400, ar_after: 16_200, chase_initiated: true },
  },
};

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

  // Resolve scenario
  const scenarioKey = (req.query.scenario as string) || "main";
  const scenario = SCENARIOS[scenarioKey] ?? SCENARIOS.main;

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
  const deployKeyForStep: Record<number, string> = {};

  try {
    sse("run_start", {
      message:     `Initiating Atlas Cash Application — Scenario: ${scenario.label}`,
      scenario:    scenarioKey,
      scenarioLabel: scenario.label,
      period:      "March 2026",
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

    sse("setup", { message: `Agents ready — OTC-AGT-009 ✓ · OTC-AGT-006 ✓`, agentIds: ids });

    for (let stepIdx = 0; stepIdx < scenario.steps.length; stepIdx++) {
      if (aborted) break;
      const step = scenario.steps[stepIdx];

      const agentId = _agentIdByName[step.agentName];
      if (!agentId) {
        sse("agent_error", { agentName: step.agentName, message: "Agent not found — skipping" });
        continue;
      }

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
        totalSteps:   scenario.steps.length,
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
        message:        scenario.pipelineCompleteMsg,
        scenario:       scenarioKey,
        scenarioLabel:  scenario.label,
        agentSummaries: agentResults,
        metrics:        scenario.metrics,
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
