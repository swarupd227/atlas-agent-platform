# ASTRA Agents — Deployment Guide (Terraform)

This guide explains how to deploy the ASTRA Agents platform to the cloud using
the Terraform scripts in `deploy/terraform/`. It is written to be followed
step by step; no prior Terraform experience is assumed.

---

## 1. What gets deployed

Every deployment consists of two things:

1. **Infrastructure** — the cloud resources the app needs (a web host and a
   PostgreSQL database). This is what Terraform creates.
2. **Application code** — the built ASTRA Agents app, which is shipped onto that
   infrastructure with a small deploy script *after* Terraform runs.

We keep these two steps separate on purpose. Terraform owns the long-lived
infrastructure and configuration; the deploy script owns the frequently-changing
code. You run Terraform once (and again only when infrastructure changes), and
you run the deploy script every time you want new code live.

---

## 2. Is it the same for AWS and Azure?

**The application is identical. The cloud resources are not.**

The ASTRA Agents app is one Node.js server plus a PostgreSQL database with the
`pgvector` extension. That never changes. What changes between clouds is *which
managed services* host those two things, because Azure and AWS offer different
services:

| Concern | Azure | AWS |
|---|---|---|
| Web hosting | App Service (Linux Web App, Node 22) | Elastic Beanstalk (Node.js platform) |
| Managed PostgreSQL | PostgreSQL Flexible Server | RDS for PostgreSQL |
| Enabling `pgvector` | `azure.extensions = VECTOR` server parameter, then `CREATE EXTENSION vector` | RDS parameter group `shared_preload_libraries = vector`, then `CREATE EXTENSION vector` |
| Code delivery | zip-deploy of a locally-built artifact | `eb deploy` of a locally-built artifact |
| App configuration | Web App **app settings** | Elastic Beanstalk **environment properties** |

Both Terraform modules set **exactly the same environment variables** on the app
(same names, same meanings). So the application behaves the same on either cloud;
only the surrounding infrastructure code differs.

> **Testing note:** The Azure module is the one deployed and validated in our
> current environment (`https://astra-agents-artizent.azurewebsites.net`). The
> AWS module is provided as a working reference for the client's AWS request but
> has **not** been run in our environment — validate it with `terraform plan` in
> an AWS account before relying on it.

> **Important — the existing live deployment.** The Azure defaults in
> `terraform.tfvars.example` intentionally match the names of the deployment that
> is **already running** (`astra-agents-artizent`, `astra-agents-db`, resource
> group `astra-agents-rg`). Terraform assumes it created everything in its state,
> so running `terraform apply` with these defaults against a **fresh** state would
> either fail on name collisions or try to recreate live resources. Choose one:
> - **New parallel environment (recommended for a first test):** change
>   `app_name`, `db_server_name`, and `resource_group_name` to new unique values
>   and apply — you get an independent stack that cannot disturb the live one.
> - **Adopt the existing deployment into Terraform:** keep the names and
>   `terraform import` each live resource into state *before* the first apply
>   (`terraform import azurerm_resource_group.main /subscriptions/<sub>/resourceGroups/astra-agents-rg`,
>   and similarly for the server, plan, and web app). Only then will `plan` show
>   an empty/near-empty diff instead of proposing to recreate things.

---

## 3. Configuration items (variables)

Per the client's request, the values that change between environments are
Terraform **variables**, not hardcoded. You set them once in a `terraform.tfvars`
file (or as environment variables for secrets). The most important ones:

| Config item | Variable | Notes |
|---|---|---|
| **GitHub repo link** | `github_repo_url` | Where the app code lives; used by the deploy step. Default: `https://github.com/swarupd227/atlas-agent-platform`. |
| Git branch | `github_branch` | Default `main`. |
| **LLM API key (Anthropic)** | `anthropic_api_key` | **Secret.** Set via `TF_VAR_anthropic_api_key`, not in a committed file. |
| **LLM API key (OpenAI)** | `openai_api_key` | **Secret**, optional (embeddings/fallback). |
| Default LLM provider | `default_llm_provider` | `anthropic` or `openai`. |
| Cloud region | `location` (Azure) / `aws_region` (AWS) | |
| App name / URL | `app_name` | Must be globally unique. |
| Database name | `db_name` | Default `astra`. |
| DB admin username | `db_admin_username` | |
| Compute size | `app_service_plan_sku` (Azure) / `eb_instance_type` (AWS) | |
| DB size | `db_sku_name` (Azure) / `db_instance_class` (AWS) | |
| Your IP for migrations | `admin_client_ip` (Azure) / `admin_client_cidr` (AWS) | Allowlists your machine on the DB firewall so you can run the schema migration. |

**Credentials you do *not* supply** — the database password, the JWT signing
secret, the audit-signing key, the integration vault key, the public API key, and
the first-login `admin` password — are **generated automatically** by Terraform
(via `random_password`) and surfaced as outputs. You never invent or store these
by hand. Retrieve them after deploy with `terraform output` (see §6).

### Handling secrets safely

- Put non-secret values (region, names, sizes) in `terraform.tfvars`.
- Pass **API keys** as environment variables so they never touch a file:
  ```bash
  export TF_VAR_anthropic_api_key="sk-ant-..."
  export TF_VAR_openai_api_key="sk-..."
  ```
- Terraform writes generated secrets into its **state file**. Treat the state as
  sensitive: use a remote backend with encryption for anything beyond a quick
  test (see §8).

---

## 4. Prerequisites

You need these installed wherever you run the commands. **Azure Cloud Shell has
all of them pre-installed** — it is the easiest place to run the Azure module.

- **Terraform** ≥ 1.5
- **Node.js 22** and **npm** (to build the app for the deploy step)
- **git**
- **Azure:** the Azure CLI (`az`), logged in (`az login`) — pre-authenticated in Cloud Shell.
- **AWS:** the AWS CLI (`aws`) configured with credentials, and the EB CLI (`eb`) for the deploy step.

---

## 5. Deploy to Azure (step by step)

### 5.1 Get the code and pick your variables

```bash
git clone https://github.com/swarupd227/atlas-agent-platform.git
cd atlas-agent-platform/deploy/terraform/azure
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` — set at least `app_name` and `db_server_name` to
globally-unique values. Then export your LLM key(s):

```bash
export TF_VAR_anthropic_api_key="sk-ant-..."
```

To be able to run the database migration from this machine, allowlist your IP:

```bash
# find your IP, then set admin_client_ip in terraform.tfvars
curl -s ifconfig.me
```

### 5.2 Create the infrastructure

```bash
terraform init
terraform plan      # review what will be created
terraform apply     # type "yes" to confirm
```

This creates the resource group, the PostgreSQL Flexible Server (with `pgvector`
allowlisted), the App Service Plan, and the Web App with all environment
variables set. It takes a few minutes (the database is the slow part).

### 5.3 Enable pgvector inside the database (one time)

Terraform allowlists the extension at the server level; you still create it
inside the database once:

```bash
DB_FQDN=$(terraform output -raw db_fqdn)
DB_PW=$(terraform output -raw db_admin_password)
PGPASSWORD="$DB_PW" psql "host=$DB_FQDN port=5432 dbname=astra user=astraadmin sslmode=require" \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 5.4 Create the database schema

The app's tables are created with drizzle. From the repo root:

```bash
cd ../../..                              # back to repo root
export DATABASE_URL="$(cd deploy/terraform/azure && terraform output -raw database_url)"
npm install
npm run db:push                          # or: cd deploy/azure && ./migrate.sh
```

> If drizzle-kit ever asks to **drop** a column named `embedding` or a `vector`
> column, **abort** — that is the pgvector data the knowledge base depends on.
> drizzle raises a false alarm because it doesn't model the vector type.

### 5.5 Ship the application code

Terraform created the empty host. Now build and deploy the app onto it. The
existing `deploy/azure/deploy.sh` does this — point it at the resource names
Terraform produced:

```bash
cd deploy/azure
cp config.env.example config.env
# set RG, APP_NAME in config.env to the Terraform outputs:
#   terraform -chdir=../terraform/azure output -raw resource_group_name
#   terraform -chdir=../terraform/azure output -raw app_name
./deploy.sh
```

`deploy.sh` builds the app locally and zip-deploys it (Azure does not build
server-side — `SCM_DO_BUILD_DURING_DEPLOYMENT=false` is already set by Terraform).

### 5.6 Sign in

```bash
terraform -chdir=deploy/terraform/azure output -raw app_url
terraform -chdir=deploy/terraform/azure output -raw bootstrap_admin_password
```

Open the URL, sign in as **`admin`** with that password, and change it.

---

## 6. Retrieving generated credentials

```bash
cd deploy/terraform/azure         # (or aws)
terraform output                              # lists everything (secrets hidden)
terraform output -raw bootstrap_admin_password
terraform output -raw database_url
terraform output -raw public_api_key
```

---

## 7. Deploy to AWS (reference)

The steps mirror Azure; only the tooling differs.

```bash
cd atlas-agent-platform/deploy/terraform/aws
cp terraform.tfvars.example terraform.tfvars   # edit region, names, sizes
export TF_VAR_anthropic_api_key="sk-ant-..."
terraform init && terraform apply
```

Then:

1. **pgvector:** the RDS parameter group preloads `vector`; after the instance is
   available, connect with `psql` and run `CREATE EXTENSION IF NOT EXISTS vector;`
   (same as Azure §5.3, using the `db_endpoint` output).
2. **Schema:** set `DATABASE_URL` from the `database_url` output and run
   `npm run db:push` (same as §5.4).
3. **Code:** deploy the built app to the Elastic Beanstalk environment with the
   EB CLI:
   ```bash
   npm install && npm run build
   eb init --region <region> <app_name>          # one time
   eb deploy <eb_environment_name>               # from terraform output
   ```
4. Sign in at the `app_url` output as `admin` using the `bootstrap_admin_password`
   output.

> Confirm the `eb_solution_stack` variable matches a currently-available Node.js
> 22 stack in your region:
> ```bash
> aws elasticbeanstalk list-available-solution-stacks \
>   --query "SolutionStacks[?contains(@,'Node.js 22')]"
> ```

---

## 8. Terraform state (important for real use)

By default Terraform stores state in a local `terraform.tfstate` file that
contains the generated secrets. For anything beyond a personal test, use a
remote, encrypted backend so state is shared and protected:

- **Azure:** an Azure Storage container backend (`azurerm` backend).
- **AWS:** an S3 bucket with a DynamoDB lock table (`s3` backend).

Add a `backend` block to the `terraform {}` section and re-run `terraform init`.
Never commit `terraform.tfstate` or a `terraform.tfvars` containing real keys —
both are already patterns to ignore.

---

## 9. Updating and tearing down

- **New app code:** re-run the deploy step only (`./deploy.sh` on Azure, `eb deploy`
  on AWS). No Terraform needed.
- **Infrastructure change** (bigger instance, new setting): edit the variable,
  run `terraform plan` then `terraform apply`.
- **Tear everything down:** `terraform destroy` (this deletes the database and all
  data — export anything you need first).

---

## 10. File map

```
deploy/terraform/
├── azure/
│   ├── main.tf                    # resource group, Postgres+pgvector, plan, web app
│   ├── variables.tf               # all config items
│   ├── outputs.tf                 # app URL + generated secrets
│   └── terraform.tfvars.example   # copy to terraform.tfvars and edit
└── aws/
    ├── main.tf                    # RDS+pgvector, Elastic Beanstalk, IAM
    ├── variables.tf
    ├── outputs.tf
    └── terraform.tfvars.example
```

The application code, and the `deploy.sh` / `migrate.sh` scripts that ship it,
live under `deploy/azure/` and the repo root and are unchanged by this guide.
