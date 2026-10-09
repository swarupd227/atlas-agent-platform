#!/usr/bin/env bash
set -Eeuo pipefail

TEST_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
AWS_DIR=$(cd -- "$TEST_DIR/.." && pwd)
# shellcheck source=../common.sh
source "$AWS_DIR/common.sh"

failures=0
fail() { printf 'not ok - %s\n' "$1" >&2; failures=$((failures + 1)); }
pass() { printf 'ok - %s\n' "$1"; }

tmp_dir=$(mktemp -d)
trap 'rm -rf -- "$tmp_dir"' EXIT

old_secret="$tmp_dir/old.json"
new_secret="$tmp_dir/new.json"
cat >"$old_secret" <<'JSON'
{
  "DATABASE_URL": "postgresql://unchanged",
  "JWT_SECRET": "azure-value-must-change",
  "BOOTSTRAP_ADMIN_PASSWORD": "unchanged-password",
  "INTEGRATION_VAULT_KEY": "unchanged-vault",
  "AUDIT_SIGNING_PRIVATE_KEY": "unchanged-audit",
  "OPENAI_API_KEY": "unchanged-openai"
}
JSON

if declare -F replace_json_secret_field >/dev/null &&
   replace_json_secret_field "$old_secret" "$new_secret" JWT_SECRET aws-only-value; then
  pass 'JSON secret field replacement is available'
else
  fail 'JSON secret field replacement is available'
fi

if [[ -s "$new_secret" ]] &&
   jq -e --slurp '
     (.[0] | del(.JWT_SECRET)) == (.[1] | del(.JWT_SECRET)) and
     .[0].JWT_SECRET == "azure-value-must-change" and
     .[1].JWT_SECRET == "aws-only-value"
   ' "$old_secret" "$new_secret" >/dev/null; then
  pass 'JWT rotation changes only JWT_SECRET'
else
  fail 'JWT rotation changes only JWT_SECRET'
fi

waf_rules="$AWS_DIR/waf-rules.json"
if [[ -f "$waf_rules" ]] && jq -e '
  ([.[] | select(.Statement.ManagedRuleGroupStatement.Name == "AWSManagedRulesAmazonIpReputationList")][0].OverrideAction.None != null) and
  ([.[] | select(.Statement.ManagedRuleGroupStatement.Name == "AWSManagedRulesCommonRuleSet")][0].OverrideAction.Count != null) and
  ([.[] | select(.Statement.ManagedRuleGroupStatement.Name == "AWSManagedRulesKnownBadInputsRuleSet")][0].OverrideAction.Count != null) and
  ([.[] | select(.Statement.RateBasedStatement != null)][0].Action.Count != null)
' "$waf_rules" >/dev/null; then
  pass 'WAF blocks IP reputation and stages other rules in count mode'
else
  fail 'WAF blocks IP reputation and stages other rules in count mode'
fi

operation_source="$AWS_DIR/operate.sh"
line_number() {
  local pattern=$1
  grep -n -m1 -- "$pattern" "$operation_source" | cut -d: -f1
}

update_line=$(line_number 'cloudfront update-distribution' || true)
wait_line=$(line_number 'cloudfront wait distribution-deployed' || true)
cloudfront_health_line=$(line_number 'CloudFront health verification failed' || true)
listener_lock_line=$(line_number 'elbv2 modify-listener' || true)
ingress_revoke_line=$(line_number 'ec2 revoke-security-group-ingress' || true)

if [[ -n "$update_line" && -n "$wait_line" && -n "$cloudfront_health_line" &&
      -n "$listener_lock_line" && -n "$ingress_revoke_line" ]] &&
   (( update_line < wait_line && wait_line < cloudfront_health_line &&
      cloudfront_health_line < listener_lock_line && listener_lock_line < ingress_revoke_line )); then
  pass 'edge hardening order keeps CloudFront healthy before closing ALB access'
else
  fail 'edge hardening order keeps CloudFront healthy before closing ALB access'
fi

if grep -Fq 'direct_status' "$operation_source" &&
   grep -Fq '[[ "$direct_status" == 403 ]]' "$operation_source" &&
   grep -Fq 'distribution-before.json' "$operation_source" &&
   grep -Fq 'listener-before.json' "$operation_source"; then
  pass 'edge operation verifies direct rejection and captures rollback state'
else
  fail 'edge operation verifies direct rejection and captures rollback state'
fi

help_output=$($AWS_DIR/operate.sh help 2>&1 || true)
if grep -Fq 'harden-edge' <<<"$help_output" &&
   grep -Fq 'rotate-jwt' <<<"$help_output"; then
  pass 'edge hardening and JWT rotation are documented operations'
else
  fail 'edge hardening and JWT rotation are documented operations'
fi

if (( failures != 0 )); then
  printf '%s test(s) failed\n' "$failures" >&2
  exit 1
fi
