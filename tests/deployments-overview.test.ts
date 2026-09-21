/**
 * The Deployments page: one list, ordered by what needs a person first, with
 * the release wizard and the freeze centre reused from the old page rather
 * than rebuilt. Promotion is described as what it is -- a request that runs
 * the gates and files an approval -- and production needs its own permission.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { normEnv, deploymentName } from "../client/src/pages/deployments-overview";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const page = () => read("client", "src", "pages", "deployments-overview.tsx");

describe("ordering", () => {
  // The same table the page uses: what needs a decision, then what is moving, then what is live.
  const RANK: Record<string, number> = { pending: 0, canary: 1, deployed: 2, active: 2, promoted: 3, inactive: 4, rolled_back: 5, failed: 5 };
  const rank = (s: string) => RANK[s] ?? 6;

  it("puts a pending deployment above a canary, and a canary above a live one", () => {
    expect(rank("pending")).toBeLessThan(rank("canary"));
    expect(rank("canary")).toBeLessThan(rank("deployed"));
    expect(rank("deployed")).toBe(rank("active"));
    expect(rank("rolled_back")).toBeGreaterThan(rank("promoted"));
    expect(rank("something-new")).toBe(6);
  });

  it("is the order the page actually applies", () => {
    const src = page();
    expect(src).toContain("const STATUS_RANK: Record<string, number> = { pending: 0, canary: 1, deployed: 2, active: 2, promoted: 3, inactive: 4, rolled_back: 5, failed: 5 };");
    expect(src).toContain("filtered = deployments");
    expect(src).toContain("rankOf(a) - rankOf(b)");
  });
});

describe("names and environments from real rows", () => {
  it("treats \"production\" and \"prod\" as the same environment", () => {
    expect(normEnv("production")).toBe("prod");
    expect(normEnv("prod")).toBe("prod");
    expect(normEnv("staging")).toBe("staging");
    expect(normEnv(null)).toBe("");
  });

  it("never shows a raw agent id: stored name, then the agent's name, then a plain statement", () => {
    const names = new Map([["ag-1", "Invoice Agent"]]);
    expect(deploymentName({ agentName: "Stored", agentId: "ag-1" }, names)).toBe("Stored");
    expect(deploymentName({ agentName: null, agentId: "ag-1" }, names)).toBe("Invoice Agent");
    expect(deploymentName({ agentName: null, agentId: "957678f5-69ce-4a1e-a8f2-ac7f698ef328" }, names)).toBe("Agent no longer exists");
  });

  it("offers no promote or runtime action for a deployment whose agent is gone", () => {
    const src = page();
    expect(src).toContain("{nextEnv && agentExists && (");
    expect(src).toContain("{!agentExists ? null : deployment.status");
  });
});

describe("page wiring", () => {
  it("has no tabs and keeps the old page reachable", () => {
    expect(page()).not.toContain("TabsTrigger");
    expect(page()).toContain('href="/deployments/classic"');
    const app = read("client", "src", "App.tsx");
    expect(app).toContain('const Deployments = lazy(() => import("@/pages/deployments-overview"));');
    expect(app).toContain('<Route path="/deployments/classic" component={DeploymentsClassic} />');
  });

  it("reuses the release wizard and freeze centre instead of rebuilding them", () => {
    expect(page()).toContain('import { CreateReleaseWizard, FreezeCenter } from "@/pages/deployments";');
    const old = read("client", "src", "pages", "deployments.tsx");
    expect(old).toContain("export function CreateReleaseWizard({");
    expect(old).toContain("export function FreezeCenter({");
  });

  it("asks for the production permission before offering a promotion into production", () => {
    const src = page();
    expect(src).toContain('const prodPerm = usePermission("deploy_prod");');
    expect(src).toContain('const canPromote = nextEnv === "prod" ? prodPerm.allowed : stagingPerm.allowed;');
    expect(src).toContain("Promotion runs the gates and files an approval; it does not move the deployment by itself.");
  });

  it("shows the server's blast radius rather than computing its own", () => {
    const src = page();
    expect(src).toContain('import { BlastRadius, type BlastRadiusData } from "@/components/blast-radius";');
    expect(src).not.toMatch(/24 \/ 168|\* 30\b/);
  });
});
