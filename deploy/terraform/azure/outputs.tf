# ─────────────────────────────────────────────────────────────────────────────
# Outputs. Sensitive values are hidden by default; retrieve with:
#   terraform output -raw bootstrap_admin_password
# ─────────────────────────────────────────────────────────────────────────────

output "app_url" {
  description = "Public URL of the deployed application."
  value       = "https://${azurerm_linux_web_app.main.default_hostname}"
}

output "app_name" {
  description = "Web App name (for az CLI / deploy.sh)."
  value       = azurerm_linux_web_app.main.name
}

output "resource_group_name" {
  description = "Resource group name (for az CLI / deploy.sh)."
  value       = azurerm_resource_group.main.name
}

output "db_fqdn" {
  description = "PostgreSQL server fully-qualified domain name."
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "database_url" {
  description = "Full DATABASE_URL connection string (also set as an app setting)."
  value       = local.database_url
  sensitive   = true
}

output "db_admin_password" {
  description = "Generated PostgreSQL admin password."
  value       = random_password.db.result
  sensitive   = true
}

output "bootstrap_admin_password" {
  description = "Generated password for the built-in 'admin' user (first login)."
  value       = random_password.bootstrap_admin.result
  sensitive   = true
}

output "jwt_secret" {
  description = "Generated JWT signing secret."
  value       = random_password.jwt_secret.result
  sensitive   = true
}

output "public_api_key" {
  description = "Generated ASTRA public API key."
  value       = random_password.public_api_key.result
  sensitive   = true
}
