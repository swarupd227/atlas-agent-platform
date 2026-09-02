# Loads everything the pack scripts need into the current shell.
#
#   source deploy/azure/env.sh
#
# MUST be sourced, not executed — a subshell would exit with the variables and
# leave the parent shell exactly as it was, which is the failure this file
# exists to stop. Cloud Shell drops $HOME and shell state regularly, so expect
# to run this at the start of every session.
#
# Reads the two files recover-secrets.sh writes. Both are gitignored, so a
# fresh clone never has them:
#   ./recover-secrets.sh astra-agents-rg astra-agents-artizent

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  echo "env.sh must be SOURCED, not executed:"
  echo "  source deploy/azure/env.sh"
  exit 1
fi

_env_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$_env_dir/config.env" ] || [ ! -f "$_env_dir/.generated-secrets.env" ]; then
  echo "Missing config.env or .generated-secrets.env in $_env_dir"
  echo "Rebuild them from the live Web App (never provision.sh, which mints fresh secrets):"
  echo "  cd $_env_dir && ./recover-secrets.sh astra-agents-rg astra-agents-artizent"
  return 1
fi

set -a
# shellcheck disable=SC1090
. "$_env_dir/config.env"
# shellcheck disable=SC1090
. "$_env_dir/.generated-secrets.env"
set +a

export APP_URL="${APP_URL:-https://${APP_NAME}.azurewebsites.net}"
export BASE_URL="$APP_URL"
export ADMIN_USER="${ADMIN_USER:-admin}"
export ADMIN_PASSWORD="$BOOTSTRAP_ADMIN_PASSWORD"
export DB_HOST="${DB_SERVER}.postgres.database.azure.com"
export DB_PORT="${DB_PORT:-5432}"
export DATABASE_URL="postgresql://${DB_ADMIN}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"

echo "Environment loaded:"
echo "  APP_URL   $APP_URL"
echo "  DB        $DB_HOST/$DB_NAME"
echo "  admin     $ADMIN_USER (password loaded)"

# The dealer role passwords are NOT derived — they are only known at the moment
# setup-pack-dataset.ts generates them. Say so plainly rather than letting a
# later script fail on an empty value.
if [ -z "${SUMMIT_READER_PASSWORD:-}" ] || [ -z "${SUMMIT_WRITER_PASSWORD:-}" ]; then
  echo ""
  echo "  Note: SUMMIT_READER_PASSWORD / SUMMIT_WRITER_PASSWORD are not set."
  echo "  Only needed to rebuild or reconnect the dealer dataset. To rotate both:"
  echo "    export SUMMIT_READER_PASSWORD=\"\$(openssl rand -base64 24 | tr -d '/+=')\""
  echo "    export SUMMIT_WRITER_PASSWORD=\"\$(openssl rand -base64 24 | tr -d '/+=')\""
  echo "    npx tsx scripts/setup-pack-dataset.ts && npx tsx scripts/connect-pack-dataset.ts"
fi

unset _env_dir
