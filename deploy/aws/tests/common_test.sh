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

if (( failures != 0 )); then
  printf '%s test(s) failed\n' "$failures" >&2
  exit 1
fi
