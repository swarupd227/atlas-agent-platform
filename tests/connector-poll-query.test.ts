/**
 * Event-driven triggers — "changed since cursor" query construction for
 * connector polling (mcp_resource_change triggers). Proves: first poll never
 * fires on pre-existing data (no cursor => plain query, no date filter), a
 * cursor correctly narrows JQL/SOQL to "changed since", and SOQL surgery
 * inserts WHERE in the right place whether or not the caller's query already
 * has one.
 */
import { describe, it, expect } from "vitest";
import {
  isPollableIntegration,
  formatJqlDate,
  buildJiraArgs,
  buildSalesforceArgs,
  MIN_POLL_INTERVAL_MS,
} from "../server/connector-poll-query";

describe("isPollableIntegration", () => {
  it("jira and salesforce are pollable", () => {
    expect(isPollableIntegration("jira")).toBe(true);
    expect(isPollableIntegration("salesforce")).toBe(true);
  });

  it("other enterprise connectors are not pollable yet", () => {
    expect(isPollableIntegration("servicenow")).toBe(false);
    expect(isPollableIntegration("github")).toBe(false);
    expect(isPollableIntegration(null)).toBe(false);
    expect(isPollableIntegration(undefined)).toBe(false);
  });
});

describe("formatJqlDate", () => {
  it("formats an ISO timestamp as Jira's JQL literal (no seconds, no T/Z)", () => {
    expect(formatJqlDate("2026-07-09T14:32:07.123Z")).toBe("2026-07-09 14:32");
  });
});

describe("buildJiraArgs", () => {
  it("first poll (no cursor) runs the base query as-is with no date filter", () => {
    const args = buildJiraArgs('project = "ENG"', null);
    expect(args.jql).toBe('project = "ENG"');
    expect(String(args.jql)).not.toMatch(/updated/);
  });

  it("first poll with an empty base query omits jql entirely rather than an empty string", () => {
    const args = buildJiraArgs("", null);
    expect(args.jql).toBeUndefined();
  });

  it("subsequent poll wraps the base query and ANDs a JQL updated-since clause", () => {
    const args = buildJiraArgs('project = "ENG"', "2026-07-09T14:32:00.000Z");
    expect(args.jql).toBe('(project = "ENG") AND updated >= "2026-07-09 14:32" ORDER BY updated ASC');
  });

  it("subsequent poll with no base query is just the cursor clause", () => {
    const args = buildJiraArgs("", "2026-07-09T14:32:00.000Z");
    expect(args.jql).toBe('updated >= "2026-07-09 14:32" ORDER BY updated ASC');
  });
});

describe("buildSalesforceArgs", () => {
  it("throws if the base query is empty (SOQL has no implicit default object)", () => {
    expect(() => buildSalesforceArgs("", null)).toThrow(/full SOQL/);
  });

  it("first poll (no cursor) runs the base query as-is with no date filter", () => {
    const args = buildSalesforceArgs("SELECT Id, Name FROM Opportunity", null);
    expect(args.soql).toBe("SELECT Id, Name FROM Opportunity");
  });

  it("inserts WHERE after FROM when the query has no existing WHERE clause", () => {
    const args = buildSalesforceArgs("SELECT Id, Name FROM Opportunity", "2026-07-09T14:32:00.000Z");
    expect(args.soql).toBe(
      "SELECT Id, Name FROM Opportunity WHERE LastModifiedDate >= 2026-07-09T14:32:00.000Z"
    );
  });

  it("ANDs into an existing WHERE clause rather than producing two WHEREs", () => {
    const args = buildSalesforceArgs(
      "SELECT Id, Name FROM Opportunity WHERE StageName = 'Closed Won'",
      "2026-07-09T14:32:00.000Z"
    );
    expect(args.soql).toBe(
      "SELECT Id, Name FROM Opportunity WHERE LastModifiedDate >= 2026-07-09T14:32:00.000Z AND StageName = 'Closed Won'"
    );
  });

  it("throws when the query has no FROM clause to anchor the filter on", () => {
    expect(() => buildSalesforceArgs("SELECT Id", "2026-07-09T14:32:00.000Z")).toThrow(/FROM clause/);
  });
});

describe("MIN_POLL_INTERVAL_MS", () => {
  it("floors at 60s to avoid hammering a connector", () => {
    expect(MIN_POLL_INTERVAL_MS).toBe(60_000);
  });
});
