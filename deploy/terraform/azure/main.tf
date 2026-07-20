# ─────────────────────────────────────────────────────────────────────────────
# ASTRA Agents — Azure infrastructure (Terraform)
#
# Provisions the same topology as deploy/azure/provision.sh:
#   Resource Group
#   PostgreSQL Flexible Server (Burstable B1ms) + database + pgvector extension
#   App Service Plan (Linux, B1)
#   Linux Web App (Node 22, WebSockets + Always On) with all app settings
#
# This creates the INFRASTRUCTURE and configuration only. The application code
# is shipped separately with deploy/azure/deploy.sh (local build + zip deploy),
# exactly as it is today — Terraform sets SCM_DO_BUILD_DURING_DEPLOYMENT=false
# so Azure never tries to build. See docs/DEPLOYMENT_GUIDE.md.
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  features {}
  # Auth comes from `az login` (Cloud Shell is pre-authenticated) or from
  # ARM_* environment variables for a service principal. No secrets in code.
  subscription_id = var.subscription_id != "" ? var.subscription_id : null
}

# ── Secrets generated once, kept in Terraform state ──────────────────────────
# These mirror the openssl-generated values in provision.sh. They live in state,
# so protect the state backend (see the backend note in DEPLOYMENT_GUIDE.md).
resource "random_password" "db" {
  length  = 28
  special = false # avoid URL-unsafe chars in the DATABASE_URL
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "random_password" "integration_vault_key" {
  length  = 44
  special = false
}

resource "random_password" "audit_signing_key" {
  length  = 44
  special = false
}

resource "random_password" "public_api_key" {
  length  = 40
  special = false
}

resource "random_password" "bootstrap_admin" {
  length  = 20
  special = false
}

# ── Resource Group ───────────────────────────────────────────────────────────
resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

# ── PostgreSQL Flexible Server (+ pgvector) ──────────────────────────────────
resource "azurerm_postgresql_flexible_server" "main" {
  name                          = var.db_server_name
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  version                       = "16"
  administrator_login           = var.db_admin_username
  administrator_password        = random_password.db.result
  storage_mb                    = var.db_storage_mb
  sku_name                      = var.db_sku_name # e.g. B_Standard_B1ms
  zone                          = "1"
  public_network_access_enabled = true
  tags                          = var.tags

  lifecycle {
    # Storage can only grow; ignore drift if Azure auto-grows it.
    ignore_changes = [zone, storage_mb]
  }
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = var.db_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Allowlist the pgvector extension at the server level (Azure requires this
# before CREATE EXTENSION vector will succeed). Equivalent to provision.sh's
# `az postgres flexible-server parameter set --name azure.extensions --value VECTOR`.
resource "azurerm_postgresql_flexible_server_configuration" "vector" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "VECTOR"
}

# Firewall: allow other Azure services (App Service outbound) to reach the DB.
# The 0.0.0.0 "start=end" rule is Azure's documented "Allow Azure services"
# shortcut. Tighten to specific outbound IPs post-deploy if your policy requires.
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# Optional: allow your own IP so migrate.sh (drizzle-kit push) can reach the DB
# from Cloud Shell / your workstation. Leave admin_client_ip empty to skip.
resource "azurerm_postgresql_flexible_server_firewall_rule" "admin_client" {
  count            = var.admin_client_ip != "" ? 1 : 0
  name             = "AllowAdminClient"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = var.admin_client_ip
  end_ip_address   = var.admin_client_ip
}

# ── App Service Plan (Linux) ─────────────────────────────────────────────────
resource "azurerm_service_plan" "main" {
  name                = var.app_service_plan_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = var.app_service_plan_sku # e.g. B1
  tags                = var.tags
}

# ── Linux Web App (Node 22) ──────────────────────────────────────────────────
locals {
  database_url = format(
    "postgresql://%s:%s@%s.postgres.database.azure.com:5432/%s?sslmode=require",
    var.db_admin_username,
    random_password.db.result,
    var.db_server_name,
    var.db_name,
  )
}

resource "azurerm_linux_web_app" "main" {
  name                = var.app_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_service_plan.main.location
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = true
  tags                = var.tags

  site_config {
    always_on         = true # required for the in-process job worker + SSE
    websockets_enabled = true # required for SSE streaming
    app_command_line  = "npm start"
    application_stack {
      node_version = "22-lts"
    }
    ftps_state = "Disabled"
  }

  app_settings = {
    NODE_ENV                       = "production"
    SECURITY_MODE                  = "production"
    DATABASE_URL                   = local.database_url
    JWT_SECRET                     = random_password.jwt_secret.result
    INTEGRATION_VAULT_KEY          = random_password.integration_vault_key.result
    AUDIT_SIGNING_PRIVATE_KEY      = random_password.audit_signing_key.result
    ASTRA_PUBLIC_API_KEY           = random_password.public_api_key.result
    BOOTSTRAP_ADMIN_PASSWORD       = random_password.bootstrap_admin.result
    DEFAULT_LLM_PROVIDER           = var.default_llm_provider
    ANTHROPIC_API_KEY              = var.anthropic_api_key
    OPENAI_API_KEY                 = var.openai_api_key
    ENABLE_DEMOS                   = var.enable_demos ? "true" : "false"
    SCM_DO_BUILD_DURING_DEPLOYMENT = "false" # code is shipped pre-built by deploy.sh
    WEBSITE_NODE_DEFAULT_VERSION   = "~22"
    WEBSITE_RUN_FROM_PACKAGE       = "0"
  }

  logs {
    application_logs {
      file_system_level = "Information"
    }
    http_logs {
      file_system {
        retention_in_days = 3
        retention_in_mb   = 35
      }
    }
  }

  lifecycle {
    # deploy.sh pushes code out-of-band; don't let Terraform fight it.
    ignore_changes = [app_settings["WEBSITE_RUN_FROM_PACKAGE"]]
  }
}
