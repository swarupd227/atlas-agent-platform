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
| `ASTRA_ALLOWED_PRIVATE_CIDRS` | Optional | Private address ranges the server may fetch from, e.g. `10.20.0.0/16,10.30.4.7@8443` (`@port` limits an entry to one port). Empty by default, so private addresses are refused. Loopback, link-local and cloud-metadata addresses can never be listed, and an invalid entry stops the server at boot. |
| `ASTRA_OUTBOUND_POLICY` | Default `audit` | How admin-configured targets (MCP servers, rest-proxy connectors, and the address saved on an enterprise connector such as Jira, SAP or NetSuite) are treated: `audit` logs what `enforce` would refuse and refuses nothing; `enforce` refuses private ranges not in `ASTRA_ALLOWED_PRIVATE_CIDRS` and loopback other than this server's own `PORT`; `off` does neither. URLs a person supplies are always enforced. |
| `ASTRA_LOCKDOWN` / `ASTRA_LOCKDOWN_FILE` | Optional | JSON (or a path to it) naming what this deployment does not allow at all: `marketplace`, `apiKeys.agent`, `apiKeys.publicApi`, `llmKeys: "env-only"`, `connectors.allow` (the connector types allowed: registry ids, `mcp`, `openapi`; others are not offered, created, edited or called, and are never deleted), `nativeTools.webSearch` / `nativeTools.codeExecution` / `nativeTools.documents` (`"off"` stops the tool being offered to a model or run, and refuses approving code execution on a skill). Read once at start-up and not changeable from the app; an invalid value stops the server. Unset restricts nothing. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (or `OTEL_EXPORTER_OTLP_ENDPOINT`), `OTEL_EXPORTER_OTLP_HEADERS` | Optional | Forward each run's span tree as OTLP over HTTP/JSON to an OpenTelemetry backend such as Datadog. Standard OTel variables; headers hold the API key (`dd-api-key=...`, or `OTEL_EXPORTER_OTLP_HEADERS_FILE` for a mounted secret). Unset sends nothing; an unusable value stops the server at boot. `ASTRA_OTLP_INCLUDE_ERRORS=true` also sends the error text of failed wire calls. Status at `GET /api/observability/export/status`. See `docs/OBSERVABILITY_EXPORT.md`. |
| `POST /api/audit-read-keys` (administrators) | Optional | Mints a read-only, organization-scoped key (shown once, expires, revocable) with which a SIEM pulls the signed audit log from `GET /api/v1/audit-events?after_seq=N`, and verifies it with the hashes and signatures each event carries. Closed by `apiKeys.publicApi: "off"` in the platform lockdown. See `docs/AUDIT_LOG_EXPORT.md`. |
| `ASTRA_SSO` / `ASTRA_SSO_FILE`, `ASTRA_SSO_CLIENT_SECRET` / `ASTRA_SSO_CLIENT_SECRET_FILE` | Optional | Let people sign in with Microsoft Entra ID (OpenID Connect with PKCE), beside the user name and password form, which stays. JSON names the tenant, client, redirect and an app-role-to-Astra-role map; the secret is separate. Roles are re-derived at every sign-in, people are identified by their Entra object id and never linked to a local account by e-mail, and `localLogin` can limit the form to administrators. Unset changes nothing; an unusable value stops the server at boot. See `docs/ENTRA_SSO.md`. |
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
