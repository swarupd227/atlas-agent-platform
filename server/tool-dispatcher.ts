/**
 * Tool Dispatcher — the single gated dispatch path for agent tool calls.
 *
 * Every engine that lets an agent invoke a tool MUST route the invocation
 * through dispatchToolCall(). The gates (policy bundle, AAR constraint list,
 * skill allowlist, rate limit) and the actual execution live here and only
 * here, so a gate added once protects every engine. tests/engine-parity.test.ts
 * fails CI if an engine bypasses this module.
 *
 * Gate order (first refusal wins):
 *   1. skill allowlist        → gate_blocked_skill
 *   2. policy bundle          → gate_blocked_policy (strict/block), monitor-mode logs and proceeds
 *   3. AAR constraint list    → gate_blocked_aar | gate_requires_approval
 *   3.5. declared scope       → gate_blocked_scope_drift (opt-in; intent-based authorization)
 *   4. rate limit             → rate_limited
 *   5. shadow environment     → shadow_skipped (no execution)
 *   6. idempotency            → deduplicated (cached result, no re-execution)
 *   7. execution              → success | tool_error
 *
 * Redaction: policy redact patterns are applied to redactedArgs for logging
 * and trace persistence only — execution always receives the raw args
 * (redacting inputs before a real API call would corrupt the call).
 */
import { createHash } from "crypto";
import { storage } from "./storage";
import { isRealMcpServer, mcpListTools, mcpCallTool as mcpSdkCallTool } from "./mcp-client";
import { resolvePolicyBundle } from "./routes/helpers";
import type { RunSpanCollector } from "./run-spans";

export type PolicyBundle = Awaited<ReturnType<typeof resolvePolicyBundle>>;

export interface AvailableTool {
  serverId: string;
  serverName: string;
  serverUrl: string;
  toolName: string;
  toolDescription: string;
  toolInputSchema: any;
  toolEndpoint?: string;
  toolMethod?: string;
  isRealMcp?: boolean;
  enterpriseIntegration?: string;
  /**
   * The integration_connections row backing this tool's MCP server, when the
   * server was registered by connecting an integration. Pins credential
   * resolution to one specific connection so an org holding several of the same
   * type (two PostgreSQL databases, say) reaches the intended one instead of
   * whichever is marked default.
   */
  connectionId?: string;
}

export async function gatherAvailableTools(mcpServerIds: string[]): Promise<AvailableTool[]> {
  const availableTools: AvailableTool[] = [];
  for (const serverId of mcpServerIds) {
    const server = await storage.getMcpServer(serverId);
    if (!server || !server.url) continue;

    const realServer = isRealMcpServer(server);

    if (realServer) {
      try {
        const liveDefs = await mcpListTools(server);
        for (const def of liveDefs) {
          availableTools.push({
            serverId,
            serverName: server.name,
            serverUrl: server.url,
            toolName: def.name,
            toolDescription: def.description,
            toolInputSchema: def.inputSchema,
            isRealMcp: true,
            connectionId: server.connectionId || undefined,
          });
        }
        continue;
      } catch (err: any) {
        console.warn(`[gatherAvailableTools] Live tools/list failed for ${server.name}, falling back to DB cache: ${err.message}`);
      }
    }

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
        isRealMcp: realServer,
        enterpriseIntegration: (ann.enterpriseIntegration as string | undefined) || undefined,
        connectionId: server.connectionId || undefined,
      });
    }
  }
  return availableTools;
}

export type DispatchOutcome =
  | "success"
  | "deduplicated"
  | "gate_blocked_skill"
  | "gate_blocked_policy"
  | "gate_blocked_aar"
  | "gate_blocked_scope_drift"
  | "gate_requires_approval"
  | "rate_limited"
  | "shadow_skipped"
  | "tool_error";

export interface DispatchRequest {
  agentId: string;
  orgId?: string | null;
  tool: AvailableTool;
  args: Record<string, any>;
  policyBundle?: PolicyBundle | null;
  /** Lowercased tool names granted by active skills; null/undefined = no skill gate. */
  skillAllowlist?: Set<string> | null;
  /**
   * Intent-based authorization: lowercased tool names the run declared
   * upfront (typically derived from the agent's own initial planning call).
   * When set and non-empty, a call to any tool outside this set is blocked
   * as scope drift, even if AAR/policy would otherwise allow it. Opt-in —
   * null/undefined/empty disables this gate entirely.
   */
  declaredScope?: Set<string> | null;
  environment?: string;
  shadow?: boolean;
  traceId?: string;
  deploymentId?: string;
  iteration?: number;
  /**
   * Idempotency scope — a value unique to one logical run (trace id or a
   * per-run UUID). Within a scope, an identical side-effectful call that
   * already SUCCEEDED is not re-executed; its cached result is returned with
   * outcome "deduplicated". Failed attempts may be retried (at-least-once).
   * Omit to disable dedup for this call.
   */
  idempotencyScope?: string;
  /** Optional span collector — when present, the dispatch records a
   *  tool_dispatch span with a nested wire span (the actual execution). */
  spanCollector?: RunSpanCollector;
  /** Parent span id (usually the current step's span) for the dispatch span. */
  parentSpanId?: string | null;
  /**
   * Set when a human has explicitly approved THIS tool call (e.g. via the Agent
   * Workspace). It satisfies the AAR require-approval gate for this one call —
   * the dispatch proceeds and records who approved it. It does NOT override a
   * policy hard-block: a strict/block policy still refuses, because a human
   * cannot approve past a policy that forbids the action.
   */
  humanApprovedApprovalId?: string;
}

export interface DispatchResult {
  outcome: DispatchOutcome;
  /** true only when the tool actually executed and returned (outcome === "success"). */
  ok: boolean;
  result: any | null;
  error?: string;
  reason?: string;
  /** Causative policy ids for gate_blocked_policy. */
  policyIds?: string[];
  approvalId?: string;
  aarDecision?: string;
  /** A monitor-mode policy flagged this tool; dispatch proceeded and a violation was logged. */
  monitorFlagged?: boolean;
  /** Set on outcome "deduplicated": the prior identical call's result was reused. */
  deduplicated?: boolean;
  /** Args with policy redact patterns applied — use THIS for logs/traces, never raw args. */
  redactedArgs: Record<string, any>;
  startedAt: string;
  completedAt: string;
  /** Total dispatch time: gates + execution. */
  durationMs: number;
  /** Wire time of the actual tool execution (absent when a gate refused dispatch). */
  executionMs?: number;
}

// ── Rate limiting (per agent:tool, sliding window) ──────────────────────────
const toolRateLimiter: Map<string, { timestamps: number[]; limit: number; windowMs: number }> = new Map();

function checkRateLimit(agentId: string, toolName: string): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const key = `${agentId}:${toolName}`;
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 100;

  if (!toolRateLimiter.has(key)) {
    toolRateLimiter.set(key, { timestamps: [], limit, windowMs });
  }
  const bucket = toolRateLimiter.get(key)!;
  bucket.timestamps = bucket.timestamps.filter(t => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - oldest) };
  }

  bucket.timestamps.push(now);
  return { allowed: true, remaining: limit - bucket.timestamps.length };
}

/** Snapshot of active rate limiter buckets — consumed by GET /api/tool-proxy/status. */
export function getToolRateLimiterSnapshot(): Array<{ key: string; callsInWindow: number; limit: number; windowMs: number }> {
  const entries: Array<{ key: string; callsInWindow: number; limit: number; windowMs: number }> = [];
  const now = Date.now();
  toolRateLimiter.forEach((bucket, key) => {
    const active = bucket.timestamps.filter((t: number) => now - t < bucket.windowMs);
    entries.push({ key, callsInWindow: active.length, limit: bucket.limit, windowMs: bucket.windowMs });
  });
  return entries;
}

// ── Idempotency for side-effectful calls ─────────────────────────────────────
// Guards against the retry-duplication failure mode: within one logical run
// (the caller's idempotencyScope), an identical side-effectful call that has
// already succeeded returns its cached result instead of re-executing — an
// agent loop that re-requests "post_message" with the same args cannot post
// twice. Failed attempts are NOT cached, so genuine retries still work
// (at-least-once semantics, honestly labeled).
const IDEMPOTENCY_TTL_MS = 15 * 60_000;
const idempotencyCache = new Map<string, { at: number; result: any }>();

const READ_ONLY_NAME_PREFIXES = ["get_", "list_", "search_", "read_", "query_", "fetch_", "describe_", "check_", "lookup_", "view_"];

/** A tool is treated as side-effectful unless it is clearly read-only. */
export function isSideEffectful(tool: AvailableTool): boolean {
  if ((tool.toolMethod || "").toUpperCase() === "GET") return false;
  const name = tool.toolName.toLowerCase();
  if (READ_ONLY_NAME_PREFIXES.some(p => name.startsWith(p))) return false;
  return true;
}

function stableStringify(obj: any): string {
  if (obj === null || obj === undefined || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(obj).sort().map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function idempotencyKey(scope: string, tool: AvailableTool, args: Record<string, any>): string {
  return createHash("sha256")
    .update(`${scope}|${tool.serverId}|${tool.toolName}|${stableStringify(args)}`)
    .digest("hex");
}

function pruneIdempotencyCache(): void {
  if (idempotencyCache.size < 1000) return;
  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
  for (const [k, v] of Array.from(idempotencyCache.entries())) {
    if (v.at < cutoff) idempotencyCache.delete(k);
  }
}

/** Deterministic AAR approval risk score, derived from what's actually known
 *  at the gate: the agent's own declared risk tier, and whether the tool is
 *  read-only or side-effectful (write/destructive actions score higher).
 *  Replaces a flat constant that gave every approval the same 0.7 regardless
 *  of what was actually being approved. */
function computeApprovalRiskScore(riskLevel: string, sideEffectful: boolean): number {
  const normalized = (riskLevel || "").toUpperCase();
  const base = normalized === "HIGH" ? 0.6 : normalized === "LOW" ? 0.2 : 0.4;
  const score = base + (sideEffectful ? 0.25 : 0);
  return Math.min(1, Math.round(score * 100) / 100);
}

// ── AAR constraint-list gate ─────────────────────────────────────────────────
// Exported for server/anthropic-code-execution.ts, which reuses this same
// allowedTools/deniedTools/requireApprovalTools mechanism for a synthetic
// "execute_code" tool name -- code execution never becomes a real tool_use
// this dispatcher sees (Anthropic runs it server-side), so it can't go
// through the normal per-dispatch pipeline below.
export async function evaluateActionPolicy(
  agentId: string,
  tool: AvailableTool,
): Promise<{ decision: string; reason: string; approvalId?: string }> {
  const evalStartMs = performance.now();
  const toolName = tool.toolName;
  const serverId = tool.serverId;
  const agent = await storage.getAgent(agentId);
  const aarConfig = await storage.getAarConfig(agentId);

  const riskLevel: string = agent?.riskTier ?? "MEDIUM";
  const autonomyMode: string = agent?.autonomyMode ?? "supervised";

  const allowedTools: string[] = (aarConfig?.allowedTools as string[] | null) ?? [];
  const deniedTools: string[] = (aarConfig?.deniedTools as string[] | null) ?? [];
  const requireApprovalTools: string[] = (aarConfig?.requireApprovalTools as string[] | null) ?? [];

  const policiesEvaluated = ["constraint-list-policy", "autonomy-policy"];
  const rulesTriggered: string[] = [];

  let decision = "ALLOW";
  let reason = "Action passed all constraint checks";
  let approvalId: string | undefined;

  if (deniedTools.length > 0 && deniedTools.includes(toolName)) {
    rulesTriggered.push("denied-tool-list");
    decision = "BLOCK";
    reason = `Tool '${toolName}' is in the denied tools list`;
  } else if (allowedTools.length > 0 && !allowedTools.includes(toolName)) {
    rulesTriggered.push("not-in-allowed-list");
    decision = "BLOCK";
    reason = `Tool '${toolName}' is not in the allowed tools list`;
  } else if (requireApprovalTools.length > 0 && requireApprovalTools.includes(toolName)) {
    rulesTriggered.push("require-approval-tool-list");
    decision = "REQUIRE_APPROVAL";
    reason = `Tool '${toolName}' requires explicit approval before invocation`;
  } else if ((riskLevel === "high" || riskLevel === "HIGH") && autonomyMode === "supervised") {
    rulesTriggered.push("high-risk-supervised-alert");
    decision = "ALERT_AND_ALLOW";
    reason = `Tool '${toolName}' invocation logged — agent is high-risk in supervised mode`;
  }

  if (decision === "REQUIRE_APPROVAL" && agent) {
    const approval = await storage.createApproval({
      organizationId: agent.organizationId ?? undefined,
      type: "tool-invocation",
      objectType: "mcp-tool",
      objectId: serverId ?? agentId,
      objectName: toolName,
      riskScore: computeApprovalRiskScore(riskLevel, isSideEffectful(tool)),
      status: "pending",
      requestedBy: agentId,
      requesterType: "agent",
      description: `AAR policy gate: agent '${agent.name}' requires approval to call tool '${toolName}'`,
    });
    approvalId = approval.id;
  }

  // Persist the decision (best-effort — do not let persistence failure block policy enforcement)
  try {
    const evaluationTimeUs = Math.round((performance.now() - evalStartMs) * 1000);
    await storage.createAarActionDecision({
      agentId,
      orgId: agent?.organizationId ?? null,
      toolName,
      serverId: serverId ?? null,
      decision,
      reason,
      policiesEvaluated,
      rulesTriggered,
      riskLevel,
      approvalId: approvalId ?? null,
      evaluationTimeUs,
    });
  } catch (persistErr: any) {
    console.error(`[AAR] evaluateActionPolicy: failed to persist decision (non-fatal): ${persistErr.message}`);
  }

  if (decision === "ALERT_AND_ALLOW") {
    console.warn(`[AAR] ALERT_AND_ALLOW: agent=${agentId} tool=${toolName} reason=${reason}`);
  }

  return { decision, reason, approvalId };
}

// ── Execution ────────────────────────────────────────────────────────────────
// Real MCP servers and enterprise connectors (both built on RealMcpBase) return
// { content: [{type: "text", text}], isError?: boolean } — a tool can fail
// (bad credentials, unconnected integration, upstream 4xx) without ever
// throwing. Returns the error text when the result is that shape and
// isError is true, else null (including for the plain-HTTP tool path below,
// whose responses aren't MCP-shaped and shouldn't be reinterpreted here).
function resultErrorMessage(result: any): string | null {
  if (!result || typeof result !== "object" || result.isError !== true) return null;
  const text = Array.isArray(result.content) ? result.content.find((c: any) => typeof c?.text === "string")?.text : undefined;
  return typeof text === "string" && text.length > 0 ? text : "Tool returned an error";
}

export async function executeTool(tool: AvailableTool, args: Record<string, any>, orgId?: string | null, agentId?: string): Promise<any> {
  // Enterprise connectors (GitHub, Slack, Salesforce, the SQL family, …) are
  // OUR OWN code and must be dispatched in-process, so the agent's org context
  // and its connection pin select the right encrypted credentials.
  //
  // This is checked BEFORE isRealMcp deliberately. isRealMcpServer() is true for
  // any streamable-http/sse server whose url isn't localhost -- which is exactly
  // what these become once deployed, since they are registered at
  // <BASE_URL>/api/integrations/<id>. Locally that url IS localhost, so this
  // ordering never mattered in dev; in the cloud every connector tool call took
  // the real-MCP HTTP path instead and 401'd, because that endpoint requires an
  // agent-scoped bearer with "mcp" scope that the runtime never attaches.
  //
  // The HTTP path is also wrong on the merits even when authenticated: it
  // resolves credentials by integration type, so a tool bound to a specific
  // connection would silently query the org's DEFAULT connection instead --
  // bypassing the pin, and with it any allowed-tables scoping on that
  // connection.
  if (tool.enterpriseIntegration) {
    const { getEnterpriseServerById } = await import("./integrations/register");
    const connector = getEnterpriseServerById(tool.enterpriseIntegration);
    if (connector) {
      const { getDefaultOrgId } = await import("./auth");
      const effectiveOrgId = orgId ?? getDefaultOrgId();
      if (!effectiveOrgId) {
        throw new Error(`No organization context to invoke '${tool.toolName}' on integration '${tool.enterpriseIntegration}'`);
      }
      // agentId lets a per-agent credential (agent_integration_credentials) take
      // priority; connectionId pins the fallback to the specific connection this
      // server was registered against, rather than the org's default connection
      // for the type -- see RealMcpBase.getCredentials for the full precedence.
      return connector.callTool(tool.toolName, args, effectiveOrgId, agentId, tool.connectionId);
    }
  }

  // Genuinely external MCP servers (someone else's endpoint) — speak the real
  // protocol over HTTP. Reached only when the tool is not one of our own
  // enterprise connectors, which are handled in-process above.
  if (tool.isRealMcp) {
    const server = await storage.getMcpServer(tool.serverId);
    if (server) {
      return mcpSdkCallTool(server, tool.toolName, args);
    }
  }

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

  // Header-type parameters — recorded by openapi-import.ts on each generated
  // tool's inputSchema property as `in: "header"` (see schemaToProperty /
  // the parameter loop in parseOpenApiSpec). Without this, header params are
  // documented in the schema but silently dropped: they'd otherwise fall
  // through into the JSON body (POST/PUT/PATCH) or the query string (GET)
  // instead of becoming actual HTTP headers.
  const schemaProperties: Record<string, any> =
    tool.toolInputSchema && typeof tool.toolInputSchema === "object" && tool.toolInputSchema.properties && typeof tool.toolInputSchema.properties === "object"
      ? tool.toolInputSchema.properties
      : {};
  const headerParams: Record<string, string> = {};
  for (const [paramName, propSchema] of Object.entries(schemaProperties)) {
    if (propSchema && typeof propSchema === "object" && propSchema.in === "header" && remainingArgs[paramName] != null) {
      headerParams[paramName] = String(remainingArgs[paramName]);
      delete remainingArgs[paramName];
    }
  }

  let fetchUrl = `${baseUrl}${endpointPath}`;
  const fetchOpts: RequestInit = { method };

  if (method === "POST" || method === "PUT" || method === "PATCH") {
    fetchOpts.headers = { "Content-Type": "application/json", ...headerParams };
    fetchOpts.body = JSON.stringify(remainingArgs);
  } else {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(remainingArgs).map(([k, v]) => [k, String(v)]))
    ).toString();
    if (qs) fetchUrl += `?${qs}`;
    if (Object.keys(headerParams).length > 0) fetchOpts.headers = { ...headerParams };
  }

  const res = await fetch(fetchUrl, fetchOpts);
  if (!res.ok) throw new Error(`MCP API ${tool.serverName}/${tool.toolName} returned ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return { status: res.status, message: await res.text() };
}

function redactArgs(args: Record<string, any>, patterns: string[]): Record<string, any> {
  if (!patterns || patterns.length === 0) return args;
  const redacted: Record<string, any> = { ...args };
  for (const pattern of patterns) {
    try {
      const re = new RegExp(pattern, "gi");
      for (const key of Object.keys(redacted)) {
        if (typeof redacted[key] === "string") {
          redacted[key] = (redacted[key] as string).replace(re, "[REDACTED]");
        }
      }
    } catch {}
  }
  return redacted;
}

// ── The dispatch path ────────────────────────────────────────────────────────
export async function dispatchToolCall(req: DispatchRequest): Promise<DispatchResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const { tool, agentId, policyBundle } = req;
  const toolNameLower = tool.toolName.toLowerCase();
  const redactedArgs = redactArgs(req.args, policyBundle?.redactPatterns ?? []);

  const finish = (partial: Omit<DispatchResult, "redactedArgs" | "startedAt" | "completedAt" | "durationMs">): DispatchResult => ({
    ...partial,
    redactedArgs,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
  });

  // 1. Skill allowlist gate — skills grant tool capabilities; a declared
  //    allowlist that omits this tool refuses dispatch.
  if (req.skillAllowlist && !req.skillAllowlist.has(toolNameLower)) {
    const reason = `Tool "${tool.toolName}" is not granted by any active skill (skill allowlist enforcement)`;
    storage.createAuditEvent({
      actorType: "system",
      actorId: "skill-gate",
      action: "tool_blocked_skill",
      objectType: "agent",
      objectId: agentId,
      details: JSON.stringify({ toolName: tool.toolName, serverName: tool.serverName, reason, iteration: req.iteration, traceId: req.traceId }),
    }).catch(() => {});
    return finish({ outcome: "gate_blocked_skill", ok: false, result: null, error: reason, reason });
  }

  // 2. Policy bundle gate — strict/block enforcement hard-blocks; monitor
  //    enforcement logs a violation and proceeds.
  let monitorFlagged = false;
  if (policyBundle) {
    const isHardBlocked = policyBundle.blockedTools.some(b => b.toLowerCase() === toolNameLower);
    const allowlistActive = policyBundle.toolAllowlist.length > 0;
    const isAllowed = !allowlistActive || policyBundle.toolAllowlist.some(a => a.toLowerCase() === toolNameLower);
    if (isHardBlocked || (!isAllowed && allowlistActive)) {
      const reason = isHardBlocked
        ? `Tool "${tool.toolName}" is blocked by a strict/block-enforcement policy`
        : `Tool "${tool.toolName}" is not in the policy tool allowlist (strict enforcement)`;
      const causativePolicyIds =
        policyBundle.blockedToolsToPolicyIds?.[toolNameLower] ??
        policyBundle.appliedPolicies
          .filter(p => p.enforcement === "strict" || p.enforcement === "block")
          .map(p => p.id);
      storage.createAuditEvent({
        actorType: "system",
        actorId: "policy-gate",
        action: "hard_violation",
        objectType: "agent",
        objectId: agentId,
        details: JSON.stringify({
          blockReason: reason,
          toolName: tool.toolName,
          serverName: tool.serverName,
          enforcementMode: "strict/block",
          policyCount: policyBundle.appliedPolicies.length,
          appliedPolicies: policyBundle.appliedPolicies.map(p => ({ id: p.id, name: p.name, version: p.version, enforcement: p.enforcement })),
          iteration: req.iteration,
          deploymentId: req.deploymentId,
        }),
      }).catch(() => {});
      return finish({ outcome: "gate_blocked_policy", ok: false, result: null, error: reason, reason, policyIds: causativePolicyIds });
    }
    const isMonitorBlocked = policyBundle.monitorBlockedTools?.some(b => b.toLowerCase() === toolNameLower);
    if (isMonitorBlocked) {
      monitorFlagged = true;
      const monitorReason = `Tool "${tool.toolName}" is flagged by a monitor-mode policy (dispatch allowed)`;
      storage.createAuditEvent({
        actorType: "system",
        actorId: "policy-gate",
        action: "policy_violation",
        objectType: "agent",
        objectId: agentId,
        details: JSON.stringify({
          blockReason: monitorReason,
          toolName: tool.toolName,
          serverName: tool.serverName,
          enforcementMode: "monitor",
          iteration: req.iteration,
          deploymentId: req.deploymentId,
        }),
      }).catch(() => {});
      // Dispatch proceeds — fall through.
    }
  }

  // 3. AAR constraint-list gate.
  const aar = await evaluateActionPolicy(agentId, tool);
  if (aar.decision === "BLOCK") {
    return finish({ outcome: "gate_blocked_aar", ok: false, result: null, error: aar.reason, reason: aar.reason, aarDecision: aar.decision, monitorFlagged });
  }
  if (aar.decision === "REQUIRE_APPROVAL") {
    if (req.humanApprovedApprovalId) {
      // A human approved this exact call — proceed, and record the approval on
      // the record. (Policy hard-blocks were already checked above and cannot
      // be overridden this way.)
      storage.createAuditEvent({
        actorType: "system",
        actorId: "workspace-approval",
        action: "tool_human_approved",
        objectType: "tool",
        objectId: tool.toolName,
        details: `Tool "${tool.toolName}" required approval and was human-approved (approvalId=${req.humanApprovedApprovalId}) for agent ${agentId}.`,
      }).catch(() => {});
    } else {
      return finish({ outcome: "gate_requires_approval", ok: false, result: null, error: aar.reason, reason: aar.reason, aarDecision: aar.decision, approvalId: aar.approvalId, monitorFlagged });
    }
  }

  // 3.5. Declared-scope gate (intent-based authorization). When the run
  // declared an upfront tool scope, a call outside it is blocked as drift —
  // even though skill/policy/AAR already allowed it — because the agent
  // itself never planned to make this call.
  if (req.declaredScope && req.declaredScope.size > 0 && !req.declaredScope.has(toolNameLower)) {
    const reason = `Tool "${tool.toolName}" was not in the scope this run declared at the start (intent-based authorization: blocking scope drift)`;
    storage.createAuditEvent({
      actorType: "system",
      actorId: "scope-gate",
      action: "tool_blocked_scope_drift",
      objectType: "agent",
      objectId: agentId,
      details: JSON.stringify({ toolName: tool.toolName, serverName: tool.serverName, declaredScope: Array.from(req.declaredScope), reason, iteration: req.iteration, traceId: req.traceId }),
    }).catch(() => {});
    return finish({ outcome: "gate_blocked_scope_drift", ok: false, result: null, error: reason, reason, monitorFlagged });
  }

  // 4. Rate limit.
  const rate = checkRateLimit(agentId, tool.toolName);
  if (!rate.allowed) {
    const reason = `Rate limit exceeded for tool "${tool.toolName}". Retry after ${rate.retryAfterMs}ms`;
    storage.createAuditEvent({
      action: "tool_proxy_rate_limited",
      objectType: "tool",
      objectId: tool.toolName,
      actorId: agentId,
      actorType: "agent",
      details: `Rate limit exceeded for ${tool.toolName} by agent ${agentId}. Retry after ${rate.retryAfterMs}ms`,
    }).catch(() => {});
    return finish({ outcome: "rate_limited", ok: false, result: null, error: reason, reason, monitorFlagged });
  }

  // 5. Shadow environment — log the intended call, never execute.
  if (req.shadow) {
    storage.createAuditEvent({
      action: "tool_proxy_shadow_dry_run",
      objectType: "tool",
      objectId: tool.toolName,
      actorId: agentId,
      actorType: "agent",
      details: `Shadow dry-run: ${tool.toolName} for agent ${agentId}. Input logged but not executed.`,
    }).catch(() => {});
    return finish({
      outcome: "shadow_skipped",
      ok: false,
      result: {
        toolName: tool.toolName,
        status: "dry_run",
        mode: "shadow",
        output: `[DRY RUN] Would execute ${tool.toolName} in shadow mode`,
        input: redactedArgs,
        executedAt: new Date().toISOString(),
      },
      reason: "Shadow environment — dispatch skipped",
      monitorFlagged,
    });
  }

  // 6. Idempotency — an identical side-effectful call that already succeeded
  //    within this scope returns the cached result instead of re-executing.
  let idemKey: string | null = null;
  if (req.idempotencyScope && isSideEffectful(tool)) {
    idemKey = idempotencyKey(req.idempotencyScope, tool, req.args);
    const prior = idempotencyCache.get(idemKey);
    if (prior && Date.now() - prior.at < IDEMPOTENCY_TTL_MS) {
      const reason = `Identical side-effectful call already succeeded in this run — returning cached result (not re-executed)`;
      storage.createAuditEvent({
        action: "tool_call_deduplicated",
        objectType: "tool",
        objectId: tool.toolName,
        actorId: agentId,
        actorType: "agent",
        details: `Dedup: ${tool.toolName} for agent ${agentId} in scope ${req.idempotencyScope}. Cached result reused.`,
      }).catch(() => {});
      return finish({ outcome: "deduplicated", ok: true, result: prior.result, reason, deduplicated: true, monitorFlagged });
    }
  }

  // 7. Execute.
  const execStartMs = Date.now();
  const wireKind = tool.enterpriseIntegration ? "connector" : tool.isRealMcp ? "mcp" : "http";
  try {
    const result = await executeTool(tool, req.args, req.orgId, agentId);
    const executionMs = Date.now() - execStartMs;
    if (idemKey) {
      pruneIdempotencyCache();
      idempotencyCache.set(idemKey, { at: Date.now(), result });
    }
    // A tool can return without throwing yet still report failure in its own
    // payload (MCP's {content, isError: true} shape — e.g. "integration not
    // connected"). Treating that as outcome "success" is what let the
    // playground's Execution Trace claim "1/1 successful" for a call whose
    // result was plainly an error. Surface it as tool_error instead, same as
    // a thrown exception, so every downstream consumer (trace UI, audit
    // events, idempotency semantics) sees one honest signal.
    const resultError = resultErrorMessage(result);
    if (resultError) {
      console.log(JSON.stringify({ span: "tool_dispatch", agentId, tool: tool.toolName, server: tool.serverName, outcome: "tool_error", traceId: req.traceId, durationMs: Date.now() - startMs, executionMs, error: resultError.slice(0, 200) }));
      recordSpans(req, tool, startMs, Date.now() - startMs, execStartMs, executionMs, "error", wireKind, resultError);
      return finish({ outcome: "tool_error", ok: false, result, error: resultError, reason: resultError, monitorFlagged, executionMs });
    }
    // Structured span line — greppable/ingestable regardless of collector.
    console.log(JSON.stringify({ span: "tool_dispatch", agentId, tool: tool.toolName, server: tool.serverName, outcome: "success", traceId: req.traceId, durationMs: Date.now() - startMs, executionMs }));
    recordSpans(req, tool, startMs, Date.now() - startMs, execStartMs, executionMs, "ok", wireKind);
    return finish({ outcome: "success", ok: true, result, monitorFlagged, executionMs });
  } catch (err: any) {
    const executionMs = Date.now() - execStartMs;
    console.log(JSON.stringify({ span: "tool_dispatch", agentId, tool: tool.toolName, server: tool.serverName, outcome: "tool_error", traceId: req.traceId, durationMs: Date.now() - startMs, executionMs, error: String(err.message).slice(0, 200) }));
    recordSpans(req, tool, startMs, Date.now() - startMs, execStartMs, executionMs, "error", wireKind, err.message);
    return finish({ outcome: "tool_error", ok: false, result: null, error: err.message, reason: err.message, monitorFlagged, executionMs });
  }
}

/** Emit a tool_dispatch span with a nested wire span into the caller's collector. */
function recordSpans(
  req: DispatchRequest, tool: AvailableTool, dispatchStartMs: number, dispatchDurationMs: number,
  wireStartMs: number, wireDurationMs: number, status: "ok" | "error", wireKind: string, error?: string,
): void {
  const c = req.spanCollector;
  if (!c) return;
  const attrs: Record<string, string | number | boolean> = {
    "tool.name": tool.toolName, "tool.server": tool.serverName,
    ...(tool.enterpriseIntegration ? { "integration.id": tool.enterpriseIntegration } : {}),
  };
  const dispatchSpan = c.record(`tool_dispatch ${tool.toolName}`, "tool_dispatch", req.parentSpanId ?? null, dispatchStartMs, dispatchDurationMs, status, attrs);
  c.record(`${wireKind} ${tool.toolName}`, "wire", dispatchSpan, wireStartMs, wireDurationMs, status, {
    ...attrs, "wire.kind": wireKind, ...(error ? { "error.message": String(error).slice(0, 200) } : {}),
  });
}
