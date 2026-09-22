/**
 * Production data access for Astra's tools. Every function takes the caller's
 * organization and returns only what that organization may see: connectors go
 * through the tenant-scoped catalog (storage.getMcpServers(orgId)) and agents
 * through storage.getAgents(orgId) / getAgent(id, orgId).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { agentMcpServers, agentProposals, agents, mcpElicitations, policyExceptions, workspaceRuns, type InsertPolicy } from "@shared/schema";
import { createHash } from "crypto";
import { buildTeamFromProposal, teamBuildBodySchema } from "../team-build";
import { computeWaves, extractFinalOutputText, startTeamAgentDagRun } from "../dag-execution-engine";
import { summarizeRunToolCalls } from "../run-tool-summary";
import { getDagRunEventBuffer, subscribeDagRunEvents, type DagRunEvent } from "../dag-run-events";
import { TERMINAL_RUN_STATUSES, watchTeamRun } from "./team-run-watch";
import { assessTeamWiring, type WiringAgent, type WiringLink, type WiringSnapshot } from "./wiring-assess";
import { getWorkspaceAgents, getWorkspaceRun, resumeWorkspaceRun, startWorkspaceRun, type OnWorkspaceEvent } from "../workspace-run";
import { getRedactionLevel, hasPermission, redactPayload, type RoleId } from "../permissions";
import { getIndustryPack } from "@shared/industry-packs";
import { getBuiltInIndustry } from "@shared/built-in-industries";
import { isSideEffectful, type AvailableTool } from "../tool-dispatcher";
import { filterElicitationsForOrg, filterPolicyExceptionsForOrg, isMcpServerVisibleToOrg } from "../tenant-scope";
import { decideApproval, whoMayDecide, type ApprovalDecision } from "../approval-decision";
import { acknowledgeAlert, decidePolicyException, decideRecommendation, getAlertInOrg, getRecommendationInOrg, recommendationEffect, respondToToolRequest } from "../action-decisions";
import { bindPolicyToAgent, bindPolicyToOutcome, installPolicyPack, policyPackCatalog, type Enforcement } from "../policy-actions";
import { resolvePolicyBundle } from "../routes/helpers";
import { evalServices } from "./eval-services";
import { knowledgeServices } from "./knowledge-services";
import { deployServices } from "./deploy-services";
import { resolveAgentIndustry } from "../agent-industry";
import { checkPolicyRequirements, policyRequirementsFor } from "@shared/policy-requirements";
import { buildMyActions, loadMyActionsRows } from "../my-actions-build";
import { proposeTeam } from "../team-proposal";
import { assessProposalBindings, resolveBindingServer } from "../team-bindings";
import { flattenGraphToSteps, isUntouchedStarterFlow } from "@shared/process-flow";
import { extractHtmlDocument } from "@shared/html-document";
import { assessOutcomeIntelligence } from "../outcome-intelligence";
import { similarOutcomeNames } from "./outcome-names";
import { decisionRoute } from "./needs-you";
import { createOutcomeFromProposal, prepareOutcomeFromProposal, type OutcomeProposalBody } from "../outcome-create";
import type { AstraServices } from "./types";

export interface ConnectorSummary {
  id: string;
  name: string;
  description: string | null;
  integrationId: string | null;
  status: string;
  riskTier: string;
  /** Enterprise integration connected for this organization; null for non-integration servers. */
  connected: boolean | null;
  toolCount: number;
  writeToolCount: number;
}

function asAvailableTool(serverId: string, tool: { name: string; annotations?: unknown }): AvailableTool {
  const annotations = (tool.annotations ?? {}) as { method?: string };
  return {
    serverId,
    serverName: "",
    serverUrl: "",
    toolName: tool.name,
    toolDescription: "",
    toolInputSchema: {},
    toolMethod: annotations.method,
  };
}

async function listAgents(orgId: string) {
  return storage.getAgents(orgId);
}

async function getAgent(orgId: string, agentId: string) {
  return storage.getAgent(agentId, orgId);
}

async function listAgentConnectors(orgId: string, agentId: string) {
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent) return [];
  const links = await storage.getAgentMcpServers(agentId);
  const out: Array<{ linkId: string; serverId: string; name: string; integrationId: string | null; riskTier: string; status: string }> = [];
  for (const link of links) {
    const server = await storage.getMcpServer(link.serverId);
    if (!server || !isMcpServerVisibleToOrg(server, orgId)) continue;
    out.push({ linkId: link.id, serverId: server.id, name: server.name, integrationId: server.integrationId, riskTier: server.riskTier, status: server.status });
  }
  return out;
}

async function listConnectors(orgId: string): Promise<ConnectorSummary[]> {
  const [servers, tools, connections] = await Promise.all([
    storage.getMcpServers(orgId),
    storage.getAllMcpServerTools(orgId),
    storage.listIntegrationConnections(orgId).catch(() => []),
  ]);
  const toolsByServer = new Map<string, typeof tools>();
  for (const t of tools) {
    const list = toolsByServer.get(t.serverId) ?? [];
    list.push(t);
    toolsByServer.set(t.serverId, list);
  }
  return servers.map((s) => {
    const serverTools = toolsByServer.get(s.id) ?? [];
    const connection = s.connectionId
      ? connections.find((c) => c.id === s.connectionId)
      : connections.find((c) => c.integrationId === s.integrationId && c.status === "connected");
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      integrationId: s.integrationId,
      status: s.status,
      riskTier: s.riskTier,
      connected: s.integrationId ? connection?.status === "connected" : null,
      toolCount: serverTools.length,
      writeToolCount: serverTools.filter((t) => isSideEffectful(asAvailableTool(s.id, t))).length,
    };
  });
}

/** Agents in this organization linked to any of the given connectors. */
async function agentsLinkedToConnectors(orgId: string, serverIds: string[]) {
  if (serverIds.length === 0) return [];
  return db
    .select({ serverId: agentMcpServers.serverId, agentId: agents.id, agentName: agents.name, agentStatus: agents.status })
    .from(agentMcpServers)
    .innerJoin(agents, eq(agents.id, agentMcpServers.agentId))
    .where(and(inArray(agentMcpServers.serverId, serverIds), eq(agents.organizationId, orgId)));
}

async function getIndustryContext(industryId: string | null | undefined) {
  if (!industryId) return { selected: false as const };
  const pack = getIndustryPack(industryId);
  if (!pack) {
    // A built-in industry has a profile (ontology, frameworks, sub-verticals) but no policy packs.
    const builtIn = getBuiltInIndustry(industryId);
    if (!builtIn) return { selected: true as const, industryId, pack: false as const, builtIn: false as const };
    return {
      selected: true as const,
      industryId: builtIn.id,
      pack: false as const,
      builtIn: true as const,
      label: builtIn.label,
      description: builtIn.description,
      ontology: builtIn.ontology,
      regulatoryFrameworks: builtIn.regulatoryFrameworks,
      subVerticals: builtIn.subVerticals,
      policyPacks: [] as string[],
    };
  }
  return {
    selected: true as const,
    industryId,
    pack: true as const,
    builtIn: false as const,
    label: pack.profile.label,
    description: pack.profile.description,
    ontology: pack.profile.ontology,
    regulatoryFrameworks: pack.profile.regulatoryFrameworks,
    subVerticals: pack.profile.subVerticals,
    policyPacks: pack.policyPacks.map((p) => p.name),
  };
}

// ── attach_connector ─────────────────────────────────────────────────────────

async function getConnector(orgId: string, serverId: string) {
  const server = await storage.getMcpServer(serverId);
  if (!server || !isMcpServerVisibleToOrg(server, orgId)) return undefined;
  return { id: server.id, name: server.name, integrationId: server.integrationId, riskTier: server.riskTier };
}

async function getConnectorTools(orgId: string, serverId: string) {
  if (!(await getConnector(orgId, serverId))) return [];
  const tools = await storage.getMcpServerTools(serverId);
  return tools.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    riskClassification: t.riskClassification,
    annotations: t.annotations,
    sideEffectful: isSideEffectful(asAvailableTool(serverId, t)),
  }));
}

async function isConnectorLinked(orgId: string, agentId: string, serverId: string) {
  if (!(await storage.getAgent(agentId, orgId))) return false;
  return !!(await storage.getAgentMcpServerByIds(agentId, serverId));
}

async function listPolicies(orgId: string) {
  return storage.getPolicies(orgId);
}

async function createPolicy(orgId: string, policy: Omit<InsertPolicy, "organizationId">) {
  return storage.createPolicy({ ...policy, organizationId: orgId });
}

async function deletePolicy(orgId: string, policyId: string) {
  return storage.deletePolicy(policyId, orgId);
}

async function linkConnector(orgId: string, agentId: string, serverId: string) {
  // Both ends re-checked against the organization at the moment of writing.
  if (!(await storage.getAgent(agentId, orgId))) throw new Error("Agent not found in this organization.");
  if (!(await getConnector(orgId, serverId))) throw new Error("Connector not available to this organization.");
  if (await storage.getAgentMcpServerByIds(agentId, serverId)) throw new Error("The connector is already attached to this agent.");
  return storage.createAgentMcpServer({ agentId, serverId, assignedBy: "astra-workspace" });
}

async function recordAudit(
  orgId: string,
  userId: string | null,
  event: { action: string; objectType: string; objectId: string; details: Record<string, unknown> },
) {
  await storage.createAuditEvent({
    actorType: "user",
    actorId: userId ?? "unknown",
    action: event.action,
    objectType: event.objectType,
    objectId: event.objectId,
    organizationId: orgId,
    details: JSON.stringify(event.details),
  });
}

// ── run_agent / get_run ──────────────────────────────────────────────────────

const RUNNABLE_STATUSES = new Set(["active", "deployed"]);

/**
 * The agents this role may run from Astra: what the Workspace offers it
 * (runnable, in its audience, not a team's internal worker), plus -- for roles
 * that can view agents -- a team's internal workers on their own. The
 * Workspace hides those to keep business users' list short; someone building
 * agents needs to run a step by itself. Audience and status rules still apply,
 * and teams themselves are not included.
 */
async function listRunnableAgents(orgId: string, role: RoleId) {
  const all = await storage.getAgents(orgId);
  const offered = await getWorkspaceAgents(orgId, role, all);
  if (!hasPermission(role, "view_agents")) return offered;
  const ids = new Set(offered.map((a) => a.id));
  const workers = all
    .filter((a) => !ids.has(a.id) && RUNNABLE_STATUSES.has(a.status) && a.agentType !== "team")
    .filter((a) => {
      if (role === "admin") return true;
      const audience = ((a as any).workspaceAudience as string[] | null) ?? [];
      return audience.length === 0 || audience.includes(role);
    })
    .map((a) => ({ id: a.id, name: a.name, description: a.description ?? null, ontologyTags: Array.isArray((a as any).ontologyTags) ? (a as any).ontologyTags : [] }));
  return [...offered, ...workers];
}

/**
 * Runs are addressed by id alone in workspace-run.ts; Astra only touches a run
 * that belongs to the caller's organization (a run with no organization is
 * treated as belonging to none).
 */
async function runInOrg(orgId: string, runId: string): Promise<boolean> {
  const [row] = await db.select({ organizationId: workspaceRuns.organizationId }).from(workspaceRuns).where(eq(workspaceRuns.id, runId)).limit(1);
  return !!row && row.organizationId === orgId;
}

/** Workspace semantics: the actor is the caller's role. */
async function startAgentRun(orgId: string, role: RoleId, agentId: string, request: string, onEvent: OnWorkspaceEvent) {
  return startWorkspaceRun({ agentId, input: request, orgId, actorId: role }, onEvent);
}

async function getAgentRun(orgId: string, runId: string) {
  if (!(await runInOrg(orgId, runId))) return null;
  return getWorkspaceRun(runId, orgId);
}

async function decideAgentRun(orgId: string, role: RoleId, runId: string, decision: "approve" | "deny", onEvent: OnWorkspaceEvent) {
  if (!(await runInOrg(orgId, runId))) throw new Error("Run not found in this organization.");
  return resumeWorkspaceRun({ runId, decision, orgId, actorId: role, role }, onEvent);
}

/** A run as the role may see it: payloads redacted to the role's level. */
async function getRunForRole(orgId: string, role: RoleId, runId: string) {
  const run = await getAgentRun(orgId, runId);
  if (!run) return null;
  return redactPayload(run, getRedactionLevel(role)) as typeof run;
}

// ── decide_approval ──────────────────────────────────────────────────────────

/** One approval in the organization, with what deciding it affects. */
async function getApprovalForDecision(orgId: string, role: RoleId, approvalId: string) {
  const approval = await storage.getApproval(approvalId, orgId);
  if (!approval) return null;
  let outcome: { id: string; name: string; status: string } | null = null;
  if (approval.objectType === "outcome_contract" && approval.objectId) {
    const o = await storage.getOutcome(approval.objectId, orgId);
    if (o) outcome = { id: o.id, name: o.name, status: o.status };
  }
  return {
    id: approval.id,
    type: approval.type,
    objectType: approval.objectType,
    objectName: approval.objectName,
    status: approval.status,
    description: approval.description,
    requestedBy: approval.requestedBy,
    createdAt: approval.createdAt ? new Date(approval.createdAt).toISOString() : null,
    requiredReviewerRole: approval.requiredReviewerRole ?? null,
    canDecide: whoMayDecide(role, approval),
    outcome,
  };
}

async function decideApprovalAs(
  orgId: string,
  role: RoleId,
  userId: string | null,
  decidedBy: string,
  approvalId: string,
  decision: ApprovalDecision,
  note?: string,
) {
  return decideApproval({ orgId, role, userId, decidedBy, approvalId, decision, note, via: "Astra Workspace" });
}

// ── decide_recommendation / acknowledge_alert ───────────────────────────────

/** A recommendation for an agent in the organization, with what accepting it would do. */
async function getRecommendationForDecision(orgId: string, recommendationId: string) {
  const found = await getRecommendationInOrg(recommendationId, orgId);
  if (!found) return null;
  const { rec, agent } = found;
  const effect = recommendationEffect(rec, agent);
  return {
    id: rec.id,
    title: rec.title,
    description: rec.description ?? null,
    status: rec.status,
    severity: rec.severity,
    // Written by the recommendation generator from a target, not measured.
    estimatedImpact: rec.impact ?? null,
    agent: { id: agent.id, name: agent.name },
    effect: effect.kind === "model_downgrade" ? { kind: effect.kind, from: effect.from, to: effect.to } : effect,
  };
}

async function decideRecommendationAs(orgId: string, userId: string | null, actorLabel: string, recommendationId: string, decision: "accept" | "dismiss", note?: string) {
  return decideRecommendation({ orgId, actorId: userId ?? actorLabel, actorLabel, via: "Astra Workspace", recommendationId, decision, note });
}

async function getAlertForDecision(orgId: string, alertId: string) {
  const alert = await getAlertInOrg(alertId, orgId);
  if (!alert) return null;
  return {
    id: alert.id,
    agentName: alert.agentName,
    message: alert.message,
    severity: alert.severity,
    acknowledged: !!alert.acknowledgedAt,
    triggeredAt: alert.triggeredAt ? new Date(alert.triggeredAt).toISOString() : null,
  };
}

async function acknowledgeAlertAs(orgId: string, userId: string | null, actorLabel: string, alertId: string, note?: string) {
  return acknowledgeAlert({ orgId, actorId: userId ?? actorLabel, actorLabel, via: "Astra Workspace", alertId, note });
}

// ── decide_policy_exception / answer_tool_request ───────────────────────────

/** A requested policy exception in the organization: which policy, who for, why, until when. */
async function getPolicyExceptionForDecision(orgId: string, exceptionId: string) {
  const [pe] = await db.select().from(policyExceptions).where(eq(policyExceptions.id, exceptionId));
  if (!pe || (await filterPolicyExceptionsForOrg([pe], orgId)).length === 0) return null;
  const [policy, agent] = await Promise.all([storage.getPolicy(pe.policyId), pe.agentId ? storage.getAgent(pe.agentId, orgId) : Promise.resolve(undefined)]);
  return {
    id: pe.id,
    status: pe.status,
    reason: pe.reason,
    scope: pe.scope,
    requestedBy: pe.requestedBy ?? null,
    expiresAt: pe.expiresAt ? new Date(pe.expiresAt).toISOString() : null,
    policy: policy ? { id: policy.id, name: policy.name } : null,
    agent: agent ? { id: agent.id, name: agent.name } : null,
  };
}

async function decidePolicyExceptionAs(orgId: string, userId: string | null, actorLabel: string, exceptionId: string, decision: "approve" | "reject", note?: string) {
  return decidePolicyException({ orgId, actorId: userId ?? actorLabel, actorLabel, via: "Astra Cowork", exceptionId, decision, note });
}

/** An agent's pending request to use a tool, in the organization. */
async function getToolRequestForDecision(orgId: string, elicitationId: string) {
  const [el] = await db.select().from(mcpElicitations).where(eq(mcpElicitations.id, elicitationId));
  if (!el || (await filterElicitationsForOrg([el], orgId)).length === 0) return null;
  const agent = el.agentId ? await storage.getAgent(el.agentId, orgId) : undefined;
  const args = el.proposedArgs == null ? null : JSON.stringify(el.proposedArgs);
  return {
    id: el.id,
    status: el.status,
    toolName: el.toolName ?? null,
    serverName: el.serverName ?? null,
    reason: el.reason ?? null,
    riskFlags: el.riskFlags ?? [],
    proposedArgs: args && args.length > 400 ? `${args.slice(0, 399)}…` : args,
    // A request that asks for a form or a URL visit needs an answer, not a yes or no.
    needsAnswer: el.mode === "url" || (el.formSchema != null && Object.keys((el.formSchema as any)?.properties ?? {}).length > 0),
    agent: agent ? { id: agent.id, name: agent.name } : null,
  };
}

async function respondToToolRequestAs(orgId: string, userId: string | null, actorLabel: string, elicitationId: string, decision: "approve" | "decline", note?: string) {
  return respondToToolRequest({ orgId, actorId: userId ?? actorLabel, actorLabel, via: "Astra Cowork", elicitationId, decision, note });
}

// ── Governance pack ─────────────────────────────────────────────────────────

/** An agent only if it is in this organization (resolvePolicyBundle alone would fall back to org policies). */
async function agentInOrg(orgId: string, agentId: string) {
  const agent = await storage.getAgent(agentId, orgId);
  return agent && agent.organizationId === orgId ? agent : null;
}

/** The policies that apply to an agent, by scope, and what they block at run time. */
async function explainPolicies(orgId: string, agentId: string) {
  const agent = await agentInOrg(orgId, agentId);
  if (!agent) return null;
  const bundle = await resolvePolicyBundle(agent.id, orgId);
  return {
    agent: { id: agent.id, name: agent.name },
    applied: bundle.appliedPolicies,
    blockedTools: bundle.blockedTools,
    monitoredTools: bundle.monitorBlockedTools,
    toolAllowlist: bundle.toolAllowlist,
    guardrailCount: bundle.guardrails.length,
    redactionPatternCount: bundle.redactPatterns.length,
  };
}

/** The agent's industry requirements checked against the policies that actually apply to it. */
async function governanceReadiness(orgId: string, agentId: string) {
  const agent = await agentInOrg(orgId, agentId);
  if (!agent) return null;
  const industryId = await resolveAgentIndustry(agent);
  if (!industryId) {
    return { agent: { id: agent.id, name: agent.name }, industryId: null, passed: true, checked: false, message: "The agent has no industry (and the organization has none set), so no requirements were checked.", requirements: [] };
  }
  const bundle = await resolvePolicyBundle(agent.id, orgId);
  const appliedIds = new Set(bundle.appliedPolicies.map((p) => p.id));
  const applied = (await storage.getPolicies(orgId)).filter((p) => appliedIds.has(p.id));
  const result = checkPolicyRequirements(industryId, policyRequirementsFor(industryId), applied, agent.riskTier ?? undefined);
  return { agent: { id: agent.id, name: agent.name }, industryId, ...result };
}

async function verifyAuditChain(orgId: string) {
  return storage.verifyAuditChainIntegrity(orgId);
}

/** What the signed regulatory exam package for an agent would contain, counted (the package itself is downloaded). */
async function examPackageSummary(orgId: string, agentId: string, days: number) {
  const agent = await agentInOrg(orgId, agentId);
  if (!agent) return null;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const inWindow = (d: Date | string | null | undefined) => !!d && new Date(d).getTime() >= since;
  const [events, approvals, redteamRuns, bundle] = await Promise.all([
    storage.getAuditEvents(orgId),
    storage.getApprovals(orgId),
    storage.getEvalRedteamRuns({ organizationId: orgId, agentId: agent.id }).catch(() => []),
    resolvePolicyBundle(agent.id, orgId).catch(() => null),
  ]);
  return {
    agent: { id: agent.id, name: agent.name },
    days,
    decisionLogEvents: events.filter((e) => e.objectId === agent.id && inWindow(e.createdAt)).length,
    humanOverrides: approvals.filter((a) => a.agentId === agent.id && inWindow(a.decidedAt)).length,
    redTeamRuns: redteamRuns.filter((r: any) => inWindow(r.startedAt)).length,
    appliedPolicies: bundle?.appliedPolicies.length ?? 0,
    downloadHref: `/api/agents/${encodeURIComponent(agent.id)}/regulatory-exam-package?timeWindowDays=${days}`,
  };
}

async function listOutcomeNames(orgId: string) {
  return (await storage.getOutcomes(orgId)).map((o) => ({ id: o.id, name: o.name }));
}

async function listPolicyPacks(industryId: string | null) {
  return policyPackCatalog(industryId);
}

async function installPolicyPackAs(orgId: string, packId: string, actor: string, actorId: string) {
  return installPolicyPack({ orgId, packId, actor, actorId, via: "Astra Workspace" });
}

async function bindPolicyAs(
  orgId: string,
  actor: string,
  actorId: string,
  target: { policyId: string; agentId?: string; outcomeId?: string; enforcement: Enforcement },
) {
  if (target.agentId) {
    return { kind: "agent" as const, ...(await bindPolicyToAgent({ orgId, policyId: target.policyId, agentId: target.agentId, enforcement: target.enforcement, actor, actorId, via: "Astra Workspace" })) };
  }
  const [policy, outcome] = await Promise.all([storage.getPolicy(target.policyId, orgId), storage.getOutcome(target.outcomeId!, orgId)]);
  if (!policy) throw new Error("No policy with that id in this organization.");
  if (!outcome) throw new Error("No outcome with that id in this organization.");
  const r = await bindPolicyToOutcome({ orgId, policy, outcomeId: outcome.id, actor, actorId });
  return { kind: "outcome" as const, policy: { id: r.policy.id, name: r.policy.name }, outcome: { id: outcome.id, name: outcome.name }, cloned: r.cloned };
}

async function getUserDisplayName(userId: string | null) {
  if (!userId) return null;
  const user = await storage.getUser(userId).catch(() => undefined);
  return (user as any)?.username ?? null;
}

// ── discover_outcome / list_outcomes ────────────────────────────────────────

async function outcomeGrounding(
  orgId: string,
  industryId: string | null | undefined,
  draft: { name: string; description: string; riskTier?: string; roles?: string[]; tools?: string[] },
) {
  const [outcomes, agentsList, templates, servers, policies] = await Promise.all([
    storage.getOutcomes(orgId),
    storage.getAgents(orgId),
    storage.getAgentTemplates(),
    storage.getMcpServers(orgId),
    storage.getPolicies(orgId),
  ]);
  const tools = (await Promise.all(servers.map((srv) => storage.getMcpServerTools(srv.id)))).flat();
  const intel = assessOutcomeIntelligence(
    { agents: agentsList, templates, servers, tools, policies },
    {
      industry: industryId ?? "",
      toolNames: draft.tools ?? [],
      roleNames: draft.roles ?? [],
      autonomyModes: [],
      riskTiers: draft.riskTier ? [draft.riskTier] : [],
      proposedApprovalGatesCount: null,
    },
  );
  const pack = industryId ? getIndustryPack(industryId) : undefined;
  const builtIn = !pack && industryId ? getBuiltInIndustry(industryId) : undefined;

  return {
    possibleDuplicates: similarOutcomeNames(draft.name, outcomes),
    industry: pack
      ? {
          selected: true as const,
          pack: true as const,
          id: pack.id,
          label: pack.profile.label,
          regulatoryFrameworks: pack.profile.regulatoryFrameworks,
          kpiDimensions: pack.assurance.kpiDimensions.map((k) => ({ label: k.label, description: k.description })),
          regulatoryChecks: pack.assurance.regulatoryTemplates.map((t) => `${t.regulation} ${t.section}: ${t.name}`),
          policyPacks: pack.policyPacks.map((pp) => ({ name: pp.name, framework: pp.framework, riskLevel: pp.riskLevel })),
        }
      : builtIn
        ? { selected: true as const, pack: false as const, builtIn: true as const, id: builtIn.id, label: builtIn.label, regulatoryFrameworks: builtIn.regulatoryFrameworks }
        : { selected: !!industryId, pack: false as const, id: industryId ?? null },
    // Catalog figures (template deployment counts, delivery rates, time to production)
    // and health scores are left out: they aren't measured for this organization.
    similarAgents: intel.matchedAgents.map((group) => ({
      role: group.role,
      matches: group.matches.map((a) => ({ id: a.id, name: a.name, status: a.status, totalRuns: a.totalRuns, riskTier: a.riskTier, autonomyMode: a.autonomyMode })),
    })),
    templates: intel.matchedTemplates.map((t) => ({ id: t.id, name: t.name, category: t.category, industry: t.industry, defaultRiskTier: t.defaultRiskTier })),
    toolCoverage: intel.toolCoverage.map((t) => ({ proposed: t.proposedName, status: t.status, matched: t.matchedTool?.name ?? null, risk: t.matchedTool?.riskClassification ?? null })),
    policies: intel.matchedPolicies.map((pol) => ({ id: pol.id, name: pol.name, domain: pol.domain, enforcement: pol.enforcementType })),
    compositeRisk: intel.compositeRisk,
    checked: { outcomes: outcomes.length, agents: agentsList.length, connectors: servers.length, policies: policies.length },
  };
}

async function listOutcomes(orgId: string) {
  const [outcomes, approvalsList, agentsList] = await Promise.all([
    storage.getOutcomes(orgId),
    storage.getApprovals(orgId),
    storage.getAgents(orgId),
  ]);
  const pendingReviews = new Map(
    approvalsList
      .filter((a) => a.type === "outcome_review" && a.status === "pending" && a.objectId)
      .map((a) => [a.objectId as string, a.id]),
  );
  const agentCount = new Map<string, number>();
  for (const a of agentsList) if (a.outcomeId) agentCount.set(a.outcomeId, (agentCount.get(a.outcomeId) ?? 0) + 1);

  return Promise.all(
    outcomes.map(async (o) => {
      const kpis = await storage.getKpisByOutcome(o.id);
      return {
        id: o.id,
        name: o.name,
        description: o.description,
        status: o.status,
        riskTier: o.riskTier,
        pendingReviewApprovalId: pendingReviews.get(o.id) ?? null,
        agentCount: agentCount.get(o.id) ?? 0,
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
        kpis: kpis.map((k) => ({
          id: k.id,
          name: k.name,
          unit: k.unit,
          target: k.target,
          targetOperator: k.targetOperator,
          baseline: k.baseline,
          // A current value is only reported with its source; without one it isn't measured.
          current: k.valueSource
            ? { value: k.currentValue, source: k.valueSource, updatedAt: k.valueUpdatedAt ? new Date(k.valueUpdatedAt).toISOString() : null }
            : null,
        })),
      };
    }),
  );
}

/** Outcome counts for the home briefing, without loading each outcome's KPIs. */
async function outcomeCounts(orgId: string) {
  const [outcomes, approvalsList] = await Promise.all([storage.getOutcomes(orgId), storage.getApprovals(orgId)]);
  const ids = new Set(outcomes.map((o) => o.id));
  const pendingReview = new Set(
    approvalsList
      .filter((a) => a.type === "outcome_review" && a.status === "pending" && a.objectId && ids.has(a.objectId))
      .map((a) => a.objectId as string),
  ).size;
  return { total: outcomes.length, pendingReview };
}

// ── create_outcome ───────────────────────────────────────────────────────────

async function findSimilarOutcomes(orgId: string, name: string) {
  return similarOutcomeNames(name, await storage.getOutcomes(orgId));
}

/** Validate a drafted outcome without writing it (throws with the reason). */
async function checkOutcomeDraft(body: OutcomeProposalBody) {
  return prepareOutcomeFromProposal(body, { baselineWhenMissing: null });
}

/** Create the outcome pending review. A baseline nobody gave is stored as unknown, not 0. */
async function createOutcome(orgId: string, actor: string, body: OutcomeProposalBody) {
  const prepared = prepareOutcomeFromProposal(body, { baselineWhenMissing: null });
  return createOutcomeFromProposal(orgId, actor, prepared, { source: "astra_workspace", evidence: body.evidence });
}

// ── list_needs_me ────────────────────────────────────────────────────────────

/**
 * My Actions for the organization, with where this role decides each item: in
 * the conversation, or on which page and why. The rail and list_needs_me both
 * read this, so they can't disagree.
 */
async function needsMe(orgId: string, role: RoleId) {
  const rows = await loadMyActionsRows(orgId);
  const built = buildMyActions(rows);
  const approvalsById = new Map(rows.approvals.map((a) => [a.id, a]));
  const annotate = (item: (typeof built.needsDecision)[number]) => {
    const approval = item.source === "approval" ? approvalsById.get(item.sourceId) : undefined;
    const route = decisionRoute({
      source: item.source,
      category: item.category,
      sourceId: item.sourceId,
      approval: approval ? { status: approval.status, objectType: approval.objectType, requiredReviewerRole: approval.requiredReviewerRole ?? null } : null,
      allowed: approval
        ? whoMayDecide(role, approval)
        : item.source === "recommendation"
          ? { allowed: hasPermission(role, "approve_changes"), reason: "" }
          : item.source === "alert"
            ? { allowed: hasPermission(role, "view_agents"), reason: "" }
            : item.source === "governance" || item.source === "autonomy"
              ? { allowed: hasPermission(role, "approve_changes"), reason: "" }
              : null,
    });
    return {
      ...item,
      // An approval's "impact" line is derived from the requester's risk score, not measured.
      businessImpact: item.source === "approval" ? null : item.businessImpact,
      approvalKind: approval?.objectType ?? null,
      ...route,
    };
  };
  return {
    needsDecisionCount: built.needsDecisionCount,
    fyiCount: built.fyiCount,
    completedTodayCount: built.completedTodayCount,
    needsDecision: built.needsDecision.map(annotate),
    fyi: built.fyi.map(annotate),
  };
}

// ── propose_team ─────────────────────────────────────────────────────────────

/** How a plan's connector bindings resolve against this organization's connectors and their tools. */
async function assessBindings(orgId: string, agentsInPlan: Array<{ name: string; mcpToolBindings?: Array<{ server: string; tool: string }> }>) {
  const connectors = await listConnectors(orgId);
  const toolNames = new Map<string, string[]>();
  const named = new Set(agentsInPlan.flatMap((a) => (a.mcpToolBindings ?? []).map((b) => b.server)));
  for (const serverName of Array.from(named)) {
    const connector = resolveBindingServer(serverName, connectors);
    if (connector && !toolNames.has(connector.id)) {
      toolNames.set(connector.id, (await getConnectorTools(orgId, connector.id)).map((t) => t.name));
    }
  }
  return { ...assessProposalBindings(agentsInPlan, connectors, toolNames), connectorsChecked: connectors.length };
}

/**
 * Propose a team for one of the organization's outcomes. Progress messages
 * go to onProgress; the plan is saved as the outcome's draft proposal.
 */
async function proposeTeamForOutcome(
  orgId: string,
  outcomeId: string,
  industryId: string | null,
  feedback: string | undefined,
  onProgress: (message: string) => void,
) {
  const outcome = await storage.getOutcome(outcomeId, orgId);
  if (!outcome) return { ok: false as const, error: "No outcome with that id in this organization." };
  const kpis = await storage.getKpisByOutcome(outcome.id);
  const flow = outcome.processFlow as any;
  // The planner treats a process flow as authored by the business. The starter
  // flow every new outcome gets is a placeholder, so it isn't passed as one.
  const hasFlow = !!flow && Array.isArray(flow.nodes) && flow.nodes.length > 0;
  const starterOnly = hasFlow && isUntouchedStarterFlow(flow, outcome.name, outcome.riskTier);
  const processFlowSteps = hasFlow && !starterOnly ? flattenGraphToSteps(flow) : undefined;

  // The planner applies feedback only against a previous plan. With no draft
  // yet, the user's requirements travel with the outcome instead.
  const draft = feedback ? await storage.getAgentProposalByOutcome(outcome.id).catch(() => undefined) : undefined;
  const previousPlan = draft ? { orchestrator: draft.orchestrator, workers: draft.workers, pipeline: draft.pipeline } : undefined;
  const outcomeContract: Record<string, unknown> = {
    ...outcome,
    // The whole outcome is shown to the planner; keep the placeholder flow out of it too.
    ...(starterOnly ? { processFlow: null } : {}),
    ...(feedback && !previousPlan ? { requirementsFromTheUser: feedback } : {}),
  };

  let result: any = null;
  let failure: { error: string; details?: string; timeout?: boolean } | null = null;
  await proposeTeam(
    { outcomeContract, kpis, feedback: previousPlan ? feedback : undefined, previousPlan, industryContext: industryId ? { industryId } : null, processFlowSteps },
    {
      orgId,
      onEvent: (event) => {
        if (event.type === "progress") onProgress(event.message);
        else if (event.type === "done") result = event.result;
        else if (event.type === "error") failure = event;
      },
    },
  );
  if (failure) return { ok: false as const, error: (failure as any).error, details: (failure as any).details, timeout: (failure as any).timeout };
  if (!result || result.error || !Array.isArray(result.agents) || result.agents.length === 0) {
    return { ok: false as const, error: result?.error ?? "No team plan was produced.", likelyTooLarge: !!result?.likelyTooLarge };
  }
  const bindings = await assessBindings(orgId, [...(result.orchestrator ? [result.orchestrator] : []), ...result.agents]);
  return { ok: true as const, outcome: { id: outcome.id, name: outcome.name, status: outcome.status, riskTier: outcome.riskTier }, plan: result, proposalId: result.proposalId ?? null, bindings };
}

// ── build_team ───────────────────────────────────────────────────────────────

/** A fingerprint of a plan: the draft is overwritten when the outcome is proposed for again. */
function planHash(row: { orchestrator: unknown; workers: unknown; pipeline: unknown }) {
  return createHash("sha256").update(JSON.stringify([row.orchestrator ?? null, row.workers ?? null, row.pipeline ?? null])).digest("hex");
}

/** A saved proposal, only when its outcome belongs to the organization. */
async function getProposalForBuild(orgId: string, proposalId: string) {
  const [row] = await db.select().from(agentProposals).where(eq(agentProposals.id, proposalId)).limit(1);
  if (!row) return null;
  const outcome = await storage.getOutcome(row.outcomeId, orgId);
  if (!outcome) return null;
  const approvalsList = await storage.getApprovals(orgId);
  const review = approvalsList.find((a) => a.type === "outcome_review" && a.status === "pending" && a.objectId === outcome.id);
  const flow = outcome.processFlow as any;
  return {
    proposal: { id: row.id, status: row.status, orchestrator: row.orchestrator as any, workers: (row.workers as any[]) ?? [], pipeline: row.pipeline as any },
    outcome: { id: outcome.id, name: outcome.name, status: outcome.status, riskTier: outcome.riskTier },
    pendingReviewApprovalId: review?.id ?? null,
    processFlowSteps: flow && Array.isArray(flow.nodes) && flow.nodes.length > 0 ? flattenGraphToSteps(flow) : undefined,
    hash: planHash(row),
  };
}

/** Which policy names in a plan match this organization's active policies. */
async function resolvePolicyNames(orgId: string, names: string[]) {
  const active = (await storage.getPolicies(orgId)).filter((pol) => pol.status === "active");
  const byName = new Set(active.map((pol) => pol.name.toLowerCase().trim()));
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  return { resolved: unique.filter((n) => byName.has(n.toLowerCase())), unresolved: unique.filter((n) => !byName.has(n.toLowerCase())) };
}

/** Build the team in the organization (validates the body the same way the create-team route does). */
async function buildTeam(orgId: string, body: unknown) {
  return buildTeamFromProposal(teamBuildBodySchema.parse(body), { orgId });
}

async function markProposalBuilt(proposalId: string) {
  await storage.updateAgentProposal(proposalId, { status: "created" });
}

// ── verify_wiring ────────────────────────────────────────────────────────────

/** Team agents in the organization, for finding a team by name. */
async function listTeams(orgId: string) {
  return (await storage.getAgents(orgId))
    .filter((a) => a.agentType === "team")
    .map((a) => ({ id: a.id, name: a.name, status: a.status, riskTier: a.riskTier, blueprintId: a.blueprintId ?? null }));
}

function toWiringAgent(a: any): WiringAgent {
  const rc = (a.runtimeConfig ?? {}) as { mcpToolBindings?: Array<{ server: string; tool: string }> };
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    agentType: a.agentType,
    organizationId: a.organizationId ?? null,
    mcpToolBindings: Array.isArray(rc.mcpToolBindings) ? rc.mcpToolBindings : [],
    policyBindings: Array.isArray(a.policyBindings) ? a.policyBindings : [],
  };
}

/**
 * Everything the wiring check looks at, for a team in the organization.
 * Agents the team uses are loaded without organization scoping on purpose,
 * so one belonging to another organization is reported instead of hidden.
 */
async function loadTeamWiring(orgId: string, teamAgentId: string): Promise<WiringSnapshot | null> {
  const team = await storage.getAgent(teamAgentId, orgId);
  if (!team || team.agentType !== "team") return null;

  const blueprint = team.blueprintId ? await storage.getBlueprint(team.blueprintId) : undefined;
  const [nodes, edges] = blueprint
    ? await Promise.all([storage.getTeamBlueprintNodes(blueprint.id), storage.getTeamBlueprintEdges(blueprint.id)])
    : [[], []];

  const agentIds = new Set<string>([team.id]);
  for (const m of await storage.getAgentTeamMembers(team.id)) agentIds.add(m.memberAgentId);
  for (const n of nodes) {
    if (n.refAgentId) agentIds.add(n.refAgentId);
    if (n.refTeamAgentId) agentIds.add(n.refTeamAgentId);
  }
  const agentsLoaded = (await Promise.all(Array.from(agentIds).map((id) => storage.getAgent(id)))).filter(Boolean);

  const connectors = await listConnectors(orgId);
  const byId = new Map(connectors.map((c) => [c.id, c]));
  const links: Record<string, WiringLink[]> = {};
  const toolCache = new Map<string, string[]>();
  for (const a of agentsLoaded as any[]) {
    const rows: WiringLink[] = [];
    for (const link of await storage.getAgentMcpServers(a.id)) {
      const summary = byId.get(link.serverId);
      if (!summary) {
        const server = await storage.getMcpServer(link.serverId);
        rows.push({ serverId: link.serverId, name: server?.name ?? "an unknown connector", visible: false, connected: null, toolNames: [] });
        continue;
      }
      if (!toolCache.has(summary.id)) toolCache.set(summary.id, (await storage.getMcpServerTools(summary.id)).map((t) => t.name));
      rows.push({ serverId: summary.id, name: summary.name, visible: true, connected: summary.connected, toolNames: toolCache.get(summary.id)!, writeToolCount: summary.writeToolCount });
    }
    links[a.id] = rows;
  }

  let waves: WiringSnapshot["waves"];
  try {
    waves = { totalWaves: computeWaves(nodes as any, edges as any).totalWaves };
  } catch (err: any) {
    waves = { cycleError: err?.message ?? "cycle" };
  }

  const policies = await storage.getPolicies(orgId);
  return {
    orgId,
    team: { id: team.id, name: team.name, riskTier: team.riskTier ?? null, organizationId: team.organizationId ?? null, blueprintId: team.blueprintId ?? null },
    blueprint: blueprint ? { id: blueprint.id, organizationId: blueprint.organizationId ?? null, status: blueprint.status } : null,
    nodes,
    edges,
    agents: (agentsLoaded as any[]).map(toWiringAgent),
    links,
    connectors: connectors.map((c) => ({ id: c.id, name: c.name, connected: c.connected })),
    activePolicyIds: policies.filter((pol) => pol.status === "active").map((pol) => pol.id),
    waves,
  };
}

/** The wiring report for a team, with the steps in order for the card. */
async function verifyTeamWiring(orgId: string, teamAgentId: string) {
  const snapshot = await loadTeamWiring(orgId, teamAgentId);
  if (!snapshot) return null;
  const report = assessTeamWiring(snapshot);
  let order: string[] = [];
  if ("totalWaves" in snapshot.waves) {
    try {
      const plan = computeWaves(snapshot.nodes as any, snapshot.edges as any) as any;
      const labelOf = new Map(snapshot.nodes.map((n) => [n.id, n.label]));
      order = (plan.waves ?? []).map((w: any) => (w.nodeIds ?? w.nodes ?? []).map((id: any) => labelOf.get(typeof id === "string" ? id : id?.id) ?? "").filter(Boolean).join(" + "));
    } catch {
      order = [];
    }
  }
  const connectors = new Map<string, { name: string; writeTools: number; connected: boolean | null }>();
  for (const rows of Object.values(snapshot.links)) {
    for (const l of rows) if (l.visible) connectors.set(l.serverId, { name: l.name, writeTools: l.writeToolCount ?? 0, connected: l.connected });
  }
  return { team: snapshot.team, report, steps: order, connectors: Array.from(connectors.values()) };
}

// ── run_team / get_team_run ─────────────────────────────────────────────────

/** Start a team run, the same way the Run Flow button does. */
async function startTeamRun(orgId: string, teamAgentId: string, request: string) {
  const team = await storage.getAgent(teamAgentId, orgId);
  if (!team || team.agentType !== "team") throw new Error("No team with that id in this organization.");
  if (!team.blueprintId) throw new Error(`${team.name} has no team blueprint to run.`);
  const { dagRunId, wavePlan } = await startTeamAgentDagRun(team.id, team.blueprintId, request, { errorStrategy: "best_effort" });
  return { dagRunId, totalWaves: wavePlan.totalWaves };
}

/** A run's row, only when its team belongs to the organization (runs carry no organization of their own). */
async function getTeamRunRow(orgId: string, dagRunId: string) {
  const row = await storage.getDagExecutionRun(dagRunId);
  if (!row?.teamAgentId) return null;
  const team = await storage.getAgent(row.teamAgentId, orgId);
  if (!team) return null;
  return { row, team };
}

async function followTeamRun(
  orgId: string,
  dagRunId: string,
  opts: { onEvent: (e: DagRunEvent) => void; maxWaitMs: number; ignoreApprovalId?: string | null },
) {
  return watchTeamRun(
    { runId: dagRunId, onEvent: opts.onEvent, maxWaitMs: opts.maxWaitMs, ignoreApprovalId: opts.ignoreApprovalId },
    {
      subscribe: subscribeDagRunEvents,
      buffer: getDagRunEventBuffer,
      loadRow: async () => {
        const found = await getTeamRunRow(orgId, dagRunId);
        return found ? { status: found.row.status, pendingApprovalId: found.row.pendingApprovalId ?? null } : null;
      },
    },
  );
}

/** What happened in a team run, step by step, with its answer once it's done. */
async function getTeamRun(orgId: string, role: RoleId, dagRunId: string) {
  const found = await getTeamRunRow(orgId, dagRunId);
  if (!found) return null;
  const { row, team } = found;
  const blueprintId = team.blueprintId;
  const [nodes, edges] = blueprintId
    ? await Promise.all([storage.getTeamBlueprintNodes(blueprintId), storage.getTeamBlueprintEdges(blueprintId)])
    : [[], []];
  const labelOf = new Map(nodes.map((n) => [n.id, n.label]));
  const waveResults = (Array.isArray(row.waveResults) ? row.waveResults : []) as any[];
  const plan = nodes.length > 0 ? (() => { try { return computeWaves(nodes as any, edges as any); } catch { return null; } })() : null;
  const steps: Array<{ nodeId: string; wave: number; revision: number; label: string; status: string; error: string | null; durationMs: number | null; html: boolean }> =
    waveResults.flatMap((w) =>
      (w.nodes ?? []).map((n: any) => ({
        nodeId: n.nodeId,
        wave: w.waveNumber,
        revision: w.revisionRound ?? 0,
        label: labelOf.get(n.nodeId) ?? n.nodeId,
        status: n.status,
        error: n.error ? String(n.error).slice(0, 300) : null,
        durationMs: n.durationMs ?? null,
        // Whether the step produced a web page or email, which can be opened as a page.
        html: Object.values(n.output ?? {}).some((v) => typeof v === "string" && extractHtmlDocument(v) !== null),
      })),
    );
  // While the run is live, the steps it hasn't reached yet are listed too, so a
  // viewer sees the whole plan fill in: the next stage running (or its approval
  // step waiting for a person), the rest waiting.
  if (plan && !TERMINAL_RUN_STATUSES.has(row.status)) {
    const reached = new Set(steps.map((s) => s.nodeId));
    const nextWave = (waveResults.length ? waveResults[waveResults.length - 1].waveNumber : 0) + 1;
    for (const w of plan.waves) {
      for (const nodeId of w.nodes) {
        if (reached.has(nodeId)) continue;
        const status = w.wave_number !== nextWave ? "waiting" : row.status === "waiting_approval" ? "waiting_approval" : row.status === "running" ? "running" : "waiting";
        steps.push({ nodeId, wave: w.wave_number, revision: 0, label: labelOf.get(nodeId) ?? nodeId, status, error: null, durationMs: null, html: false });
      }
    }
  }

  let answer: string | null = null;
  if (TERMINAL_RUN_STATUSES.has(row.status) && row.finalState && plan) {
    try {
      const skippedNodeIds = Array.from(new Set(waveResults.flatMap((w) => w.nodes ?? []).filter((n: any) => n.status === "skipped").map((n: any) => n.nodeId)));
      answer = extractFinalOutputText({ success: row.status !== "failed", finalState: row.finalState as any, skippedNodeIds } as any, plan);
      const toolSummary = summarizeRunToolCalls(row.finalState as Record<string, unknown>, plan);
      if (toolSummary) answer = `${answer}\n\n---\n\n${toolSummary}`;
    } catch {
      answer = null;
    }
  }
  let pending: { approvalId: string; label: string | null; description: string | null } | null = null;
  if (row.status === "waiting_approval" && row.pendingApprovalId) {
    const approval = await storage.getApproval(row.pendingApprovalId).catch(() => undefined);
    // The step's own name ("Email Approval") reads better than the approval record's long title.
    const gateStep = steps.find((s) => s.status === "waiting_approval");
    pending = { approvalId: row.pendingApprovalId, label: gateStep?.label ?? approval?.objectName ?? null, description: approval?.description ?? null };
  }
  return {
    id: row.id,
    team: { id: team.id, name: team.name },
    status: row.status,
    currentWave: row.currentWave ?? 0,
    totalWaves: row.totalWaves ?? 0,
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    error: row.error ?? null,
    costUsd: row.totalCostUsd ?? 0,
    toolCalls: row.totalToolCalls ?? 0,
    steps,
    pending,
    answer: answer == null ? null : redactPayload(answer, getRedactionLevel(role)),
  };
}

async function getOrganizationName(orgId: string) {
  const org = await storage.getOrganization(orgId).catch(() => undefined);
  return org?.name ?? null;
}

export function createAstraServices(): AstraServices {
  return {
    ...evalServices,
    ...knowledgeServices,
    ...deployServices,
    listAgents,
    getAgent,
    listAgentConnectors,
    listConnectors,
    agentsLinkedToConnectors,
    getIndustryContext,
    getOrganizationName,
    getConnector,
    getConnectorTools,
    isConnectorLinked,
    listPolicies,
    createPolicy,
    deletePolicy,
    linkConnector,
    recordAudit,
    listRunnableAgents,
    startAgentRun,
    getAgentRun,
    decideAgentRun,
    getRunForRole,
    getApprovalForDecision,
    decideApprovalAs,
    explainPolicies,
    governanceReadiness,
    verifyAuditChain,
    examPackageSummary,
    listPolicyPacks,
    listOutcomeNames,
    installPolicyPackAs,
    bindPolicyAs,
    getRecommendationForDecision,
    decideRecommendationAs,
    getAlertForDecision,
    acknowledgeAlertAs,
    getPolicyExceptionForDecision,
    decidePolicyExceptionAs,
    getToolRequestForDecision,
    respondToToolRequestAs,
    getUserDisplayName,
    outcomeGrounding,
    listOutcomes,
    outcomeCounts,
    findSimilarOutcomes,
    checkOutcomeDraft,
    createOutcome,
    needsMe,
    assessBindings,
    proposeTeamForOutcome,
    getProposalForBuild,
    resolvePolicyNames,
    buildTeam,
    markProposalBuilt,
    listTeams,
    verifyTeamWiring,
    startTeamRun,
    getTeamRunRow,
    followTeamRun,
    getTeamRun,
  };
}
