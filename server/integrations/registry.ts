export type AuthMethod = "oauth2" | "apikey" | "basic" | "service_account";
export type IntegrationCategory = "crm" | "itsm" | "devops" | "collaboration" | "data" | "erp" | "finance";

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  pkce: boolean;
  /** Azure AD / similar: admin consent URL template for app-level permissions */
  adminConsentUrlTemplate?: string;
  /** Human-readable required permissions for the connect-flow guidance step */
  requiredPermissions?: { permission: string; type: "Delegated" | "Application"; description: string }[];
  /** Connect-flow guidance shown before the user clicks "Authorize" */
  connectGuidance?: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  required: boolean;
  placeholder?: string;
}

export interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  logoColor: string;
  authMethod: AuthMethod;
  oauthConfig?: OAuthConfig;
  credentialFields?: FieldDef[];
  docsUrl?: string;
  wave: 1 | 2 | 3 | 4;
  capabilities: string[];
}

export const INTEGRATION_REGISTRY: IntegrationDef[] = [
  // ── Wave 1: CRM ──────────────────────────────────────────────────────────
  {
    id: "salesforce",
    name: "Salesforce",
    description: "CRM — leads, opportunities, accounts, cases, and workflow automation",
    category: "crm",
    logoColor: "#00A1E0",
    authMethod: "oauth2",
    oauthConfig: {
      authorizationUrl: "https://login.salesforce.com/services/oauth2/authorize",
      tokenUrl: "https://login.salesforce.com/services/oauth2/token",
      defaultScopes: ["api", "refresh_token", "offline_access"],
      pkce: true,
    },
    docsUrl: "https://developer.salesforce.com/docs",
    wave: 1,
    capabilities: ["read_leads", "write_leads", "read_accounts", "write_accounts", "read_opportunities", "read_cases"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "CRM & marketing hub — contacts, deals, pipelines, and email sequences",
    category: "crm",
    logoColor: "#FF7A59",
    authMethod: "apikey",
    credentialFields: [
      { key: "api_key", label: "Private App Token", type: "password", required: true, placeholder: "pat-na1-..." },
      { key: "portal_id", label: "Portal ID", type: "text", required: true, placeholder: "12345678" },
    ],
    docsUrl: "https://developers.hubspot.com",
    wave: 1,
    capabilities: ["read_contacts", "write_contacts", "read_deals", "write_deals", "read_companies"],
  },
  {
    id: "dynamics365",
    name: "Microsoft Dynamics 365",
    description: "Enterprise CRM — sales, customer service, and field operations",
    category: "crm",
    logoColor: "#0078D4",
    authMethod: "oauth2",
    oauthConfig: {
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      defaultScopes: ["https://org.crm.dynamics.com/.default", "offline_access"],
      pkce: true,
    },
    docsUrl: "https://docs.microsoft.com/en-us/dynamics365",
    wave: 1,
    capabilities: ["read_accounts", "read_contacts", "read_opportunities", "write_cases"],
  },

  // ── Wave 2: ITSM & DevOps ─────────────────────────────────────────────────
  {
    id: "servicenow",
    name: "ServiceNow",
    description: "ITSM — incidents, service requests, change management, and CMDB",
    category: "itsm",
    logoColor: "#62D84E",
    authMethod: "basic",
    credentialFields: [
      { key: "instance_url", label: "Instance URL", type: "url", required: true, placeholder: "https://yourinstance.service-now.com" },
      { key: "username", label: "Username", type: "text", required: true, placeholder: "admin" },
      { key: "password", label: "Password", type: "password", required: true },
    ],
    docsUrl: "https://developer.servicenow.com",
    wave: 2,
    capabilities: ["read_incidents", "create_incidents", "update_incidents", "read_cmdb", "read_changes"],
  },
  {
    id: "jira",
    name: "Jira",
    description: "Project management — issues, sprints, epics, and Agile boards",
    category: "devops",
    logoColor: "#0052CC",
    authMethod: "apikey",
    credentialFields: [
      { key: "base_url", label: "Jira Base URL", type: "url", required: true, placeholder: "https://yourorg.atlassian.net" },
      { key: "email", label: "Account Email", type: "text", required: true, placeholder: "you@company.com" },
      { key: "api_token", label: "API Token", type: "password", required: true },
    ],
    docsUrl: "https://developer.atlassian.com/cloud/jira",
    wave: 2,
    capabilities: ["read_issues", "create_issues", "update_issues", "read_projects", "read_sprints"],
  },
  {
    id: "github",
    name: "GitHub",
    description: "DevOps — repos, issues, PRs, actions, and code reviews",
    category: "devops",
    logoColor: "#24292E",
    authMethod: "apikey",
    credentialFields: [
      { key: "token", label: "Personal Access Token", type: "password", required: true, placeholder: "ghp_..." },
      { key: "org", label: "Organization (optional)", type: "text", required: false, placeholder: "my-org" },
    ],
    docsUrl: "https://docs.github.com/en/rest",
    wave: 2,
    capabilities: ["read_repos", "read_issues", "create_issues", "read_prs", "read_actions"],
  },

  // ── Wave 3: Collaboration ─────────────────────────────────────────────────
  {
    id: "slack",
    name: "Slack",
    description: "Team messaging — channels, DMs, threads, and workflow triggers",
    category: "collaboration",
    logoColor: "#4A154B",
    authMethod: "oauth2",
    oauthConfig: {
      authorizationUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      defaultScopes: [
        "channels:history",
        "channels:read",
        "chat:write",
        "files:read",
        "groups:history",
        "groups:read",
        "reactions:write",
        "search:read",
        "users:read",
        "users:read.email",
        "canvases:write",
      ],
      pkce: false,
    },
    docsUrl: "https://api.slack.com",
    wave: 3,
    capabilities: ["read_channels", "send_messages", "read_users", "read_files", "create_webhooks"],
  },
  {
    id: "microsoft_teams",
    name: "Microsoft Teams",
    description: "Collaboration — meetings, chats, channels, and file sharing via Graph API",
    category: "collaboration",
    logoColor: "#6264A7",
    authMethod: "oauth2",
    oauthConfig: {
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      defaultScopes: ["https://graph.microsoft.com/Team.ReadBasic.All", "https://graph.microsoft.com/Chat.Read", "offline_access"],
      pkce: true,
    },
    docsUrl: "https://docs.microsoft.com/en-us/graph/api/resources/teams-api-overview",
    wave: 3,
    capabilities: ["read_teams", "send_messages", "read_chats", "read_files"],
  },
  {
    id: "msgraph",
    name: "Microsoft Graph / M365",
    description: "Microsoft Graph API v1.0 — unified API surface for Exchange email, Outlook Calendar, Teams channels, SharePoint, OneDrive, and Azure AD user directory",
    category: "collaboration",
    logoColor: "#00A4EF",
    authMethod: "oauth2",
    oauthConfig: {
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      defaultScopes: [
        "https://graph.microsoft.com/Mail.ReadWrite",
        "https://graph.microsoft.com/Mail.Send",
        "https://graph.microsoft.com/Calendars.ReadWrite",
        "https://graph.microsoft.com/User.Read.All",
        "https://graph.microsoft.com/Team.ReadBasic.All",
        "https://graph.microsoft.com/ChannelMessage.Send",
        "https://graph.microsoft.com/Files.Read.All",
        "https://graph.microsoft.com/Sites.Read.All",
        "offline_access",
      ],
      pkce: true,
      adminConsentUrlTemplate: "https://login.microsoftonline.com/{tenantId}/adminconsent?client_id={clientId}&redirect_uri={redirectUri}",
      requiredPermissions: [
        { permission: "Mail.ReadWrite",        type: "Delegated",   description: "Read and send email on behalf of the signed-in user" },
        { permission: "Mail.Send",             type: "Delegated",   description: "Send email on behalf of the signed-in user" },
        { permission: "Calendars.ReadWrite",   type: "Delegated",   description: "Read and create calendar events" },
        { permission: "User.Read.All",         type: "Application", description: "Look up any user in the Azure AD directory" },
        { permission: "Team.ReadBasic.All",    type: "Application", description: "List Teams the service account is a member of" },
        { permission: "ChannelMessage.Send",   type: "Application", description: "Post messages to Teams channels" },
        { permission: "ChannelMessage.Read.All", type: "Application", description: "Read Teams channel messages" },
        { permission: "Files.Read.All",        type: "Application", description: "Read SharePoint and OneDrive files" },
        { permission: "Sites.Read.All",        type: "Application", description: "Read SharePoint site pages and content" },
      ],
    },
    docsUrl: "https://docs.microsoft.com/en-us/graph/overview",
    wave: 3,
    capabilities: ["read_email", "send_email", "read_calendar", "create_events", "read_users", "send_teams_messages", "read_sharepoint", "read_onedrive"],
    connectGuidance: "Before connecting, an Azure AD Global Administrator must grant admin consent for the required application permissions. Use the Admin Consent URL below (substitute your tenant_id and client_id) to open the Microsoft Entra admin center consent flow: https://login.microsoftonline.com/{tenant_id}/adminconsent?client_id={client_id}",
  },

  // ── Wave 4: Data & ERP ────────────────────────────────────────────────────
  {
    id: "snowflake",
    name: "Snowflake",
    description: "Cloud data warehouse — query, schema inspection, and result streaming",
    category: "data",
    logoColor: "#29B5E8",
    authMethod: "apikey",
    credentialFields: [
      { key: "account", label: "Account Identifier", type: "text", required: true, placeholder: "orgname-accountname" },
      { key: "username", label: "Username", type: "text", required: true },
      { key: "private_key", label: "Private Key (PEM)", type: "password", required: true },
      { key: "database", label: "Default Database", type: "text", required: false },
      { key: "warehouse", label: "Warehouse", type: "text", required: false, placeholder: "COMPUTE_WH" },
    ],
    docsUrl: "https://docs.snowflake.com/en/developer-guide/sql-api",
    wave: 4,
    capabilities: ["run_queries", "read_schema", "read_tables", "create_views"],
  },
  {
    id: "workday",
    name: "Workday",
    description: "HCM & finance ERP — workers, organizations, payroll, and financial reporting",
    category: "erp",
    logoColor: "#F4811F",
    authMethod: "oauth2",
    oauthConfig: {
      authorizationUrl: "https://wd2.myworkday.com/wday/authgwy/yourtenantname/authorize.htmld",
      tokenUrl: "https://wd2.myworkday.com/ccx/oauth2/yourtenantname/token",
      defaultScopes: ["openid", "profile"],
      pkce: true,
    },
    credentialFields: [
      { key: "tenant_name", label: "Tenant Name", type: "text", required: true, placeholder: "mycompany" },
      { key: "client_id", label: "Client ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
    ],
    docsUrl: "https://community.workday.com/api",
    wave: 4,
    capabilities: ["read_workers", "read_organizations", "read_payroll", "read_financials"],
  },
  {
    id: "sap",
    name: "SAP S/4HANA",
    description: "ERP — materials management, finance, procurement, and plant maintenance",
    category: "erp",
    logoColor: "#0FAAFF",
    authMethod: "basic",
    credentialFields: [
      { key: "base_url", label: "S/4HANA OData Base URL", type: "url", required: true, placeholder: "https://myhost:443/sap/opu/odata" },
      { key: "username", label: "Username", type: "text", required: true },
      { key: "password", label: "Password", type: "password", required: true },
      { key: "client", label: "SAP Client", type: "text", required: false, placeholder: "100" },
    ],
    docsUrl: "https://api.sap.com",
    wave: 4,
    capabilities: ["read_materials", "read_purchase_orders", "read_financials", "create_service_orders"],
  },
];

export function getIntegrationDef(id: string): IntegrationDef | undefined {
  return INTEGRATION_REGISTRY.find((r) => r.id === id);
}

export function getIntegrationsByWave(wave: 1 | 2 | 3 | 4): IntegrationDef[] {
  return INTEGRATION_REGISTRY.filter((r) => r.wave === wave);
}

export function getIntegrationsByCategory(category: IntegrationCategory): IntegrationDef[] {
  return INTEGRATION_REGISTRY.filter((r) => r.category === category);
}
