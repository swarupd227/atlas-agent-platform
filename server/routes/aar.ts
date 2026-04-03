import { Router } from "express";
import { storage } from "../storage";
import type { AarConfig } from "../../shared/schema";

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

  return {
    moduleId,
    status: "active" as const,
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

function buildAarPackage(agentId: string, agentName: string, aarConfig: Pick<AarConfig, "targetPlatform" | "policyBundleVersion" | "lastSyncedAt">) {
  const modules = buildModuleConfig(agentId, aarConfig.targetPlatform);
  const platformHints = buildPlatformHints(aarConfig.targetPlatform);
  const seed = seedFromAgentId(agentId);

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
      certRotationDays: 30,
      vaultIntegration: platformHints.secretStore,
      mTlsEnabled: true,
    },
    platformDeploymentHints: platformHints,
    healthEndpoints: {
      healthz: "/healthz",
      readyz: "/readyz",
      heartbeatIntervalSeconds: 15,
    },
    controlPlane: {
      syncUrl: "https://atlas.internal/api/aar/sync",
      policyPushEnabled: true,
      provenanceStreamEndpoint: "atlas-telemetry-collector:4318",
      maxOfflineQueueMb: 512,
    },
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/api/aar/configs", async (_req, res) => {
  try {
    const configs = await storage.getAllAarConfigs();
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
    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const aarConfig = await storage.getAarConfig(agentId);
    if (!aarConfig) {
      return res.json({ aarConfig: null, modules: null, agentName: agent.name });
    }

    const modules = buildModuleConfig(agentId, aarConfig.targetPlatform);
    const seed = seedFromAgentId(agentId);
    const policyActions = {
      block: seed % 8,
      alert: 12 + (seed % 40),
      log: 300 + (seed % 700),
    };

    return res.json({
      aarConfig,
      modules,
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
    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const { targetPlatform } = req.body;
    const updated = await storage.upsertAarConfig(agentId, { targetPlatform });
    res.json({ aarConfig: updated });
  } catch (err: any) {
    console.error("[AAR] PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/agents/:agentId/aar/package", async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const aarConfig = await storage.getAarConfig(agentId);
    const configData = aarConfig ?? { targetPlatform: "atlas-native", policyBundleVersion: "v1.0.0", lastSyncedAt: new Date() };
    const pkg = buildAarPackage(agentId, agent.name, configData);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="aar-package-${agent.name.replace(/\s+/g, "-").toLowerCase()}.json"`);
    res.json(pkg);
  } catch (err: any) {
    console.error("[AAR] Package error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

// ─── Auto-generation helper (called from deployment creation) ─────────────────

export async function ensureAarConfig(agentId: string): Promise<void> {
  try {
    const existing = await storage.getAarConfig(agentId);
    if (existing) {
      // Update lastSyncedAt on every deployment to reflect the latest sync time
      await storage.upsertAarConfig(agentId, { lastSyncedAt: new Date() });
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
    for (const agent of deployed) {
      const existing = await storage.getAarConfig(agent.id);
      if (!existing) {
        await ensureAarConfig(agent.id);
        created++;
      }
    }
    if (created > 0) {
      console.log(`[AAR] Backfilled ${created} AAR config(s) for existing deployed agents`);
    }
  } catch (err: any) {
    console.error("[AAR] backfillAarConfigs failed:", err.message);
  }
}
