/**
 * NetSuite tool implementations — 6 read-only tools.
 * Each function receives a NetSuiteClient and the validated args.
 * Design scope: read invoices, payments, orders, and customers. No writes.
 */

import { NetSuiteClient } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

// ── Tool: netsuite_run_suiteql ──────────────────────────────────────────────────

export async function netsuite_run_suiteql(
  client: NetSuiteClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const query = args.query as string | undefined;
  if (!query) throw new Error("query is required (a SuiteQL SELECT statement)");
  if (!/^\s*select\b/i.test(query)) {
    throw new Error("Only SELECT queries are allowed — netsuite_run_suiteql is read-only and cannot run INSERT/UPDATE/DELETE/DDL statements");
  }

  const limit = Math.min(Number(args.limit ?? 100), 1000);
  const offset = Math.max(Number(args.offset ?? 0), 0);

  const result = await client.runSuiteQL(query, limit, offset);
  return ok({ count: result.items.length, offset, has_more: result.hasMore, total_results: result.totalResults, items: result.items });
}

// ── Tool: netsuite_list_invoices ─────────────────────────────────────────────────

export async function netsuite_list_invoices(
  client: NetSuiteClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const customer_id = args.customer_id as string | undefined;
  const status = args.status as string | undefined;
  const updated_since = args.updated_since as string | undefined;
  const limit = Math.min(Number(args.limit ?? 50), 200);

  const result = await client.listInvoices({ customerId: customer_id, status, updatedSince: updated_since }, limit);

  const invoices = result.items.map((row: any) => ({
    id: row.id,
    invoice_number: row.tranid,
    customer_id: row.entity,
    status: row.status,
    date: row.trandate,
    due_date: row.duedate,
    total: row.total,
    currency: row.currency,
    last_modified: row.lastmodifieddate,
  }));

  return ok({ count: invoices.length, has_more: result.hasMore, invoices });
}

// ── Tool: netsuite_get_invoice ────────────────────────────────────────────────────

export async function netsuite_get_invoice(
  client: NetSuiteClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const internal_id = args.internal_id as string | undefined;
  if (!internal_id) throw new Error("internal_id is required");

  const invoice = await client.getRecord("invoice", internal_id, true);

  return ok({
    id: invoice.id,
    invoice_number: invoice.tranId ?? invoice.tranid,
    customer: invoice.entity ?? null,
    status: invoice.status ?? null,
    date: invoice.tranDate ?? invoice.trandate ?? null,
    due_date: invoice.dueDate ?? invoice.duedate ?? null,
    total: invoice.total ?? null,
    currency: invoice.currency ?? null,
    line_items: (invoice.item?.items ?? []).map((line: any) => ({
      item: line.item?.refName ?? line.item ?? null,
      quantity: line.quantity ?? null,
      rate: line.rate ?? null,
      amount: line.amount ?? null,
      description: line.description ?? null,
    })),
  });
}

// ── Tool: netsuite_list_orders ────────────────────────────────────────────────────

export async function netsuite_list_orders(
  client: NetSuiteClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const customer_id = args.customer_id as string | undefined;
  const status = args.status as string | undefined;
  const updated_since = args.updated_since as string | undefined;
  const limit = Math.min(Number(args.limit ?? 50), 200);

  const result = await client.listOrders({ customerId: customer_id, status, updatedSince: updated_since }, limit);

  const orders = result.items.map((row: any) => ({
    id: row.id,
    order_number: row.tranid,
    customer_id: row.entity,
    status: row.status,
    date: row.trandate,
    total: row.total,
    currency: row.currency,
    last_modified: row.lastmodifieddate,
  }));

  return ok({ count: orders.length, has_more: result.hasMore, orders });
}

// ── Tool: netsuite_list_payments ──────────────────────────────────────────────────

export async function netsuite_list_payments(
  client: NetSuiteClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const customer_id = args.customer_id as string | undefined;
  const updated_since = args.updated_since as string | undefined;
  const limit = Math.min(Number(args.limit ?? 50), 200);

  const result = await client.listPayments({ customerId: customer_id, updatedSince: updated_since }, limit);

  // Best-effort reconciliation against invoices via the nexttransactionlink table.
  // A lookup failure for one payment must not fail the whole list.
  const payments = await Promise.all(
    result.items.map(async (row: any) => {
      const applied_invoice_ids = await client.getAppliedInvoicesForPayment(String(row.id)).catch(() => []);
      return {
        id: row.id,
        payment_number: row.tranid,
        customer_id: row.entity,
        date: row.trandate,
        total: row.total,
        currency: row.currency,
        last_modified: row.lastmodifieddate,
        applied_invoice_ids,
      };
    })
  );

  return ok({ count: payments.length, has_more: result.hasMore, payments });
}

// ── Tool: netsuite_search_customers ───────────────────────────────────────────────

export async function netsuite_search_customers(
  client: NetSuiteClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const name = args.name as string | undefined;
  const email = args.email as string | undefined;
  const updated_since = args.updated_since as string | undefined;
  const limit = Math.min(Number(args.limit ?? 50), 200);

  if (!name && !email) throw new Error("Either name or email is required");

  const result = await client.searchCustomers({ name, email, updatedSince: updated_since }, limit);

  const customers = result.items.map((row: any) => ({
    internal_id: row.id,
    name: row.companyname ?? row.entityid,
    email: maskEmail(row.email),
    balance: row.balance,
    status: row.status,
    last_modified: row.lastmodifieddate,
  }));

  return ok({ count: customers.length, has_more: result.hasMore, customers });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}

/** Partially mask an email address for audit-safe output */
function maskEmail(email: string | undefined | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "****";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.length > 2 ? local.slice(0, 2) : local[0];
  return `${visible}****${domain}`;
}
