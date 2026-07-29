# Azure deployment scripts

Deploys Astra Agents to Azure App Service (Linux, Node 22) with an Azure
Database for PostgreSQL Flexible Server backend. Run from Git Bash, WSL, or
Azure Cloud Shell — plain `az` CLI + bash, no extra tooling required.

## Running from Azure Cloud Shell

Cloud Shell (shell.azure.com, or the `>_` icon in the Azure portal) comes
pre-authenticated as your Azure identity — `az` already works, no `az login`
needed (run `az account set --subscription "<name-or-id>"` only if
swarupd@nousinfo.com has more than one subscription and the default isn't
the right one). It does **not** already have this repo, though — Cloud Shell
has no automatic link to GitHub, so the first step is always a clone:

```bash
# Public repo — this just works:
git clone https://github.com/swarupd227/atlas-agent-platform.git
cd atlas-agent-platform

# Private repo — authenticate first, then clone:
gh auth login          # interactive device-code flow; Cloud Shell has gh preinstalled
gh repo clone swarupd227/atlas-agent-platform
cd atlas-agent-platform
```

Cloud Shell's `$HOME` persists between sessions (backed by an Azure File
Share created the first time you use it), so you only need to clone once —
next time you open Cloud Shell the folder is still there; just `cd` back in
and `git pull` to pick up new commits.

## Order of operations

```bash
cd deploy/azure
cp config.env.example config.env   # fill in your values
./provision.sh                     # one-time: create every resource + secrets + app settings
./deploy.sh                        # push the app code (run again after every commit you want live) --
                                    # this also applies any pending schema change, since the app
                                    # migrates itself on every restart (see migrate.sh below)
./verify.sh                        # confirm it's actually up
```

## Files

- `config.env.example` — copy to `config.env` and fill in (resource group, region, app name, LLM keys). `config.env` is gitignored — never commit it, it ends up holding real API keys once filled in.
- `provision.sh` — creates the resource group, Postgres Flexible Server (+ pgvector), App Service plan + Web App, generates the three production-required secrets (`JWT_SECRET`, `INTEGRATION_VAULT_KEY`, `AUDIT_SIGNING_PRIVATE_KEY`), wires up all app settings, and enables WebSockets/Always On. Safe to re-run — every step uses idempotent `az` commands (`create` calls no-op or update in place if the resource already exists).
- `deploy.sh` — builds the app locally (`npm install` + `npm run build`), prunes devDependencies, and zips the built artifact (`package.json`, `package-lock.json`, `dist/`, `node_modules/`) straight to the Web App via `az webapp deployment source config-zip`. **This is the actual deploy mechanism** — run it after every commit you want live.
- `migrate.sh` — **does not run `db:push`.** This app applies schema changes automatically on every boot via `runStartupMigrations()` in `server/db.ts` (idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements), so a normal `./deploy.sh` restart already migrates the database — there is usually nothing to run here. `drizzle-kit push` is unsafe against this database specifically: `knowledge_chunks.embedding` isn't declared in `shared/schema.ts` at all (it's created out-of-band by `ensurePgVector()` so drizzle-kit never manages it), so `db:push` always proposes dropping it, taking real pgvector embeddings with it. If you have a schema change that isn't covered by an existing startup migration, add an idempotent statement to `runStartupMigrations()` instead and just redeploy.
- `verify.sh` — opens the app URL, curls the health endpoint, and tails the last few minutes of App Service logs.
- `sync-local-data.sh` — copies data from your local Docker Postgres (`atlas-postgres`, used by `npm run dev`) into the Azure database, replacing whatever's there. Run this **locally** (Git Bash on your machine, not Cloud Shell) — it needs the local Docker container.
- `recover-secrets.sh` — rebuilds `config.env` and `.generated-secrets.env` from the live Azure app settings of an already-deployed app. Use this if a Cloud Shell session loses `$HOME` (or you're setting up a fresh machine) and you need to reconnect to an existing deployment — see "Recovering after losing local state" below.

## Recovering after losing local state

Cloud Shell's `$HOME` normally persists, but if a session ever comes up with no `atlas-agent-platform` directory at all (not just a stale working directory — the whole clone is gone), **do not just re-clone and run `provision.sh`**. Its secrets step only generates fresh values when `.generated-secrets.env` is missing, and a freshly generated `DB_PASSWORD`/`JWT_SECRET`/etc. won't match what's actually on the live Postgres server or already-issued sessions — pushing those as app settings breaks the working deployment. Instead:

```bash
cd ~
git clone https://github.com/swarupd227/atlas-agent-platform.git
cd atlas-agent-platform/deploy/azure
./recover-secrets.sh <resource-group> <app-name>
```

This reads the real secrets back out of the Web App's own app settings (which persist independently of Cloud Shell, since they live in Azure) and reconstructs `config.env`/`.generated-secrets.env` from them. Don't know your resource group/app name? `az webapp list --query "[].{name:name, rg:resourceGroup}" -o table`. After this, `deploy.sh`/`migrate.sh`/`verify.sh` work normally.

## Copying local data to the cloud

If you've built up demo data locally (via `npm run dev` against the `atlas-postgres` Docker container) and want the Azure deployment to have the same data:

```bash
cd deploy/azure
./sync-local-data.sh
```

This dumps the local database and restores it into Azure, replacing all existing cloud data (it prompts for confirmation first — this can't be undone). It uses `pg_dump`/`pg_restore` from inside the local Postgres container itself, so no Postgres client tools are needed on the host. Requires Docker Desktop running with the `atlas-postgres` container up, and the Azure Postgres firewall still open to your connection (the default `0.0.0.0-255.255.255.255` rule from `provision.sh`, or your current IP if you've since tightened it).

## Deploying future changes

Pull the latest code, then re-run `deploy.sh`:

```bash
git pull
cd deploy/azure
./deploy.sh
```

(GitHub-linked continuous deployment via `--manual-integration` was tried first but turned out unreliable in practice — the SCM container's git fetch from GitHub failed silently and near-instantly on every attempt, leaving `wwwroot` empty and the container stuck retrying `npm start` against a missing `package.json` until the platform's 230s startup timeout. Zip deploy with a server-side Oryx build was tried next, but Oryx's build kept failing to resolve devDependencies during `npm run build` (`Cannot find package '@vitejs/plugin-react'`) even with the documented `NPM_CONFIG_PRODUCTION=false` fix applied — the installed package count didn't change at all with that setting. `deploy.sh` now builds locally instead and ships the finished artifact, so Azure just runs `npm start` against it with no server-side build step at all.)

## What you'll be asked to fill in

`config.env.example` has placeholders for the two things a script can't generate for you: your Anthropic and OpenAI API keys. Everything else (secrets, resource names, connection strings) is generated or derived automatically by `provision.sh`.

## Notes

- Defaults are cost-conservative (`B1` App Service, `Burstable B1ms` Postgres) — fine to get running, not sized for production load. Scale up later with `az appservice plan update --sku` / a Postgres tier bump.
- The Postgres firewall is opened to all IPs by `provision.sh` so the whole flow works end-to-end without extra steps. Tighten this once you're past initial setup — see the comment in `provision.sh` for the exact command.
- Secrets land in Azure App Service application settings (encrypted at rest by Azure, but visible in plaintext to anyone with portal/CLI access to the Web App). Move them into Azure Key Vault with Key Vault references once the base deployment is verified — ask for that as a follow-up.
- If `provision.sh` errors with something like "MissingSubscriptionRegistration" on the Postgres or Web App creation step, the subscription hasn't registered that resource provider yet — run `az provider register --namespace Microsoft.DBforPostgreSQL` / `az provider register --namespace Microsoft.Web` and re-run `provision.sh` once registration finishes (`az provider show --namespace Microsoft.DBforPostgreSQL --query registrationState` to check status).
