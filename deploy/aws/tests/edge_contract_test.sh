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

direct_probe_source=$(sed -n '/direct_status=/,+2p' "$operation_source")
if grep -Fq -- "--noproxy '*'" <<<"$direct_probe_source"; then
  pass 'direct ALB verification bypasses ambient HTTP proxies'
else
  fail 'direct ALB verification bypasses ambient HTTP proxies'
fi

if grep -Fq 'if [[ -e "$edge_state" ]]' "$operation_source" &&
   grep -Fq 'export EDGE_STAGE=listener-rule-created' "$operation_source" &&
   grep -Fq 'export ORIGIN_RULE_ARN=%q' "$operation_source" &&
   grep -Fq 'non_cloudfront_origin_rule_ids' "$operation_source" &&
   grep -Fq 'assert_only_cloudfront_origin_ingress' "$operation_source"; then
  pass 'partial edge state cannot be overwritten and all alternate ingress is rejected'
else
  fail 'partial edge state cannot be overwritten and all alternate ingress is rejected'
fi

rollback_source=$(sed -n '/^rollback_edge()/,/^rotate_jwt()/p' "$operation_source")
if grep -Fq 'security_group_rule_permission' <<<"$rollback_source" &&
  grep -Fq 'security-group-before.json' <<<"$rollback_source" &&
  grep -Fq 'CLOUDFRONT_INGRESS_CREATED' <<<"$rollback_source" &&
  ! grep -Fq 'Temporary rollback HTTP access' <<<"$rollback_source"; then
  pass 'edge rollback restores captured ingress without opening public HTTP'
else
  fail 'edge rollback restores captured ingress without opening public HTTP'
fi

rotate_source=$(sed -n '/^rotate_jwt()/,/^rollback_jwt()/p' "$operation_source")
rotate_instance_line=$(grep -n -m1 'resolve_single_instance_id' <<<"$rotate_source" | cut -d: -f1 || true)
rotate_secret_line=$(grep -n -m1 'put-secret-value' <<<"$rotate_source" | cut -d: -f1 || true)
if [[ -n "$rotate_instance_line" && -n "$rotate_secret_line" ]] &&
   (( rotate_instance_line < rotate_secret_line )) &&
   grep -Fq 'target group does not contain exactly the resolved deployment instance' "$operation_source"; then
  pass 'JWT and edge mutations require exact-instance preflight'
else
  fail 'JWT and edge mutations require exact-instance preflight'
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
