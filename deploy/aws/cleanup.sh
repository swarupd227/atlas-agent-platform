#!/usr/bin/env bash
# Permanently deletes one complete, isolated Astra Agents AWS deployment.
# Azure is never accessed or modified.
set -Eeuo pipefail
umask 077
export AWS_PAGER=""
trap 'status=$?; printf "ERROR: full cleanup stopped at line %s (exit %s).\n" "$LINENO" "$status" >&2; exit "$status"' ERR

for required_command in aws jq tr sed grep; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'ERROR: required command is not installed: %s\n' "$required_command" >&2
    exit 1
  fi
done

show_phase() {
  printf '\n[%s] [Cleanup %s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2"
}

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REQUESTED_DEPLOYMENT_ID="${DEPLOYMENT_ID:-demo}"
if [[ ! "$REQUESTED_DEPLOYMENT_ID" =~ ^[a-z0-9][a-z0-9-]{0,11}$ ]]; then
  printf 'ERROR: DEPLOYMENT_ID must use 1-12 lowercase letters, numbers, or hyphens.\n' >&2
  exit 1
fi
ASTRA_STATE_ROOT="${ASTRA_STATE_ROOT:-$SCRIPT_DIR/state}"
STATE_FILE="$ASTRA_STATE_ROOT/$REQUESTED_DEPLOYMENT_ID/deployment-state.env"

if [[ ! -f "$STATE_FILE" ]]; then
  printf 'ERROR: state file not found: %s\n' "$STATE_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"
if [[ "$DEPLOYMENT_ID" != "$REQUESTED_DEPLOYMENT_ID" ]]; then
  printf 'ERROR: saved deployment ID does not match requested deployment ID.\n' >&2
  exit 1
fi

for required_variable in \
  AWS_REGION ACCOUNT_ID RESOURCE_PREFIX VPC_ID INSTANCE_ID EC2_INSTANCE_NAME \
  DB_INSTANCE_ID DB_SUBNET_GROUP RDS_MASTER_SECRET_ARN ALB_ARN ALB_DNS_NAME \
  TARGET_GROUP_ARN CLOUDFRONT_DISTRIBUTION_ID ECR_REPOSITORY APP_SECRET_ARN \
  SOURCE_SECRET_ARN EC2_ROLE_NAME INSTANCE_PROFILE_NAME LOG_GROUP \
  ORIGIN_SECRET_NAME WAF_NAME WAF_LOG_GROUP ALB_NAME TARGET_GROUP_NAME \
  APP_SECRET_NAME SOURCE_SECRET_NAME ENVIRONMENT; do
  if [[ -z "${!required_variable:-}" ]]; then
    printf 'ERROR: %s is missing from deployment state.\n' "$required_variable" >&2
    exit 1
  fi
done
export AWS_DEFAULT_REGION="$AWS_REGION"

EXPECTED_RESOURCE_PREFIX="astra-agents-$REQUESTED_DEPLOYMENT_ID"
EXPECTED_ENVIRONMENT="${REQUESTED_DEPLOYMENT_ID}-isolated"
[[ "$ACCOUNT_ID" == 964604400233 && "$AWS_REGION" == us-east-1 &&
   "$RESOURCE_PREFIX" == "$EXPECTED_RESOURCE_PREFIX" &&
   "$ENVIRONMENT" == "$EXPECTED_ENVIRONMENT" &&
   "$EC2_INSTANCE_NAME" == "${EXPECTED_RESOURCE_PREFIX}-app" &&
   "$DB_INSTANCE_ID" == "${EXPECTED_RESOURCE_PREFIX}-db" &&
   "$DB_SUBNET_GROUP" == "${EXPECTED_RESOURCE_PREFIX}-db-subnets" &&
   "$ALB_NAME" == "${EXPECTED_RESOURCE_PREFIX}-alb" &&
   "$TARGET_GROUP_NAME" == "${EXPECTED_RESOURCE_PREFIX}-tg" &&
   "$ECR_REPOSITORY" == "${EXPECTED_RESOURCE_PREFIX}-app" &&
   "$EC2_ROLE_NAME" == "${EXPECTED_RESOURCE_PREFIX}-role" &&
   "$INSTANCE_PROFILE_NAME" == "${EXPECTED_RESOURCE_PREFIX}-profile" &&
   "$LOG_GROUP" == "/ec2/${EXPECTED_RESOURCE_PREFIX}/app" &&
   "$APP_SECRET_NAME" == "astra-agents/${REQUESTED_DEPLOYMENT_ID}/app-env" &&
   "$SOURCE_SECRET_NAME" == "astra-agents/${REQUESTED_DEPLOYMENT_ID}/azure-source" &&
   "$ORIGIN_SECRET_NAME" == "astra-agents/${REQUESTED_DEPLOYMENT_ID}/cloudfront-origin" &&
   "$WAF_NAME" == "${EXPECTED_RESOURCE_PREFIX}-cloudfront" &&
   "$WAF_LOG_GROUP" == "aws-waf-logs-${EXPECTED_RESOURCE_PREFIX}-cloudfront" ]] || {
  printf 'ERROR: deployment state names do not match the requested isolated boundary.\n' >&2
  exit 1
}
[[ "$INSTANCE_ID" == i-* && "$VPC_ID" == vpc-* &&
   "$CLOUDFRONT_DISTRIBUTION_ID" =~ ^E[A-Z0-9]+$ &&
   "$ALB_ARN" == "arn:aws:elasticloadbalancing:${AWS_REGION}:${ACCOUNT_ID}:loadbalancer/app/${ALB_NAME}/"* &&
   "$TARGET_GROUP_ARN" == "arn:aws:elasticloadbalancing:${AWS_REGION}:${ACCOUNT_ID}:targetgroup/${TARGET_GROUP_NAME}/"* &&
   "$APP_SECRET_ARN" == "arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:${APP_SECRET_NAME}-"* &&
   "$SOURCE_SECRET_ARN" == "arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:${SOURCE_SECRET_NAME}-"* &&
   "$RDS_MASTER_SECRET_ARN" == "arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:rds!db-"* ]] || {
  printf 'ERROR: deployment state identifiers or ARNs are outside the approved account boundary.\n' >&2
  exit 1
}

show_phase "0/7" "Validate account and exact demo resource boundary"
CURRENT_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [[ "$CURRENT_ACCOUNT_ID" != "$ACCOUNT_ID" ]]; then
  printf 'ERROR: authenticated account %s does not match saved account %s.\n' \
    "$CURRENT_ACCOUNT_ID" "$ACCOUNT_ID" >&2
  exit 1
fi

ECR_ARN=$(aws ecr describe-repositories \
  --region "$AWS_REGION" --repository-names "$ECR_REPOSITORY" \
  --query 'repositories[0].repositoryArn' --output text)
aws ecr list-tags-for-resource --region "$AWS_REGION" --resource-arn "$ECR_ARN" \
  --output json | jq -e --arg environment "$ENVIRONMENT" '
    any(.tags[]?; .Key == "Application" and .Value == "astra-agents") and
    any(.tags[]?; .Key == "Environment" and .Value == $environment)
  ' >/dev/null || {
  printf 'ERROR: ECR repository ownership tags do not match this deployment.\n' >&2
  exit 1
}
aws iam list-role-tags --role-name "$EC2_ROLE_NAME" --output json |
  jq -e --arg environment "$ENVIRONMENT" '
    any(.Tags[]?; .Key == "Application" and .Value == "astra-agents") and
    any(.Tags[]?; .Key == "Environment" and .Value == $environment)
  ' >/dev/null || {
  printf 'ERROR: EC2 role ownership tags do not match this deployment.\n' >&2
  exit 1
}
for ownership_secret in "$APP_SECRET_ARN" "$SOURCE_SECRET_ARN" "$ORIGIN_SECRET_NAME"; do
  if secret_metadata=$(aws secretsmanager describe-secret \
    --region "$AWS_REGION" --secret-id "$ownership_secret" --output json 2>/dev/null); then
    jq -e --arg environment "$ENVIRONMENT" '
      any(.Tags[]?; .Key == "Application" and .Value == "astra-agents") and
      any(.Tags[]?; .Key == "Environment" and .Value == $environment)
    ' <<<"$secret_metadata" >/dev/null || {
      printf 'ERROR: secret ownership tags do not match this deployment: %s\n' \
        "$ownership_secret" >&2
      exit 1
    }
  fi
done

EXPECTED_VPC_NAME="${RESOURCE_PREFIX}-vpc"
ACTUAL_VPC_NAME=$(aws ec2 describe-vpcs \
  --region "$AWS_REGION" --vpc-ids "$VPC_ID" \
  --query 'Vpcs[0].Tags[?Key==`Name`].Value | [0]' --output text)
if [[ "$ACTUAL_VPC_NAME" != "$EXPECTED_VPC_NAME" ]]; then
  printf 'ERROR: VPC name %s does not match expected %s.\n' \
    "$ACTUAL_VPC_NAME" "$EXPECTED_VPC_NAME" >&2
  exit 1
fi

INSTANCE_STATE=$(aws ec2 describe-instances \
  --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].State.Name' --output text)
INSTANCE_NAME=$(aws ec2 describe-instances \
  --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].Tags[?Key==`Name`].Value|[0]' --output text)
INSTANCE_VPC_ID=$(aws ec2 describe-instances \
  --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].VpcId' --output text)
if [[ "$INSTANCE_NAME" != "$EC2_INSTANCE_NAME" ]]; then
  printf 'ERROR: saved EC2 instance name does not match the demo boundary.\n' >&2
  exit 1
fi
if [[ "$INSTANCE_STATE" == terminated ]]; then
  : # AWS clears VpcId after termination; the saved ID and Name remain validated.
elif [[ "$INSTANCE_VPC_ID" != "$VPC_ID" ]]; then
  printf 'ERROR: active EC2 instance is outside the saved demo VPC.\n' >&2
  exit 1
fi

RDS_EXISTS=false
if RDS_VPC_ID=$(aws rds describe-db-instances \
  --region "$AWS_REGION" --db-instance-identifier "$DB_INSTANCE_ID" \
  --query 'DBInstances[0].DBSubnetGroup.VpcId' --output text 2>/dev/null); then
  RDS_EXISTS=true
  if [[ "$RDS_VPC_ID" != "$VPC_ID" ]]; then
    printf 'ERROR: RDS is outside the saved demo VPC.\n' >&2
    exit 1
  fi
fi

ALB_EXISTS=false
if ALB_VPC_ID=$(aws elbv2 describe-load-balancers \
  --region "$AWS_REGION" --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].VpcId' --output text 2>/dev/null); then
  ALB_EXISTS=true
  if [[ "$ALB_VPC_ID" != "$VPC_ID" ]]; then
    printf 'ERROR: ALB is outside the saved demo VPC.\n' >&2
    exit 1
  fi
fi

CLOUDFRONT_EXISTS=false
if CLOUDFRONT_ORIGIN=$(aws cloudfront get-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --query 'Distribution.DistributionConfig.Origins.Items[0].DomainName' \
  --output text 2>/dev/null); then
  CLOUDFRONT_EXISTS=true
  if [[ "$CLOUDFRONT_ORIGIN" != "$ALB_DNS_NAME" ]]; then
    printf 'ERROR: CloudFront origin does not match the saved demo ALB.\n' >&2
    exit 1
  fi
fi

UNEXPECTED_EC2_COUNT=$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" \
    'Name=instance-state-name,Values=pending,running,stopping,stopped' \
  --query "length(Reservations[].Instances[?InstanceId!='$INSTANCE_ID'][] )" --output text)
UNEXPECTED_ALB_COUNT=$(aws elbv2 describe-load-balancers \
  --region "$AWS_REGION" \
  --query "length(LoadBalancers[?VpcId=='$VPC_ID' && LoadBalancerArn!='$ALB_ARN'])" \
  --output text)
UNEXPECTED_RDS_COUNT=$(aws rds describe-db-instances \
  --region "$AWS_REGION" \
  --query "length(DBInstances[?DBSubnetGroup.VpcId=='$VPC_ID' && DBInstanceIdentifier!='$DB_INSTANCE_ID'])" \
  --output text)
UNEXPECTED_RESOURCE_COUNT=$((UNEXPECTED_EC2_COUNT + UNEXPECTED_ALB_COUNT + UNEXPECTED_RDS_COUNT))
if (( UNEXPECTED_RESOURCE_COUNT != 0 )); then
  printf 'ERROR: demo VPC contains resources not recorded in demo state: EC2=%s ALB=%s RDS=%s.\n' \
    "$UNEXPECTED_EC2_COUNT" "$UNEXPECTED_ALB_COUNT" "$UNEXPECTED_RDS_COUNT" >&2
  exit 1
fi

printf 'AWS account: %s\nDeployment: %s\nVPC: %s (%s)\nEC2: %s\nRDS: %s\nCloudFront: %s\n' \
  "$ACCOUNT_ID" "$DEPLOYMENT_ID" "$VPC_ID" "$ACTUAL_VPC_NAME" \
  "$INSTANCE_ID" "$DB_INSTANCE_ID" "$CLOUDFRONT_DISTRIBUTION_ID"
printf 'WARNING: RDS will be permanently deleted without a final snapshot.\n'

confirmation="${CONFIRMATION:-}"
if [[ -z "$confirmation" ]]; then
  printf 'Type DELETE %s PERMANENTLY to continue: ' "$DEPLOYMENT_ID"
  read -r confirmation
fi
if [[ "$confirmation" != "DELETE $DEPLOYMENT_ID PERMANENTLY" ]]; then
  printf 'Cleanup cancelled.\n'
  exit 0
fi

wait_for_branch() {
  local branch_name=$1
  local branch_pid=$2
  local branch_status
  if wait "$branch_pid"; then
    printf '[%s] Deleted: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$branch_name"
    return 0
  else
    branch_status=$?
    printf 'ERROR: deletion branch failed: %s (exit %s).\n' \
      "$branch_name" "$branch_status" >&2
    return "$branch_status"
  fi
}

delete_waf_resources() {
  local waf_list waf_id waf_arn waf_lock
  waf_list=$(aws wafv2 list-web-acls \
    --region us-east-1 --scope CLOUDFRONT --output json)
  waf_id=$(jq -r --arg name "$WAF_NAME" \
    'first(.WebACLs[]? | select(.Name == $name) | .Id) // empty' <<<"$waf_list")
  waf_arn=$(jq -r --arg name "$WAF_NAME" \
    'first(.WebACLs[]? | select(.Name == $name) | .ARN) // empty' <<<"$waf_list")
  if [[ -n "$waf_id" && "$waf_id" != null ]]; then
    waf_lock=$(aws wafv2 get-web-acl \
      --region us-east-1 --scope CLOUDFRONT \
      --name "$WAF_NAME" --id "$waf_id" \
      --query LockToken --output text)
    aws wafv2 delete-logging-configuration \
      --region us-east-1 \
      --resource-arn "$waf_arn" \
      >/dev/null 2>&1 || true
    aws wafv2 delete-web-acl \
      --region us-east-1 --scope CLOUDFRONT \
      --name "$WAF_NAME" --id "$waf_id" --lock-token "$waf_lock"
  fi
  aws logs delete-log-group \
    --region us-east-1 --log-group-name "$WAF_LOG_GROUP" >/dev/null 2>&1 || true
}

delete_cloudfront_branch() {
  local config_file="$WORK_DIR/cloudfront-delete-config.json"
  local distribution_json etag enabled
  [[ "$CLOUDFRONT_EXISTS" == true ]] || return 0
  distribution_json=$(aws cloudfront get-distribution-config \
    --id "$CLOUDFRONT_DISTRIBUTION_ID")
  etag=$(jq -r .ETag <<<"$distribution_json")
  enabled=$(jq -r .DistributionConfig.Enabled <<<"$distribution_json")

  if [[ "$enabled" == true ]]; then
    jq '.DistributionConfig | .Enabled = false' <<<"$distribution_json" > "$config_file"
    aws cloudfront update-distribution \
      --id "$CLOUDFRONT_DISTRIBUTION_ID" \
      --if-match "$etag" \
      --distribution-config "file://$config_file" >/dev/null
    aws cloudfront wait distribution-deployed --id "$CLOUDFRONT_DISTRIBUTION_ID"
  fi

  distribution_json=$(aws cloudfront get-distribution-config \
    --id "$CLOUDFRONT_DISTRIBUTION_ID")
  etag=$(jq -r .ETag <<<"$distribution_json")
  aws cloudfront delete-distribution \
    --id "$CLOUDFRONT_DISTRIBUTION_ID" --if-match "$etag"

  for _ in $(seq 1 90); do
    if ! aws cloudfront get-distribution \
      --id "$CLOUDFRONT_DISTRIBUTION_ID" >/dev/null 2>&1; then
      rm -f "$config_file"
      delete_waf_resources
      return 0
    fi
    sleep 10
  done
  printf 'ERROR: CloudFront distribution still exists after 900 seconds.\n' >&2
  return 1
}

delete_ec2_branch() {
  local instance_state
  instance_state=$(aws ec2 describe-instances \
    --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].State.Name' --output text)
  [[ "$instance_state" != terminated ]] || return 0
  aws ec2 terminate-instances \
    --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" >/dev/null
  aws ec2 wait instance-terminated \
    --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
}

delete_rds_branch() {
  [[ "$RDS_EXISTS" == true ]] || return 0
  aws rds modify-db-instance \
    --region "$AWS_REGION" \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --no-deletion-protection --apply-immediately >/dev/null
  aws rds wait db-instance-available \
    --region "$AWS_REGION" --db-instance-identifier "$DB_INSTANCE_ID"
  aws rds delete-db-instance \
    --region "$AWS_REGION" \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --skip-final-snapshot --delete-automated-backups >/dev/null
  aws rds wait db-instance-deleted \
    --region "$AWS_REGION" --db-instance-identifier "$DB_INSTANCE_ID"
}

delete_target_group_with_retry() {
  local delete_error
  for _ in $(seq 1 60); do
    if ! aws elbv2 describe-target-groups \
      --region "$AWS_REGION" --target-group-arns "$TARGET_GROUP_ARN" \
      >/dev/null 2>&1; then
      return 0
    fi
    if delete_error=$(aws elbv2 delete-target-group \
      --region "$AWS_REGION" --target-group-arn "$TARGET_GROUP_ARN" 2>&1); then
      return 0
    fi
    if [[ "$delete_error" != *ResourceInUse* ]]; then
      printf '%s\n' "$delete_error" >&2
      return 1
    fi
    sleep 10
  done
  printf 'ERROR: target group remained in use after 600 seconds.\n' >&2
  return 1
}

delete_alb_branch() {
  if [[ "$ALB_EXISTS" == true ]]; then
    aws elbv2 delete-load-balancer \
      --region "$AWS_REGION" --load-balancer-arn "$ALB_ARN"
    aws elbv2 wait load-balancers-deleted \
      --region "$AWS_REGION" --load-balancer-arns "$ALB_ARN"
  fi
  delete_target_group_with_retry
}

show_phase "1/7" "Delete CloudFront, EC2, RDS, and ALB in parallel"
delete_cloudfront_branch &
CLOUDFRONT_PID=$!
delete_ec2_branch &
EC2_PID=$!
delete_rds_branch &
RDS_PID=$!
delete_alb_branch &
ALB_PID=$!

branch_status=0
wait_for_branch CloudFront "$CLOUDFRONT_PID" || branch_status=1
wait_for_branch EC2 "$EC2_PID" || branch_status=1
wait_for_branch RDS "$RDS_PID" || branch_status=1
wait_for_branch ALB "$ALB_PID" || branch_status=1
if (( branch_status != 0 )); then
  printf 'ERROR: one or more primary deletion branches failed; network deletion was not started.\n' >&2
  exit 1
fi

show_phase "2/7" "Delete database group, registry, secrets, IAM, and logs"
aws rds delete-db-subnet-group \
  --region "$AWS_REGION" --db-subnet-group-name "$DB_SUBNET_GROUP"

aws ecr delete-repository \
  --region "$AWS_REGION" --repository-name "$ECR_REPOSITORY" --force >/dev/null

delete_secret() {
  local secret_id=$1
  local deleted_date
  if ! deleted_date=$(aws secretsmanager describe-secret \
    --region "$AWS_REGION" --secret-id "$secret_id" \
    --query DeletedDate --output text 2>/dev/null); then
    return 0
  fi
  if [[ "$deleted_date" != None ]]; then
    aws secretsmanager restore-secret \
      --region "$AWS_REGION" --secret-id "$secret_id" >/dev/null
  fi
  aws secretsmanager delete-secret \
    --region "$AWS_REGION" --secret-id "$secret_id" \
    --force-delete-without-recovery >/dev/null
}

delete_secret "$APP_SECRET_ARN"
delete_secret "$SOURCE_SECRET_ARN"
delete_secret "$RDS_MASTER_SECRET_ARN"
delete_secret "$ORIGIN_SECRET_NAME"

mapfile -t ATTACHED_POLICY_ARNS < <(aws iam list-attached-role-policies \
  --role-name "$EC2_ROLE_NAME" --query 'AttachedPolicies[].PolicyArn' --output text \
  | tr '\t' '\n' | sed '/^None$/d;/^$/d')
for policy_arn in "${ATTACHED_POLICY_ARNS[@]}"; do
  aws iam detach-role-policy --role-name "$EC2_ROLE_NAME" --policy-arn "$policy_arn"
done

mapfile -t INLINE_POLICY_NAMES < <(aws iam list-role-policies \
  --role-name "$EC2_ROLE_NAME" --query 'PolicyNames[]' --output text \
  | tr '\t' '\n' | sed '/^None$/d;/^$/d')
for policy_name in "${INLINE_POLICY_NAMES[@]}"; do
  aws iam delete-role-policy --role-name "$EC2_ROLE_NAME" --policy-name "$policy_name"
done

mapfile -t PROFILE_ROLES < <(aws iam get-instance-profile \
  --instance-profile-name "$INSTANCE_PROFILE_NAME" \
  --query 'InstanceProfile.Roles[].RoleName' --output text \
  | tr '\t' '\n' | sed '/^None$/d;/^$/d')
for role_name in "${PROFILE_ROLES[@]}"; do
  aws iam remove-role-from-instance-profile \
    --instance-profile-name "$INSTANCE_PROFILE_NAME" --role-name "$role_name"
done
aws iam delete-instance-profile --instance-profile-name "$INSTANCE_PROFILE_NAME"
aws iam delete-role --role-name "$EC2_ROLE_NAME"
aws logs delete-log-group --region "$AWS_REGION" --log-group-name "$LOG_GROUP"

show_phase "3/7" "Delete NAT gateways and release Elastic IPs"
mapfile -t NAT_GATEWAY_IDS < <(aws ec2 describe-nat-gateways \
  --region "$AWS_REGION" --filter "Name=vpc-id,Values=$VPC_ID" \
  --query 'NatGateways[?State!=`deleted`].NatGatewayId' --output text \
  | tr '\t' '\n' | sed '/^None$/d;/^$/d')
for nat_gateway_id in "${NAT_GATEWAY_IDS[@]}"; do
  nat_state=$(aws ec2 describe-nat-gateways \
    --region "$AWS_REGION" --nat-gateway-ids "$nat_gateway_id" \
    --query 'NatGateways[0].State' --output text)
  if [[ "$nat_state" != deleting ]]; then
    aws ec2 delete-nat-gateway \
      --region "$AWS_REGION" --nat-gateway-id "$nat_gateway_id" >/dev/null
  fi
done
for nat_gateway_id in "${NAT_GATEWAY_IDS[@]}"; do
  aws ec2 wait nat-gateway-deleted \
    --region "$AWS_REGION" --nat-gateway-ids "$nat_gateway_id"
done

if [[ -n "${NAT_EIP_ALLOCATION_ID:-}" ]]; then
  aws ec2 release-address \
    --region "$AWS_REGION" --allocation-id "$NAT_EIP_ALLOCATION_ID"
fi

show_phase "4/7" "Delete routes, security groups, gateway, and subnets"
mapfile -t ROUTE_TABLE_IDS < <(aws ec2 describe-route-tables \
  --region "$AWS_REGION" --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'RouteTables[?Associations[?Main==`true`]|length(@)==`0`].RouteTableId' \
  --output text | tr '\t' '\n' | sed '/^None$/d;/^$/d')
for route_table_id in "${ROUTE_TABLE_IDS[@]}"; do
  mapfile -t association_ids < <(aws ec2 describe-route-tables \
    --region "$AWS_REGION" --route-table-ids "$route_table_id" \
    --query 'RouteTables[0].Associations[?Main==`false`].RouteTableAssociationId' \
    --output text | tr '\t' '\n' | sed '/^None$/d;/^$/d')
  for association_id in "${association_ids[@]}"; do
    aws ec2 disassociate-route-table \
      --region "$AWS_REGION" --association-id "$association_id"
  done
  aws ec2 delete-route-table \
    --region "$AWS_REGION" --route-table-id "$route_table_id"
done

for _ in $(seq 1 60); do
  ENI_COUNT=$(aws ec2 describe-network-interfaces \
    --region "$AWS_REGION" --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'length(NetworkInterfaces)' --output text)
  [[ "$ENI_COUNT" == 0 ]] && break
  sleep 10
done
if [[ "$ENI_COUNT" != 0 ]]; then
  aws ec2 describe-network-interfaces \
    --region "$AWS_REGION" --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'NetworkInterfaces[].{Id:NetworkInterfaceId,Status:Status,Description:Description}'
  printf 'ERROR: network interfaces still exist in demo VPC.\n' >&2
  exit 1
fi

mapfile -t CUSTOM_SECURITY_GROUP_IDS < <(aws ec2 describe-security-groups \
  --region "$AWS_REGION" --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[?GroupName!='default'].GroupId" --output text \
  | tr '\t' '\n' | sed '/^None$/d;/^$/d')
for security_group_id in "${CUSTOM_SECURITY_GROUP_IDS[@]}"; do
  mapfile -t ingress_rule_ids < <(aws ec2 describe-security-group-rules \
    --region "$AWS_REGION" --filters "Name=group-id,Values=$security_group_id" \
    --query 'SecurityGroupRules[?IsEgress==`false`].SecurityGroupRuleId' \
    --output text | tr '\t' '\n' | sed '/^None$/d;/^$/d')
  if (( ${#ingress_rule_ids[@]} > 0 )); then
    aws ec2 revoke-security-group-ingress \
      --region "$AWS_REGION" --group-id "$security_group_id" \
      --security-group-rule-ids "${ingress_rule_ids[@]}" >/dev/null
  fi
done
for security_group_id in "${CUSTOM_SECURITY_GROUP_IDS[@]}"; do
  aws ec2 delete-security-group \
    --region "$AWS_REGION" --group-id "$security_group_id"
done

mapfile -t INTERNET_GATEWAY_IDS < <(aws ec2 describe-internet-gateways \
  --region "$AWS_REGION" --filters "Name=attachment.vpc-id,Values=$VPC_ID" \
  --query 'InternetGateways[].InternetGatewayId' --output text \
  | tr '\t' '\n' | sed '/^None$/d;/^$/d')
for internet_gateway_id in "${INTERNET_GATEWAY_IDS[@]}"; do
  aws ec2 detach-internet-gateway \
    --region "$AWS_REGION" --internet-gateway-id "$internet_gateway_id" \
    --vpc-id "$VPC_ID"
  aws ec2 delete-internet-gateway \
    --region "$AWS_REGION" --internet-gateway-id "$internet_gateway_id"
done

mapfile -t SUBNET_IDS < <(aws ec2 describe-subnets \
  --region "$AWS_REGION" --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[].SubnetId' --output text \
  | tr '\t' '\n' | sed '/^None$/d;/^$/d')
for subnet_id in "${SUBNET_IDS[@]}"; do
  aws ec2 delete-subnet --region "$AWS_REGION" --subnet-id "$subnet_id"
done
aws ec2 delete-vpc --region "$AWS_REGION" --vpc-id "$VPC_ID"

show_phase "5/7" "Residual-resource audit"
RESIDUAL_COUNT=0

if aws rds describe-db-instances --region "$AWS_REGION" \
  --db-instance-identifier "$DB_INSTANCE_ID" >/dev/null 2>&1; then
  printf 'RESIDUAL: RDS %s\n' "$DB_INSTANCE_ID" >&2
  RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
fi
if aws cloudfront get-distribution --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  >/dev/null 2>&1; then
  printf 'RESIDUAL: CloudFront %s\n' "$CLOUDFRONT_DISTRIBUTION_ID" >&2
  RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
fi
if aws wafv2 list-web-acls --region us-east-1 --scope CLOUDFRONT --output json |
  jq -e --arg name "$WAF_NAME" 'any(.WebACLs[]?; .Name == $name)' >/dev/null; then
  printf 'RESIDUAL: WAF web ACL %s\n' "$WAF_NAME" >&2
  RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
fi
if [[ $(aws logs describe-log-groups \
  --region us-east-1 --log-group-name-prefix "$WAF_LOG_GROUP" \
  --query "logGroups[?logGroupName=='${WAF_LOG_GROUP}'] | length(@)" \
  --output text) != 0 ]]; then
  printf 'RESIDUAL: WAF log group %s\n' "$WAF_LOG_GROUP" >&2
  RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
fi
if aws elbv2 describe-load-balancers --region "$AWS_REGION" \
  --load-balancer-arns "$ALB_ARN" >/dev/null 2>&1; then
  printf 'RESIDUAL: ALB %s\n' "$ALB_ARN" >&2
  RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
fi
if aws elbv2 describe-target-groups --region "$AWS_REGION" \
  --target-group-arns "$TARGET_GROUP_ARN" >/dev/null 2>&1; then
  printf 'RESIDUAL: target group %s\n' "$TARGET_GROUP_ARN" >&2
  RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
fi
if aws ecr describe-repositories --region "$AWS_REGION" \
  --repository-names "$ECR_REPOSITORY" >/dev/null 2>&1; then
  printf 'RESIDUAL: ECR %s\n' "$ECR_REPOSITORY" >&2
  RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
fi
if aws iam get-role --role-name "$EC2_ROLE_NAME" >/dev/null 2>&1; then
  printf 'RESIDUAL: IAM role %s\n' "$EC2_ROLE_NAME" >&2
  RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
fi
if aws ec2 describe-vpcs --region "$AWS_REGION" --vpc-ids "$VPC_ID" \
  >/dev/null 2>&1; then
  printf 'RESIDUAL: VPC %s\n' "$VPC_ID" >&2
  RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
fi

INSTANCE_STATE=$(aws ec2 describe-instances \
  --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].State.Name' --output text)
if [[ "$INSTANCE_STATE" != terminated ]]; then
  printf 'RESIDUAL: EC2 %s is %s\n' "$INSTANCE_ID" "$INSTANCE_STATE" >&2
  RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
fi

for secret_id in "$APP_SECRET_ARN" "$SOURCE_SECRET_ARN" "$RDS_MASTER_SECRET_ARN" \
  "$ORIGIN_SECRET_NAME"; do
  if deleted_date=$(aws secretsmanager describe-secret \
    --region "$AWS_REGION" --secret-id "$secret_id" \
    --query DeletedDate --output text 2>/dev/null); then
    if [[ "$deleted_date" == None ]]; then
      printf 'RESIDUAL: active secret %s\n' "$secret_id" >&2
      RESIDUAL_COUNT=$((RESIDUAL_COUNT + 1))
    else
      printf 'Secret deletion pending: %s\n' "$secret_id"
    fi
  fi
done

if (( RESIDUAL_COUNT != 0 )); then
  printf 'ERROR: residual audit found %s active demo resources.\n' "$RESIDUAL_COUNT" >&2
  exit 1
fi

show_phase "6/7" "Record completion"
TEARDOWN_COMPLETED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf 'export TEARDOWN_COMPLETED_AT=%q\n' "$TEARDOWN_COMPLETED_AT" >> "$STATE_FILE"
printf 'Full demo teardown completed at %s.\n' "$TEARDOWN_COMPLETED_AT"
printf 'State retained for audit: %s\n' "$STATE_FILE"

show_phase "7/7" "Complete"
