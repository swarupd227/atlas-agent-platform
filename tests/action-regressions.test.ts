import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", ...parts), "utf8").replace(/\r\n/g, "\n");

const fleet = read("client", "src", "pages", "observability.tsx");
const skills = read("client", "src", "pages", "skills.tsx");
const agent = read("client", "src", "pages", "agent-detail.tsx");
const routes = read("server", "routes", "shadow-canary.ts");
const knowledge = read("client", "src", "pages", "knowledge-base-detail.tsx");

describe("FH-001 Fleet Health actions", () => {
  it("shows refresh progress and completion instead of silently refetching", () => {
    expect(fleet).toContain("isFetching: fleetFetching");
    expect(fleet).toContain("await Promise.all([refetchFleet(), refetchAlerts(), refetchSmokeTests()])");
    expect(fleet).toContain('toast({ title: "Fleet Health refreshed"');
    expect(fleet).toContain("disabled={refreshing}");
  });

  it("selects and reveals the alerts tab through component state", () => {
    expect(fleet).toContain('const [activeTab, setActiveTab] = useState("agents")');
    expect(fleet).toContain('value={activeTab} onValueChange={setActiveTab}');
    expect(fleet).toContain('setActiveTab("alerts")');
    expect(fleet).toContain("fleetTabsRef.current?.scrollIntoView");
  });
});

describe("KB-ENH-001 linked-agent search", () => {
  it("filters the available agents by name before linking", () => {
    expect(knowledge).toContain("const [agentSearch, setAgentSearch]");
    expect(knowledge).toContain("agent.name.toLowerCase().includes(agentSearch.trim().toLowerCase())");
    expect(knowledge).toContain('data-testid="input-agent-search"');
    expect(knowledge).toContain("filteredAvailableAgents.map");
  });
});

describe("SK-001 skill comparison", () => {
  it("reveals the comparison panel when Compare is clicked", () => {
    expect(skills).toContain("const comparePanelRef = useRef<HTMLDivElement>(null)");
    expect(skills).toContain("comparePanelRef.current?.scrollIntoView");
    expect(skills).toContain("ref={comparePanelRef}");
  });
});

describe("TEAM-003 asynchronous team tests", () => {
  const runTest = routes.slice(
    routes.indexOf('router.post("/api/agents/:id/run-test"'),
    routes.indexOf('router.get("/api/agents/:id/kpi-contributions"'),
  );

  it("returns a run id before starting the long team pipeline", () => {
    expect(runTest).toContain("storage.createAgentRuntimeRun");
    expect(runTest).toContain("res.status(202).json({ accepted: true, runId: runtimeRun.id");
    expect(runTest).toContain("void executeTest()");
    expect(runTest.indexOf("res.status(202).json")).toBeLessThan(runTest.indexOf("void executeTest()"));
  });

  it("polls the accepted run and displays completion or application errors", () => {
    expect(agent).toContain('queryKey: ["/api/agent-runtime/runs", runTestRunId]');
    expect(agent).toContain("refetchInterval: (query)");
    expect(agent).toContain("runTestRun.errorMessage");
    expect(agent).toContain("runTestQueryError");
    expect(agent).toContain("Retry status");
    expect(agent).toContain('data-testid="status-run-test"');
  });
});

describe("runtime-run tenant and lifecycle safety", () => {
  it("checks the requesting organization before returning runtime runs", () => {
    expect(routes).toContain("allowedAgentIds.has(run.agentId)");
    expect(routes).toContain("storage.getAgent(run.agentId, getOrgId(req))");
  });

  it("expires abandoned tests without misreporting active local work", () => {
    expect(routes).toContain('run.triggerType !== "test"');
    expect(routes).toContain("activeTeamTestRunIds.has(run.id)");
    expect(routes).toContain("Team test run timed out or the server restarted before it completed.");
    expect(routes).toContain("A team test is already running for this agent.");
    expect(routes).toContain("activeTeamTestRunIds.delete(runtimeRun.id)");
    expect(routes).toContain("creatingTeamTestAgentIds.has(req.params.id)");
    expect(routes).toContain("creatingTeamTestAgentIds.delete(req.params.id)");
  });
});
