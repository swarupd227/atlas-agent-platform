/**
 * ServiceNow tool implementations — 11 tools.
 * Each function receives a ServiceNowClient and the validated args.
 */

import {
  ServiceNowClient,
  buildSnQuery,
  INCIDENT_FIELDS,
} from "./client";
import type { McpToolResult } from "../../real-mcp-base";

// ── Tool: snow_create_incident ───────────────────────────────────────────────

export async function snow_create_incident(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const {
    short_description,
    description,
    category,
    priority,
    urgency,
    impact,
    assignment_group,
    caller_id,
    contact_type,
    business_service,
  } = args as Record<string, string | undefined>;

  if (!short_description) throw new Error("short_description is required");

  const record = await client.createRecord("incident", {
    short_description,
    ...(description && { description }),
    ...(category && { category }),
    ...(priority && { priority }),
    ...(urgency && { urgency }),
    ...(impact && { impact }),
    ...(assignment_group && { assignment_group }),
    ...(caller_id && { caller_id }),
    ...(contact_type && { contact_type }),
    ...(business_service && { business_service }),
    state: "1",
  });

  return ok({ created: true, sys_id: record.sys_id, number: record.number, ...record });
}

// ── Tool: snow_get_incident ───────────────────────────────────────────────────

export async function snow_get_incident(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const number = args.number as string | undefined;
  const sys_id = args.sys_id as string | undefined;

  if (!number && !sys_id) throw new Error("Either number (e.g. INC0001234) or sys_id is required");

  let record;
  if (number) {
    record = await client.getByNumber("incident", number, INCIDENT_FIELDS);
    if (!record) throw new Error(`Incident ${number} not found`);
  } else {
    record = await client.getRecord("incident", sys_id!, INCIDENT_FIELDS);
  }

  return ok(record);
}

// ── Tool: snow_update_incident ────────────────────────────────────────────────

export async function snow_update_incident(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const number = args.number as string | undefined;
  const sys_id = args.sys_id as string | undefined;

  if (!number && !sys_id) throw new Error("Either number or sys_id is required");

  let resolvedSysId = sys_id;
  if (!resolvedSysId && number) {
    const found = await client.getByNumber("incident", number, ["sys_id"]);
    if (!found) throw new Error(`Incident ${number} not found`);
    resolvedSysId = found.sys_id as string;
  }

  const updateFields: Record<string, unknown> = {};
  const allowed = ["state", "priority", "urgency", "impact", "assignment_group",
    "assigned_to", "work_notes", "comments", "close_notes", "resolution_code",
    "category", "subcategory", "short_description", "description"];
  for (const f of allowed) {
    if (args[f] !== undefined) updateFields[f] = args[f];
  }

  if (!Object.keys(updateFields).length) throw new Error("No update fields provided");

  const updated = await client.updateRecord("incident", resolvedSysId!, updateFields);
  return ok({ updated: true, sys_id: resolvedSysId, ...updated });
}

// ── Tool: snow_search_incidents ───────────────────────────────────────────────

export async function snow_search_incidents(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const conditions: Record<string, string | undefined> = {};
  if (args.state) conditions["state"] = args.state as string;
  if (args.priority) conditions["priority"] = args.priority as string;
  if (args.assignment_group) conditions["assignment_group.name"] = args.assignment_group as string;
  if (args.category) conditions["category"] = args.category as string;

  let query = buildSnQuery(conditions);
  if (args.opened_after) {
    const sep = query ? "^" : "";
    query += `${sep}opened_at>=${args.opened_after}`;
  }
  if (args.text_search) {
    const sep = query ? "^" : "";
    query += `${sep}short_descriptionLIKE${args.text_search}`;
  }

  const records = await client.queryTable("incident", {
    query: query || undefined,
    fields: INCIDENT_FIELDS,
    limit: Math.min(Number(args.limit ?? 20), 50),
    displayValue: true,
    orderBy: "sys_created_on^DESC",
  });

  return ok({ count: records.length, incidents: records });
}

// ── Tool: snow_add_work_note ──────────────────────────────────────────────────

export async function snow_add_work_note(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const table = (args.table as string | undefined) ?? "incident";
  const number = args.number as string | undefined;
  const sys_id = args.sys_id as string | undefined;
  const note = args.note as string | undefined;
  const customer_visible = Boolean(args.customer_visible ?? false);

  if (!note) throw new Error("note is required");
  if (!number && !sys_id) throw new Error("Either number or sys_id is required");

  let resolvedSysId = sys_id;
  if (!resolvedSysId && number) {
    const found = await client.getByNumber(table, number, ["sys_id"]);
    if (!found) throw new Error(`Record ${number} not found in ${table}`);
    resolvedSysId = found.sys_id as string;
  }

  await client.addWorkNote(table, resolvedSysId!, note, customer_visible);
  return ok({ added: true, table, sys_id: resolvedSysId, customer_visible });
}

// ── Tool: snow_create_change_request ─────────────────────────────────────────

export async function snow_create_change_request(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const {
    short_description,
    description,
    type,
    priority,
    risk,
    assignment_group,
    implementation_plan,
    backout_plan,
    test_plan,
    start_date,
    end_date,
  } = args as Record<string, string | undefined>;

  if (!short_description) throw new Error("short_description is required");

  const record = await client.createRecord("change_request", {
    short_description,
    ...(description && { description }),
    type: type ?? "normal",
    ...(priority && { priority }),
    ...(risk && { risk }),
    ...(assignment_group && { assignment_group }),
    ...(implementation_plan && { implementation_plan }),
    ...(backout_plan && { backout_plan }),
    ...(test_plan && { test_plan }),
    ...(start_date && { start_date }),
    ...(end_date && { end_date }),
    state: "-5",
  });

  return ok({ created: true, sys_id: record.sys_id, number: record.number, ...record });
}

// ── Tool: snow_approve_change ─────────────────────────────────────────────────

export async function snow_approve_change(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const number = args.number as string | undefined;
  const sys_id = args.sys_id as string | undefined;
  const approval = (args.approval as string) ?? "approved";
  const comments = args.comments as string | undefined;

  if (!number && !sys_id) throw new Error("Either number or sys_id is required");

  let resolvedSysId = sys_id;
  if (!resolvedSysId && number) {
    const found = await client.getByNumber("change_request", number, ["sys_id"]);
    if (!found) throw new Error(`Change request ${number} not found`);
    resolvedSysId = found.sys_id as string;
  }

  const updateFields: Record<string, unknown> = { approval };
  if (comments) updateFields.work_notes = comments;
  if (approval === "approved") updateFields.state = "0";

  const updated = await client.updateRecord("change_request", resolvedSysId!, updateFields);
  return ok({ updated: true, approval, sys_id: resolvedSysId, ...updated });
}

// ── Tool: snow_get_cmdb_ci ────────────────────────────────────────────────────

export async function snow_get_cmdb_ci(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const sys_id = args.sys_id as string | undefined;
  const name = args.name as string | undefined;

  if (!sys_id && !name) throw new Error("Either sys_id or name is required");

  if (sys_id) {
    const ci = await client.getCmdbCi(sys_id);
    return ok(ci);
  }

  const records = await client.queryTable("cmdb_ci", {
    query: `nameLIKE${name}`,
    limit: 5,
    displayValue: true,
    fields: ["sys_id", "name", "sys_class_name", "operational_status", "install_status",
      "short_description", "ip_address", "fqdn", "location", "department", "used_for"],
  });

  if (!records.length) throw new Error(`No CI found with name matching '${name}'`);
  return ok({ count: records.length, results: records });
}

// ── Tool: snow_search_cmdb ────────────────────────────────────────────────────

export async function snow_search_cmdb(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const ci_class = (args.ci_class as string | undefined) ?? "cmdb_ci";
  const text = args.text as string | undefined;
  const operational_status = args.operational_status as string | undefined;
  const limit = Math.min(Number(args.limit ?? 20), 50);

  const conditions: Record<string, string | undefined> = {};
  if (operational_status) conditions["operational_status"] = operational_status;

  let query = buildSnQuery(conditions);
  if (text) {
    const sep = query ? "^" : "";
    query += `${sep}nameLIKE${text}^ORshort_descriptionLIKE${text}`;
  }

  const records = await client.searchCmdb(ci_class, query || "", limit);
  return ok({ count: records.length, ci_class, results: records });
}

// ── Tool: snow_create_task ────────────────────────────────────────────────────

export async function snow_create_task(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const {
    short_description,
    description,
    assignment_group,
    assigned_to,
    parent,
    parent_type,
    priority,
  } = args as Record<string, string | undefined>;

  if (!short_description) throw new Error("short_description is required");

  const taskData: Record<string, unknown> = {
    short_description,
    ...(description && { description }),
    ...(assignment_group && { assignment_group }),
    ...(assigned_to && { assigned_to }),
    ...(priority && { priority }),
  };

  if (parent) {
    const parentTable = parent_type ?? "incident";
    const parentRecord = await client.getByNumber(parentTable, parent, ["sys_id"]);
    if (parentRecord) taskData.parent = parentRecord.sys_id;
  }

  const record = await client.createRecord("sc_task", taskData);
  return ok({ created: true, sys_id: record.sys_id, number: record.number, ...record });
}

// ── Tool: snow_get_catalog_item ───────────────────────────────────────────────

export async function snow_get_catalog_item(
  client: ServiceNowClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const sys_id = args.sys_id as string | undefined;
  const name = args.name as string | undefined;

  if (!sys_id && !name) throw new Error("Either sys_id or name is required");

  if (sys_id) {
    const item = await client.getCatalogItem(sys_id);
    return ok(item);
  }

  const records = await client.queryTable("sc_cat_item", {
    query: `nameLIKE${name}^active=true`,
    limit: 5,
    displayValue: true,
    fields: ["sys_id", "name", "short_description", "description", "category", "price", "delivery_time", "active"],
  });

  if (!records.length) throw new Error(`No catalog item found matching '${name}'`);
  return ok({ count: records.length, results: records });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}
