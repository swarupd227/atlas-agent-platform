#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export AWS_PAGER=""

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

EXPECTED_ACCOUNT_ID=${EXPECTED_ACCOUNT_ID:-964604400233}
GITHUB_REPOSITORY=${GITHUB_REPOSITORY:-swarupd227/atlas-agent-platform}
GITHUB_DEPLOY_ROLE=${GITHUB_DEPLOY_ROLE:-astra-agents-github-ecr-push}
GITHUB_OIDC_PROVIDER=${GITHUB_OIDC_PROVIDER:-token.actions.githubusercontent.com}
CURL_BIN=${CURL_BIN:-curl}
OPENSSL_BIN=${OPENSSL_BIN:-openssl}

usage() {
  cat <<'USAGE'
Usage: deploy/aws/operate.sh <command> --deployment-id <id> [options]

Commands:
  bootstrap-ci   Create or update the GitHub OIDC ECR-push role.
  bootstrap-repository
                 Create or normalize the deployment ECR repository.
  deploy-image   Deploy an existing ECR image digest through SSM.
  verify         Verify the exact digest and local application health.
  harden-runtime-role
                 Restrict the EC2 role to runtime pull/read access.
  harden-edge    Add origin authentication, WAF, and CloudFront-only ALB access.
  rollback-edge  Restore the captured pre-hardening edge configuration.
  rotate-jwt     Rotate only the AWS JWT secret and redeploy an exact digest.
  rollback-jwt   Restore the prior JWT secret version and redeploy.
USAGE
}

parse_options() {
  DEPLOYMENT_ID=${DEPLOYMENT_ID:-}
  IMAGE_DIGEST=${IMAGE_DIGEST:-}
  CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-}
  while (( $# )); do
    case "$1" in
      --deployment-id)
        (( $# >= 2 )) || { printf 'ERROR: --deployment-id requires a value.\n' >&2; return 2; }
        DEPLOYMENT_ID=$2
        shift 2
        ;;
      --digest)
        (( $# >= 2 )) || { printf 'ERROR: --digest requires a value.\n' >&2; return 2; }
        IMAGE_DIGEST=$2
        shift 2
        ;;
      --distribution-id)
        (( $# >= 2 )) || { printf 'ERROR: --distribution-id requires a value.\n' >&2; return 2; }
        CLOUDFRONT_DISTRIBUTION_ID=$2
        shift 2
        ;;
      *) printf 'ERROR: unknown option: %s\n' "$1" >&2; return 2 ;;
    esac
  done
  validate_deployment_id "$DEPLOYMENT_ID" || {
    printf 'ERROR: --deployment-id must use 1-12 lowercase letters, numbers, or hyphens.\n' >&2
    return 2
  }
  deployment_names "$DEPLOYMENT_ID"
}

require_image_digest() {
  if [[ ! "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    printf 'ERROR: --digest must be a complete immutable sha256 digest.\n' >&2
    return 2
  fi
}

require_expected_account() {
  local actual_account_id
  actual_account_id=$(aws_cli sts get-caller-identity --query Account --output text)
  if [[ "$actual_account_id" != "$EXPECTED_ACCOUNT_ID" ]]; then
    printf 'ERROR: authenticated account %s does not match expected account %s.\n' \
      "$actual_account_id" "$EXPECTED_ACCOUNT_ID" >&2
    return 1
  fi
  ACCOUNT_ID=$actual_account_id
  export ACCOUNT_ID
}

resolve_instance_role() {
  local instance_id=$1 profile_arn profile_json
  profile_arn=$(aws_cli ec2 describe-instances \
    --region "$AWS_REGION" \
    --instance-ids "$instance_id" \
    --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' \
    --output text)
  [[ "$profile_arn" == arn:aws:iam::"${ACCOUNT_ID}":instance-profile/* ]] || {
    printf 'ERROR: instance %s has no instance profile in the approved account.\n' "$instance_id" >&2
    return 1
  }
  RESOLVED_INSTANCE_PROFILE_NAME=${profile_arn##*/}
  profile_json=$(aws_cli iam get-instance-profile \
    --instance-profile-name "$RESOLVED_INSTANCE_PROFILE_NAME" \
    --output json)
  [[ $(jq '.InstanceProfile.Roles | length' <<<"$profile_json") -eq 1 ]] || {
    printf 'ERROR: instance profile %s must contain exactly one role.\n' \
      "$RESOLVED_INSTANCE_PROFILE_NAME" >&2
    return 1
  }
  RESOLVED_EC2_ROLE_NAME=$(jq -r '.InstanceProfile.Roles[0].RoleName' <<<"$profile_json")
  [[ "$RESOLVED_INSTANCE_PROFILE_NAME" == "${RESOURCE_PREFIX}-profile" &&
     "$RESOLVED_EC2_ROLE_NAME" == "${RESOURCE_PREFIX}-role" ]] || {
    printf 'ERROR: instance %s is not attached to the dedicated %s role/profile.\n' \
      "$instance_id" "$RESOURCE_PREFIX" >&2
    return 1
  }
  export RESOLVED_INSTANCE_PROFILE_NAME RESOLVED_EC2_ROLE_NAME
}

assert_role_policy_boundary() {
  local role_name=$1 allowed_inline=$2 allowed_managed_arn=${3:-}
  local attached_json inline_json
  attached_json=$(aws_cli iam list-attached-role-policies \
    --role-name "$role_name" --output json)
  inline_json=$(aws_cli iam list-role-policies \
    --role-name "$role_name" --output json)
  jq -e --arg allowed "$allowed_managed_arn" '
    all(.AttachedPolicies[]?; $allowed != "" and .PolicyArn == $allowed)
  ' <<<"$attached_json" >/dev/null || {
    printf 'ERROR: role %s has an unexpected attached managed policy.\n' "$role_name" >&2
    return 1
  }
  jq -e --arg allowed "$allowed_inline" '
    all(.PolicyNames[]?; . == $allowed)
  ' <<<"$inline_json" >/dev/null || {
    printf 'ERROR: role %s has an unexpected inline policy.\n' "$role_name" >&2
    return 1
  }
}

assert_actions_not_allowed() {
  local role_arn=$1
  shift
  local simulation
  simulation=$(aws_cli iam simulate-principal-policy \
    --policy-source-arn "$role_arn" \
    --action-names "$@" \
    --output json)
  jq -e 'all(.EvaluationResults[]?; .EvalDecision != "allowed")' \
    <<<"$simulation" >/dev/null || {
    printf 'ERROR: role %s still allows a forbidden action.\n' "$role_arn" >&2
    return 1
  }
}

bootstrap_ci() {
  local state_dir provider_arn role_arn trust_file policy_file
  require_commands "$AWS_BIN" jq
  require_expected_account
  state_dir=$(init_state_dir "$DEPLOYMENT_ID")
  provider_arn="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${GITHUB_OIDC_PROVIDER}"
  role_arn="arn:aws:iam::${ACCOUNT_ID}:role/${GITHUB_DEPLOY_ROLE}"
  trust_file="$state_dir/ci-trust-policy.json"
  policy_file="$state_dir/ci-ecr-policy.json"

  aws_cli iam get-open-id-connect-provider \
    --open-id-connect-provider-arn "$provider_arn" >/dev/null

  jq -n \
    --arg provider "$provider_arn" \
    --arg subject "repo:${GITHUB_REPOSITORY}:ref:refs/heads/main" '
    {
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: {Federated: $provider},
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": $subject
        }}
      }]
    }
  ' >"$trust_file"

  jq -n \
    --arg repositories "arn:aws:ecr:${AWS_REGION}:${ACCOUNT_ID}:repository/astra-agents-*-app" '
    {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AuthenticateToEcr",
          Effect: "Allow",
          Action: "ecr:GetAuthorizationToken",
          Resource: "*"
        },
        {
          Sid: "PushAstraImages",
          Effect: "Allow",
          Action: [
            "ecr:BatchCheckLayerAvailability",
            "ecr:CompleteLayerUpload",
            "ecr:GetDownloadUrlForLayer",
            "ecr:InitiateLayerUpload",
            "ecr:PutImage",
            "ecr:UploadLayerPart",
            "ecr:BatchGetImage",
            "ecr:DescribeRepositories",
            "ecr:DescribeImages",
            "ecr:DescribeImageScanFindings"
          ],
          Resource: $repositories
        }
      ]
    }
  ' >"$policy_file"

  if aws_cli iam get-role --role-name "$GITHUB_DEPLOY_ROLE" >/dev/null 2>&1; then
    assert_role_policy_boundary "$GITHUB_DEPLOY_ROLE" astra-agents-ecr-push
    aws_cli iam update-assume-role-policy \
      --role-name "$GITHUB_DEPLOY_ROLE" \
      --policy-document "file://$trust_file"
  else
    aws_cli iam create-role \
      --role-name "$GITHUB_DEPLOY_ROLE" \
      --description 'GitHub Actions ECR push role for Astra Agents' \
      --assume-role-policy-document "file://$trust_file" \
      --tags Key=Application,Value=astra-agents Key=Purpose,Value=github-actions \
      --query Role.Arn --output text >/dev/null
  fi

  aws_cli iam put-role-policy \
    --role-name "$GITHUB_DEPLOY_ROLE" \
    --policy-name astra-agents-ecr-push \
    --policy-document "file://$policy_file"
  assert_actions_not_allowed "$role_arn" \
    ssm:SendCommand secretsmanager:GetSecretValue ec2:RunInstances iam:PassRole

  printf 'GitHub role ready: %s\n' "$role_arn"
}

bootstrap_repository() {
  local state_dir lifecycle_file repository_uri
  require_commands "$AWS_BIN" jq
  require_expected_account
  state_dir=$(init_state_dir "$DEPLOYMENT_ID")
  lifecycle_file="$state_dir/ecr-lifecycle.json"

  if ! repository_uri=$(aws_cli ecr describe-repositories \
    --region "$AWS_REGION" \
    --repository-names "$ECR_REPOSITORY" \
    --query 'repositories[0].repositoryUri' \
    --output text 2>/dev/null); then
    repository_uri=$(aws_cli ecr create-repository \
      --region "$AWS_REGION" \
      --repository-name "$ECR_REPOSITORY" \
      --image-tag-mutability IMMUTABLE \
      --image-scanning-configuration scanOnPush=true \
      --encryption-configuration encryptionType=AES256 \
      --tags Key=Application,Value=astra-agents Key=Environment,Value="$ENVIRONMENT" \
      --query 'repository.repositoryUri' \
      --output text)
  fi
  aws_cli ecr put-image-tag-mutability \
    --region "$AWS_REGION" \
    --repository-name "$ECR_REPOSITORY" \
    --image-tag-mutability IMMUTABLE >/dev/null
  aws_cli ecr put-image-scanning-configuration \
    --region "$AWS_REGION" \
    --repository-name "$ECR_REPOSITORY" \
    --image-scanning-configuration scanOnPush=true >/dev/null
  jq -n '{rules:[{
    rulePriority: 1,
    description: "Retain the newest 20 immutable application images",
    selection: {tagStatus:"any", countType:"imageCountMoreThan", countNumber:20},
    action: {type:"expire"}
  }]}' >"$lifecycle_file"
  aws_cli ecr put-lifecycle-policy \
    --region "$AWS_REGION" \
    --repository-name "$ECR_REPOSITORY" \
    --lifecycle-policy-text "file://$lifecycle_file" >/dev/null
  printf 'ECR repository ready: %s\n' "$repository_uri"
}

harden_runtime_role() {
  local state_dir policy_file role_name role_arn instance_id repository_arn app_secret_arn log_group_arn
  local ssm_managed_policy
  require_commands "$AWS_BIN" jq
  require_expected_account
  instance_id=$(resolve_single_instance_id "$DEPLOYMENT_ID")
  resolve_instance_role "$instance_id"
  state_dir=$(init_state_dir "$DEPLOYMENT_ID")
  policy_file="$state_dir/ec2-runtime-policy.json"
  role_name=$RESOLVED_EC2_ROLE_NAME
  role_arn="arn:aws:iam::${ACCOUNT_ID}:role/${role_name}"
  ssm_managed_policy='arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
  assert_role_policy_boundary "$role_name" astra-agents-ec2-runtime "$ssm_managed_policy"
  repository_arn="arn:aws:ecr:${AWS_REGION}:${ACCOUNT_ID}:repository/${ECR_REPOSITORY}"
  app_secret_arn="arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:${APP_SECRET_NAME}-*"
  log_group_arn="arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:/ec2/${RESOURCE_PREFIX}/app:*"

  jq -n \
    --arg repository "$repository_arn" \
    --arg app_secret "$app_secret_arn" \
    --arg log_group "$log_group_arn" '
    {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AuthenticateToEcr",
          Effect: "Allow",
          Action: "ecr:GetAuthorizationToken",
          Resource: "*"
        },
        {
          Sid: "PullApplicationImage",
          Effect: "Allow",
          Action: [
            "ecr:BatchCheckLayerAvailability",
            "ecr:BatchGetImage",
            "ecr:DescribeImages",
            "ecr:GetDownloadUrlForLayer"
          ],
          Resource: $repository
        },
        {
          Sid: "ReadApplicationEnvironment",
          Effect: "Allow",
          Action: "secretsmanager:GetSecretValue",
          Resource: $app_secret
        },
        {
          Sid: "WriteApplicationLogs",
          Effect: "Allow",
          Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
          Resource: $log_group
        }
      ]
    }
  ' >"$policy_file"

  aws_cli iam put-role-policy \
    --role-name "$role_name" \
    --policy-name astra-agents-ec2-runtime \
    --policy-document "file://$policy_file"
  assert_actions_not_allowed "$role_arn" \
    ecr:PutImage ecr:InitiateLayerUpload ecr:UploadLayerPart ecr:CompleteLayerUpload
  printf 'Runtime role hardened: %s\n' "$role_name"
}

write_remote_deploy_script() {
  local target_file=$1 repository_uri=$2 image_digest=$3
  cat >"$target_file" <<REMOTE_SCRIPT
#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

AWS_REGION='$AWS_REGION'
REPOSITORY_URI='$repository_uri'
IMAGE_DIGEST='$image_digest'
APP_SECRET_NAME='$APP_SECRET_NAME'
CONTAINER_NAME='astra-agents'
ROLLBACK_NAME='astra-agents-rollback'
ENV_DIR='/etc/astra-agents'
ENV_FILE="\$ENV_DIR/app.env"
RDS_CA_FILE="\$ENV_DIR/aws-rds-global-bundle.pem"
LOG_GROUP='/ec2/$RESOURCE_PREFIX/app'
previous_exists=false

restore_previous_container() {
  docker rm -f "\$CONTAINER_NAME" >/dev/null 2>&1 || true
  if [[ "\$previous_exists" == true ]]; then
    docker rename "\$ROLLBACK_NAME" "\$CONTAINER_NAME"
    docker start "\$CONTAINER_NAME" >/dev/null
  fi
}

mkdir -p "\$ENV_DIR"
app_json=\$(aws secretsmanager get-secret-value \
  --region "\$AWS_REGION" \
  --secret-id "\$APP_SECRET_NAME" \
  --query SecretString \
  --output text)
jq -e 'to_entries | all(((.value | tostring | contains("\\n")) | not))' \
  <<<"\$app_json" >/dev/null
jq -r 'to_entries[] | "\(.key)=\(.value | tostring)"' \
  <<<"\$app_json" >"\$ENV_FILE.new"
unset app_json
chmod 0600 "\$ENV_FILE.new"
mv -f "\$ENV_FILE.new" "\$ENV_FILE"
test -s "\$RDS_CA_FILE"

aws ecr get-login-password --region "\$AWS_REGION" |
  docker login --username AWS --password-stdin "\${REPOSITORY_URI%%/*}"
docker pull "\$REPOSITORY_URI@$image_digest"

docker rm -f "\$ROLLBACK_NAME" >/dev/null 2>&1 || true
if docker container inspect "\$CONTAINER_NAME" >/dev/null 2>&1; then
  previous_exists=true
  docker stop "\$CONTAINER_NAME" >/dev/null
  docker rename astra-agents astra-agents-rollback
fi

if ! docker run -d \
  --name "\$CONTAINER_NAME" \
  --restart unless-stopped \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,size=128m \
  --env-file "\$ENV_FILE" \
  --env NODE_EXTRA_CA_CERTS=/etc/ssl/certs/aws-rds-global-bundle.pem \
  -p 5000:5000 \
  -v "\$RDS_CA_FILE:/etc/ssl/certs/aws-rds-global-bundle.pem:ro" \
  --log-driver awslogs \
  --log-opt "awslogs-region=\$AWS_REGION" \
  --log-opt "awslogs-group=\$LOG_GROUP" \
  --log-opt 'awslogs-create-group=false' \
  "\$REPOSITORY_URI@$image_digest"; then
  restore_previous_container
  exit 1
fi

healthy=false
for _attempt in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:5000/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 5
done

if [[ "\$healthy" != true ]]; then
  restore_previous_container
  exit 1
fi

docker rm -f "\$ROLLBACK_NAME" >/dev/null 2>&1 || true
printf 'Deployed %s@%s and passed local health check.\n' "\$REPOSITORY_URI" "\$IMAGE_DIGEST"
REMOTE_SCRIPT
  chmod 0700 "$target_file"
}

wait_for_ssm_command() {
  local command_id=$1 instance_id=$2 status invocation attempt
  for (( attempt=1; attempt<=120; attempt++ )); do
    invocation=$(aws_cli ssm get-command-invocation \
      --region "$AWS_REGION" \
      --command-id "$command_id" \
      --instance-id "$instance_id" \
      --output json 2>/dev/null || true)
    status=$(jq -r '.Status // "Pending"' <<<"$invocation")
    case "$status" in
      Success)
        jq -r '.StandardOutputContent // empty' <<<"$invocation"
        return 0
        ;;
      Cancelled|Failed|TimedOut|Cancelling)
        jq -r '.StandardErrorContent // empty' <<<"$invocation" >&2
        printf 'ERROR: SSM command %s ended with status %s.\n' "$command_id" "$status" >&2
        return 1
        ;;
    esac
    sleep "${SSM_POLL_SECONDS:-5}"
  done
  printf 'ERROR: SSM command %s did not finish within 10 minutes.\n' "$command_id" >&2
  return 1
}

deploy_image() {
  local state_dir instance_id repository_uri actual_digest remote_script parameters_file command_id ssm_status
  require_image_digest
  require_commands "$AWS_BIN" jq
  require_expected_account
  state_dir=$(init_state_dir "$DEPLOYMENT_ID")
  instance_id=$(resolve_single_instance_id "$DEPLOYMENT_ID")
  ssm_status=$(aws_cli ssm describe-instance-information \
    --region "$AWS_REGION" \
    --filters "Key=InstanceIds,Values=$instance_id" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text)
  [[ "$ssm_status" == Online ]] || {
    printf 'ERROR: instance %s is not online in Systems Manager.\n' "$instance_id" >&2
    return 1
  }

  repository_uri=$(aws_cli ecr describe-repositories \
    --region "$AWS_REGION" \
    --repository-names "$ECR_REPOSITORY" \
    --query 'repositories[0].repositoryUri' \
    --output text)
  actual_digest=$(aws_cli ecr describe-images \
    --region "$AWS_REGION" \
    --repository-name "$ECR_REPOSITORY" \
    --image-ids "imageDigest=$IMAGE_DIGEST" \
    --query 'imageDetails[0].imageDigest' \
    --output text)
  [[ "$actual_digest" == "$IMAGE_DIGEST" ]] || {
    printf 'ERROR: digest %s does not exist in %s.\n' "$IMAGE_DIGEST" "$ECR_REPOSITORY" >&2
    return 1
  }

  remote_script="$state_dir/deploy-container.sh"
  parameters_file="$state_dir/deploy-parameters.json"
  write_remote_deploy_script "$remote_script" "$repository_uri" "$IMAGE_DIGEST"
  jq -Rs '{commands: [.]} ' <"$remote_script" >"$parameters_file"

  command_id=$(aws_cli ssm send-command \
    --region "$AWS_REGION" \
    --document-name AWS-RunShellScript \
    --comment "Deploy ${ECR_REPOSITORY}@${IMAGE_DIGEST}" \
    --instance-ids "$instance_id" \
    --parameters "file://$parameters_file" \
    --timeout-seconds 900 \
    --query 'Command.CommandId' \
    --output text)
  wait_for_ssm_command "$command_id" "$instance_id"
  printf 'Deployment complete: %s@%s on %s\n' "$repository_uri" "$IMAGE_DIGEST" "$instance_id"
}

verify_runtime() {
  local state_dir instance_id repository_uri remote_script parameters_file command_id ssm_status
  require_image_digest
  require_commands "$AWS_BIN" jq
  require_expected_account
  state_dir=$(init_state_dir "$DEPLOYMENT_ID")
  instance_id=$(resolve_single_instance_id "$DEPLOYMENT_ID")
  ssm_status=$(aws_cli ssm describe-instance-information \
    --region "$AWS_REGION" \
    --filters "Key=InstanceIds,Values=$instance_id" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text)
  [[ "$ssm_status" == Online ]] || {
    printf 'ERROR: instance %s is not online in Systems Manager.\n' "$instance_id" >&2
    return 1
  }
  repository_uri=$(aws_cli ecr describe-repositories \
    --region "$AWS_REGION" \
    --repository-names "$ECR_REPOSITORY" \
    --query 'repositories[0].repositoryUri' \
    --output text)

  remote_script="$state_dir/verify-container.sh"
  parameters_file="$state_dir/verify-parameters.json"
  cat >"$remote_script" <<VERIFY_SCRIPT
#!/usr/bin/env bash
set -Eeuo pipefail
expected_image='$repository_uri@$IMAGE_DIGEST'
actual_image=\$(docker inspect --format '{{.Config.Image}}' astra-agents)
test "\$actual_image" = "\$expected_image"
curl --fail --silent --show-error http://127.0.0.1:5000/health >/dev/null
printf 'Verified %s and local health.\n' "\$actual_image"
VERIFY_SCRIPT
  chmod 0700 "$remote_script"
  jq -Rs '{commands: [.]} ' <"$remote_script" >"$parameters_file"

  command_id=$(aws_cli ssm send-command \
    --region "$AWS_REGION" \
    --document-name AWS-RunShellScript \
    --comment "Verify ${ECR_REPOSITORY}@${IMAGE_DIGEST}" \
    --instance-ids "$instance_id" \
    --parameters "file://$parameters_file" \
    --timeout-seconds 300 \
    --query 'Command.CommandId' \
    --output text)
  wait_for_ssm_command "$command_id" "$instance_id"
  printf 'Runtime verified: %s@%s on %s\n' "$repository_uri" "$IMAGE_DIGEST" "$instance_id"
}

ensure_cloudfront_waf() {
  local state_dir=$1 rules_file list_json waf_id waf_arn create_json current_json lock_token
  local default_action_file visibility_file logging_file log_group_arn
  rules_file="$SCRIPT_DIR/waf-rules.json"
  default_action_file="$state_dir/waf-default-action.json"
  visibility_file="$state_dir/waf-visibility.json"
  logging_file="$state_dir/waf-logging.json"
  printf '{"Allow":{}}\n' >"$default_action_file"
  jq -n --arg metric "${RESOURCE_PREFIX}-cloudfront" '{
    SampledRequestsEnabled: true,
    CloudWatchMetricsEnabled: true,
    MetricName: $metric
  }' >"$visibility_file"

  list_json=$(aws_cli wafv2 list-web-acls \
    --region us-east-1 \
    --scope CLOUDFRONT \
    --output json)
  waf_id=$(jq -r --arg name "$WAF_NAME" \
    'first(.WebACLs[]? | select(.Name == $name) | .Id) // empty' <<<"$list_json")
  waf_arn=$(jq -r --arg name "$WAF_NAME" \
    'first(.WebACLs[]? | select(.Name == $name) | .ARN) // empty' <<<"$list_json")

  if [[ -z "$waf_id" || "$waf_id" == null ]]; then
    create_json=$(aws_cli wafv2 create-web-acl \
      --region us-east-1 \
      --name "$WAF_NAME" \
      --scope CLOUDFRONT \
      --description "Staged protection for ${RESOURCE_PREFIX}" \
      --default-action "file://$default_action_file" \
      --rules "file://$rules_file" \
      --visibility-config "file://$visibility_file" \
      --tags Key=Application,Value=astra-agents Key=Environment,Value="$ENVIRONMENT" \
      --output json)
    waf_id=$(jq -r '.Summary.Id' <<<"$create_json")
    waf_arn=$(jq -r '.Summary.ARN' <<<"$create_json")
  else
    current_json=$(aws_cli wafv2 get-web-acl \
      --region us-east-1 \
      --name "$WAF_NAME" \
      --scope CLOUDFRONT \
      --id "$waf_id" \
      --output json)
    lock_token=$(jq -r '.LockToken' <<<"$current_json")
    aws_cli wafv2 update-web-acl \
      --region us-east-1 \
      --name "$WAF_NAME" \
      --scope CLOUDFRONT \
      --id "$waf_id" \
      --lock-token "$lock_token" \
      --description "Staged protection for ${RESOURCE_PREFIX}" \
      --default-action "file://$default_action_file" \
      --rules "file://$rules_file" \
      --visibility-config "file://$visibility_file" >/dev/null
  fi

  if ! aws_cli logs describe-log-groups \
    --region us-east-1 \
    --log-group-name-prefix "$WAF_LOG_GROUP" \
    --query "logGroups[?logGroupName=='${WAF_LOG_GROUP}'].logGroupName | [0]" \
    --output text | grep -Fxq "$WAF_LOG_GROUP"; then
    aws_cli logs create-log-group \
      --region us-east-1 \
      --log-group-name "$WAF_LOG_GROUP" \
      --tags Application=astra-agents,Environment="$ENVIRONMENT"
  fi
  aws_cli logs put-retention-policy \
    --region us-east-1 \
    --log-group-name "$WAF_LOG_GROUP" \
    --retention-in-days 30
  log_group_arn="arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:${WAF_LOG_GROUP}"
  jq -n --arg resource "$waf_arn" --arg destination "$log_group_arn" '{
    ResourceArn: $resource,
    LogDestinationConfigs: [$destination],
    RedactedFields: [
      {SingleHeader: {Name: "authorization"}},
      {SingleHeader: {Name: "cookie"}}
    ]
  }' >"$logging_file"
  aws_cli wafv2 put-logging-configuration \
    --region us-east-1 \
    --logging-configuration "file://$logging_file" >/dev/null
  printf '%s\n' "$waf_arn"
}

harden_edge() {
  local state_dir alb_json alb_arn alb_dns alb_sg listener_json listener_arn target_group_arn
  local instance_id target_health_json
  local distribution_json distribution_domain distribution_etag origin_matches origin_secret_value
  local origin_secret_file updated_distribution waf_arn rule_priority priorities candidate rule_arn
  local prefix_list_id sg_rules public_rule_id direct_status direct_attempt edge_state
  local prefix_ingress_created=false
  require_commands "$AWS_BIN" jq "$CURL_BIN" "$OPENSSL_BIN"
  require_expected_account
  instance_id=$(resolve_single_instance_id "$DEPLOYMENT_ID")
  resolve_instance_role "$instance_id"
  [[ "$CLOUDFRONT_DISTRIBUTION_ID" =~ ^E[A-Z0-9]+$ ]] || {
    printf 'ERROR: harden-edge requires --distribution-id.\n' >&2
    return 2
  }
  state_dir=$(init_state_dir "$DEPLOYMENT_ID")
  edge_state="$state_dir/edge-state.env"
  if [[ -e "$edge_state" ]]; then
    printf 'ERROR: edge state already exists; verify or run rollback-edge before retrying.\n' >&2
    return 1
  fi

  alb_json=$(aws_cli elbv2 describe-load-balancers \
    --region "$AWS_REGION" \
    --names "${RESOURCE_PREFIX}-alb" \
    --output json)
  alb_arn=$(jq -r '.LoadBalancers[0].LoadBalancerArn' <<<"$alb_json")
  alb_dns=$(jq -r '.LoadBalancers[0].DNSName' <<<"$alb_json")
  alb_sg=$(jq -r '.LoadBalancers[0].SecurityGroups[0]' <<<"$alb_json")
  [[ "$alb_arn" != null && "$alb_dns" != null && "$alb_sg" != null ]] || {
    printf 'ERROR: could not resolve one ALB for %s.\n' "$DEPLOYMENT_ID" >&2
    return 1
  }
  listener_json=$(aws_cli elbv2 describe-listeners \
    --region "$AWS_REGION" \
    --load-balancer-arn "$alb_arn" \
    --output json)
  [[ $(jq '[.Listeners[] | select(.Port == 80)] | length' <<<"$listener_json") -eq 1 ]] || {
    printf 'ERROR: expected exactly one HTTP listener on %s.\n' "$alb_arn" >&2
    return 1
  }
  listener_arn=$(jq -r '.Listeners[] | select(.Port == 80) | .ListenerArn' <<<"$listener_json")
  target_group_arn=$(aws_cli elbv2 describe-target-groups \
    --region "$AWS_REGION" \
    --names "${RESOURCE_PREFIX}-tg" \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)
  target_health_json=$(aws_cli elbv2 describe-target-health \
    --region "$AWS_REGION" \
    --target-group-arn "$target_group_arn" \
    --output json)
  jq -e --arg instance "$instance_id" '
    (.TargetHealthDescriptions | length) == 1 and
    .TargetHealthDescriptions[0].Target.Id == $instance
  ' <<<"$target_health_json" >/dev/null || {
    printf 'ERROR: target group does not contain exactly the resolved deployment instance.\n' >&2
    return 1
  }

  distribution_json=$(aws_cli cloudfront get-distribution-config \
    --id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --output json)
  distribution_domain=$(aws_cli cloudfront get-distribution \
    --id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --query 'Distribution.DomainName' \
    --output text)
  distribution_etag=$(jq -r '.ETag' <<<"$distribution_json")
  origin_matches=$(jq --arg domain "$alb_dns" \
    '[.DistributionConfig.Origins.Items[] | select(.DomainName == $domain)] | length' \
    <<<"$distribution_json")
  [[ "$origin_matches" -eq 1 ]] || {
    printf 'ERROR: CloudFront distribution does not contain exactly one expected ALB origin.\n' >&2
    return 1
  }
  printf '%s\n' "$distribution_json" >"$state_dir/distribution-before.json"
  printf '%s\n' "$listener_json" >"$state_dir/listener-before.json"
  sg_rules=$(aws_cli ec2 describe-security-group-rules \
    --region "$AWS_REGION" \
    --filters "Name=group-id,Values=$alb_sg" \
    --output json)
  printf '%s\n' "$sg_rules" >"$state_dir/security-group-before.json"
  {
    printf 'export EDGE_STAGE=state-captured\n'
    printf 'export CLOUDFRONT_DISTRIBUTION_ID=%q\n' "$CLOUDFRONT_DISTRIBUTION_ID"
    printf 'export ALB_ARN=%q\n' "$alb_arn"
    printf 'export ALB_DNS=%q\n' "$alb_dns"
    printf 'export ALB_SECURITY_GROUP_ID=%q\n' "$alb_sg"
    printf 'export HTTP_LISTENER_ARN=%q\n' "$listener_arn"
    printf 'export ORIGIN_RULE_ARN=%q\n' ''
    printf 'export CLOUDFRONT_PREFIX_LIST_ID=%q\n' ''
    printf 'export CLOUDFRONT_INGRESS_CREATED=false\n'
    printf 'export WAF_ARN=%q\n' ''
  } >"$edge_state"
  chmod 0600 "$edge_state"

  origin_secret_file="$state_dir/origin-secret.txt"
  if origin_secret_value=$(aws_cli secretsmanager get-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$ORIGIN_SECRET_NAME" \
    --query SecretString \
    --output text 2>/dev/null); then
    [[ "$origin_secret_value" =~ ^[0-9a-f]{64}$ ]] || {
      printf 'ERROR: existing origin secret has an unexpected format.\n' >&2
      return 1
    }
  else
    origin_secret_value=$($OPENSSL_BIN rand -hex 32)
    printf '%s' "$origin_secret_value" >"$origin_secret_file"
    aws_cli secretsmanager create-secret \
      --region "$AWS_REGION" \
      --name "$ORIGIN_SECRET_NAME" \
      --description "CloudFront origin authentication for ${RESOURCE_PREFIX}" \
      --secret-string "file://$origin_secret_file" \
      --tags Key=Application,Value=astra-agents Key=Environment,Value="$ENVIRONMENT" >/dev/null
  fi
  printf '%s' "$origin_secret_value" >"$origin_secret_file"
  chmod 0600 "$origin_secret_file"

  waf_arn=$(ensure_cloudfront_waf "$state_dir")
  {
    printf 'export EDGE_STAGE=waf-ready\n'
    printf 'export WAF_ARN=%q\n' "$waf_arn"
  } >>"$edge_state"
  updated_distribution="$state_dir/distribution-hardened.json"
  jq --arg domain "$alb_dns" \
     --arg header 'X-Astra-Origin-Verify' \
     --arg value "$origin_secret_value" \
     --arg waf "$waf_arn" '
    .DistributionConfig
    | .WebACLId = $waf
    | (.Origins.Items[] | select(.DomainName == $domain) | .CustomHeaders) |=
        (((.Items // [])
          | map(select((.HeaderName | ascii_downcase) != ($header | ascii_downcase)))
          | . + [{HeaderName: $header, HeaderValue: $value}]) as $items
         | {Quantity: ($items | length), Items: $items})
  ' <<<"$distribution_json" >"$updated_distribution"
  aws_cli cloudfront update-distribution \
    --id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --if-match "$distribution_etag" \
    --distribution-config "file://$updated_distribution" >/dev/null
  aws_cli cloudfront wait distribution-deployed \
    --id "$CLOUDFRONT_DISTRIBUTION_ID"
  if ! "$CURL_BIN" --fail --silent --show-error \
    --retry 6 --retry-all-errors --retry-delay 5 \
    "https://${distribution_domain}/health" >/dev/null; then
    printf 'ERROR: CloudFront health verification failed; ALB access remains unchanged.\n' >&2
    return 1
  fi

  priorities=$(aws_cli elbv2 describe-rules \
    --region "$AWS_REGION" \
    --listener-arn "$listener_arn" \
    --query 'Rules[?Priority!=`default`].Priority' \
    --output text)
  rule_priority=''
  for (( candidate=1; candidate<=50000; candidate++ )); do
    if ! grep -Eq "(^|[[:space:]])${candidate}([[:space:]]|$)" <<<"$priorities"; then
      rule_priority=$candidate
      break
    fi
  done
  [[ -n "$rule_priority" ]] || { printf 'ERROR: no ALB listener rule priority is available.\n' >&2; return 1; }
  jq -n --arg target "$target_group_arn" '[{Type:"forward",TargetGroupArn:$target}]' \
    >"$state_dir/listener-origin-actions.json"
  jq -n --arg value "$origin_secret_value" '[{
    Field: "http-header",
    HttpHeaderConfig: {HttpHeaderName: "X-Astra-Origin-Verify", Values: [$value]}
  }]' >"$state_dir/listener-origin-conditions.json"
  rule_arn=$(aws_cli elbv2 create-rule \
    --region "$AWS_REGION" \
    --listener-arn "$listener_arn" \
    --priority "$rule_priority" \
    --conditions "file://$state_dir/listener-origin-conditions.json" \
    --actions "file://$state_dir/listener-origin-actions.json" \
    --query 'Rules[0].RuleArn' \
    --output text)
  {
    printf 'export EDGE_STAGE=listener-rule-created\n'
    printf 'export ORIGIN_RULE_ARN=%q\n' "$rule_arn"
  } >>"$edge_state"
  printf '[{"Type":"fixed-response","FixedResponseConfig":{"StatusCode":"403","ContentType":"text/plain","MessageBody":"Forbidden"}}]\n' \
    >"$state_dir/listener-default-403.json"
  aws_cli elbv2 modify-listener \
    --region "$AWS_REGION" \
    --listener-arn "$listener_arn" \
    --default-actions "file://$state_dir/listener-default-403.json" >/dev/null

  direct_status=''
  for (( direct_attempt=1; direct_attempt<=12; direct_attempt++ )); do
    direct_status=$($CURL_BIN --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' \
      --connect-timeout 10 "http://${alb_dns}/health" || true)
    [[ "$direct_status" == 403 ]] && break
    (( direct_attempt < 12 )) && sleep 5
  done
  [[ "$direct_status" == 403 ]] || {
    printf 'ERROR: direct ALB request returned %s instead of 403.\n' "$direct_status" >&2
    return 1
  }
  "$CURL_BIN" --fail --silent --show-error \
    "https://${distribution_domain}/health" >/dev/null

  prefix_list_id=$(aws_cli ec2 describe-managed-prefix-lists \
    --region "$AWS_REGION" \
    --filters 'Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing' \
    --query 'PrefixLists[0].PrefixListId' \
    --output text)
  [[ "$prefix_list_id" == pl-* ]] || { printf 'ERROR: CloudFront origin prefix list was not found.\n' >&2; return 1; }
  {
    printf 'export EDGE_STAGE=prefix-list-resolved\n'
    printf 'export CLOUDFRONT_PREFIX_LIST_ID=%q\n' "$prefix_list_id"
  } >>"$edge_state"
  jq -n --arg prefix "$prefix_list_id" '[{
    IpProtocol: "tcp", FromPort: 80, ToPort: 80,
    PrefixListIds: [{PrefixListId: $prefix, Description: "CloudFront origin-facing only"}]
  }]' >"$state_dir/cloudfront-ingress.json"
  if ! jq -e --arg prefix "$prefix_list_id" '
    any(.SecurityGroupRules[]?; .IsEgress == false and .FromPort == 80 and
      .ToPort == 80 and .PrefixListId == $prefix)
  ' <<<"$sg_rules" >/dev/null; then
    aws_cli ec2 authorize-security-group-ingress \
      --region "$AWS_REGION" \
      --group-id "$alb_sg" \
      --ip-permissions "file://$state_dir/cloudfront-ingress.json" >/dev/null
    prefix_ingress_created=true
    printf 'export CLOUDFRONT_INGRESS_CREATED=true\n' >>"$edge_state"
  fi
  while IFS= read -r public_rule_id; do
    [[ -n "$public_rule_id" ]] || continue
    aws_cli ec2 revoke-security-group-ingress \
      --region "$AWS_REGION" \
      --group-id "$alb_sg" \
      --security-group-rule-ids "$public_rule_id" >/dev/null
  done < <(non_cloudfront_origin_rule_ids \
    "$state_dir/security-group-before.json" "$prefix_list_id" 80)

  aws_cli ec2 describe-security-group-rules \
    --region "$AWS_REGION" \
    --filters "Name=group-id,Values=$alb_sg" \
    --output json >"$state_dir/security-group-hardened.json"
  assert_only_cloudfront_origin_ingress \
    "$state_dir/security-group-hardened.json" "$prefix_list_id" 80 || {
      printf 'ERROR: ALB ingress is not restricted to the CloudFront managed prefix list.\n' >&2
      return 1
    }

  "$CURL_BIN" --fail --silent --show-error \
    --retry 6 --retry-all-errors --retry-delay 5 \
    "https://${distribution_domain}/health" >/dev/null
  {
    printf 'export EDGE_STAGE=complete\n'
    printf 'export CLOUDFRONT_DISTRIBUTION_ID=%q\n' "$CLOUDFRONT_DISTRIBUTION_ID"
    printf 'export ALB_ARN=%q\n' "$alb_arn"
    printf 'export ALB_DNS=%q\n' "$alb_dns"
    printf 'export ALB_SECURITY_GROUP_ID=%q\n' "$alb_sg"
    printf 'export HTTP_LISTENER_ARN=%q\n' "$listener_arn"
    printf 'export ORIGIN_RULE_ARN=%q\n' "$rule_arn"
    printf 'export CLOUDFRONT_PREFIX_LIST_ID=%q\n' "$prefix_list_id"
    printf 'export CLOUDFRONT_INGRESS_CREATED=%q\n' "$prefix_ingress_created"
    printf 'export WAF_ARN=%q\n' "$waf_arn"
  } >"$edge_state"
  chmod 0600 "$edge_state"
  rm -f -- "$origin_secret_file" "$state_dir/listener-origin-conditions.json"
  unset origin_secret_value
  printf 'Edge hardened: https://%s\n' "$distribution_domain"
}

rollback_edge() {
  local state_dir edge_state listener_actions current_distribution current_etag
  local restore_distribution distribution_domain sg_rules prefix_rule_id original_rule_id
  local current_rules_file restore_permission restored_ids_file
  require_commands "$AWS_BIN" jq "$CURL_BIN"
  require_expected_account
  state_dir=$(init_state_dir "$DEPLOYMENT_ID")
  edge_state="$state_dir/edge-state.env"
  [[ -f "$edge_state" && -f "$state_dir/distribution-before.json" &&
     -f "$state_dir/listener-before.json" ]] || {
    printf 'ERROR: complete edge rollback state was not found.\n' >&2
    return 1
  }
  # shellcheck disable=SC1090
  source "$edge_state"
  [[ "${CLOUDFRONT_DISTRIBUTION_ID:-}" =~ ^E[A-Z0-9]+$ &&
     "${ALB_SECURITY_GROUP_ID:-}" == sg-* &&
     "${HTTP_LISTENER_ARN:-}" == arn:aws:elasticloadbalancing:* &&
     "${CLOUDFRONT_INGRESS_CREATED:-false}" =~ ^(true|false)$ ]] || {
    printf 'ERROR: edge rollback state is invalid.\n' >&2
    return 1
  }

  current_rules_file="$state_dir/security-group-rollback-current.json"
  restore_permission="$state_dir/security-group-restore-permission.json"
  restored_ids_file="$state_dir/security-group-restored-original-ids.txt"
  touch "$restored_ids_file"
  chmod 0600 "$restored_ids_file"
  aws_cli ec2 describe-security-group-rules \
    --region "$AWS_REGION" \
    --filters "Name=group-id,Values=$ALB_SECURITY_GROUP_ID" \
    --output json >"$current_rules_file"
  while IFS= read -r original_rule_id; do
    [[ -n "$original_rule_id" ]] || continue
    if jq -e --arg id "$original_rule_id" \
        'any(.SecurityGroupRules[]?; .SecurityGroupRuleId == $id)' \
        "$current_rules_file" >/dev/null ||
       grep -Fxq "$original_rule_id" "$restored_ids_file"; then
      continue
    fi
    security_group_rule_permission \
      "$state_dir/security-group-before.json" "$original_rule_id" \
      >"$restore_permission"
    aws_cli ec2 authorize-security-group-ingress \
      --region "$AWS_REGION" \
      --group-id "$ALB_SECURITY_GROUP_ID" \
      --ip-permissions "file://$restore_permission" >/dev/null
    printf '%s\n' "$original_rule_id" >>"$restored_ids_file"
  done < <(non_cloudfront_origin_rule_ids \
    "$state_dir/security-group-before.json" \
    "${CLOUDFRONT_PREFIX_LIST_ID:-}" 80)

  listener_actions="$state_dir/listener-restore-actions.json"
  jq --arg listener "$HTTP_LISTENER_ARN" \
    '[.Listeners[] | select(.ListenerArn == $listener) | .DefaultActions[]]' \
    "$state_dir/listener-before.json" >"$listener_actions"
  [[ $(jq 'length' "$listener_actions") -gt 0 ]] || {
    printf 'ERROR: prior listener action is missing from rollback state.\n' >&2
    return 1
  }
  aws_cli elbv2 modify-listener \
    --region "$AWS_REGION" \
    --listener-arn "$HTTP_LISTENER_ARN" \
    --default-actions "file://$listener_actions" >/dev/null
  if [[ "${ORIGIN_RULE_ARN:-}" == arn:aws:elasticloadbalancing:* ]]; then
    aws_cli elbv2 delete-rule \
      --region "$AWS_REGION" \
      --rule-arn "$ORIGIN_RULE_ARN" >/dev/null 2>&1 || true
  fi

  current_distribution=$(aws_cli cloudfront get-distribution-config \
    --id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --output json)
  current_etag=$(jq -r '.ETag' <<<"$current_distribution")
  restore_distribution="$state_dir/distribution-restore.json"
  jq '.DistributionConfig' "$state_dir/distribution-before.json" >"$restore_distribution"
  aws_cli cloudfront update-distribution \
    --id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --if-match "$current_etag" \
    --distribution-config "file://$restore_distribution" >/dev/null
  aws_cli cloudfront wait distribution-deployed \
    --id "$CLOUDFRONT_DISTRIBUTION_ID"
  distribution_domain=$(aws_cli cloudfront get-distribution \
    --id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --query 'Distribution.DomainName' \
    --output text)
  "$CURL_BIN" --fail --silent --show-error \
    --retry 6 --retry-all-errors --retry-delay 5 \
    "https://${distribution_domain}/health" >/dev/null

  if [[ "${CLOUDFRONT_INGRESS_CREATED:-false}" == true ]]; then
    sg_rules=$(aws_cli ec2 describe-security-group-rules \
      --region "$AWS_REGION" \
      --filters "Name=group-id,Values=$ALB_SECURITY_GROUP_ID" \
      --output json)
    while IFS= read -r prefix_rule_id; do
      [[ -n "$prefix_rule_id" ]] || continue
      aws_cli ec2 revoke-security-group-ingress \
        --region "$AWS_REGION" \
        --group-id "$ALB_SECURITY_GROUP_ID" \
        --security-group-rule-ids "$prefix_rule_id" >/dev/null
    done < <(jq -r --arg prefix "${CLOUDFRONT_PREFIX_LIST_ID:-}" '.SecurityGroupRules[]? |
      select(.IsEgress == false and .IpProtocol == "tcp" and .FromPort == 80 and
        .ToPort == 80 and .PrefixListId == $prefix) | .SecurityGroupRuleId' <<<"$sg_rules")
  fi
  printf 'Edge rollback complete: https://%s\n' "$distribution_domain"
}

rotate_jwt() {
  local state_dir secret_response old_secret new_secret rotation_state old_version new_version new_jwt
  local instance_id ssm_status actual_digest
  require_image_digest
  require_commands "$AWS_BIN" jq "$OPENSSL_BIN"
  require_expected_account
  instance_id=$(resolve_single_instance_id "$DEPLOYMENT_ID")
  resolve_instance_role "$instance_id"
  ssm_status=$(aws_cli ssm describe-instance-information \
    --region "$AWS_REGION" \
    --filters "Key=InstanceIds,Values=$instance_id" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text)
  [[ "$ssm_status" == Online ]] || {
    printf 'ERROR: instance %s is not online in Systems Manager.\n' "$instance_id" >&2
    return 1
  }
  actual_digest=$(aws_cli ecr describe-images \
    --region "$AWS_REGION" \
    --repository-name "$ECR_REPOSITORY" \
    --image-ids "imageDigest=$IMAGE_DIGEST" \
    --query 'imageDetails[0].imageDigest' \
    --output text)
  [[ "$actual_digest" == "$IMAGE_DIGEST" ]] || {
    printf 'ERROR: digest %s does not exist in %s.\n' "$IMAGE_DIGEST" "$ECR_REPOSITORY" >&2
    return 1
  }
  state_dir=$(init_state_dir "$DEPLOYMENT_ID")
  secret_response="$state_dir/app-secret-current.json"
  old_secret="$state_dir/app-secret-old.json"
  new_secret="$state_dir/app-secret-new.json"
  rotation_state="$state_dir/jwt-rotation.env"
  aws_cli secretsmanager get-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$APP_SECRET_NAME" \
    --version-stage AWSCURRENT \
    --output json >"$secret_response"
  old_version=$(jq -r '.VersionId' "$secret_response")
  jq -er '.SecretString | fromjson' "$secret_response" >"$old_secret"
  new_jwt=$($OPENSSL_BIN rand -hex 48)
  replace_json_secret_field "$old_secret" "$new_secret" JWT_SECRET "$new_jwt"
  jq -e --slurp '(.[0] | del(.JWT_SECRET)) == (.[1] | del(.JWT_SECRET))' \
    "$old_secret" "$new_secret" >/dev/null
  new_version=$(aws_cli secretsmanager put-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$APP_SECRET_NAME" \
    --secret-string "file://$new_secret" \
    --query VersionId \
    --output text)
  {
    printf 'export OLD_SECRET_VERSION=%q\n' "$old_version"
    printf 'export NEW_SECRET_VERSION=%q\n' "$new_version"
  } >"$rotation_state"
  chmod 0600 "$rotation_state"
  rm -f -- "$secret_response" "$old_secret" "$new_secret"
  unset new_jwt

  if ! deploy_image; then
    aws_cli secretsmanager update-secret-version-stage \
      --region "$AWS_REGION" \
      --secret-id "$APP_SECRET_NAME" \
      --version-stage AWSCURRENT \
      --move-to-version-id "$old_version" \
      --remove-from-version-id "$new_version" >/dev/null
    printf 'ERROR: deployment failed; AWSCURRENT was restored to the prior JWT version.\n' >&2
    return 1
  fi
  printf 'JWT_SECRET rotated for AWS; existing sessions must sign in again.\n'
}

rollback_jwt() {
  local state_dir rotation_state
  require_image_digest
  require_commands "$AWS_BIN" jq
  require_expected_account
  state_dir=$(init_state_dir "$DEPLOYMENT_ID")
  rotation_state="$state_dir/jwt-rotation.env"
  [[ -f "$rotation_state" ]] || { printf 'ERROR: no JWT rotation state exists.\n' >&2; return 1; }
  # shellcheck disable=SC1090
  source "$rotation_state"
  [[ "${OLD_SECRET_VERSION:-}" =~ ^[A-Za-z0-9-]{16,}$ &&
     "${NEW_SECRET_VERSION:-}" =~ ^[A-Za-z0-9-]{16,}$ ]] || {
    printf 'ERROR: JWT rotation state is invalid.\n' >&2
    return 1
  }
  aws_cli secretsmanager update-secret-version-stage \
    --region "$AWS_REGION" \
    --secret-id "$APP_SECRET_NAME" \
    --version-stage AWSCURRENT \
    --move-to-version-id "$OLD_SECRET_VERSION" \
    --remove-from-version-id "$NEW_SECRET_VERSION" >/dev/null
  deploy_image
  printf 'Prior JWT secret version restored.\n'
}

main() {
  local command_name=${1:-}
  [[ -n "$command_name" ]] || { usage >&2; return 2; }
  shift
  case "$command_name" in
    -h|--help|help) usage; return 0 ;;
  esac
  parse_options "$@"

  case "$command_name" in
    bootstrap-ci) bootstrap_ci ;;
    bootstrap-repository) bootstrap_repository ;;
    deploy-image) deploy_image ;;
    verify) verify_runtime ;;
    harden-runtime-role) harden_runtime_role ;;
    harden-edge) harden_edge ;;
    rollback-edge) rollback_edge ;;
    rotate-jwt) rotate_jwt ;;
    rollback-jwt) rollback_jwt ;;
    *) printf 'ERROR: unknown command: %s\n' "$command_name" >&2; usage >&2; return 2 ;;
  esac
}

main "$@"
