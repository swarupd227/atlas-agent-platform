# ─────────────────────────────────────────────────────────────────────────────
# ASTRA Agents — AWS infrastructure (Terraform)  [REFERENCE VARIANT]
#
# The APPLICATION and its environment variables are IDENTICAL to Azure. Only the
# cloud resources differ, because the two clouds offer different managed services:
#
#   Concern            Azure                          AWS (this file)
#   ────────────────   ────────────────────────────   ──────────────────────────
#   Compute / hosting  App Service (Linux Web App)    Elastic Beanstalk (Node)
#   Managed Postgres   PostgreSQL Flexible Server     RDS for PostgreSQL
#   pgvector           azure.extensions=VECTOR +      RDS param group (shared_
#                      CREATE EXTENSION vector        preload) + CREATE EXTENSION
#   Code delivery      zip-deploy (build locally)     eb deploy / S3 app version
#   App settings       Web App app_settings           EB environment option_settings
#
# Elastic Beanstalk (Node.js platform) is chosen because the app ships as a plain
# built Node server with `npm start` — no Docker — exactly like the Azure path.
# EB uploads a zip of the built app and runs it, mirroring Azure zip-deploy.
#
# NOTE: This variant is provided for the client per their AWS request. It has NOT
# been validated in the current test environment (only Azure is testable here).
# Run `terraform validate` / `plan` in an AWS account before relying on it.
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
  # Auth comes from the standard AWS credential chain (env vars, ~/.aws/config,
  # instance profile). No secrets in code.
}

# ── Secrets generated once, kept in Terraform state ──────────────────────────
resource "random_password" "db" {
  length  = 28
  special = false
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

# ── Networking: use the account's default VPC to keep this reference minimal ──
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ── RDS PostgreSQL (+ pgvector) ──────────────────────────────────────────────
resource "aws_security_group" "db" {
  name        = "${var.app_name}-db-sg"
  description = "ASTRA Agents RDS access"
  vpc_id      = data.aws_vpc.default.id

  # Postgres from within the VPC (the EB instances) and optionally from your IP.
  ingress {
    description = "Postgres from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }

  dynamic "ingress" {
    for_each = var.admin_client_cidr != "" ? [var.admin_client_cidr] : []
    content {
      description = "Postgres from admin client (migrations)"
      from_port   = 5432
      to_port     = 5432
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.app_name}-db-subnets"
  subnet_ids = data.aws_subnets.default.ids
  tags       = var.tags
}

# Parameter group that preloads pgvector so CREATE EXTENSION vector succeeds.
resource "aws_db_parameter_group" "pg" {
  name   = "${var.app_name}-pg16"
  family = "postgres16"

  parameter {
    name         = "shared_preload_libraries"
    value        = "vector"
    apply_method = "pending-reboot"
  }

  tags = var.tags
}

resource "aws_db_instance" "main" {
  identifier                  = var.db_server_name
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = var.db_instance_class # e.g. db.t4g.micro
  allocated_storage           = var.db_allocated_storage
  db_name                     = var.db_name
  username                    = var.db_admin_username
  password                    = random_password.db.result
  db_subnet_group_name        = aws_db_subnet_group.main.name
  vpc_security_group_ids      = [aws_security_group.db.id]
  parameter_group_name        = aws_db_parameter_group.pg.name
  publicly_accessible         = var.admin_client_cidr != "" # only if you need external migration access
  skip_final_snapshot         = true
  apply_immediately           = true
  allow_major_version_upgrade = false
  tags                        = var.tags
}

# ── Elastic Beanstalk (Node.js) ──────────────────────────────────────────────
locals {
  database_url = format(
    "postgresql://%s:%s@%s:5432/%s?sslmode=require",
    var.db_admin_username,
    random_password.db.result,
    aws_db_instance.main.address,
    var.db_name,
  )
}

# IAM: EC2 instances in the EB environment need an instance profile.
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eb_ec2" {
  name               = "${var.app_name}-eb-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "eb_web" {
  role       = aws_iam_role.eb_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier"
}

resource "aws_iam_instance_profile" "eb_ec2" {
  name = "${var.app_name}-eb-ec2-profile"
  role = aws_iam_role.eb_ec2.name
}

resource "aws_elastic_beanstalk_application" "main" {
  name        = var.app_name
  description = "ASTRA Agents platform"
  tags        = var.tags
}

resource "aws_elastic_beanstalk_environment" "main" {
  name                = "${var.app_name}-env"
  application         = aws_elastic_beanstalk_application.main.name
  solution_stack_name = var.eb_solution_stack # e.g. "64bit Amazon Linux 2023 v6.x.x running Node.js 22"
  tier                = "WebServer"

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "IamInstanceProfile"
    value     = aws_iam_instance_profile.eb_ec2.name
  }
  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "EnvironmentType"
    value     = "SingleInstance" # mirrors the single B1 Azure plan
  }
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "InstanceType"
    value     = var.eb_instance_type
  }

  # ── Application environment variables (identical set to Azure) ──────────────
  dynamic "setting" {
    for_each = {
      NODE_ENV                  = "production"
      SECURITY_MODE             = "production"
      PORT                      = "8080"
      DATABASE_URL              = local.database_url
      JWT_SECRET                = random_password.jwt_secret.result
      INTEGRATION_VAULT_KEY     = random_password.integration_vault_key.result
      AUDIT_SIGNING_PRIVATE_KEY = random_password.audit_signing_key.result
      ASTRA_PUBLIC_API_KEY      = random_password.public_api_key.result
      BOOTSTRAP_ADMIN_PASSWORD  = random_password.bootstrap_admin.result
      DEFAULT_LLM_PROVIDER      = var.default_llm_provider
      ANTHROPIC_API_KEY         = var.anthropic_api_key
      OPENAI_API_KEY            = var.openai_api_key
      ENABLE_DEMOS              = var.enable_demos ? "true" : "false"
    }
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = setting.key
      value     = setting.value
    }
  }

  # EB's Node proxy listens on 80 and forwards to the app's PORT (8080 above).
  setting {
    namespace = "aws:elasticbeanstalk:environment:proxy"
    name      = "ProxyServer"
    value     = "nginx"
  }

  tags = var.tags
}
