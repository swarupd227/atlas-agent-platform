#!/usr/bin/env bash
set -Eeuo pipefail

TEST_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
AWS_DIR=$(cd -- "$TEST_DIR/.." && pwd)
PROVISION="$AWS_DIR/provision.sh"
CLEANUP="$AWS_DIR/cleanup.sh"

failures=0
fail() { printf 'not ok - %s\n' "$1" >&2; failures=$((failures + 1)); }
pass() { printf 'ok - %s\n' "$1"; }

if grep -Eq 'docker[[:space:]]+build|docker[[:space:]]+push|git[[:space:]]+clone' "$PROVISION"; then
  fail 'provisioner never builds or pushes on EC2'
else
  pass 'provisioner never builds or pushes on EC2'
fi

if grep -Eq 'ecr:(PutImage|InitiateLayerUpload|UploadLayerPart|CompleteLayerUpload)' "$PROVISION"; then
  fail 'provisioned EC2 policy has no ECR push actions'
else
  pass 'provisioned EC2 policy has no ECR push actions'
fi

if grep -Fq 'IMAGE_DIGEST' "$PROVISION" &&
   grep -Fq 'sha256:[0-9a-f]{64}' "$PROVISION" &&
   grep -Fq 'operate.sh" deploy-image' "$PROVISION"; then
  pass 'provisioner requires and deploys an immutable digest'
else
  fail 'provisioner requires and deploys an immutable digest'
fi

if grep -Fq 'AWS_JWT_SECRET=$(openssl rand' "$PROVISION" &&
   grep -Fq 'JWT_SECRET: $JWT_SECRET' "$PROVISION" &&
   ! grep -Fq 'JWT_SECRET: setting("JWT_SECRET")' "$PROVISION"; then
  pass 'fresh AWS deployment creates a distinct JWT secret'
else
  fail 'fresh AWS deployment creates a distinct JWT secret'
fi

if grep -Eq '^[[:space:]]*aws login|^[[:space:]]*az login' "$PROVISION"; then
  fail 'provisioner does not initiate interactive authentication'
else
  pass 'provisioner does not initiate interactive authentication'
fi

if grep -Fq 'operate.sh" harden-edge' "$PROVISION" &&
   grep -Fq 'operate.sh" harden-runtime-role' "$PROVISION"; then
  pass 'fresh deployment applies runtime and edge hardening'
else
  fail 'fresh deployment applies runtime and edge hardening'
fi

if grep -Fq 'wafv2 delete-web-acl' "$CLEANUP" &&
   grep -Fq 'WAF_LOG_GROUP' "$CLEANUP" &&
   grep -Fq 'ORIGIN_SECRET_NAME' "$CLEANUP"; then
  pass 'cleanup owns WAF, WAF logs, and the origin secret'
else
  fail 'cleanup owns WAF, WAF logs, and the origin secret'
fi

if (( failures != 0 )); then
  printf '%s test(s) failed\n' "$failures" >&2
  exit 1
fi
