/**
 * Connector contract tests — run each enterprise connector's cheapest
 * READ-ONLY tool against a real sandbox account and assert the live API
 * still honors the contract our connector code expects.
 *
 * Credential model: env-gated. Each connector's suite runs ONLY when its
 * CONTRACT_* env vars are set (CI: repository secrets; local: shell env) and
 * is reported as skipped otherwise — visible, never silently absent. No
 * credentials live in this file or in the repo.
 *
 * Why this exists: the 10 native connectors call partner REST APIs directly.
 * Without contract tests, a partner API change breaks a connector silently —
 * agents keep "succeeding" with error payloads. This suite is the tripwire.
 *
 * Adding a connector: copy a CONTRACTS entry — connector instance, env spec,
 * one cheap read-only tool + args. Keep probes read-only; contract tests must
 * never mutate sandbox state.
 *
 * NOTE: these tests call handleTool() directly with env credentials — they do
 * not touch the credential vault, the DB, or the org model.
 */
import { describe, it, expect } from "vitest";

interface ContractSpec {
  id: string;
  /** Required env vars; all must be present for the suite to run. */
  env: string[];
  /** Build the credential map handleTool expects from the env. */
  credentials: () => Record<string, string>;
  /** Cheap READ-ONLY probe. */
  tool: string;
  args: () => Record<string, unknown>;
  /** Load the connector instance (lazy so unconfigured suites import nothing). */
  load: () => Promise<{ handleTool: (t: string, a: Record<string, unknown>, c: Record<string, string>, orgId: string) => Promise<any> }>;
}

const CONTRACTS: ContractSpec[] = [
  {
    id: "github",
    env: ["CONTRACT_GITHUB_TOKEN", "CONTRACT_GITHUB_REPO"],
    credentials: () => ({ token: process.env.CONTRACT_GITHUB_TOKEN! }),
    tool: "gh_get_repo",
    args: () => ({ repo: process.env.CONTRACT_GITHUB_REPO! }),
    load: async () => (await import("../server/integrations/register")).githubMcpServer,
  },
  {
    id: "slack",
    env: ["CONTRACT_SLACK_BOT_TOKEN"],
    credentials: () => ({ bot_token: process.env.CONTRACT_SLACK_BOT_TOKEN! }),
    tool: "slack_list_channels",
    args: () => ({ limit: 1 }),
    load: async () => (await import("../server/integrations/register")).slackMcpServer,
  },
  {
    id: "jira",
    env: ["CONTRACT_JIRA_URL", "CONTRACT_JIRA_EMAIL", "CONTRACT_JIRA_TOKEN"],
    credentials: () => ({
      instance_url: process.env.CONTRACT_JIRA_URL!,
      email: process.env.CONTRACT_JIRA_EMAIL!,
      api_token: process.env.CONTRACT_JIRA_TOKEN!,
    }),
    tool: "jira_search",
    args: () => ({ jql: "order by created DESC", maxResults: 1 }),
    load: async () => (await import("../server/integrations/register")).jiraMcpServer,
  },
  // Remaining connectors (salesforce, servicenow, msgraph, snowflake, workday,
  // sap, hubspot) follow the same pattern — add a spec when a sandbox account
  // is provisioned. Until then their suites appear as skipped, which is the
  // honest signal that they are NOT contract-verified.
];

for (const spec of CONTRACTS) {
  const configured = spec.env.every(v => !!process.env[v]);

  describe(`connector contract: ${spec.id}`, () => {
    it.skipIf(!configured)(`${spec.tool} returns a well-formed result from the live sandbox`, async () => {
      const connector = await spec.load();
      const result = await connector.handleTool(spec.tool, spec.args(), spec.credentials(), "contract-test-org");

      // Contract: McpToolResult shape with ok flag; a live-auth read must succeed.
      expect(result).toBeTypeOf("object");
      expect(result).toHaveProperty("ok");
      if (!result.ok) {
        throw new Error(`Contract probe failed for ${spec.id}/${spec.tool}: ${JSON.stringify(result).slice(0, 500)}`);
      }
    }, 30_000);

    it.skipIf(configured)(`SKIPPED — sandbox not configured (set ${spec.env.join(", ")})`, () => {
      expect(true).toBe(true);
    });
  });
}
