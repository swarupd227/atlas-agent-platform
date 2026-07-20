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
