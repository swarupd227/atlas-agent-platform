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

usage() {
  cat <<'USAGE'
Usage: deploy/aws/operate.sh <command> --deployment-id <id> [options]

Commands:
  bootstrap-ci   Create or update the GitHub OIDC ECR-push role.
  deploy-image   Deploy an existing ECR image digest through SSM.
  verify         Verify the exact digest and local application health.
  harden-runtime-role
                 Restrict the EC2 role to runtime pull/read access.
USAGE
}

parse_options() {
  DEPLOYMENT_ID=${DEPLOYMENT_ID:-}
  IMAGE_DIGEST=${IMAGE_DIGEST:-}
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
            "ecr:DescribeImages"
          ],
          Resource: $repositories
        }
      ]
    }
  ' >"$policy_file"

  if aws_cli iam get-role --role-name "$GITHUB_DEPLOY_ROLE" >/dev/null 2>&1; then
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

  printf 'GitHub role ready: %s\n' "$role_arn"
}

harden_runtime_role() {
  local state_dir policy_file role_name repository_arn app_secret_arn log_group_arn
  require_commands "$AWS_BIN" jq
  require_expected_account
  state_dir=$(init_state_dir "$DEPLOYMENT_ID")
  policy_file="$state_dir/ec2-runtime-policy.json"
  role_name="${RESOURCE_PREFIX}-role"
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

main() {
  local command_name=${1:-}
  [[ -n "$command_name" ]] || { usage >&2; return 2; }
  shift
  parse_options "$@"

  case "$command_name" in
    bootstrap-ci) bootstrap_ci ;;
    deploy-image) deploy_image ;;
    verify) verify_runtime ;;
    harden-runtime-role) harden_runtime_role ;;
    -h|--help|help) usage ;;
    *) printf 'ERROR: unknown command: %s\n' "$command_name" >&2; usage >&2; return 2 ;;
  esac
}

main "$@"
