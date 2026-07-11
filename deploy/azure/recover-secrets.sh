#!/usr/bin/env bash
# Rebuilds config.env and .generated-secrets.env from the CURRENTLY DEPLOYED
# Azure app settings -- for when a Cloud Shell session's $HOME is lost (or
# you're on a new machine) and you need to reconnect to an
# already-provisioned deployment WITHOUT regenerating secrets.
#
# Never just re-run provision.sh after losing local state: its secrets step
# only generates fresh values when .generated-secrets.env is missing, which
# it now is -- a fresh DB_PASSWORD/JWT_SECRET/etc. wouldn't match what's
# actually on the live Postgres server (its password is fixed at server
# creation) or already-issued sessions, breaking the working deployment the
# moment those get pushed as app settings. This script reads the real
# values back out of the Web App's own app settings instead.
#
# Usage: ./recover-secrets.sh <resource-group> <app-name>
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Pulling latest from git..."
  git pull --ff-only || { echo "git pull failed -- resolve manually before continuing." >&2; exit 1; }
fi

RG="${1:-}"
APP_NAME="${2:-}"
if [ -z "$RG" ] || [ -z "$APP_NAME" ]; then
  echo "Usage: $0 <resource-group> <app-name>" >&2
  echo "" >&2
  echo "Not sure of the names? List your web apps:" >&2
  echo "  az webapp list --query \"[].{name:name, rg:resourceGroup}\" -o table" >&2
  exit 1
fi

echo "Reading current app settings from $APP_NAME..."
SETTINGS_FILE=$(mktemp)
az webapp config appsettings list --resource-group "$RG" --name "$APP_NAME" -o json > "$SETTINGS_FILE"
LOCATION=$(az webapp show --resource-group "$RG" --name "$APP_NAME" --query location -o tsv)
PLAN=$(basename "$(az webapp show --resource-group "$RG" --name "$APP_NAME" --query appServicePlanId -o tsv)")

python3 - "$SETTINGS_FILE" "$RG" "$LOCATION" "$PLAN" "$APP_NAME" <<'PYEOF'
import json, sys
from urllib.parse import urlparse

settings_file, rg, location, plan, app_name = sys.argv[1:6]
with open(settings_file) as f:
    settings = {s["name"]: s["value"] for s in json.load(f)}

db_url = urlparse(settings["DATABASE_URL"])
db_server = db_url.hostname.split(".")[0]
db_name = db_url.path.lstrip("/").split("?")[0]
# Azure's `location` property sometimes comes back as a display name
# ("Central US") instead of the canonical slug ("centralus") the rest of
# these scripts expect (az ... --location, and it must exactly match what
# --location accepts). Normalize the same way Azure does internally.
location_slug = location.replace(" ", "").lower()

def q(v):
    # Quote every value -- a display name with a space (e.g. "Central US")
    # unquoted in config.env makes `source config.env` try to execute the
    # second word as a command.
    return "'" + str(v).replace("'", "'\\''") + "'"

with open("config.env", "w") as f:
    f.write(f"""RG={q(rg)}
LOCATION={q(location_slug)}
DB_SERVER={q(db_server)}
DB_NAME={q(db_name)}
DB_ADMIN={q(db_url.username)}
PLAN={q(plan)}
APP_NAME={q(app_name)}
ANTHROPIC_API_KEY={q(settings.get('ANTHROPIC_API_KEY', ''))}
OPENAI_API_KEY={q(settings.get('OPENAI_API_KEY', ''))}
""")

with open(".generated-secrets.env", "w") as f:
    f.write(f"""# Reconstructed from live Azure app settings by recover-secrets.sh -- keep this safe, never commit it.
DB_PASSWORD='{db_url.password}'
JWT_SECRET='{settings.get('JWT_SECRET', '')}'
INTEGRATION_VAULT_KEY='{settings.get('INTEGRATION_VAULT_KEY', '')}'
AUDIT_SIGNING_PRIVATE_KEY='{settings.get('AUDIT_SIGNING_PRIVATE_KEY', '')}'
ASTRA_PUBLIC_API_KEY='{settings.get('ASTRA_PUBLIC_API_KEY', '')}'
BOOTSTRAP_ADMIN_PASSWORD='{settings.get('BOOTSTRAP_ADMIN_PASSWORD', '')}'
""")

print("Wrote config.env and .generated-secrets.env from live Azure state.")
PYEOF

rm -f "$SETTINGS_FILE"
chmod 600 config.env .generated-secrets.env

echo ""
echo "Done. ./deploy.sh, ./migrate.sh, and ./verify.sh will now work normally."
echo "Do NOT run ./provision.sh unless you actually need to create new resources."
