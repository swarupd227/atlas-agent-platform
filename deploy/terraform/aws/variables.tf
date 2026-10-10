# ─────────────────────────────────────────────────────────────────────────────
# Input variables for the AWS reference deployment.
# Secrets (LLM keys) should come from TF_VAR_* env vars, not committed tfvars.
# ─────────────────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default = {
    application = "astra-agents"
    managed_by  = "terraform"
  }
}

# ── Application source (config item requested by the client) ─────────────────
variable "github_repo_url" {
  description = "GitHub repository URL for the ASTRA Agents application code. Used by the deployment guide's build+deploy step; not consumed by Terraform directly."
  type        = string
  default     = "https://github.com/swarupd227/atlas-agent-platform"
}

variable "github_branch" {
  description = "Git branch to deploy."
  type        = string
  default     = "main"
}

# ── Compute (Elastic Beanstalk) ──────────────────────────────────────────────
variable "app_name" {
  description = "Base name for the EB application and related resources."
  type        = string
  default     = "astra-agents"
}

variable "eb_solution_stack" {
  description = "Elastic Beanstalk Node.js solution stack. Find current values with: aws elasticbeanstalk list-available-solution-stacks --query \"SolutionStacks[?contains(@,'Node.js 22')]\""
  type        = string
  default     = "64bit Amazon Linux 2023 v6.1.2 running Node.js 22"
}

variable "eb_instance_type" {
  description = "EC2 instance type for the EB environment."
  type        = string
  default     = "t3.small"
}

# ── PostgreSQL (RDS) ─────────────────────────────────────────────────────────
variable "db_server_name" {
  description = "RDS instance identifier."
  type        = string
  default     = "astra-agents-db"
}

variable "db_name" {
  description = "Application database name."
  type        = string
  default     = "astra"
}

variable "db_admin_username" {
  description = "RDS master username."
  type        = string
  default     = "astraadmin"
}

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro is the low-cost baseline; size up for production."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB."
  type        = number
  default     = 20
}

variable "admin_client_cidr" {
  description = "CIDR (e.g. YOUR.IP/32) allowlisted on the DB security group for running migrations. Leave empty to keep the DB private to the VPC."
  type        = string
  default     = ""
}

# ── LLM providers (config items requested by the client) ─────────────────────
variable "default_llm_provider" {
  description = "Default LLM provider: anthropic or openai."
  type        = string
  default     = "anthropic"
}

variable "anthropic_api_key" {
  description = "Anthropic API key. Set via TF_VAR_anthropic_api_key — do not commit."
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_api_key" {
  description = "OpenAI API key (optional). Set via TF_VAR_openai_api_key."
  type        = string
  sensitive   = true
  default     = ""
}

variable "enable_demos" {
  description = "Whether to expose built-in demo surfaces. Keep false for client/production."
  type        = bool
  default     = false
}

variable "db_ssl_mode" {
  description = "sslmode in the DATABASE_URL. The app's pg client verifies the server certificate against Node's CA store, which does not contain Amazon's RDS CA, so 'require' fails to connect. 'no-verify' encrypts the connection but does not authenticate the server. To verify it, trust the RDS CA bundle on the instance (NODE_EXTRA_CA_CERTS) and set this to 'require'."
  type        = string
  default     = "no-verify"

  validation {
    condition     = contains(["no-verify", "require"], var.db_ssl_mode)
    error_message = "db_ssl_mode must be no-verify or require."
  }
}

variable "allowed_private_cidrs" {
  description = "Private address ranges the app may fetch from (ASTRA_ALLOWED_PRIVATE_CIDRS), e.g. \"10.20.0.0/16,10.30.4.7@8443\" (@port limits an entry to one port). Empty means none. Loopback, link-local and cloud-metadata addresses can never be listed."
  type        = string
  default     = ""
}

variable "outbound_policy" {
  description = "ASTRA_OUTBOUND_POLICY: how admin-configured targets (MCP servers, rest-proxy connectors, enterprise connector addresses) are treated. audit logs what enforce would refuse and refuses nothing; enforce refuses private ranges not in allowed_private_cidrs and loopback other than the app's own port; off does neither. URLs a person supplies are always enforced."
  type        = string
  default     = "audit"

  validation {
    condition     = contains(["audit", "enforce", "off"], var.outbound_policy)
    error_message = "outbound_policy must be audit, enforce or off."
  }
}

variable "lockdown" {
  description = "ASTRA_LOCKDOWN: JSON naming what this deployment does not allow at all, e.g. {\"marketplace\":\"off\",\"apiKeys\":{\"agent\":\"off\",\"publicApi\":\"off\"},\"llmKeys\":\"env-only\",\"connectors\":{\"allow\":[\"msgraph\",\"mcp\"]},\"nativeTools\":{\"webSearch\":\"off\",\"codeExecution\":\"off\",\"documents\":\"off\"}}. Read once at start-up and not changeable from the app; an invalid value stops the server. Empty restricts nothing."
  type        = string
  default     = ""
}

variable "otlp_traces_endpoint" {
  description = "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: where run traces are forwarded as OTLP over HTTP/JSON (a Datadog intake URL for your site, or a Collector/Datadog Agent). Empty sends nothing."
  type        = string
  default     = ""
}

variable "otlp_headers" {
  description = "OTEL_EXPORTER_OTLP_HEADERS: request headers for the endpoint as name=value,name=value, e.g. dd-api-key=<key>. A secret: set via TF_VAR_otlp_headers."
  type        = string
  sensitive   = true
  default     = ""
}

variable "sso" {
  description = "ASTRA_SSO: JSON that turns on Sign in with Microsoft Entra ID beside the password form (tenantId, clientId, redirectUri, roles.map, optional localLogin/sessionHours/requireMfa; see docs/ENTRA_SSO.md). Empty leaves single sign-on off. An unusable value stops the server at start-up."
  type        = string
  default     = ""
}

variable "sso_client_secret" {
  description = "ASTRA_SSO_CLIENT_SECRET: the Entra app registration's client secret. A secret: set via TF_VAR_sso_client_secret."
  type        = string
  sensitive   = true
  default     = ""
}

variable "scim_token" {
  description = "ASTRA_SCIM_TOKEN: the bearer token Entra uses to provision and deactivate the people who sign in with Microsoft (at least 32 characters; needs `sso`; see docs/ENTRA_SCIM.md). A secret: set via TF_VAR_scim_token. Empty leaves SCIM off."
  type        = string
  sensitive   = true
  default     = ""
}