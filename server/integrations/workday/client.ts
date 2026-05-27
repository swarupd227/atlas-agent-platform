/**
 * Workday REST API client
 * Auth: OAuth 2.0 client credentials — obtains/refreshes a Bearer token from
 *       the Workday Authorization Server automatically.
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
  /** Optional override for tenants not on the default wd2.myworkday.com host (e.g. wd5.myworkday.com or a VAN host) */
  hostname?: string;
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
  private tokenExpiry = 0;

  constructor(
    private readonly creds: WorkdayCredentials,
    private readonly fetch: Fetcher
  ) {
    this.tenant = creds.tenant_name;
    this.token  = creds.access_token ?? "";
  }

  private get wdHost(): string {
    return this.creds.hostname?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "wd2.myworkday.com";
  }

  private get restBase(): string {
    return `https://${this.wdHost}/api/v1/${this.tenant}`;
  }

  private get raasBase(): string {
    return `https://${this.wdHost}/ccx/service/customreport2/${this.tenant}`;
  }

  private get tokenEndpoint(): string {
    return `https://${this.wdHost}/ccx/oauth2/${this.tenant}/token`;
  }

  /**
   * Returns a valid access token, obtaining a new one via client_credentials
   * if the cached token is missing or expired (5-minute buffer applied).
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.tokenExpiry - 300_000) {
      return this.token;
    }
    if (!this.creds.client_id || !this.creds.client_secret) {
      if (this.token) return this.token;
      throw new Error(
        "Workday: client_id and client_secret are required to obtain an OAuth2 token. " +
        "Configure them in the Integrations settings or supply a pre-generated access_token."
      );
    }
    const body = new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     this.creds.client_id,
      client_secret: this.creds.client_secret,
    });
    const res = await this.fetch(this.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await parseWorkday(res) as any;
    if (!data?.access_token) {
      throw new Error("Workday token endpoint did not return an access_token");
    }
    this.token       = data.access_token as string;
    this.tokenExpiry = now + ((data.expires_in ?? 3600) as number) * 1000;
    return this.token;
  }

  private async get(path: string): Promise<unknown> {
    const token = await this.getAccessToken();
    const res = await this.fetch(`${this.restBase}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    return parseWorkday(res);
  }

  private async raasGet(reportName: string, params?: Record<string, string>): Promise<unknown> {
    const token = await this.getAccessToken();
    const sp = new URLSearchParams({ format: "json", ...params });
    const res = await this.fetch(`${this.raasBase}/${reportName}?${sp.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
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
