/**
 * What the agent screens load. The agents list sent every column of every
 * agent (~80 columns, 12 JSON blobs including the blueprint and the system
 * prompt) to four pages; an agent's traces came back unlimited, with each
 * row's whole payload, fetched on mount; and all 23 tabs' data loaded whether
 * or not the tab was opened.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const storage = read("server", "storage.ts");
const route = read("server", "routes", "agents.ts");
const detail = read("client", "src", "pages", "agent-detail.tsx");

describe("the agents list", () => {
  it("can be asked for just what a list shows", () => {
    expect(route).toContain('req.query.summary === "1" ? await storage.getAgentSummaries(orgId) : await storage.getAgents(orgId)');
    const at = storage.indexOf("async getAgentSummaries(");
    const body = storage.slice(at, at + 900);
    expect(body).toContain("name: agents.name");
    // The heavy columns aren't in it.
    expect(body).not.toMatch(/blueprintJson|systemPrompt|runtimeConfig|memoryGovernanceRules/);
  });

  it("the registry and the agent page ask for that", () => {
    expect(read("client", "src", "pages", "agents-home.tsx")).toContain('queryKey: ["/api/agents?summary=1"]');
    expect(detail).toContain('queryKey: ["/api/agents?summary=1"]');
  });
});

describe("an agent's traces", () => {
  it("are capped, newest first", () => {
    const at = storage.indexOf("async getTracesByAgent(");
    const body = storage.slice(at, at + 600);
    expect(body).toContain("limitCount = 100");
    expect(body).toContain(".limit(limitCount)");
    expect(route).toContain("const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));");
  });
});

describe("the agent page's tabs", () => {
  it("knows which tab is open before its queries run", () => {
    expect(detail.indexOf('const [activeTab, setActiveTab] = useState("summary");')).toBeLessThan(detail.indexOf('queryKey: ["/api/agents", agentId]'));
    expect(detail).toContain("const onTab = (...tabs: string[]) => tabs.includes(activeTab);");
  });

  it.each([
    ["/api/skills", 'enabled: onTab("skills")'],
    ["/api/runbooks", 'enabled: onTab("aar", "monitor")'],
    ["/api/ontology-concepts/all", 'enabled: onTab("ontology", "knowledge-graph")'],
    ["/api/remote-agents", 'enabled: onTab("a2a", "team")'],
  ])("%s waits for its tab", (key, gate) => {
    const at = detail.indexOf(`queryKey: ["${key}"]`);
    expect(at).toBeGreaterThan(-1);
    expect(detail.slice(at, at + 160)).toContain(gate);
  });
});
