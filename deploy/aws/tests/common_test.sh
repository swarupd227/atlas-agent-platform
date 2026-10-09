#!/usr/bin/env bash
set -Eeuo pipefail

TEST_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
AWS_DIR=$(cd -- "$TEST_DIR/.." && pwd)

# shellcheck source=../common.sh
source "$AWS_DIR/common.sh"

failures=0

fail() {
  printf 'not ok - %s\n' "$1" >&2
  failures=$((failures + 1))
}

pass() {
  printf 'ok - %s\n' "$1"
}

assert_success() {
  local name=$1
  shift
  if "$@" >/dev/null 2>&1; then pass "$name"; else fail "$name"; fi
}

assert_failure() {
  local name=$1
  shift
  if "$@" >/dev/null 2>&1; then fail "$name"; else pass "$name"; fi
}

assert_success 'accepts a valid deployment id' validate_deployment_id demo-2
assert_failure 'rejects an uppercase deployment id' validate_deployment_id Demo
assert_failure 'rejects a deployment id longer than twelve characters' validate_deployment_id thirteen-chars
assert_failure 'rejects a deployment id with shell metacharacters' validate_deployment_id 'demo;id'

assert_success 'finds installed prerequisites' require_commands bash printf
assert_failure 'rejects a missing prerequisite' require_commands astra-command-that-does-not-exist

tmp_dir=$(mktemp -d)
trap 'rm -rf -- "$tmp_dir"' EXIT

fake_aws="$tmp_dir/aws"
cat >"$fake_aws" <<'FAKE_AWS'
#!/usr/bin/env bash
case "${FAKE_AWS_RESULT:-single}" in
  none) exit 0 ;;
  single) printf 'i-0123456789abcdef0\n' ;;
  multiple) printf 'i-0123456789abcdef0\ti-0fedcba9876543210\n' ;;
esac
FAKE_AWS
chmod +x "$fake_aws"
export AWS_BIN="$fake_aws"
export AWS_REGION=us-east-1

export FAKE_AWS_RESULT=single
instance_id=$(resolve_single_instance_id demo)
if [[ "$instance_id" == i-0123456789abcdef0 ]]; then
  pass 'returns the only tagged running instance'
else
  fail 'returns the only tagged running instance'
fi

export FAKE_AWS_RESULT=none
assert_failure 'rejects zero matching instances' resolve_single_instance_id demo

export FAKE_AWS_RESULT=multiple
assert_failure 'rejects multiple matching instances' resolve_single_instance_id demo

export ASTRA_STATE_ROOT="$tmp_dir/state"
sentinel="$tmp_dir/unrelated"
printf 'keep\n' >"$sentinel"
state_dir=$(init_state_dir demo)
expected_state_dir="$ASTRA_STATE_ROOT/demo"
if [[ "$state_dir" == "$expected_state_dir" && -d "$state_dir" ]]; then
  pass 'creates state only inside the deployment directory'
else
  fail 'creates state only inside the deployment directory'
fi

if [[ "$(stat -c '%a' "$state_dir")" == 700 && "$(<"$sentinel")" == keep ]]; then
  pass 'uses private state permissions without touching siblings'
else
  fail 'uses private state permissions without touching siblings'
fi

cat >"$tmp_dir/sg-rules.json" <<'JSON'
{
  "SecurityGroupRules": [
    {"SecurityGroupRuleId":"allow-cf","IsEgress":false,"IpProtocol":"tcp","FromPort":80,"ToPort":80,"PrefixListId":"pl-cloudfront"},
    {"SecurityGroupRuleId":"public-v4","IsEgress":false,"IpProtocol":"tcp","FromPort":80,"ToPort":80,"CidrIpv4":"0.0.0.0/0"},
    {"SecurityGroupRuleId":"public-v6","IsEgress":false,"IpProtocol":"tcp","FromPort":0,"ToPort":443,"CidrIpv6":"::/0"},
    {"SecurityGroupRuleId":"all-protocols","IsEgress":false,"IpProtocol":"-1","CidrIpv4":"10.0.0.0/8"},
    {"SecurityGroupRuleId":"source-sg","IsEgress":false,"IpProtocol":"tcp","FromPort":80,"ToPort":80,"Description":"corporate proxy","ReferencedGroupInfo":{"GroupId":"sg-source","UserId":"964604400233"}},
    {"SecurityGroupRuleId":"ssh-only","IsEgress":false,"IpProtocol":"tcp","FromPort":22,"ToPort":22,"CidrIpv4":"0.0.0.0/0"},
    {"SecurityGroupRuleId":"egress","IsEgress":true,"IpProtocol":"-1","CidrIpv4":"0.0.0.0/0"}
  ]
}
JSON
mapfile -t unsafe_rules < <(non_cloudfront_origin_rule_ids \
  "$tmp_dir/sg-rules.json" pl-cloudfront 80)
if [[ "${unsafe_rules[*]}" == 'public-v4 public-v6 all-protocols source-sg' ]]; then
  pass 'finds every non-CloudFront rule that permits the origin port'
else
  fail 'finds every non-CloudFront rule that permits the origin port'
fi
if assert_only_cloudfront_origin_ingress "$tmp_dir/sg-rules.json" pl-cloudfront 80; then
  fail 'rejects mixed origin ingress'
else
  pass 'rejects mixed origin ingress'
fi
jq '{SecurityGroupRules:[.SecurityGroupRules[0],.SecurityGroupRules[5],.SecurityGroupRules[6]]}' \
  "$tmp_dir/sg-rules.json" >"$tmp_dir/sg-rules-safe.json"
assert_success 'accepts only exact CloudFront origin ingress' \
  assert_only_cloudfront_origin_ingress "$tmp_dir/sg-rules-safe.json" pl-cloudfront 80

if security_group_rule_permission "$tmp_dir/sg-rules.json" source-sg |
  jq -e '.[0].IpProtocol == "tcp" and .[0].FromPort == 80 and
    .[0].UserIdGroupPairs[0].GroupId == "sg-source" and
    .[0].UserIdGroupPairs[0].UserId == "964604400233" and
    .[0].UserIdGroupPairs[0].Description == "corporate proxy"' >/dev/null; then
  pass 'reconstructs original source-security-group ingress for rollback'
else
  fail 'reconstructs original source-security-group ingress for rollback'
fi

if (( failures != 0 )); then
  printf '%s test(s) failed\n' "$failures" >&2
  exit 1
fi
