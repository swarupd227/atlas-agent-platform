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
printf '%s\n' "$*" >>"$FAKE_AWS_LOG"
case "$1 $2" in
  'sts get-caller-identity') printf '964604400233\n' ;;
  'ec2 describe-instances') printf 'i-0123456789abcdef0\n' ;;
  'ssm describe-instance-information') printf 'Online\n' ;;
  'ecr describe-repositories') printf '964604400233.dkr.ecr.us-east-1.amazonaws.com/astra-agents-demo-app\n' ;;
  'ecr describe-images') printf '%s\n' "$EXPECTED_DIGEST" ;;
  'ssm send-command') printf 'command-123\n' ;;
  'ssm get-command-invocation') printf '{"Status":"Success","StandardOutputContent":"healthy","StandardErrorContent":""}\n' ;;
  'iam put-role-policy') exit 0 ;;
  *) printf 'Unexpected fake AWS call: %s\n' "$*" >&2; exit 64 ;;
esac
FAKE_AWS
chmod +x "$fake_aws"

export AWS_BIN="$fake_aws"
export FAKE_AWS_LOG="$tmp_dir/aws.log"
export ASTRA_STATE_ROOT="$tmp_dir/state"
export AWS_REGION=us-east-1
export EXPECTED_DIGEST='sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

: >"$FAKE_AWS_LOG"
if "$AWS_DIR/operate.sh" deploy-image --deployment-id demo --digest latest >/dev/null 2>&1; then
  fail 'deploy-image rejects mutable image references'
else
  pass 'deploy-image rejects mutable image references'
fi
if [[ ! -s "$FAKE_AWS_LOG" ]]; then
  pass 'invalid digests fail before AWS access'
else
  fail 'invalid digests fail before AWS access'
fi

: >"$FAKE_AWS_LOG"
if "$AWS_DIR/operate.sh" deploy-image \
  --deployment-id demo --digest "$EXPECTED_DIGEST" >/dev/null; then
  pass 'deploy-image accepts an existing immutable ECR digest'
else
  fail 'deploy-image accepts an existing immutable ECR digest'
fi

if grep -Fq -- '--instance-ids i-0123456789abcdef0' "$FAKE_AWS_LOG" &&
   ! grep -Fq -- '--targets' "$FAKE_AWS_LOG"; then
  pass 'SSM deployment targets the single resolved instance id'
else
  fail 'SSM deployment targets the single resolved instance id'
fi

remote_script="$ASTRA_STATE_ROOT/demo/deploy-container.sh"
if grep -Fq "@${EXPECTED_DIGEST}" "$remote_script" &&
   grep -Fq 'docker rename astra-agents astra-agents-rollback' "$remote_script" &&
   grep -Fq 'restore_previous_container' "$remote_script" &&
   grep -Fq "jq -r 'to_entries[]" "$remote_script" &&
   grep -Fq 'NODE_EXTRA_CA_CERTS=/etc/ssl/certs/aws-rds-global-bundle.pem' "$remote_script" &&
   grep -Fq 'http://127.0.0.1:5000/health' "$remote_script"; then
  pass 'remote deployment renders JSON secrets and contains health rollback'
else
  fail 'remote deployment renders JSON secrets and contains health rollback'
fi

: >"$FAKE_AWS_LOG"
if "$AWS_DIR/operate.sh" harden-runtime-role --deployment-id demo >/dev/null; then
  pass 'runtime role hardening completes'
else
  fail 'runtime role hardening completes'
fi

runtime_policy="$ASTRA_STATE_ROOT/demo/ec2-runtime-policy.json"
if jq -e '
  ([.Statement[].Action] | flatten) as $actions |
  ($actions | index("ecr:BatchGetImage") != null) and
  ($actions | index("ecr:GetDownloadUrlForLayer") != null) and
  ($actions | index("ecr:PutImage") == null) and
  ($actions | index("ecr:InitiateLayerUpload") == null) and
  ($actions | index("ecr:UploadLayerPart") == null) and
  ($actions | index("ecr:CompleteLayerUpload") == null)
' "$runtime_policy" >/dev/null; then
  pass 'EC2 policy retains pull actions and removes every push action'
else
  fail 'EC2 policy retains pull actions and removes every push action'
fi

: >"$FAKE_AWS_LOG"
if "$AWS_DIR/operate.sh" verify \
  --deployment-id demo --digest "$EXPECTED_DIGEST" >/dev/null; then
  pass 'runtime verification completes for an immutable digest'
else
  fail 'runtime verification completes for an immutable digest'
fi

verify_script="$ASTRA_STATE_ROOT/demo/verify-container.sh"
if grep -Fq 'docker inspect' "$verify_script" &&
   grep -Fq "$EXPECTED_DIGEST" "$verify_script" &&
   grep -Fq 'http://127.0.0.1:5000/health' "$verify_script" &&
   grep -Fq -- '--instance-ids i-0123456789abcdef0' "$FAKE_AWS_LOG"; then
  pass 'verification checks the exact instance, digest, and local health'
else
  fail 'verification checks the exact instance, digest, and local health'
fi

if (( failures != 0 )); then
  printf '%s test(s) failed\n' "$failures" >&2
  exit 1
fi
