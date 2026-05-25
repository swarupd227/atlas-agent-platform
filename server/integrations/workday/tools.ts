/**
 * Workday MCP tool implementations — 10 tools.
 * PII stripping is applied automatically based on pii_allowed flag passed from the router.
 */

import type { WorkdayClient } from "./client";
import { stripPii } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

function ok(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}
function err(msg: string): McpToolResult {
  return { content: [{ type: "text", text: msg }], isError: true };
}

// ── Tool: wd_get_worker ───────────────────────────────────────────────────────

export async function wd_get_worker(client: WorkdayClient, args: Record<string, unknown>, piiAllowed = false): Promise<McpToolResult> {
  const workerId = String(args.worker_id ?? "");
  if (!workerId) return err("worker_id is required");
  try {
    const data = await client.getWorker(workerId);
    return ok(stripPii(data, piiAllowed));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: wd_search_workers ───────────────────────────────────────────────────

export async function wd_search_workers(client: WorkdayClient, args: Record<string, unknown>, piiAllowed = false): Promise<McpToolResult> {
  const query = String(args.query ?? "");
  const department = args.department ? String(args.department) : undefined;
  const location = args.location ? String(args.location) : undefined;
  const limit = Math.min(Number(args.limit ?? 20), 100);
  try {
    const data = await client.searchWorkers(query, department, location, limit);
    return ok(stripPii(data, piiAllowed));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: wd_get_organization ─────────────────────────────────────────────────

export async function wd_get_organization(client: WorkdayClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const orgId = String(args.org_id ?? "");
  if (!orgId) return err("org_id is required");
  try {
    const data = await client.getOrganization(orgId);
    return ok(data);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: wd_list_open_positions ──────────────────────────────────────────────

export async function wd_list_open_positions(client: WorkdayClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const department = args.department ? String(args.department) : undefined;
  const location = args.location ? String(args.location) : undefined;
  const limit = Math.min(Number(args.limit ?? 25), 100);
  try {
    const data = await client.listOpenPositions(department, location, limit);
    return ok(data);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: wd_get_time_off_balance ─────────────────────────────────────────────

export async function wd_get_time_off_balance(client: WorkdayClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const workerId = String(args.worker_id ?? "");
  if (!workerId) return err("worker_id is required");
  try {
    const data = await client.getTimeOffBalance(workerId);
    return ok(data);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: wd_get_pay_group ────────────────────────────────────────────────────

export async function wd_get_pay_group(client: WorkdayClient, args: Record<string, unknown>, piiAllowed = false): Promise<McpToolResult> {
  const workerId = String(args.worker_id ?? "");
  if (!workerId) return err("worker_id is required");
  try {
    const data = await client.getPayGroup(workerId);
    return ok(stripPii(data, piiAllowed));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: wd_get_headcount_report ─────────────────────────────────────────────

export async function wd_get_headcount_report(client: WorkdayClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const params = {
    department: args.department ? String(args.department) : undefined,
    location: args.location ? String(args.location) : undefined,
    costCenter: args.cost_center ? String(args.cost_center) : undefined,
  };
  try {
    const data = await client.getHeadcountReport(params);
    return ok(data);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: wd_list_cost_centers ────────────────────────────────────────────────

export async function wd_list_cost_centers(client: WorkdayClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const limit = Math.min(Number(args.limit ?? 50), 200);
  try {
    const data = await client.listCostCenters(limit);
    return ok(data);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: wd_get_financial_period ─────────────────────────────────────────────

export async function wd_get_financial_period(client: WorkdayClient, args: Record<string, unknown>): Promise<McpToolResult> {
  try {
    const data = await client.getFinancialPeriods();
    return ok(data);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: wd_get_gl_summary ───────────────────────────────────────────────────

export async function wd_get_gl_summary(client: WorkdayClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const costCenter = String(args.cost_center ?? "");
  const period = String(args.period ?? "");
  if (!costCenter || !period) return err("cost_center and period are required");
  try {
    const data = await client.getGlSummary(costCenter, period);
    return ok(data);
  } catch (e: any) { return err(e.message); }
}
