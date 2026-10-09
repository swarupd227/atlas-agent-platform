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
USAGE
}

parse_deployment_id() {
  DEPLOYMENT_ID=${DEPLOYMENT_ID:-}
  while (( $# )); do
    case "$1" in
      --deployment-id)
        (( $# >= 2 )) || { printf 'ERROR: --deployment-id requires a value.\n' >&2; return 2; }
        DEPLOYMENT_ID=$2
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

main() {
  local command_name=${1:-}
  [[ -n "$command_name" ]] || { usage >&2; return 2; }
  shift
  parse_deployment_id "$@"

  case "$command_name" in
    bootstrap-ci) bootstrap_ci ;;
    -h|--help|help) usage ;;
    *) printf 'ERROR: unknown command: %s\n' "$command_name" >&2; usage >&2; return 2 ;;
  esac
}

main "$@"
