# ─────────────────────────────────────────────────────────────────────────────
# Outputs. Retrieve sensitive values with: terraform output -raw <name>
# ─────────────────────────────────────────────────────────────────────────────

output "app_url" {
  description = "Public URL of the Elastic Beanstalk environment."
  value       = "http://${aws_elastic_beanstalk_environment.main.cname}"
}

output "eb_environment_name" {
  description = "Elastic Beanstalk environment name (for `eb deploy`)."
  value       = aws_elastic_beanstalk_environment.main.name
}

output "eb_application_name" {
  description = "Elastic Beanstalk application name."
  value       = aws_elastic_beanstalk_application.main.name
}

output "db_endpoint" {
  description = "RDS PostgreSQL endpoint (host)."
  value       = aws_db_instance.main.address
}

output "database_url" {
  description = "Full DATABASE_URL connection string (also set as an EB env var)."
  value       = local.database_url
  sensitive   = true
}

output "db_admin_password" {
  description = "Generated RDS admin password."
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
