# Astra Agents

A multi-agent orchestration platform: agents and teams of agents run inside real industry context (ontologies, regulatory frameworks, knowledge bases) with governance built in — MCP tool integrations, DAG-orchestrated team workflows, human approval gates, and a full audit trail.

Live environment: [astra-agents-artizent.azurewebsites.net](https://astra-agents-artizent.azurewebsites.net)

## Quickstart (local)

```bash
npm install
cp .env.example .env   # fill in JWT_SECRET, INTEGRATION_VAULT_KEY, BOOTSTRAP_ADMIN_PASSWORD (see below)
npm run dev             # tsx server/index.ts, serves on :5000
```

On a completely fresh database, run `npm run db:push` once first — startup migrations (`runStartupMigrations()` in `server/db.ts`) only handle additive and pgvector changes after that, not the base schema.

Alternatively, run the self-host container: `docker-compose up` (a standalone `Dockerfile`, Node 22 on `bookworm-slim`, is also available for building the image without compose).

## Configuration

Copy `.env.example` to `.env` (git-ignored) and fill in:

| Variable | Required | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | Yes | Session/JWT signing secret. Generate with `openssl rand -hex 32`. |
| `INTEGRATION_VAULT_KEY` | Yes | Encrypts stored integration credentials (AES-256-GCM). Keep it stable — rotating it makes existing stored credentials undecryptable. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Yes | Seeds the `admin` user on an empty database only; ignored once users exist. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Default `astra`/`astra`/`astra` | Used by `docker-compose`'s bundled `db` service. |
| `DATABASE_URL` | Optional | Points at an external/managed Postgres instead; takes precedence over `POSTGRES_*`. Must support the pgvector extension. |
| `PORT` | Default `5000` | Port the app listens on. |
| `SECURITY_MODE` | Default `production` | `demo` bypasses auth entirely — never use it for a real deployment. |
| `ANTHROPIC_API_KEY` (or `AI_INTEGRATIONS_ANTHROPIC_API_KEY`) | Powers the agents | Either name is accepted. |
| `OPENAI_API_KEY` | Optional | Alternate model provider. |
| `GITHUB_TOKEN` | Optional | GitHub connector. |

## Deploying

Two equivalent paths ship code to Azure:

1. `deploy/azure/deploy.sh`, run from a fresh Cloud Shell — see [`deploy/azure/README.md`](deploy/azure/README.md) for the full provisioning and secrets-recovery story.
2. The `.github/workflows/deploy.yml` GitHub Action (`workflow_dispatch`), which needs the `AZURE_WEBAPP_PUBLISH_PROFILE` repository secret.

Schema changes are **not** deployed by `migrate.sh` (it applies nothing) — they go through `runStartupMigrations()` and apply on the restart a deploy triggers.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Local dev server (`tsx server/index.ts`) |
| `npm run build` | Production build (`script/build.ts`) |
| `npm start` | Run the production build (`dist/index.cjs`) |
| `npm run check` | TypeScript check |
| `npm run db:push` | Push the Drizzle schema (init only — see `deploy/azure/README.md`) |
| `npm run lint:a11y` | Accessibility lint on `client/src` |

## This is a public repository

Treat any pushed security fix as disclosed until it is actually deployed — pair a security-relevant push with an immediate deploy rather than leaving it to a later batch.

## Further reading

- [`deploy/azure/README.md`](deploy/azure/README.md) — full Azure provisioning, deploy, and secrets-recovery reference.
- [`.env.example`](.env.example) — the source of truth for every environment variable this app reads.
