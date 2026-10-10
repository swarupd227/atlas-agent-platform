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
  parseGenericPollSpec,
  buildGenericArgs,
  extractGenericRecords,
  readPath,
  DEFAULT_GENERIC_PAGE_SIZE,
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

/**
 * Polling a connector that is neither Jira nor Salesforce. The spec is the
 * trigger's own description of how to ask, so the failure that matters is a
 * spec that looks workable and quietly asks the wrong question: those return
 * zero records forever and read exactly like an estate where nothing happened.
 */
describe("generic poll spec", () => {
  const spec = (over = {}) =>
    parseGenericPollSpec({ tool: "search_incidents", changedSinceParam: "updated_since", ...over });

  it("refuses a spec with no tool or no changed-since argument, naming what is missing", () => {
    expect(() => parseGenericPollSpec({ changedSinceParam: "updated_since" })).toThrow(/config\.poll\.tool/);
    expect(() => parseGenericPollSpec({ tool: "search_incidents" })).toThrow(/changedSinceParam/);
    expect(() => parseGenericPollSpec(undefined)).toThrow(/config\.poll\.tool/);
  });

  it("defaults the page size rather than sending a nonsense one", () => {
    expect(spec().pageSize).toBe(DEFAULT_GENERIC_PAGE_SIZE);
    expect(spec({ pageSize: 0 }).pageSize).toBe(DEFAULT_GENERIC_PAGE_SIZE);
    expect(spec({ pageSize: -5 }).pageSize).toBe(DEFAULT_GENERIC_PAGE_SIZE);
    expect(spec({ pageSize: "not a number" }).pageSize).toBe(DEFAULT_GENERIC_PAGE_SIZE);
    expect(spec({ pageSize: 25 }).pageSize).toBe(25);
  });

  it("leaves the cursor off the baseline poll, so the first cycle cannot fire on old records", () => {
    const args = buildGenericArgs(spec({ args: { category: "Applications" } }), null);
    expect(args).toEqual({ category: "Applications" });
    expect(args).not.toHaveProperty("updated_since");
  });

  it("adds the cursor under the argument the spec names, keeping the base filter", () => {
    const args = buildGenericArgs(
      spec({ args: { category: "Applications" }, pageSizeParam: "limit", pageSize: 10 }),
      "2026-10-10T08:00:00.000Z",
    );
    expect(args).toEqual({ category: "Applications", limit: 10, updated_since: "2026-10-10T08:00:00.000Z" });
  });

  it("does not mutate the spec's base args between polls", () => {
    const s = spec({ args: { category: "Applications" } });
    buildGenericArgs(s, "2026-10-10T08:00:00.000Z");
    expect(s.args).toEqual({ category: "Applications" });
  });

  it("counts the records the connector actually returned, not a total it reports", () => {
    const parsed = { result: { incidents: [{ sys_updated_on: "2026-10-10T09:00:00Z" }, { sys_updated_on: "2026-10-10T10:00:00Z" }], count: 900 } };
    const out = extractGenericRecords(parsed, spec({ recordsPath: "result.incidents", timestampField: "sys_updated_on" }));
    expect(out.recordCount).toBe(2);
    expect(out.lastRecordTimestampIso).toBe("2026-10-10T10:00:00Z");
    expect(out.error).toBeUndefined();
  });

  it("takes the LATEST changed-at in the page, whatever order they arrived in", () => {
    const parsed = { incidents: [{ at: "2026-10-10T12:00:00Z" }, { at: "2026-10-10T07:00:00Z" }, { at: "2026-10-10T11:00:00Z" }] };
    const out = extractGenericRecords(parsed, spec({ recordsPath: "incidents", timestampField: "at" }));
    expect(out.lastRecordTimestampIso).toBe("2026-10-10T12:00:00Z");
  });

  it("ignores a timestamp nothing can parse instead of making it the cursor", () => {
    const parsed = { incidents: [{ at: "last Tuesday" }, { at: "2026-10-10T09:00:00Z" }] };
    const out = extractGenericRecords(parsed, spec({ recordsPath: "incidents", timestampField: "at" }));
    expect(out.recordCount).toBe(2);
    expect(out.lastRecordTimestampIso).toBe("2026-10-10T09:00:00Z");
  });

  it("reports no timestamp at all rather than inventing one, which freezes the cursor safely", () => {
    const parsed = { incidents: [{ number: "A" }, { number: "B" }] };
    const out = extractGenericRecords(parsed, spec({ recordsPath: "incidents" }));
    expect(out.recordCount).toBe(2);
    expect(out.lastRecordTimestampIso).toBeNull();
  });

  it("errors when the declared path is not an array, instead of reporting zero changes", () => {
    const out = extractGenericRecords({ result: { incidents: { number: "A" } } }, spec({ recordsPath: "result.incidents" }));
    expect(out.recordCount).toBe(0);
    expect(out.error).toMatch(/recordsPath/);
  });

  it("errors when the reply is an object and no path was declared", () => {
    const out = extractGenericRecords({ incidents: [{ at: "2026-10-10T09:00:00Z" }] }, spec());
    expect(out.error).toMatch(/recordsPath must say where the records are/);
  });

  it("accepts a reply that is itself the array", () => {
    const out = extractGenericRecords([{ at: "2026-10-10T09:00:00Z" }], spec({ timestampField: "at" }));
    expect(out.recordCount).toBe(1);
    expect(out.error).toBeUndefined();
  });

  it("reads a dotted path and survives every gap along it", () => {
    expect(readPath({ a: { b: { c: 7 } } }, "a.b.c")).toBe(7);
    expect(readPath({ a: null }, "a.b")).toBeUndefined();
    expect(readPath({ a: "text" }, "a.b")).toBeUndefined();
    expect(readPath(undefined, "a")).toBeUndefined();
    expect(readPath({ a: 1 }, undefined)).toBeUndefined();
  });

  it("still reports Jira and Salesforce as pollable, and an unknown integration as not", () => {
    expect(isPollableIntegration("jira")).toBe(true);
    expect(isPollableIntegration("servicenow")).toBe(false);
  });
});
