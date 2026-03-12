import { Router, type Request, type Response } from "express";
import {
  getState,
  approveStep,
  completeRequest,
  activateIdentity,
  provisionAccount,
  certifyIdentity,
  addAuditEntry,
  resetDemo,
} from "./demo-store";
import type { IStorage } from "./storage";

export const demoRouter = Router();

demoRouter.get("/servicenow/requests/:id", (_req: Request, res: Response) => {
  const state = getState();
  if (_req.params.id !== state.servicenow.id) {
    return res.status(404).json({ error: "Request not found" });
  }
  res.json(state.servicenow);
});

demoRouter.get("/servicenow/requests", (req: Request, res: Response) => {
  const state = getState();
  const { status, unprocessed } = req.query;
  if (status === "approved" && unprocessed === "true") {
    const allApproved = state.servicenow.approvalChain.every((s) => s.status === "approved");
    if (allApproved && !state.servicenow.processed) {
      return res.json({ requests: [state.servicenow] });
    }
    return res.json({ requests: [] });
  }
  res.json({ requests: [state.servicenow] });
});

demoRouter.post("/servicenow/requests/:id/approve-step", (req: Request, res: Response) => {
  const state = getState();
  if (req.params.id !== state.servicenow.id) {
    return res.status(404).json({ error: "Request not found" });
  }
  const result = approveStep();
  res.json(result);
});

demoRouter.post("/servicenow/requests/:id/complete", (req: Request, res: Response) => {
  const result = completeRequest(req.params.id);
  res.json(result);
});

demoRouter.get("/radiantone/identities", (_req: Request, res: Response) => {
  res.json({ identities: getState().radiantone });
});

demoRouter.get("/radiantone/identities/:id", (req: Request, res: Response) => {
  const identity = getState().radiantone.find((i) => i.id === req.params.id);
  if (!identity) return res.status(404).json({ error: "Identity not found" });
  res.json(identity);
});

demoRouter.post("/radiantone/identities/:id/activate", (req: Request, res: Response) => {
  const result = activateIdentity(req.params.id);
  res.json(result);
});

demoRouter.get("/sailpoint/accounts/:identityId", (_req: Request, res: Response) => {
  res.json({ accounts: getState().sailpoint });
});

demoRouter.post("/sailpoint/provision", (req: Request, res: Response) => {
  const { identityId, app, role } = req.body;
  if (!identityId || !app || !role) {
    return res.status(400).json({ error: "identityId, app, and role are required" });
  }
  const result = provisionAccount(identityId, app, role);
  res.json(result);
});

demoRouter.get("/brainwave/certifications", (_req: Request, res: Response) => {
  res.json(getState().brainwave);
});

demoRouter.post("/brainwave/certify/:identityId", (req: Request, res: Response) => {
  const result = certifyIdentity(req.params.identityId);
  res.json(result);
});

demoRouter.post("/audit-log", (req: Request, res: Response) => {
  const { action, system, details } = req.body;
  const state = getState();
  if (state.auditLog.length >= 500) {
    return res.status(429).json({ error: "Audit log limit reached. Reset the demo." });
  }
  const entry = addAuditEntry(
    String(action || "unknown").slice(0, 200),
    String(system || "unknown").slice(0, 50),
    String(details || "").slice(0, 500)
  );
  res.json(entry);
});

demoRouter.get("/audit-log", (_req: Request, res: Response) => {
  res.json({ entries: getState().auditLog });
});

demoRouter.post("/reset", (_req: Request, res: Response) => {
  resetDemo();
  res.json({ success: true, message: "Demo state reset" });
});

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

export async function seedDemoMcpServer(storage: IStorage): Promise<void> {
  const existing = (await storage.getMcpServers()).find(
    (s) => s.name === "BlackRock Synthetic Worker MCP"
  );
  if (existing) return;

  const server = await storage.createMcpServer({
    name: "BlackRock Synthetic Worker MCP",
    description:
      "Mock MCP server for the BlackRock Synthetic Worker provisioning demo. Provides tools to poll ServiceNow, activate identities in RadiantOne, provision accounts in SailPoint, schedule certifications in Brainwave, and log audit actions.",
    url: `${BASE_URL}/demo-api`,
    transportType: "streamable-http",
    status: "production-enabled",
    riskTier: "LOW",
    capabilities: { tools: true, resources: false, prompts: false },
  });

  const tools = [
    {
      name: "check_pending_requests",
      description:
        "Poll ServiceNow for approved, unprocessed Synthetic Worker access requests. Returns a list of requests ready for agent processing.",
      endpoint: "/servicenow/requests?status=approved&unprocessed=true",
      method: "GET",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "complete_request",
      description:
        "Mark a ServiceNow request as fully processed after all provisioning steps are complete.",
      endpoint: "/servicenow/requests/{requestId}/complete",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: {
          requestId: { type: "string", description: "The ServiceNow request ID (e.g., REQ0084721)" },
        },
        required: ["requestId"],
      },
    },
    {
      name: "activate_identity",
      description:
        "Activate a synthetic worker identity in RadiantOne Identity Data Platform.",
      endpoint: "/radiantone/identities/{identityId}/activate",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: {
          identityId: { type: "string", description: "The identity ID to activate (e.g., AIM-SYNTH-001)" },
        },
        required: ["identityId"],
      },
    },
    {
      name: "provision_account",
      description:
        "Provision an application account for a synthetic worker in SailPoint IdentityIQ.",
      endpoint: "/sailpoint/provision",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: {
          identityId: { type: "string", description: "The identity ID to provision for" },
          app: { type: "string", description: "Application name (e.g., Aladdin OMS)" },
          role: { type: "string", description: "Role to assign (e.g., AIM_Notify_Processor)" },
        },
        required: ["identityId", "app", "role"],
      },
    },
    {
      name: "schedule_certification",
      description:
        "Schedule a Brainwave recertification for a synthetic worker identity.",
      endpoint: "/brainwave/certify/{identityId}",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: {
          identityId: { type: "string", description: "The identity ID to certify" },
        },
        required: ["identityId"],
      },
    },
    {
      name: "log_action",
      description:
        "Record an action in the demo audit trail. Every agent action should be logged here for the live activity feed.",
      endpoint: "/audit-log",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", description: "Short action name (e.g., poll, activate_identity, provision_account)" },
          system: { type: "string", description: "System name (e.g., ServiceNow, RadiantOne, SailPoint, Brainwave)" },
          details: { type: "string", description: "Human-readable description of what happened" },
        },
        required: ["action", "system", "details"],
      },
    },
  ];

  for (const toolDef of tools) {
    await storage.createMcpServerTool({
      serverId: server.id,
      name: toolDef.name,
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
      enabled: true,
      riskClassification: "low",
      annotations: {
        endpoint: toolDef.endpoint,
        method: toolDef.method,
      },
    });
  }
}
