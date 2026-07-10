# Azure deployment scripts

Deploys Astra Agents to Azure App Service (Linux, Node 22) with an Azure
Database for PostgreSQL Flexible Server backend. Run from Git Bash, WSL, or
Azure Cloud Shell — plain `az` CLI + bash, no extra tooling required.

## Order of operations

```bash
az login --username swarupd@nousinfo.com

cd deploy/azure
cp config.env.example config.env   # fill in your values
./provision.sh                     # one-time: create every resource + secrets + app settings
./migrate.sh                       # run once now, and again after every schema change
./verify.sh                        # confirm it's actually up
```

## Files

- `config.env.example` — copy to `config.env` and fill in (resource group, region, app name, LLM keys). `config.env` is gitignored — never commit it, it ends up holding real API keys once filled in.
- `provision.sh` — creates the resource group, Postgres Flexible Server (+ pgvector), App Service plan + Web App, generates the three production-required secrets (`JWT_SECRET`, `INTEGRATION_VAULT_KEY`, `AUDIT_SIGNING_PRIVATE_KEY`), wires up all app settings, enables WebSockets/Always On, and points the Web App at this GitHub repo for continuous deployment. Safe to re-run — every step uses idempotent `az` commands (`create` calls no-op or update in place if the resource already exists).
- `migrate.sh` — runs `npm run db:push` against the deployed database. Re-run this after every commit that changes `shared/schema.ts`.
- `verify.sh` — opens the app URL, curls the health endpoint, and tails the last few minutes of App Service logs.

## What you'll be asked to fill in

`config.env.example` has placeholders for the two things a script can't generate for you: your Anthropic and OpenAI API keys. Everything else (secrets, resource names, connection strings) is generated or derived automatically by `provision.sh`.

## Notes

- Defaults are cost-conservative (`B1` App Service, `Burstable B1ms` Postgres) — fine to get running, not sized for production load. Scale up later with `az appservice plan update --sku` / a Postgres tier bump.
- The Postgres firewall is opened to all IPs by `provision.sh` so the whole flow works end-to-end without extra steps. Tighten this once you're past initial setup — see the comment in `provision.sh` for the exact command.
- Secrets land in Azure App Service application settings (encrypted at rest by Azure, but visible in plaintext to anyone with portal/CLI access to the Web App). Move them into Azure Key Vault with Key Vault references once the base deployment is verified — ask for that as a follow-up.
