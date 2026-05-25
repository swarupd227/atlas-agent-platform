/**
 * Workday REST API client
 * Auth: OAuth 2.0 client credentials (Workday as Authorization Server)
 * Base URL: https://wd2.myworkday.com/api/v1/{tenant}
 * RAAS (Report-As-A-Service) used for headcount/GL reports that lack REST equivalents.
 *
 * PII stripping: compensation, bank account, and SSN fields are removed unless
 * the requesting agent has pii_level: "high" in its permissions config.
 */

const PII_HIGH_FIELDS = new Set([
  "annualSalary", "basePay", "compensationGrade", "compensationStep",
  "bankAccountNumber", "routingTransitNumber",
  "socialSecurityNumber", "taxId", "nationalId",
  "salaryRange", "equityGrant", "bonus", "targetBonus",
]);

export function stripPii(obj: unknown, allow: boolean = false): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(item => stripPii(item, allow));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!allow && PII_HIGH_FIELDS.has(k)) {
      out[k] = "[REDACTED — requires pii_level_high]";
    } else {
      out[k] = typeof v === "object" ? stripPii(v, allow) : v;
    }
  }
  return out;
}

export interface WorkdayCredentials {
  tenant_name: string;
  client_id: string;
  client_secret: string;
  access_token?: string;
}

type Fetcher = (url: string, options?: RequestInit) => Promise<Response>;

async function parseWorkday(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text || res.status === 204) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Workday non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const err = (body as any)?.error ?? (body as any)?.message ?? `HTTP ${res.status}`;
    throw new Error(`Workday API error: ${err}`);
  }
  return body;
}

export class WorkdayClient {
  private readonly tenant: string;
  private token: string;

  constructor(
    private readonly creds: WorkdayCredentials,
    private readonly fetch: Fetcher
  ) {
    this.tenant = creds.tenant_name;
    this.token = creds.access_token ?? "";
  }

  private get restBase(): string {
    return `https://wd2.myworkday.com/api/v1/${this.tenant}`;
  }

  private get raasBase(): string {
    return `https://wd2.myworkday.com/ccx/service/customreport2/${this.tenant}`;
  }

  private async get(path: string): Promise<unknown> {
    const res = await this.fetch(`${this.restBase}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });
    return parseWorkday(res);
  }

  private async raasGet(reportName: string, params?: Record<string, string>): Promise<unknown> {
    const sp = new URLSearchParams({ format: "json", ...params });
    const res = await this.fetch(`${this.raasBase}/${reportName}?${sp.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });
    return parseWorkday(res);
  }

  // ── Workers ────────────────────────────────────────────────────────────────

  async getWorker(workerId: string): Promise<unknown> {
    return this.get(`/workers/${encodeURIComponent(workerId)}?expand=personalInformation,organizations,supervisoryOrganization,jobs`);
  }

  async searchWorkers(query: string, department?: string, location?: string, limit = 20): Promise<unknown> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (query) params.set("search", query);
    if (department) params.set("department", department);
    if (location) params.set("location", location);
    return this.get(`/workers?${params.toString()}`);
  }

  // ── Organizations ──────────────────────────────────────────────────────────

  async getOrganization(orgId: string): Promise<unknown> {
    return this.get(`/supervisoryOrganizations/${encodeURIComponent(orgId)}?expand=leaders,staffingModel,positions`);
  }

  async listCostCenters(limit = 50): Promise<unknown> {
    return this.get(`/costCenters?limit=${Math.min(limit, 200)}`);
  }

  // ── Positions & Requisitions ───────────────────────────────────────────────

  async listOpenPositions(department?: string, location?: string, limit = 25): Promise<unknown> {
    const params = new URLSearchParams({ limit: String(limit), status: "Open" });
    if (department) params.set("organizationalUnit", department);
    if (location) params.set("location", location);
    return this.get(`/jobRequisitions?${params.toString()}`);
  }

  // ── Leave / Time Off ───────────────────────────────────────────────────────

  async getTimeOffBalance(workerId: string): Promise<unknown> {
    return this.get(`/workers/${encodeURIComponent(workerId)}/timeOffBalances`);
  }

  // ── Compensation (PII-sensitive) ───────────────────────────────────────────

  async getPayGroup(workerId: string): Promise<unknown> {
    return this.get(`/workers/${encodeURIComponent(workerId)}/compensation?expand=payGroup,compensationGrade`);
  }

  // ── Reports (RAAS) ─────────────────────────────────────────────────────────

  async getHeadcountReport(params?: { department?: string; location?: string; costCenter?: string }): Promise<unknown> {
    const rParams: Record<string, string> = {};
    if (params?.department) rParams["department"] = params.department;
    if (params?.location) rParams["location"] = params.location;
    if (params?.costCenter) rParams["costCenter"] = params.costCenter;
    return this.raasGet("Atlas_Headcount_By_Org", rParams);
  }

  async getGlSummary(costCenter: string, period: string): Promise<unknown> {
    return this.raasGet("Atlas_GL_Account_Summary", { costCenter, period });
  }

  async getFinancialPeriods(): Promise<unknown> {
    return this.get("/periods/financial?expand=periodStatus&limit=20&sort=-startDate");
  }
}
