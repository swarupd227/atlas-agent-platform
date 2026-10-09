#!/usr/bin/env bash
set -Eeuo pipefail

TEST_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
AWS_DIR=$(cd -- "$TEST_DIR/.." && pwd)
REPO_ROOT=$(cd -- "$AWS_DIR/../.." && pwd)

failures=0
fail() { printf 'not ok - %s\n' "$1" >&2; failures=$((failures + 1)); }
pass() { printf 'ok - %s\n' "$1"; }

tmp_dir=$(mktemp -d)
trap 'rm -rf -- "$tmp_dir"' EXIT

fake_aws="$tmp_dir/aws"
cat >"$fake_aws" <<'FAKE_AWS'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_AWS_LOG"
case "$1 $2" in
  'sts get-caller-identity') printf '964604400233\n' ;;
  'iam get-open-id-connect-provider') printf '{"ClientIDList":["sts.amazonaws.com"]}\n' ;;
  'iam get-role') exit 254 ;;
  'iam create-role') printf 'arn:aws:iam::964604400233:role/astra-agents-github-ecr-push\n' ;;
  'iam put-role-policy') exit 0 ;;
  'ecr describe-repositories') exit 254 ;;
  'ecr create-repository') printf '964604400233.dkr.ecr.us-east-1.amazonaws.com/astra-agents-demo-app\n' ;;
  'ecr put-image-tag-mutability'|'ecr put-image-scanning-configuration'|'ecr put-lifecycle-policy') exit 0 ;;
  *) printf 'Unexpected fake AWS call: %s\n' "$*" >&2; exit 64 ;;
esac
FAKE_AWS
chmod +x "$fake_aws"

export AWS_BIN="$fake_aws"
export FAKE_AWS_LOG="$tmp_dir/aws.log"
export ASTRA_STATE_ROOT="$tmp_dir/state"
export AWS_REGION=us-east-1

if "$AWS_DIR/operate.sh" bootstrap-ci --deployment-id demo >/dev/null; then
  pass 'bootstrap-ci completes against an empty account role'
else
  fail 'bootstrap-ci completes against an empty account role'
fi

trust="$ASTRA_STATE_ROOT/demo/ci-trust-policy.json"
policy="$ASTRA_STATE_ROOT/demo/ci-ecr-policy.json"

if jq -e '
  .Statement | length == 1 and
  .[0].Principal.Federated == "arn:aws:iam::964604400233:oidc-provider/token.actions.githubusercontent.com" and
  .[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com" and
  .[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:swarupd227/atlas-agent-platform:ref:refs/heads/main"
' "$trust" >/dev/null; then
  pass 'trust is restricted to the repository main ref and STS audience'
else
  fail 'trust is restricted to the repository main ref and STS audience'
fi

if jq -e '
  ([.Statement[].Action] | flatten | all(startswith("ecr:"))) and
  any(.Statement[]; .Action == "ecr:GetAuthorizationToken" and .Resource == "*") and
  any(.Statement[]; .Resource as $resource |
    ($resource | type == "string") and
    ($resource | endswith(":repository/astra-agents-*-app")))
' "$policy" >/dev/null; then
  pass 'CI permissions are confined to ECR and Astra repositories'
else
  fail 'CI permissions are confined to ECR and Astra repositories'
fi

if grep -Eq 'ssm:|secretsmanager:|ec2:|cloudfront:|wafv2:|rds:' "$policy"; then
  fail 'CI policy excludes deployment and secret services'
else
  pass 'CI policy excludes deployment and secret services'
fi

: >"$FAKE_AWS_LOG"
if "$AWS_DIR/operate.sh" bootstrap-repository --deployment-id demo >/dev/null &&
   grep -Fq 'ecr create-repository' "$FAKE_AWS_LOG" &&
   grep -Fq -- '--image-tag-mutability IMMUTABLE' "$FAKE_AWS_LOG" &&
   grep -Fq -- 'scanOnPush=true' "$FAKE_AWS_LOG"; then
  pass 'repository bootstrap creates an immutable scan-on-push ECR repository'
else
  fail 'repository bootstrap creates an immutable scan-on-push ECR repository'
fi

workflow="$REPO_ROOT/.github/workflows/build-aws-image.yml"
if node --input-type=module - "$workflow" <<'NODE'
import fs from 'node:fs';
import YAML from 'yaml';
const workflow = YAML.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dispatch = workflow.on?.workflow_dispatch;
if (!dispatch?.inputs?.source_ref?.required || !dispatch?.inputs?.deployment_id?.required) process.exit(1);
if (workflow.permissions?.contents !== 'read' || workflow.permissions?.['id-token'] !== 'write') process.exit(1);
const text = JSON.stringify(workflow);
if (!text.includes('docker build') || !text.includes('docker push')) process.exit(1);
if (/ssm:|secretsmanager:|aws ssm|aws secretsmanager/.test(text)) process.exit(1);
NODE
then
  pass 'workflow is manual, OIDC-enabled, builds and pushes without deployment access'
else
  fail 'workflow is manual, OIDC-enabled, builds and pushes without deployment access'
fi

if (( failures != 0 )); then
  printf '%s test(s) failed\n' "$failures" >&2
  exit 1
fi
