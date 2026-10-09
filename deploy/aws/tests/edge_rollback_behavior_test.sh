#!/usr/bin/env bash
set -Eeuo pipefail

TEST_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
AWS_DIR=$(cd -- "$TEST_DIR/.." && pwd)

failures=0
fail() { printf 'not ok - %s\n' "$1" >&2; failures=$((failures + 1)); }
pass() { printf 'ok - %s\n' "$1"; }

tmp_dir=$(mktemp -d)
trap 'rm -rf -- "$tmp_dir"' EXIT

fake_aws="$tmp_dir/aws"
cat >"$fake_aws" <<'FAKE_AWS'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$FAKE_AWS_LOG"
case "$1 $2" in
  'sts get-caller-identity') printf '964604400233\n' ;;
  'ec2 describe-security-group-rules')
    printf '%s\n' '{"SecurityGroupRules":[{"SecurityGroupRuleId":"cf-current","IsEgress":false,"IpProtocol":"tcp","FromPort":80,"ToPort":80,"PrefixListId":"pl-cloudfront"}]}'
    ;;
  'ec2 authorize-security-group-ingress')
    permission_file=''
    while (( $# )); do
      if [[ "$1" == --ip-permissions ]]; then permission_file=${2#file://}; break; fi
      shift
    done
    jq -c '.' "$permission_file" >>"$FAKE_AUTH_LOG"
    ;;
  'ec2 revoke-security-group-ingress') exit 0 ;;
  'elbv2 modify-listener'|'elbv2 delete-rule') exit 0 ;;
  'cloudfront get-distribution-config')
    printf '%s\n' '{"ETag":"current-etag","DistributionConfig":{"CallerReference":"current"}}'
    ;;
  'cloudfront update-distribution'|'cloudfront wait') exit 0 ;;
  'cloudfront get-distribution') printf 'rollback.example.test\n' ;;
  *) printf 'Unexpected fake AWS call: %s\n' "$*" >&2; exit 64 ;;
esac
FAKE_AWS
chmod +x "$fake_aws"

fake_curl="$tmp_dir/curl"
cat >"$fake_curl" <<'FAKE_CURL'
#!/usr/bin/env bash
exit 0
FAKE_CURL
chmod +x "$fake_curl"

export AWS_BIN="$fake_aws"
export CURL_BIN="$fake_curl"
export FAKE_AWS_LOG="$tmp_dir/aws.log"
export FAKE_AUTH_LOG="$tmp_dir/authorized.jsonl"
export ASTRA_STATE_ROOT="$tmp_dir/state"
export AWS_REGION=us-east-1

state_dir="$ASTRA_STATE_ROOT/demo"
mkdir -p "$state_dir"
cat >"$state_dir/security-group-before.json" <<'JSON'
{
  "SecurityGroupRules": [
    {"SecurityGroupRuleId":"cf-original","IsEgress":false,"IpProtocol":"tcp","FromPort":80,"ToPort":80,"PrefixListId":"pl-cloudfront"},
    {"SecurityGroupRuleId":"ipv4-original","IsEgress":false,"IpProtocol":"tcp","FromPort":80,"ToPort":80,"CidrIpv4":"203.0.113.0/24","Description":"office IPv4"},
    {"SecurityGroupRuleId":"ipv6-original","IsEgress":false,"IpProtocol":"tcp","FromPort":0,"ToPort":443,"CidrIpv6":"2001:db8::/64","Description":"office IPv6"},
    {"SecurityGroupRuleId":"all-original","IsEgress":false,"IpProtocol":"-1","CidrIpv4":"10.0.0.0/8"},
    {"SecurityGroupRuleId":"source-original","IsEgress":false,"IpProtocol":"tcp","FromPort":80,"ToPort":80,"ReferencedGroupInfo":{"GroupId":"sg-source","UserId":"964604400233"},"Description":"proxy SG"},
    {"SecurityGroupRuleId":"prefix-original","IsEgress":false,"IpProtocol":"tcp","FromPort":80,"ToPort":80,"PrefixListId":"pl-corporate","Description":"corporate prefix"}
  ]
}
JSON
cat >"$state_dir/listener-before.json" <<'JSON'
{"Listeners":[{"ListenerArn":"arn:aws:elasticloadbalancing:us-east-1:964604400233:listener/app/test/one/two","DefaultActions":[{"Type":"forward","TargetGroupArn":"arn:aws:elasticloadbalancing:us-east-1:964604400233:targetgroup/test/one"}]}]}
JSON
cat >"$state_dir/distribution-before.json" <<'JSON'
{"ETag":"before-etag","DistributionConfig":{"CallerReference":"before"}}
JSON

write_edge_state() {
  local ingress_created=$1
  cat >"$state_dir/edge-state.env" <<EOF
export EDGE_STAGE=complete
export CLOUDFRONT_DISTRIBUTION_ID=E123TEST
export ALB_SECURITY_GROUP_ID=sg-test
export HTTP_LISTENER_ARN=arn:aws:elasticloadbalancing:us-east-1:964604400233:listener/app/test/one/two
export ORIGIN_RULE_ARN=arn:aws:elasticloadbalancing:us-east-1:964604400233:listener-rule/app/test/one/two/three
export CLOUDFRONT_PREFIX_LIST_ID=pl-cloudfront
export CLOUDFRONT_INGRESS_CREATED=$ingress_created
EOF
}

: >"$FAKE_AWS_LOG"
: >"$FAKE_AUTH_LOG"
write_edge_state true
if "$AWS_DIR/operate.sh" rollback-edge --deployment-id demo >/dev/null; then
  pass 'edge rollback completes against captured state'
else
  fail 'edge rollback completes against captured state'
fi

if jq -s -e '
  length == 5 and
  any(.[]; .[0].IpRanges[0].CidrIp == "203.0.113.0/24") and
  any(.[]; .[0].Ipv6Ranges[0].CidrIpv6 == "2001:db8::/64") and
  any(.[]; .[0].IpProtocol == "-1" and (.[0] | has("FromPort") | not)) and
  any(.[]; .[0].UserIdGroupPairs[0].GroupId == "sg-source") and
  any(.[]; .[0].PrefixListIds[0].PrefixListId == "pl-corporate") and
  all(.[]; ([.. | strings] | index("0.0.0.0/0")) == null)
' "$FAKE_AUTH_LOG" >/dev/null; then
  pass 'rollback restores every captured ingress shape without public HTTP'
else
  fail 'rollback restores every captured ingress shape without public HTTP'
fi

authorize_line=$(grep -n -m1 'ec2 authorize-security-group-ingress' "$FAKE_AWS_LOG" | cut -d: -f1 || true)
listener_line=$(grep -n -m1 'elbv2 modify-listener' "$FAKE_AWS_LOG" | cut -d: -f1 || true)
if [[ -n "$authorize_line" && -n "$listener_line" ]] && (( authorize_line < listener_line )); then
  pass 'rollback restores ingress before reopening the listener'
else
  fail 'rollback restores ingress before reopening the listener'
fi

if grep -Fq 'ec2 revoke-security-group-ingress' "$FAKE_AWS_LOG" &&
  grep -Fq -- '--security-group-rule-ids cf-current' "$FAKE_AWS_LOG"; then
  pass 'rollback removes the CloudFront ingress rule when hardening created it'
else
  fail 'rollback removes the CloudFront ingress rule when hardening created it'
fi

: >"$FAKE_AWS_LOG"
write_edge_state false
if "$AWS_DIR/operate.sh" rollback-edge --deployment-id demo >/dev/null &&
  ! grep -Fq 'ec2 revoke-security-group-ingress' "$FAKE_AWS_LOG"; then
  pass 'rollback preserves a pre-existing CloudFront ingress rule'
else
  fail 'rollback preserves a pre-existing CloudFront ingress rule'
fi

if (( failures != 0 )); then
  printf '%s test(s) failed\n' "$failures" >&2
  exit 1
fi
