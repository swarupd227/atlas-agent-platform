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
./migrate.sh                       # run once now, and again after every schema change
./verify.sh                        # confirm it's actually up
```

## Files

- `config.env.example` — copy to `config.env` and fill in (resource group, region, app name, LLM keys). `config.env` is gitignored — never commit it, it ends up holding real API keys once filled in.
- `provision.sh` — creates the resource group, Postgres Flexible Server (+ pgvector), App Service plan + Web App, generates the three production-required secrets (`JWT_SECRET`, `INTEGRATION_VAULT_KEY`, `AUDIT_SIGNING_PRIVATE_KEY`), wires up all app settings, enables WebSockets/Always On, and points the Web App at this GitHub repo for continuous deployment. Safe to re-run — every step uses idempotent `az` commands (`create` calls no-op or update in place if the resource already exists).
- `migrate.sh` — runs `npm run db:push` against the deployed database. Installs `node_modules` first if missing (so it works on a fresh Cloud Shell clone) and warns if the active Node is older than 18. Re-run this after every commit that changes `shared/schema.ts`.
- `verify.sh` — opens the app URL, curls the health endpoint, and tails the last few minutes of App Service logs.

## What you'll be asked to fill in

`config.env.example` has placeholders for the two things a script can't generate for you: your Anthropic and OpenAI API keys. Everything else (secrets, resource names, connection strings) is generated or derived automatically by `provision.sh`.

## Notes

- Defaults are cost-conservative (`B1` App Service, `Burstable B1ms` Postgres) — fine to get running, not sized for production load. Scale up later with `az appservice plan update --sku` / a Postgres tier bump.
- The Postgres firewall is opened to all IPs by `provision.sh` so the whole flow works end-to-end without extra steps. Tighten this once you're past initial setup — see the comment in `provision.sh` for the exact command.
- Secrets land in Azure App Service application settings (encrypted at rest by Azure, but visible in plaintext to anyone with portal/CLI access to the Web App). Move them into Azure Key Vault with Key Vault references once the base deployment is verified — ask for that as a follow-up.
- If `provision.sh` errors with something like "MissingSubscriptionRegistration" on the Postgres or Web App creation step, the subscription hasn't registered that resource provider yet — run `az provider register --namespace Microsoft.DBforPostgreSQL` / `az provider register --namespace Microsoft.Web` and re-run `provision.sh` once registration finishes (`az provider show --namespace Microsoft.DBforPostgreSQL --query registrationState` to check status).
