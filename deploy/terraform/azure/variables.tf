# ─────────────────────────────────────────────────────────────────────────────
# Input variables. Copy terraform.tfvars.example to terraform.tfvars and fill in.
# Secrets (LLM keys) should come from environment variables (TF_VAR_anthropic_api_key)
# or a secrets manager — do NOT commit terraform.tfvars with real keys.
# ─────────────────────────────────────────────────────────────────────────────

# ── Azure account / location ────────────────────────────────────────────────
variable "subscription_id" {
  description = "Azure subscription ID. Leave empty to use the CLI's active subscription."
  type        = string
  default     = ""
}

variable "location" {
  description = "Azure region for all resources."
  type        = string
  default     = "eastus"
}

variable "resource_group_name" {
  description = "Name of the resource group to create."
  type        = string
  default     = "astra-agents-rg"
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

# ── App Service ──────────────────────────────────────────────────────────────
variable "app_name" {
  description = "Globally-unique name for the Web App (becomes <name>.azurewebsites.net)."
  type        = string
  default     = "astra-agents-artizent"
}

variable "app_service_plan_name" {
  description = "Name of the App Service Plan."
  type        = string
  default     = "astra-agents-plan"
}

variable "app_service_plan_sku" {
  description = "App Service Plan SKU. B1 is the tested baseline; use P1v3+ for production load."
  type        = string
  default     = "B1"
}

# ── PostgreSQL ───────────────────────────────────────────────────────────────
variable "db_server_name" {
  description = "Globally-unique name for the PostgreSQL Flexible Server."
  type        = string
  default     = "astra-agents-db"
}

variable "db_name" {
  description = "Application database name."
  type        = string
  default     = "astra"
}

variable "db_admin_username" {
  description = "PostgreSQL administrator login."
  type        = string
  default     = "astraadmin"
}

variable "db_sku_name" {
  description = "PostgreSQL Flexible Server SKU. B_Standard_B1ms is the tested Burstable baseline."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "db_storage_mb" {
  description = "PostgreSQL storage in MB (minimum 32768)."
  type        = number
  default     = 32768
}

variable "admin_client_ip" {
  description = "Your public IP, allowlisted on the DB firewall so you can run migrations (drizzle-kit push) from Cloud Shell / workstation. Leave empty to skip."
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
  description = "Anthropic API key. Set via TF_VAR_anthropic_api_key or a secrets manager — do not commit."
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_api_key" {
  description = "OpenAI API key (optional; used for embeddings/fallback). Set via TF_VAR_openai_api_key."
  type        = string
  sensitive   = true
  default     = ""
}

variable "enable_demos" {
  description = "Whether to expose the built-in demo surfaces. Keep false for client/production."
  type        = bool
  default     = false
}
