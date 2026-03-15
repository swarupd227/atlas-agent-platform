import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function ensureBlueprint(): Promise<{ id: string; blueprintJson: any }> {
  const existing = await api("GET", "/api/blueprints");
  if (existing.status === 200 && Array.isArray(existing.data)) {
    const withJson = existing.data.find((b: any) => b.blueprintJson != null);
    if (withJson) return { id: withJson.id, blueprintJson: withJson.blueprintJson };
    if (existing.data.length > 0) return { id: existing.data[0].id, blueprintJson: existing.data[0].blueprintJson };
  }
  const created = await api("POST", "/api/blueprints", {
    name: `Test-Blueprint-${Date.now()}`,
    description: "Fixture blueprint for agent creation tests",
    status: "draft",
    blueprintJson: {
      nodes: [{ id: "n1", type: "llm_call", label: "Process" }, { id: "n2", type: "tool_call", label: "Execute" }],
      edges: [{ from: "n1", to: "n2" }],
    },
  });
  expect(created.status).toBe(201);
  return { id: created.data.id, blueprintJson: created.data.blueprintJson };
}

async function ensureOutcome(): Promise<string> {
  const existing = await api("GET", "/api/outcomes");
  if (existing.status === 200 && Array.isArray(existing.data) && existing.data.length > 0) {
    return existing.data[0].id;
  }
  const created = await api("POST", "/api/outcomes", {
    name: `Test-Outcome-${Date.now()}`,
    description: "Fixture outcome for agent creation tests",
    status: "active",
    riskTier: "MEDIUM",
    industry: "financial_services",
  });
  expect(created.status).toBe(201);
  return created.data.id;
}

async function ensureTemplate(): Promise<string> {
  const existing = await api("GET", "/api/agent-templates");
  if (existing.status === 200 && Array.isArray(existing.data) && existing.data.length > 0) {
    return existing.data[0].id;
  }
  const created = await api("POST", "/api/agent-templates", {
    name: `Test-Template-${Date.now()}`,
    description: "Fixture template for agent creation tests",
    category: "general",
    industry: "cross_industry",
    complexity: "medium",
  });
  expect(created.status).toBe(201);
  return created.data.id;
}

describe("Agent Creation Routes (Post Task #24)", () => {
  let blueprintId: string;
  let blueprintJson: any;
  let outcomeId: string;
  let templateId: string;

  beforeAll(async () => {
    const bp = await ensureBlueprint();
    blueprintId = bp.id;
    blueprintJson = bp.blueprintJson;
    outcomeId = await ensureOutcome();
    templateId = await ensureTemplate();
  });

  describe("POST /api/agents — single agent creation", () => {
    it("creates agent without blueprint", async () => {
      const name = `Test-NoBP-${Date.now()}`;
      const res = await api("POST", "/api/agents", {
        name,
        description: "Agent without blueprint",
        agentType: "single",
        riskTier: "MEDIUM",
        autonomyMode: "assisted",
        modelProvider: "openai",
        modelName: "gpt-4.1",
        status: "active",
      });
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty("id");
      expect(res.data.name).toBe(name);
      expect(res.data.agentType).toBe("single");
      expect(res.data.riskTier).toBe("MEDIUM");
      expect(res.data.autonomyMode).toBe("assisted");
    });

    it("creates agent with valid blueprintId — resolves blueprintJson from library", async () => {
      const name = `Test-WithBP-${Date.now()}`;
      const res = await api("POST", "/api/agents", {
        name,
        description: "Agent with blueprint",
        agentType: "single",
        riskTier: "HIGH",
        autonomyMode: "assisted",
        modelProvider: "openai",
        modelName: "gpt-4.1",
        status: "active",
        blueprintId,
      });
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty("id");
      expect(res.data.blueprintJson).not.toBeNull();
      if (blueprintJson) {
        expect(JSON.stringify(res.data.blueprintJson)).toBe(JSON.stringify(blueprintJson));
      }
    });

    it("returns 400 for invalid blueprintId", async () => {
      const badId = "non-existent-blueprint-id-12345";
      const res = await api("POST", "/api/agents", {
        name: `Test-BadBP-${Date.now()}`,
        description: "Should fail",
        agentType: "single",
        riskTier: "MEDIUM",
        autonomyMode: "assisted",
        modelProvider: "openai",
        modelName: "gpt-4.1",
        status: "active",
        blueprintId: badId,
      });
      expect(res.status).toBe(400);
      expect(res.data.message).toContain("Blueprint not found");
      expect(res.data.message).toContain(badId);
    });

    it("preserves inline blueprintJson when no blueprintId is set", async () => {
      const inlineJson = { nodes: [{ id: "n1", type: "llm_call", label: "Test" }], edges: [] };
      const res = await api("POST", "/api/agents", {
        name: `Test-InlineBP-${Date.now()}`,
        description: "Agent with inline blueprintJson",
        agentType: "single",
        riskTier: "MEDIUM",
        autonomyMode: "assisted",
        modelProvider: "openai",
        modelName: "gpt-4.1",
        status: "active",
        blueprintJson: inlineJson,
      });
      expect(res.status).toBe(201);
      expect(res.data.blueprintJson).toBeTruthy();
      expect(res.data.blueprintJson.nodes).toEqual(inlineJson.nodes);
    });
  });

  describe("POST /api/agents/bulk-create-from-plan", () => {
    it("creates multiple agents — resolves blueprintJson for agent with blueprintId", async () => {
      const res = await api("POST", "/api/agents/bulk-create-from-plan", {
        outcomeId,
        industry: "financial_services",
        agents: [
          {
            name: `BulkA-${Date.now()}`,
            description: "No blueprint",
            riskTier: "MEDIUM",
            autonomyMode: "assisted",
          },
          {
            name: `BulkB-${Date.now()}`,
            description: "With blueprint",
            riskTier: "HIGH",
            autonomyMode: "assisted",
            blueprintId,
          },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.data.agents).toHaveLength(2);
      expect(res.data.count).toBe(2);
      expect(res.data.agents[0].outcomeId).toBe(outcomeId);
      expect(res.data.agents[1].blueprintJson).not.toBeNull();
      if (blueprintJson) {
        expect(JSON.stringify(res.data.agents[1].blueprintJson)).toBe(JSON.stringify(blueprintJson));
      }
    });

    it("returns 400 for invalid blueprintId in bulk create", async () => {
      const badId = "fake-blueprint-id-99999";
      const res = await api("POST", "/api/agents/bulk-create-from-plan", {
        outcomeId,
        agents: [{ name: `BulkBad-${Date.now()}`, description: "Should fail", blueprintId: badId }],
      });
      expect(res.status).toBe(400);
      expect(res.data.message).toContain("Blueprint not found");
      expect(res.data.message).toContain(badId);
    });

    it("rejects empty agents array", async () => {
      const res = await api("POST", "/api/agents/bulk-create-from-plan", {
        outcomeId,
        agents: [],
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Template defaultBlueprintId field", () => {
    it("GET /api/agent-templates includes defaultBlueprintId on each template", async () => {
      const res = await api("GET", "/api/agent-templates");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      for (const t of res.data) {
        expect("defaultBlueprintId" in t).toBe(true);
      }
    });

    it("PUT /api/agent-templates/:id can set and restore defaultBlueprintId", async () => {
      const getRes = await api("GET", `/api/agent-templates/${templateId}`);
      expect(getRes.status).toBe(200);
      const originalVal = getRes.data.defaultBlueprintId;

      const setRes = await api("PUT", `/api/agent-templates/${templateId}`, {
        defaultBlueprintId: blueprintId,
      });
      expect(setRes.status).toBe(200);
      expect(setRes.data.defaultBlueprintId).toBe(blueprintId);

      const verifyRes = await api("GET", `/api/agent-templates/${templateId}`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.data.defaultBlueprintId).toBe(blueprintId);

      await api("PUT", `/api/agent-templates/${templateId}`, {
        defaultBlueprintId: originalVal || null,
      });
    });
  });
});
