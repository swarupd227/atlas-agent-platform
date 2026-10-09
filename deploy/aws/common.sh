#!/usr/bin/env bash

ASTRA_AWS_COMMON_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
AWS_BIN=${AWS_BIN:-aws}
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-$AWS_REGION}
ASTRA_STATE_ROOT=${ASTRA_STATE_ROOT:-$ASTRA_AWS_COMMON_DIR/state}

validate_deployment_id() {
  local deployment_id=${1:-}
  [[ "$deployment_id" =~ ^[a-z0-9][a-z0-9-]{0,11}$ ]]
}

require_commands() {
  local command_name
  for command_name in "$@"; do
    command -v "$command_name" >/dev/null 2>&1 || {
      printf 'ERROR: required command is not installed: %s\n' "$command_name" >&2
      return 1
    }
  done
}

deployment_names() {
  local deployment_id=$1
  validate_deployment_id "$deployment_id" || {
    printf 'ERROR: invalid deployment id: %s\n' "$deployment_id" >&2
    return 1
  }

  RESOURCE_PREFIX="astra-agents-$deployment_id"
  ENVIRONMENT="${deployment_id}-isolated"
  EC2_INSTANCE_NAME="${RESOURCE_PREFIX}-app"
  ECR_REPOSITORY="${RESOURCE_PREFIX}-app"
  APP_SECRET_NAME="astra-agents/${deployment_id}/app-env"
  ORIGIN_SECRET_NAME="astra-agents/${deployment_id}/cloudfront-origin"
  WAF_NAME="${RESOURCE_PREFIX}-cloudfront"
  WAF_LOG_GROUP="aws-waf-logs-${RESOURCE_PREFIX}-cloudfront"
  export RESOURCE_PREFIX ENVIRONMENT EC2_INSTANCE_NAME ECR_REPOSITORY
  export APP_SECRET_NAME ORIGIN_SECRET_NAME WAF_NAME WAF_LOG_GROUP
}

aws_cli() {
  "$AWS_BIN" "$@"
}

resolve_single_instance_id() {
  local deployment_id=$1
  local output
  local -a instance_ids=()

  deployment_names "$deployment_id"
  output=$(aws_cli ec2 describe-instances \
    --region "$AWS_REGION" \
    --filters \
      "Name=tag:Name,Values=$EC2_INSTANCE_NAME" \
      "Name=tag:Environment,Values=$ENVIRONMENT" \
      'Name=instance-state-name,Values=running' \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text)

  mapfile -t instance_ids < <(tr '\t' '\n' <<<"$output" | sed '/^[[:space:]]*$/d')
  if (( ${#instance_ids[@]} != 1 )); then
    printf 'ERROR: expected exactly one running instance for %s; found %s.\n' \
      "$deployment_id" "${#instance_ids[@]}" >&2
    return 1
  fi
  printf '%s\n' "${instance_ids[0]}"
}

init_state_dir() {
  local deployment_id=$1
  local state_dir

  validate_deployment_id "$deployment_id" || {
    printf 'ERROR: invalid deployment id: %s\n' "$deployment_id" >&2
    return 1
  }
  state_dir="$ASTRA_STATE_ROOT/$deployment_id"
  mkdir -p -- "$state_dir"
  chmod 0700 "$ASTRA_STATE_ROOT" "$state_dir"
  printf '%s\n' "$state_dir"
}

replace_json_secret_field() {
  local source_file=$1 target_file=$2 field_name=$3 field_value=$4
  local temporary_file="${target_file}.tmp.$$"

  jq -e --arg field "$field_name" --arg value "$field_value" '
    if (has($field) and (.[$field] | type == "string"))
    then .[$field] = $value
    else error("required string field is missing: " + $field)
    end
  ' "$source_file" >"$temporary_file" || {
    rm -f -- "$temporary_file"
    return 1
  }
  chmod 0600 "$temporary_file"
  mv -f -- "$temporary_file" "$target_file"
}

non_cloudfront_origin_rule_ids() {
  local rules_file=$1 prefix_list_id=$2 origin_port=$3
  jq -r --arg prefix "$prefix_list_id" --argjson port "$origin_port" '
    .SecurityGroupRules[]?
    | select(.IsEgress == false)
    | select(
        .IpProtocol == "-1" or
        (.IpProtocol == "tcp" and .FromPort <= $port and .ToPort >= $port)
      )
    | select(
        .IpProtocol != "tcp" or .FromPort != $port or .ToPort != $port or
        .PrefixListId != $prefix
      )
    | .SecurityGroupRuleId
  ' "$rules_file"
}

assert_only_cloudfront_origin_ingress() {
  local rules_file=$1 prefix_list_id=$2 origin_port=$3
  jq -e --arg prefix "$prefix_list_id" --argjson port "$origin_port" '
    [
      .SecurityGroupRules[]?
      | select(.IsEgress == false)
      | select(
          .IpProtocol == "-1" or
          (.IpProtocol == "tcp" and .FromPort <= $port and .ToPort >= $port)
        )
    ] as $origin_rules
    | ($origin_rules | length) == 1
      and $origin_rules[0].IpProtocol == "tcp"
      and $origin_rules[0].FromPort == $port
      and $origin_rules[0].ToPort == $port
      and $origin_rules[0].PrefixListId == $prefix
  ' "$rules_file" >/dev/null
}

security_group_rule_permission() {
  local rules_file=$1 rule_id=$2
  jq -e --arg id "$rule_id" '
    [.SecurityGroupRules[]? | select(.SecurityGroupRuleId == $id)]
    | if length != 1 then error("security-group rule not found") else .[0] end
    | . as $rule
    | [
        ({IpProtocol: $rule.IpProtocol}
        + (if $rule.IpProtocol == "-1" then {}
           else {FromPort: $rule.FromPort, ToPort: $rule.ToPort} end)
        + (if $rule.CidrIpv4 then
             {IpRanges: [({CidrIp: $rule.CidrIpv4}
               + (if $rule.Description then {Description: $rule.Description} else {} end))]}
           else {} end)
        + (if $rule.CidrIpv6 then
             {Ipv6Ranges: [({CidrIpv6: $rule.CidrIpv6}
               + (if $rule.Description then {Description: $rule.Description} else {} end))]}
           else {} end)
        + (if $rule.PrefixListId then
             {PrefixListIds: [({PrefixListId: $rule.PrefixListId}
               + (if $rule.Description then {Description: $rule.Description} else {} end))]}
           else {} end)
        + (if $rule.ReferencedGroupInfo then
             {UserIdGroupPairs: [
               ({GroupId: $rule.ReferencedGroupInfo.GroupId}
                + (if $rule.ReferencedGroupInfo.UserId then
                     {UserId: $rule.ReferencedGroupInfo.UserId} else {} end)
                + (if $rule.ReferencedGroupInfo.VpcId then
                     {VpcId: $rule.ReferencedGroupInfo.VpcId} else {} end)
                + (if $rule.ReferencedGroupInfo.VpcPeeringConnectionId then
                     {VpcPeeringConnectionId: $rule.ReferencedGroupInfo.VpcPeeringConnectionId}
                   else {} end)
                + (if $rule.Description then {Description: $rule.Description} else {} end))
             ]}
           else {} end))
      ]
  ' "$rules_file"
}
