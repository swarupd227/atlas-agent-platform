/**
 * SAP MCP tool implementations — 9 read-only tools.
 * Covers Sales Orders, Purchase Orders, Vendors, Customers, Materials, Inventory, Invoices, GL Accounts.
 */

import type { SapClient } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

function ok(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}
function err(msg: string): McpToolResult {
  return { content: [{ type: "text", text: msg }], isError: true };
}

// ── Tool: sap_get_sales_order ─────────────────────────────────────────────────

export async function sap_get_sales_order(client: SapClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const orderId = String(args.order_id ?? "");
  if (!orderId) return err("order_id is required");
  try {
    return ok(await client.getSalesOrder(orderId));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sap_search_sales_orders ─────────────────────────────────────────────

export async function sap_search_sales_orders(client: SapClient, args: Record<string, unknown>): Promise<McpToolResult> {
  try {
    return ok(await client.searchSalesOrders({
      customer: args.customer ? String(args.customer) : undefined,
      status:   args.status   ? String(args.status)   : undefined,
      dateFrom: args.date_from ? String(args.date_from) : undefined,
      dateTo:   args.date_to   ? String(args.date_to)   : undefined,
      top:      args.top ? Number(args.top) : 20,
    }));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sap_get_purchase_order ──────────────────────────────────────────────

export async function sap_get_purchase_order(client: SapClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const poId = String(args.po_id ?? "");
  if (!poId) return err("po_id is required");
  try {
    return ok(await client.getPurchaseOrder(poId));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sap_get_vendor ──────────────────────────────────────────────────────

export async function sap_get_vendor(client: SapClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const vendorId = String(args.vendor_id ?? "");
  if (!vendorId) return err("vendor_id is required");
  try {
    return ok(await client.getVendor(vendorId));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sap_get_customer ────────────────────────────────────────────────────

export async function sap_get_customer(client: SapClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const customerId = String(args.customer_id ?? "");
  if (!customerId) return err("customer_id is required");
  try {
    return ok(await client.getCustomer(customerId));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sap_get_material ────────────────────────────────────────────────────

export async function sap_get_material(client: SapClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const materialId = String(args.material_id ?? "");
  const plant = args.plant ? String(args.plant) : undefined;
  if (!materialId) return err("material_id is required");
  try {
    return ok(await client.getMaterial(materialId, plant));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sap_check_inventory ─────────────────────────────────────────────────

export async function sap_check_inventory(client: SapClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const materialId = String(args.material_id ?? "");
  const plant = String(args.plant ?? "");
  const storageLocation = args.storage_location ? String(args.storage_location) : undefined;
  if (!materialId || !plant) return err("material_id and plant are required");
  try {
    return ok(await client.checkInventory(materialId, plant, storageLocation));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sap_get_invoice ─────────────────────────────────────────────────────

export async function sap_get_invoice(client: SapClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const invoiceId = String(args.invoice_id ?? "");
  if (!invoiceId) return err("invoice_id is required");
  try {
    return ok(await client.getInvoice(invoiceId));
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sap_search_gl_accounts ─────────────────────────────────────────────

export async function sap_search_gl_accounts(client: SapClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const query = String(args.query ?? "");
  if (!query) return err("query is required");
  const top = Math.min(Number(args.top ?? 20), 50);
  try {
    return ok(await client.searchGlAccounts(query, top));
  } catch (e: any) { return err(e.message); }
}
