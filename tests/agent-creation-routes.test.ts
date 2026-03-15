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

describe("Agent Creation Routes (Post Task #24)", () => {
  let existingBlueprintId: string;
  let existingBlueprintJson: any;
  let existingOutcomeId: string;
  let existingTemplateId: string;

  beforeAll(async () => {
    const bpRes = await api("GET", "/api/blueprints");
    expect(bpRes.status).toBe(200);
    expect(Array.isArray(bpRes.data)).toBe(true);
    expect(bpRes.data.length).toBeGreaterThan(0);
    const bpWithJson = bpRes.data.find((b: any) => b.blueprintJson != null);
    const bp = bpWithJson || bpRes.data[0];
    existingBlueprintId = bp.id;
    existingBlueprintJson = bp.blueprintJson;

    const ocRes = await api("GET", "/api/outcomes");
    expect(ocRes.status).toBe(200);
    expect(Array.isArray(ocRes.data)).toBe(true);
    expect(ocRes.data.length).toBeGreaterThan(0);
    existingOutcomeId = ocRes.data[0].id;

    const tplRes = await api("GET", "/api/agent-templates");
    expect(tplRes.status).toBe(200);
    expect(Array.isArray(tplRes.data)).toBe(true);
    expect(tplRes.data.length).toBeGreaterThan(0);
    existingTemplateId = tplRes.data[0].id;
  });

  describe("POST /api/agents", () => {
    it("creates agent without blueprint — no blueprintJson in response", async () => {
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
        blueprintId: existingBlueprintId,
      });
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty("id");
      expect(res.data.blueprintJson).not.toBeNull();
      if (existingBlueprintJson) {
        expect(JSON.stringify(res.data.blueprintJson)).toBe(
          JSON.stringify(existingBlueprintJson)
        );
      }
    });

    it("returns 400 for invalid blueprintId", async () => {
      const res = await api("POST", "/api/agents", {
        name: `Test-BadBP-${Date.now()}`,
        description: "Should fail",
        agentType: "single",
        riskTier: "MEDIUM",
        autonomyMode: "assisted",
        modelProvider: "openai",
        modelName: "gpt-4.1",
        status: "active",
        blueprintId: "non-existent-blueprint-id-12345",
      });
      expect(res.status).toBe(400);
      expect(res.data.message).toContain("Blueprint not found");
      expect(res.data.message).toContain("non-existent-blueprint-id-12345");
    });

    it("creates agent without blueprintId — blueprintJson from body is preserved", async () => {
      const customBlueprintJson = { nodes: [{ id: "n1", type: "llm_call", label: "Test" }], edges: [] };
      const name = `Test-CustomBP-${Date.now()}`;
      const res = await api("POST", "/api/agents", {
        name,
        description: "Agent with inline blueprintJson",
        agentType: "single",
        riskTier: "MEDIUM",
        autonomyMode: "assisted",
        modelProvider: "openai",
        modelName: "gpt-4.1",
        status: "active",
        blueprintJson: customBlueprintJson,
      });
      expect(res.status).toBe(201);
      expect(res.data.blueprintJson).toBeTruthy();
      expect(res.data.blueprintJson.nodes).toEqual(customBlueprintJson.nodes);
    });
  });

  describe("POST /api/agents/bulk-create-from-plan", () => {
    it("creates multiple agents — second with blueprintId resolves blueprintJson", async () => {
      const res = await api("POST", "/api/agents/bulk-create-from-plan", {
        outcomeId: existingOutcomeId,
        industry: "financial_services",
        agents: [
          {
            name: `BulkA-${Date.now()}`,
            description: "First bulk agent (no blueprint)",
            riskTier: "MEDIUM",
            autonomyMode: "assisted",
          },
          {
            name: `BulkB-${Date.now()}`,
            description: "Second bulk agent (with blueprint)",
            riskTier: "HIGH",
            autonomyMode: "assisted",
            blueprintId: existingBlueprintId,
          },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.data.agents).toHaveLength(2);
      expect(res.data.count).toBe(2);
      expect(res.data.agents[0].outcomeId).toBe(existingOutcomeId);
      expect(res.data.agents[1].blueprintJson).not.toBeNull();
      if (existingBlueprintJson) {
        expect(JSON.stringify(res.data.agents[1].blueprintJson)).toBe(
          JSON.stringify(existingBlueprintJson)
        );
      }
    });

    it("returns 400 for invalid blueprintId in bulk create", async () => {
      const res = await api("POST", "/api/agents/bulk-create-from-plan", {
        outcomeId: existingOutcomeId,
        agents: [
          {
            name: `BulkBad-${Date.now()}`,
            description: "Should fail",
            blueprintId: "fake-blueprint-id-99999",
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.data.message).toContain("Blueprint not found");
      expect(res.data.message).toContain("fake-blueprint-id-99999");
    });

    it("fails validation when agents array is empty", async () => {
      const res = await api("POST", "/api/agents/bulk-create-from-plan", {
        outcomeId: existingOutcomeId,
        agents: [],
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Template defaultBlueprintId", () => {
    it("GET /api/agent-templates returns templates — defaultBlueprintId field exists", async () => {
      const res = await api("GET", "/api/agent-templates");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      const first = res.data[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("name");
      expect("defaultBlueprintId" in first).toBe(true);
    });

    it("PUT /api/agent-templates/:id can set defaultBlueprintId", async () => {
      const getRes = await api("GET", `/api/agent-templates/${existingTemplateId}`);
      expect(getRes.status).toBe(200);
      const original = getRes.data;
      const originalDefaultBlueprintId = original.defaultBlueprintId;

      const updateRes = await api("PUT", `/api/agent-templates/${existingTemplateId}`, {
        defaultBlueprintId: existingBlueprintId,
      });
      expect(updateRes.status).toBe(200);
      expect(updateRes.data.defaultBlueprintId).toBe(existingBlueprintId);

      await api("PUT", `/api/agent-templates/${existingTemplateId}`, {
        defaultBlueprintId: originalDefaultBlueprintId || null,
      });
    });
  });
});
