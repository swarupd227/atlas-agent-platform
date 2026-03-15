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
  let existingOutcomeId: string;

  beforeAll(async () => {
    const bpRes = await api("GET", "/api/blueprints");
    expect(bpRes.status).toBe(200);
    expect(Array.isArray(bpRes.data)).toBe(true);
    expect(bpRes.data.length).toBeGreaterThan(0);
    existingBlueprintId = bpRes.data[0].id;

    const ocRes = await api("GET", "/api/outcomes");
    expect(ocRes.status).toBe(200);
    expect(Array.isArray(ocRes.data)).toBe(true);
    expect(ocRes.data.length).toBeGreaterThan(0);
    existingOutcomeId = ocRes.data[0].id;
  });

  describe("POST /api/agents", () => {
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
    });

    it("creates agent with valid blueprintId and resolves blueprintJson", async () => {
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
    });
  });

  describe("POST /api/agents/bulk-create-from-plan", () => {
    it("creates multiple agents with mixed blueprint usage", async () => {
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
      expect(res.data.agents[1].blueprintJson).not.toBeNull();
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
    });
  });
});
