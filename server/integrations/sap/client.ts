/**
 * SAP OData API client
 * Supports both:
 *   - SAP S/4HANA Cloud: OData v4, Bearer token (OAuth2 — XSUAA)
 *   - SAP Business One Service Layer: REST/JSON, Session auth (B1 cookie)
 *
 * All calls are read-only (GET + $filter/$select/$expand).
 * Base URL is tenant-configurable and stored in credentials as `base_url`.
 */

export interface SapCredentials {
  base_url: string;
  username?: string;
  password?: string;
  client?: string;
  access_token?: string;
  system_type?: "s4hana" | "b1";
}

type Fetcher = (url: string, options?: RequestInit) => Promise<Response>;

async function parseSap(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text || res.status === 204) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`SAP non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const err = (body as any)?.error?.message?.value
      ?? (body as any)?.["@com.sap.vocabularies.Common.v1.Messages"]?.[0]?.message
      ?? (body as any)?.message
      ?? `HTTP ${res.status}`;
    throw new Error(`SAP API error: ${err}`);
  }
  return body;
}

function unwrapOdata(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const b = body as Record<string, unknown>;
  if (Array.isArray(b["value"])) return b["value"];
  if (b["d"] !== undefined) {
    const d = b["d"] as any;
    if (Array.isArray(d["results"])) return d["results"];
    return d;
  }
  return body;
}

export class SapClient {
  private readonly base: string;
  private readonly systemType: "s4hana" | "b1";
  private readonly token: string | undefined;
  private readonly basicAuth: { username: string; password: string } | undefined;

  constructor(
    private readonly creds: SapCredentials,
    private readonly fetch: Fetcher
  ) {
    this.base = creds.base_url.replace(/\/$/, "");
    this.systemType = creds.system_type ?? "s4hana";
    this.token = creds.access_token;
    if (creds.username && creds.password) {
      this.basicAuth = { username: creds.username, password: creds.password };
    }
  }

  private get authHeader(): string {
    if (this.token) return `Bearer ${this.token}`;
    if (this.basicAuth) {
      const b64 = Buffer.from(`${this.basicAuth.username}:${this.basicAuth.password}`).toString("base64");
      return `Basic ${b64}`;
    }
    throw new Error("SAP: no credentials configured (access_token or username/password required)");
  }

  private async get(path: string, odataParams?: Record<string, string>): Promise<unknown> {
    const sp = new URLSearchParams({ $format: "json", ...odataParams });
    const url = `${this.base}${path}?${sp.toString()}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (this.creds.client) headers["sap-client"] = this.creds.client;
    const res = await this.fetch(url, { method: "GET", headers });
    const body = await parseSap(res);
    return unwrapOdata(body);
  }

  // ── Sales Orders ──────────────────────────────────────────────────────────

  async getSalesOrder(orderId: string): Promise<unknown> {
    if (this.systemType === "b1") {
      return this.get(`/Orders(${encodeURIComponent(orderId)})`, {
        $expand: "DocumentLines",
        $select: "DocEntry,DocNum,CardCode,CardName,DocDate,DocDueDate,DocStatus,DocTotal,DocumentLines",
      });
    }
    return this.get(`/API_SALES_ORDER_SRV/A_SalesOrder('${encodeURIComponent(orderId)}')`, {
      $expand: "to_Item,to_Partner",
      $select: "SalesOrder,SalesOrderType,SoldToParty,CustomerName,RequestedDeliveryDate,SalesOrderDate,TotalNetAmount,TransactionCurrency,SDProcessStatus",
    });
  }

  async searchSalesOrders(filter?: { customer?: string; status?: string; dateFrom?: string; dateTo?: string; top?: number }): Promise<unknown> {
    const filters: string[] = [];
    if (filter?.customer) filters.push(`SoldToParty eq '${filter.customer}'`);
    if (filter?.status) filters.push(`SDProcessStatus eq '${filter.status}'`);
    if (filter?.dateFrom) filters.push(`SalesOrderDate ge ${filter.dateFrom}`);
    if (filter?.dateTo) filters.push(`SalesOrderDate le ${filter.dateTo}`);

    if (this.systemType === "b1") {
      const bFilters: string[] = [];
      if (filter?.customer) bFilters.push(`CardCode eq '${filter.customer}'`);
      if (filter?.status) bFilters.push(`DocStatus eq '${filter.status}'`);
      return this.get(`/Orders`, {
        $filter: bFilters.join(" and ") || "DocStatus ne 'X'",
        $top: String(Math.min(filter?.top ?? 20, 50)),
        $select: "DocEntry,DocNum,CardCode,CardName,DocDate,DocDueDate,DocStatus,DocTotal",
      });
    }
    return this.get(`/API_SALES_ORDER_SRV/A_SalesOrder`, {
      ...(filters.length ? { $filter: filters.join(" and ") } : {}),
      $top: String(Math.min(filter?.top ?? 20, 50)),
      $select: "SalesOrder,SalesOrderType,SoldToParty,CustomerName,RequestedDeliveryDate,SalesOrderDate,TotalNetAmount,TransactionCurrency,SDProcessStatus",
      $orderby: "SalesOrderDate desc",
    });
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async getPurchaseOrder(poId: string): Promise<unknown> {
    if (this.systemType === "b1") {
      return this.get(`/PurchaseOrders(${encodeURIComponent(poId)})`, {
        $expand: "DocumentLines",
        $select: "DocEntry,DocNum,CardCode,CardName,DocDate,DocDueDate,DocStatus,DocTotal,DocumentLines",
      });
    }
    return this.get(`/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder('${encodeURIComponent(poId)}')`, {
      $expand: "to_PurchaseOrderItem",
      $select: "PurchaseOrder,PurchaseOrderType,Supplier,CompanyCode,CreationDate,PurchaseOrderDate,TotalNetOrderAmount,DocumentCurrency,PurchasingOrganization",
    });
  }

  // ── Vendors & Customers ────────────────────────────────────────────────────

  async getVendor(vendorId: string): Promise<unknown> {
    if (this.systemType === "b1") {
      return this.get(`/BusinessPartners('${encodeURIComponent(vendorId)}')`, {
        $select: "CardCode,CardName,CardType,Phone1,EmailAddress,PayTermsGrpCode,Currency,Balance",
      });
    }
    return this.get(`/API_BUSINESS_PARTNER/A_Supplier('${encodeURIComponent(vendorId)}')`, {
      $expand: "to_SupplierPartnerFunc",
      $select: "Supplier,SupplierName,PurchasingOrganization,PaymentTerms,Currency,Country,IsBlocked",
    });
  }

  async getCustomer(customerId: string): Promise<unknown> {
    if (this.systemType === "b1") {
      return this.get(`/BusinessPartners('${encodeURIComponent(customerId)}')`, {
        $select: "CardCode,CardName,CardType,Phone1,EmailAddress,PayTermsGrpCode,Currency,Balance,CreditLimit",
      });
    }
    return this.get(`/API_BUSINESS_PARTNER/A_Customer('${encodeURIComponent(customerId)}')`, {
      $select: "Customer,CustomerName,SalesOrganization,PaymentTerms,Currency,Country,IsBlocked",
    });
  }

  // ── Materials & Inventory ──────────────────────────────────────────────────

  async getMaterial(materialId: string, plant?: string): Promise<unknown> {
    if (this.systemType === "b1") {
      return this.get(`/Items('${encodeURIComponent(materialId)}')`, {
        $select: "ItemCode,ItemName,ItemType,OnHand,OnOrder,IsStockItem,QuantityOnStock,MinInventory,PurchaseUnit,SalesUnit,ManageBatchNumbers",
      });
    }
    const plantParam = plant ? `/${plant}` : "";
    return this.get(`/API_PRODUCT_SRV/A_Product('${encodeURIComponent(materialId)}')${plantParam}`, {
      $expand: "to_Plant",
      $select: "Product,ProductDescription,ProductType,BaseUnit,GrossWeight,NetWeight,WeightUnit,MaterialGroup,Division",
    });
  }

  async checkInventory(materialId: string, plant: string, storageLocation?: string): Promise<unknown> {
    if (this.systemType === "b1") {
      return this.get(`/Items('${encodeURIComponent(materialId)}')`, {
        $select: "ItemCode,QuantityOnStock,OnHand,OnOrder",
      });
    }
    const filters = [
      `Material eq '${materialId}'`,
      `Plant eq '${plant}'`,
    ];
    if (storageLocation) filters.push(`StorageLocation eq '${storageLocation}'`);
    return this.get(`/API_MATERIAL_STOCK_SRV/A_MatlStkInAcctMod`, {
      $filter: filters.join(" and "),
      $select: "Material,Plant,StorageLocation,MatlStkQtyInMatlBaseUnit,BaseUnit",
    });
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async getInvoice(invoiceId: string): Promise<unknown> {
    if (this.systemType === "b1") {
      return this.get(`/Invoices(${encodeURIComponent(invoiceId)})`, {
        $expand: "DocumentLines",
        $select: "DocEntry,DocNum,CardCode,CardName,DocDate,DocDueDate,DocStatus,DocTotal,DocumentLines",
      });
    }
    return this.get(`/API_BILLING_DOCUMENT_SRV/A_BillingDocument('${encodeURIComponent(invoiceId)}')`, {
      $expand: "to_Item",
      $select: "BillingDocument,BillingDocumentType,SoldToParty,BillingDocumentDate,TotalNetAmount,TransactionCurrency,OverallBillingStatus",
    });
  }

  // ── GL Accounts ────────────────────────────────────────────────────────────

  async searchGlAccounts(query: string, top = 20): Promise<unknown> {
    if (this.systemType === "b1") {
      return this.get(`/ChartOfAccounts`, {
        $filter: `contains(tolower(Name), tolower('${query.replace(/'/g, "''")}'))`,
        $top: String(Math.min(top, 50)),
        $select: "Code,Name,AccountType,Active,CashAccount,ExternalCode",
      });
    }
    return this.get(`/API_GLACCOUNTINCHARTOFACCOUNTS_SRV/A_GLAccountInChartOfAccounts`, {
      $filter: `contains(tolower(GLAccountName), tolower('${query.replace(/'/g, "''")}'))`,
      $top: String(Math.min(top, 50)),
      $select: "ChartOfAccounts,GLAccount,GLAccountName,AccountType,IsBalanceSheetAccount,IsReconAccount",
    });
  }
}
