import { Router } from "express";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import type { AarConfig, InsertAarConfig } from "../../shared/schema";
import { mcpCallTool } from "../mcp-client";

const PROTO_SERVICE_DEFINITION = `
syntax = "proto3";
package atlas.aar.v1;

service AtlasAgentRuntime {
  rpc EvaluateAction (ActionRequest)      returns (ActionDecision);
  rpc InvokeTool     (ToolCallRequest)    returns (ToolCallResponse);
  rpc InvokeToolStream(ToolCallRequest)   returns (stream ToolCallChunk);
  rpc ReportState    (AgentStateReport)   returns (Ack);
  rpc GetConstraints (ConstraintQuery)    returns (ConstraintResponse);
  rpc RecordActions  (ActionBatch)        returns (Ack);
}

message ActionRequest {
  string agent_id    = 1;
  string tool_name   = 2;
  string server_id   = 3;
  map<string, string> args = 4;
  string context_id  = 5;
}

message ActionDecision {
  string decision              = 1;
  string reason                = 2;
  repeated string policies_evaluated = 3;
  repeated string rules_triggered    = 4;
  string risk_level            = 5;
  string approval_id           = 6;
  int64  evaluation_time_us    = 7;
}

message ToolCallRequest {
  string agent_id    = 1;
  string tool_name   = 2;
  string server_id   = 3;
  map<string, string> args = 4;
}

message ToolCallResponse {
  string result              = 1;
  string provenance_event_id = 2;
  ActionDecision policy_decision = 3;
}

message ToolCallChunk {
  string chunk = 1;
  bool   done  = 2;
}

message AgentStateReport {
  string agent_id     = 1;
  string report_type  = 2;
  bytes  payload      = 3;
}

message Ack {
  bool   success = 1;
  string message = 2;
}

message ConstraintQuery {
  string agent_id = 1;
}

message ConstraintResponse {
  string        autonomy_level          = 1;
  repeated string allowed_tools         = 2;
  repeated string denied_tools          = 3;
  repeated string require_approval_tools= 4;
  map<string, string> rate_limits       = 5;
  string policy_bundle_version          = 6;
  string policy_bundle_timestamp        = 7;
}

message ActionBatch {
  string         agent_id = 1;
  repeated ActionRecord actions = 2;
}

message ActionRecord {
  string tool_name   = 1;
  string decision    = 2;
  string reason      = 3;
  string occurred_at = 4;
}
`.trim();

const router = Router();

// ─── Module definitions ───────────────────────────────────────────────────────

export const AAR_MODULES = [
  {
    id: "policy-engine",
    name: "PolicyEngine",
    icon: "ShieldCheck",
    responsibility: "Evaluate policies against action requests. Return BLOCK / ALERT / LOG.",
    interfaces: ["gRPC stream (Control Plane)", "PolicyCache (read)", "ProvenanceStore (write)"],
  },
  {
    id: "mcp-proxy",
    name: "MCPProxy",
    icon: "Network",
    responsibility: "Intercept, authorize, rate-limit, and forward MCP tool calls. Behavior fingerprinting.",
    interfaces: ["gRPC server (agent-facing)", "HTTP/gRPC client (MCP server-facing)", "streamable-http + SSE transports"],
  },
  {
    id: "provenance-store",
    name: "ProvenanceStore",
    icon: "Database",
    responsibility: "Capture, hash-chain, queue, and stream provenance events to Atlas Telemetry Collector.",
    interfaces: ["gRPC stream (Atlas Collector)", "Local WAL (offline queue)"],
  },
  {
    id: "telemetry-emitter",
    name: "TelemetryEmitter",
    icon: "Activity",
    responsibility: "Emit structured metrics, traces, and logs in OpenTelemetry (OTLP) format.",
    interfaces: ["OTLP/gRPC (Atlas Collector)", "OTLP/HTTP (customer observability, optional)"],
  },
  {
    id: "autonomy-enforcer",
    name: "AutonomyEnforcer",
    icon: "Layers",
    responsibility: "Enforce current autonomy level. Route high-risk actions for approval without Control Plane round-trip.",
    interfaces: ["PolicyCache (autonomy config)", "Approval Service (queue)"],
  },
  {
    id: "credential-manager",
    name: "CredentialManager",
    icon: "KeyRound",
    responsibility: "Manage X.509 certificates and API keys. Rotate on schedule. Inject credentials into MCP calls.",
    interfaces: ["AWS Secrets Manager", "GCP Secret Manager", "Azure Key Vault", "HashiCorp Vault", "OCI Vault"],
  },
  {
    id: "health-monitor",
    name: "HealthMonitor",
    icon: "HeartPulse",
    responsibility: "Self-health checks. MCP server health probes. Behavior fingerprint drift detection.",
    interfaces: ["/healthz + /readyz HTTP endpoints", "Heartbeat stream (Control Plane)"],
  },
];

// ─── Section 1.2 Process Model — 7 goroutines ────────────────────────────────

export const AAR_GOROUTINES = [
  {
    id: "main",
    name: "Main",
    role: "Lifecycle management, signal handling, graceful shutdown",
    timingSpec: null,
    timingLabel: null,
  },
  {
    id: "grpc-server",
    name: "gRPC Server",
    role: "Agent-facing API — receives action requests from the agent process",
    timingSpec: null,
    timingLabel: null,
  },
  {
    id: "policy-sync",
    name: "Policy Sync",
    role: "Long-lived gRPC stream to Atlas Control Plane for policy updates",
    timingSpec: null,
    timingLabel: "Long-lived stream",
  },
  {
    id: "provenance",
    name: "Provenance",
    role: "Streams events to Collector; manages local WAL for offline buffer",
    timingSpec: null,
    timingLabel: "Continuous stream + WAL",
  },
  {
    id: "telemetry",
    name: "Telemetry",
    role: "Batches OTLP events (metrics, traces, logs) and flushes on schedule",
    timingSpec: { flushIntervalMs: 10000 },
    timingLabel: "Flush every 10s",
  },
  {
    id: "health-check",
    name: "Health Check",
    role: "MCP server probes on schedule; heartbeat to Control Plane every 60s",
    timingSpec: { mcpProbeIntervalSeconds: 30, heartbeatIntervalSeconds: 60 },
    timingLabel: "Probe every 30s · Heartbeat every 60s",
  },
  {
    id: "credential",
    name: "Credential",
    role: "Monitors cert expiry; triggers rotation 7 days before expiry",
    timingSpec: { expiryWarningDays: 7, rotationPeriodDays: 30 },
    timingLabel: "Rotation 7d before expiry",
  },
];

// ─── Deterministic health simulation ─────────────────────────────────────────

function seedFromAgentId(agentId: string): number {
  let h = 0;
  for (let i = 0; i < agentId.length; i++) {
    h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  }
  return h;
}

interface ModuleMetric {
  label: string;
  value: string | number;
  secondary: string;
}

function deriveModuleHealth(agentId: string, moduleId: string) {
  const seed = seedFromAgentId(agentId + moduleId);
  const evalsPerMin = 120 + (seed % 180);
  const mcpCallsProxied = 4000 + (seed % 8000);
  const eventsQueued = seed % 12;
  const eventsTotal = 50000 + (seed % 100000);
  const certDaysLeft = 45 + (seed % 315);
  const certExpiry = new Date(Date.now() + certDaysLeft * 86400000).toISOString().split("T")[0];
  const lastHeartbeat = new Date(Date.now() - (seed % 30000)).toISOString();
  const blockCount = seed % 8;
  const alertCount = 12 + (seed % 40);
  const logCount = 300 + (seed % 700);

  const metricsMap: Record<string, ModuleMetric> = {
    "policy-engine": { label: "Evals / min", value: evalsPerMin, secondary: `${blockCount} BLOCK · ${alertCount} ALERT · ${logCount} LOG` },
    "mcp-proxy": { label: "MCP calls proxied", value: mcpCallsProxied.toLocaleString(), secondary: "Rate limits: OK · Fingerprint: nominal" },
    "provenance-store": { label: "Events synced", value: eventsTotal.toLocaleString(), secondary: `${eventsQueued} queued (WAL)` },
    "telemetry-emitter": { label: "OTLP endpoint", value: "atlas-collector:4317", secondary: "Metrics + traces + logs active" },
    "autonomy-enforcer": { label: "Autonomy level", value: "Guided", secondary: "0 approvals pending" },
    "credential-manager": { label: "Cert expiry", value: certExpiry, secondary: `${certDaysLeft} days remaining · Last rotation: 30d ago` },
    "health-monitor": { label: "Last heartbeat", value: "just now", secondary: "7 / 7 checks passed · Fingerprint: stable" },
  };

  const metrics: ModuleMetric = metricsMap[moduleId] ?? { label: "Status", value: "OK", secondary: "" };

  // Derive a realistic mixed health state: ~80% active, ~12% standby, ~8% offline
  const statusSeed = seed % 100;
  const status: "active" | "standby" | "offline" =
    statusSeed < 80 ? "active" : statusSeed < 92 ? "standby" : "offline";

  return {
    moduleId,
    status,
    metricLabel: metrics.label,
    metricValue: metrics.value,
    metricSecondary: metrics.secondary,
    lastHeartbeat,
  };
}

function buildModuleConfig(agentId: string, targetPlatform: string) {
  return AAR_MODULES.map((m) => ({
    ...m,
    health: deriveModuleHealth(agentId, m.id),
  }));
}

function deriveGoroutineStatus(agentId: string, goroutineId: string): "running" | "degraded" | "stopped" {
  const seed = seedFromAgentId(agentId + "goroutine:" + goroutineId);
  // Main goroutine is always running — no process without it
  if (goroutineId === "main") return "running";
  // ~85% running, ~10% degraded, ~5% stopped
  const s = seed % 100;
  return s < 85 ? "running" : s < 95 ? "degraded" : "stopped";
}

function buildProcessModel(agentId: string) {
  return AAR_GOROUTINES.map((g) => ({
    ...g,
    status: deriveGoroutineStatus(agentId, g.id),
  }));
}

function buildPlatformHints(targetPlatform: string) {
  const base = {
    deploymentModel: "sidecar",
    transportProtocol: "gRPC",
    controlPlaneSync: "push-pull hybrid",
    policyEvalMode: "local-cache",
    provenanceBacklog: "WAL-buffered",
  };

  const hints: Record<string, Record<string, string>> = {
    "aws-bedrock": {
      ...base,
      containerFormat: "ECS sidecar / Lambda layer",
      secretStore: "AWS Secrets Manager",
      observability: "CloudWatch + OTLP/gRPC",
      networkMode: "AWS PrivateLink",
      iamNote: "Attach AarRuntimePolicy managed policy to the task role",
    },
    "gcp-vertex": {
      ...base,
      containerFormat: "GKE sidecar / Cloud Run sidecar",
      secretStore: "GCP Secret Manager",
      observability: "Cloud Monitoring + OTLP/gRPC",
      networkMode: "VPC Service Controls",
      iamNote: "Bind atlas-aar-runtime@<project>.iam.gserviceaccount.com to Vertex AI role",
    },
    "azure-ai-foundry": {
      ...base,
      containerFormat: "ACI sidecar / AKS DaemonSet",
      secretStore: "Azure Key Vault",
      observability: "Azure Monitor + OTLP/HTTP",
      networkMode: "Private Endpoint",
      iamNote: "Assign AarRuntime managed identity with Key Vault Secrets User role",
    },
    "kubernetes": {
      ...base,
      containerFormat: "Pod sidecar container",
      secretStore: "Kubernetes Secrets (encrypted at rest) or external vault",
      observability: "Prometheus scrape + OTLP/gRPC",
      networkMode: "NetworkPolicy + mutual TLS",
      iamNote: "Bind aar-runtime ServiceAccount to ClusterRole aar-policy-reader",
    },
    "on-prem": {
      ...base,
      containerFormat: "Docker sidecar or systemd service",
      secretStore: "HashiCorp Vault",
      observability: "Grafana / Prometheus + OTLP/gRPC",
      networkMode: "mTLS over existing corporate network",
      iamNote: "Issue X.509 client certificate from internal CA",
    },
  };

  return hints[targetPlatform] ?? { ...base, containerFormat: "Platform-specific", secretStore: "Platform-native vault", iamNote: "Follow your platform's IAM model" };
}

function buildAarPackage(agentId: string, agentName: string, aarConfig: Pick<AarConfig, "targetPlatform" | "policyBundleVersion" | "lastSyncedAt" | "allowedTools" | "deniedTools" | "requireApprovalTools" | "rateLimits">) {
  const modules = buildModuleConfig(agentId, aarConfig.targetPlatform);
  const platformHints = buildPlatformHints(aarConfig.targetPlatform);

  return {
    aarVersion: "1.0.0",
    schemaVersion: "atlas-aar/v1",
    generatedAt: new Date().toISOString(),
    agent: {
      id: agentId,
      name: agentName,
      targetPlatform: aarConfig.targetPlatform,
    },
    policyBundle: {
      version: aarConfig.policyBundleVersion ?? "v1.0.0",
      lastSyncedAt: aarConfig.lastSyncedAt ?? new Date().toISOString(),
      distributionMode: "push",
      gracePeriodSeconds: 30,
      criticalRulesZeroGrace: true,
    },
    moduleManifest: modules.map((m) => ({
      id: m.id,
      name: m.name,
      enabled: true,
      responsibility: m.responsibility,
      externalInterfaces: m.interfaces,
    })),
    mcpProxyRules: {
      interceptAllToolCalls: true,
      rateLimits: { requestsPerMinute: 600, burstCapacity: 50 },
      behaviorFingerprinting: { enabled: true, driftThreshold: 0.15, action: "alert-and-queue" },
      transports: ["streamable-http", "SSE"],
    },
    telemetry: {
      otlpEndpoint: "atlas-collector:4317",
      protocol: "gRPC",
      exportIntervalMs: 10000,
      customerEndpoint: null,
      metricsEnabled: true,
      tracesEnabled: true,
      logsEnabled: true,
    },
    autonomy: {
      defaultLevel: "guided",
      shadowObserveOnly: false,
      approvalQueueEndpoint: "https://atlas.internal/api/approvals",
      localEnforcement: true,
    },
    credentialManager: {
      certExpiryWarningDays: 7,
      certRotationPeriodDays: 30,
      vaultIntegration: platformHints.secretStore,
      mTlsEnabled: true,
    },
    platformDeploymentHints: platformHints,
    healthEndpoints: {
      healthz: "/healthz",
      readyz: "/readyz",
      mcpProbeIntervalSeconds: 30,
      heartbeatIntervalSeconds: 60,
    },
    controlPlane: {
      syncUrl: "https://atlas.internal/api/aar/sync",
      policyPushEnabled: true,
      provenanceStreamEndpoint: "atlas-telemetry-collector:4318",
      maxOfflineQueueMb: 512,
    },
    constraintConfig: {
      allowedTools: (aarConfig.allowedTools as string[] | null) ?? [],
      deniedTools: (aarConfig.deniedTools as string[] | null) ?? [],
      requireApprovalTools: (aarConfig.requireApprovalTools as string[] | null) ?? [],
      rateLimits: (aarConfig.rateLimits as Record<string, unknown> | null) ?? {},
    },
    grpcServiceDefinition: PROTO_SERVICE_DEFINITION,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/api/aar/configs", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const configs = await storage.getAllAarConfigs(orgId);
    const byAgentId: Record<string, AarConfig> = {};
    for (const c of configs) byAgentId[c.agentId] = c;
    res.json(byAgentId);
  } catch (err: any) {
    console.error("[AAR] GET /api/aar/configs error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/agents/:agentId/aar", async (req, res) => {
  try {
    const { agentId } = req.params;
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const aarConfig = await storage.getAarConfig(agentId, orgId);
    if (!aarConfig) {
      return res.json({ aarConfig: null, modules: null, processModel: null, policyActions: null, agentName: agent.name });
    }

    const modules = buildModuleConfig(agentId, aarConfig.targetPlatform);
    const processModel = buildProcessModel(agentId);
    const seed = seedFromAgentId(agentId);
    const policyActions = {
      block: seed % 8,
      alert: 12 + (seed % 40),
      log: 300 + (seed % 700),
    };

    return res.json({
      aarConfig,
      modules,
      processModel,
      policyActions,
      agentName: agent.name,
    });
  } catch (err: any) {
    console.error("[AAR] GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/agents/:agentId/aar", async (req, res) => {
  try {
    const { agentId } = req.params;
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const { targetPlatform, allowedTools, deniedTools, requireApprovalTools, rateLimits } = req.body;

    // Only update an existing config; do not create one via PATCH (agent must be deployed first)
    const existing = await storage.getAarConfig(agentId, orgId);
    if (!existing) {
      return res.status(404).json({ error: "AAR config not found — agent must be deployed before it can be configured" });
    }

    const patch: Partial<InsertAarConfig> = {};
    if (targetPlatform && typeof targetPlatform === "string" && targetPlatform.trim()) {
      patch.targetPlatform = targetPlatform.trim();
    }
    if (allowedTools !== undefined) patch.allowedTools = allowedTools;
    if (deniedTools !== undefined) patch.deniedTools = deniedTools;
    if (requireApprovalTools !== undefined) patch.requireApprovalTools = requireApprovalTools;
    if (rateLimits !== undefined) patch.rateLimits = rateLimits;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "Nothing to update — provide targetPlatform, allowedTools, deniedTools, requireApprovalTools, or rateLimits" });
    }

    const updated = await storage.upsertAarConfig(agentId, patch, orgId);
    res.json({ aarConfig: updated });
  } catch (err: any) {
    console.error("[AAR] PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/agents/:agentId/aar/package", async (req, res) => {
  try {
    const { agentId } = req.params;
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const aarConfig = await storage.getAarConfig(agentId, orgId);
    const configData = aarConfig ?? { targetPlatform: "atlas-native", policyBundleVersion: "v1.0.0", lastSyncedAt: new Date(), allowedTools: null, deniedTools: null, requireApprovalTools: null, rateLimits: null };
    const pkg = buildAarPackage(agentId, agent.name, configData);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="aar-package-${agent.name.replace(/\s+/g, "-").toLowerCase()}.json"`);
    res.json(pkg);
  } catch (err: any) {
    console.error("[AAR] Package error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: evaluate action against stored AAR constraint lists ──────────────

async function evaluateActionAgainstConstraints(
  agentId: string,
  toolName: string,
  serverId: string | undefined,
  orgId: string,
): Promise<{
  decision: string;
  reason: string;
  policiesEvaluated: string[];
  rulesTriggered: string[];
  riskLevel: string;
}> {
  const agent = await storage.getAgent(agentId, orgId);
  const aarConfig = await storage.getAarConfig(agentId);

  const riskLevel = agent?.riskTier ?? "medium";
  const autonomyMode = agent?.autonomyMode ?? "supervised";

  const allowedTools: string[] = (aarConfig?.allowedTools as string[] | null) ?? [];
  const deniedTools: string[] = (aarConfig?.deniedTools as string[] | null) ?? [];
  const requireApprovalTools: string[] = (aarConfig?.requireApprovalTools as string[] | null) ?? [];

  const policiesEvaluated = ["constraint-list-policy", "autonomy-policy"];
  const rulesTriggered: string[] = [];

  // Denied list takes precedence
  if (deniedTools.length > 0 && deniedTools.includes(toolName)) {
    rulesTriggered.push("denied-tool-list");
    return { decision: "BLOCK", reason: `Tool '${toolName}' is in the denied tools list`, policiesEvaluated, rulesTriggered, riskLevel };
  }

  // Allowed list: if non-empty, only listed tools pass
  if (allowedTools.length > 0 && !allowedTools.includes(toolName)) {
    rulesTriggered.push("not-in-allowed-list");
    return { decision: "BLOCK", reason: `Tool '${toolName}' is not in the allowed tools list`, policiesEvaluated, rulesTriggered, riskLevel };
  }

  // Require-approval list
  if (requireApprovalTools.length > 0 && requireApprovalTools.includes(toolName)) {
    rulesTriggered.push("require-approval-tool-list");
    return { decision: "REQUIRE_APPROVAL", reason: `Tool '${toolName}' requires explicit approval before invocation`, policiesEvaluated, rulesTriggered, riskLevel };
  }

  // High-risk agents in supervised mode get ALERT_AND_ALLOW for all tool calls
  if ((riskLevel === "high" || riskLevel === "HIGH") && autonomyMode === "supervised") {
    rulesTriggered.push("high-risk-supervised-alert");
    return { decision: "ALERT_AND_ALLOW", reason: `Tool '${toolName}' invocation logged — agent is high-risk in supervised mode`, policiesEvaluated, rulesTriggered, riskLevel };
  }

  return { decision: "ALLOW", reason: "Action passed all constraint checks", policiesEvaluated, rulesTriggered, riskLevel };
}

// ─── RPC 1: EvaluateAction ────────────────────────────────────────────────────
// POST /api/agents/:agentId/aar/evaluate-action

router.post("/api/agents/:agentId/aar/evaluate-action", async (req, res) => {
  try {
    const { agentId } = req.params;
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const { tool_name, server_id, args } = req.body;
    if (!tool_name || typeof tool_name !== "string") {
      return res.status(400).json({ error: "tool_name is required" });
    }

    const startUs = Date.now() * 1000;
    const evaluation = await evaluateActionAgainstConstraints(agentId, tool_name, server_id, orgId);
    const evaluationTimeUs = Date.now() * 1000 - startUs;

    let approvalId: string | undefined;
    if (evaluation.decision === "REQUIRE_APPROVAL") {
      const approval = await storage.createApproval({
        organizationId: orgId,
        type: "tool-invocation",
        objectType: "mcp-tool",
        objectId: server_id ?? agentId,
        objectName: tool_name,
        riskScore: evaluation.riskLevel === "high" || evaluation.riskLevel === "HIGH" ? 0.8 : 0.5,
        status: "pending",
        requestedBy: agentId,
        requesterType: "agent",
        description: `AAR policy requires approval for tool '${tool_name}' invoked by agent '${agent.name}'`,
      });
      approvalId = approval.id;
    }

    const decision = await storage.createAarActionDecision({
      agentId,
      orgId,
      toolName: tool_name,
      serverId: server_id,
      decision: evaluation.decision,
      reason: evaluation.reason,
      policiesEvaluated: evaluation.policiesEvaluated,
      rulesTriggered: evaluation.rulesTriggered,
      riskLevel: evaluation.riskLevel,
      approvalId,
      evaluationTimeUs,
    });

    const actionDecision = {
      decision: decision.decision,
      reason: decision.reason,
      policies_evaluated: decision.policiesEvaluated ?? [],
      rules_triggered: decision.rulesTriggered ?? [],
      risk_level: decision.riskLevel,
      approval_id: decision.approvalId,
      evaluation_time_us: decision.evaluationTimeUs,
    };

    const statusCode = evaluation.decision === "BLOCK" ? 403 : 200;
    res.status(statusCode).json(actionDecision);
  } catch (err: any) {
    console.error("[AAR] evaluate-action error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── RPC 2: InvokeTool ────────────────────────────────────────────────────────
// POST /api/agents/:agentId/aar/invoke-tool

router.post("/api/agents/:agentId/aar/invoke-tool", async (req, res) => {
  try {
    const { agentId } = req.params;
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const { tool_name, server_id, args } = req.body;
    if (!tool_name || typeof tool_name !== "string") {
      return res.status(400).json({ error: "tool_name is required" });
    }

    const startUs = Date.now() * 1000;
    const evaluation = await evaluateActionAgainstConstraints(agentId, tool_name, server_id, orgId);
    const evaluationTimeUs = Date.now() * 1000 - startUs;

    let approvalId: string | undefined;
    if (evaluation.decision === "REQUIRE_APPROVAL") {
      const approval = await storage.createApproval({
        organizationId: orgId,
        type: "tool-invocation",
        objectType: "mcp-tool",
        objectId: server_id ?? agentId,
        objectName: tool_name,
        riskScore: 0.7,
        status: "pending",
        requestedBy: agentId,
        requesterType: "agent",
        description: `AAR invoke-tool approval required: tool '${tool_name}' by agent '${agent.name}'`,
      });
      approvalId = approval.id;
    }

    await storage.createAarActionDecision({
      agentId, orgId, toolName: tool_name, serverId: server_id,
      decision: evaluation.decision, reason: evaluation.reason,
      policiesEvaluated: evaluation.policiesEvaluated, rulesTriggered: evaluation.rulesTriggered,
      riskLevel: evaluation.riskLevel, approvalId, evaluationTimeUs,
    });

    if (evaluation.decision === "BLOCK") {
      return res.status(403).json({
        error: "Tool invocation blocked by AAR policy",
        reason: evaluation.reason,
        policy_decision: { decision: "BLOCK", reason: evaluation.reason, risk_level: evaluation.riskLevel },
      });
    }

    if (evaluation.decision === "REQUIRE_APPROVAL") {
      return res.status(202).json({
        message: "Tool invocation queued for approval",
        approval_id: approvalId,
        policy_decision: { decision: "REQUIRE_APPROVAL", reason: evaluation.reason, approval_id: approvalId },
      });
    }

    // Proceed with the tool call — proxy through MCP
    let toolResult: unknown = null;
    let invocationError: string | undefined;

    if (server_id) {
      const mcpServer = await storage.getMcpServer(server_id);
      if (mcpServer) {
        try {
          toolResult = await mcpCallTool(mcpServer, tool_name, args ?? {});
        } catch (toolErr: any) {
          invocationError = toolErr.message;
          console.error(`[AAR] invoke-tool MCP call failed: ${toolErr.message}`);
        }
      } else {
        invocationError = `MCP server '${server_id}' not found`;
      }
    } else {
      // No server_id: look up first server tool matching the tool_name
      const allTools = await storage.getAllMcpServerTools();
      const matched = allTools.find(t => t.name === tool_name);
      if (matched) {
        const mcpServer = await storage.getMcpServer(matched.serverId);
        if (mcpServer) {
          try {
            toolResult = await mcpCallTool(mcpServer, tool_name, args ?? {});
          } catch (toolErr: any) {
            invocationError = toolErr.message;
          }
        }
      } else {
        invocationError = `No MCP server tool found for tool name '${tool_name}'`;
      }
    }

    const auditEvent = await storage.createAuditEvent({
      organizationId: orgId,
      action: "aar.invoke_tool",
      objectType: "mcp-tool",
      objectId: server_id ?? agentId,
      actorId: agentId,
      actorType: "agent",
      details: JSON.stringify({ toolName: tool_name, serverId: server_id, args: args ?? {}, policyDecision: evaluation.decision, error: invocationError }),
    });

    res.json({
      result: toolResult !== null ? JSON.stringify(toolResult) : null,
      provenance_event_id: auditEvent.id,
      policy_decision: {
        decision: evaluation.decision,
        reason: evaluation.reason,
        risk_level: evaluation.riskLevel,
        evaluation_time_us: evaluationTimeUs,
      },
      ...(invocationError ? { invocation_error: invocationError } : {}),
    });
  } catch (err: any) {
    console.error("[AAR] invoke-tool error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── RPC 3: InvokeToolStream (SSE) ───────────────────────────────────────────
// GET /api/agents/:agentId/aar/invoke-tool/stream

router.get("/api/agents/:agentId/aar/invoke-tool/stream", async (req, res) => {
  try {
    const { agentId } = req.params;
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const tool_name = req.query.tool_name as string;
    const server_id = req.query.server_id as string | undefined;
    if (!tool_name) {
      res.status(400).json({ error: "tool_name query param is required" });
      return;
    }

    const evaluation = await evaluateActionAgainstConstraints(agentId, tool_name, server_id, orgId);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    if (evaluation.decision === "BLOCK") {
      res.write(`data: ${JSON.stringify({ chunk: null, done: true, error: "BLOCKED", reason: evaluation.reason })}\n\n`);
      res.end();
      return;
    }

    // Simulate streaming chunks
    const chunks = [
      `Tool '${tool_name}' invocation started`,
      `Policy check: ${evaluation.decision}`,
      `Executing tool call...`,
      `Result: { status: "ok", tool: "${tool_name}" }`,
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < chunks.length) {
        res.write(`data: ${JSON.stringify({ chunk: chunks[i], done: false })}\n\n`);
        i++;
      } else {
        res.write(`data: ${JSON.stringify({ chunk: null, done: true })}\n\n`);
        clearInterval(interval);
        res.end();
      }
    }, 250);

    req.on("close", () => clearInterval(interval));
  } catch (err: any) {
    console.error("[AAR] invoke-tool/stream error:", err);
    res.end();
  }
});

// ─── RPC 4: ReportState ──────────────────────────────────────────────────────
// POST /api/agents/:agentId/aar/report-state

router.post("/api/agents/:agentId/aar/report-state", async (req, res) => {
  try {
    const { agentId } = req.params;
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const { report_type, payload } = req.body;

    await storage.createAarAgentStateReport({
      agentId,
      orgId,
      reportType: report_type ?? "heartbeat",
      payload: payload ?? null,
    });

    res.json({ success: true, message: "State report recorded" });
  } catch (err: any) {
    console.error("[AAR] report-state error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── RPC 5: GetConstraints ───────────────────────────────────────────────────
// GET /api/agents/:agentId/aar/constraints

router.get("/api/agents/:agentId/aar/constraints", async (req, res) => {
  try {
    const { agentId } = req.params;
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const aarConfig = await storage.getAarConfig(agentId, orgId);
    if (!aarConfig) return res.status(404).json({ error: "AAR config not found" });

    const constraintResponse = {
      autonomy_level: agent.autonomyMode ?? "supervised",
      allowed_tools: (aarConfig.allowedTools as string[] | null) ?? [],
      denied_tools: (aarConfig.deniedTools as string[] | null) ?? [],
      require_approval_tools: (aarConfig.requireApprovalTools as string[] | null) ?? [],
      rate_limits: (aarConfig.rateLimits as Record<string, unknown> | null) ?? {},
      policy_bundle_version: aarConfig.policyBundleVersion,
      policy_bundle_timestamp: aarConfig.lastSyncedAt?.toISOString() ?? new Date().toISOString(),
    };

    res.json(constraintResponse);
  } catch (err: any) {
    console.error("[AAR] constraints error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── RPC 6: RecordActions ────────────────────────────────────────────────────
// POST /api/agents/:agentId/aar/record-actions

router.post("/api/agents/:agentId/aar/record-actions", async (req, res) => {
  try {
    const { agentId } = req.params;
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const { actions } = req.body;
    if (!Array.isArray(actions)) {
      return res.status(400).json({ error: "actions must be an array" });
    }

    for (const action of actions) {
      await storage.createAuditEvent({
        organizationId: orgId,
        action: "aar.record_action",
        objectType: "mcp-tool",
        objectId: agentId,
        actorId: agentId,
        actorType: "agent",
        details: JSON.stringify({
          toolName: action.tool_name,
          decision: action.decision,
          reason: action.reason,
          occurredAt: action.occurred_at ?? new Date().toISOString(),
        }),
      });
    }

    res.json({ success: true, message: `Recorded ${actions.length} action(s)` });
  } catch (err: any) {
    console.error("[AAR] record-actions error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── UI: Action Decisions listing ────────────────────────────────────────────
// GET /api/agents/:agentId/aar/decisions

router.get("/api/agents/:agentId/aar/decisions", async (req, res) => {
  try {
    const { agentId } = req.params;
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
    const decisions = await storage.listAarActionDecisions(agentId, orgId, limit);
    res.json({ decisions });
  } catch (err: any) {
    console.error("[AAR] decisions error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

// ─── Auto-generation helper (called from deployment creation) ─────────────────

function buildModuleSummary(agentId: string) {
  const modules = buildModuleConfig(agentId, "atlas-native");
  const moduleConfig = modules.map(m => ({ id: m.id, name: m.name, enabled: true }));
  const healthSummary = {
    totalModules: modules.length,
    activeModules: modules.filter(m => m.health.status === "active").length,
    lastCheckedAt: new Date().toISOString(),
  };
  return { moduleConfig, healthSummary };
}

export async function ensureAarConfig(agentId: string): Promise<void> {
  try {
    const { moduleConfig, healthSummary } = buildModuleSummary(agentId);
    const existing = await storage.getAarConfig(agentId);
    if (existing) {
      // Update lastSyncedAt and health snapshot on every deployment
      await storage.upsertAarConfig(agentId, { lastSyncedAt: new Date(), moduleConfig, healthSummary });
      return;
    }

    const seed = seedFromAgentId(agentId);
    const major = 1;
    const minor = seed % 10;
    const patch = seed % 100;
    const policyBundleVersion = `v${major}.${minor}.${patch}`;

    await storage.upsertAarConfig(agentId, {
      targetPlatform: "atlas-native",
      policyBundleVersion,
      lastSyncedAt: new Date(),
      moduleConfig,
      healthSummary,
    });
  } catch (err: any) {
    console.error("[AAR] ensureAarConfig failed:", err.message);
  }
}

export async function backfillAarConfigs(): Promise<void> {
  try {
    const agents = await storage.getAgents();
    const deployed = agents.filter(a => a.status === "deployed" || a.status === "active");
    let created = 0;
    let refreshed = 0;
    for (const agent of deployed) {
      const existing = await storage.getAarConfig(agent.id);
      if (!existing) {
        await ensureAarConfig(agent.id);
        created++;
      } else if (!existing.healthSummary || !existing.moduleConfig) {
        // Refresh rows created before healthSummary/moduleConfig were populated
        const { moduleConfig, healthSummary } = buildModuleSummary(agent.id);
        await storage.upsertAarConfig(agent.id, { moduleConfig, healthSummary });
        refreshed++;
      }
    }
    if (created > 0 || refreshed > 0) {
      console.log(`[AAR] Backfilled ${created} new + refreshed ${refreshed} AAR config(s) for deployed agents`);
    }
  } catch (err: any) {
    console.error("[AAR] backfillAarConfigs failed:", err.message);
  }
}
