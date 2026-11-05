#!/usr/bin/env bash
set -Eeuo pipefail

TEST_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
AWS_DIR=$(cd -- "$TEST_DIR/.." && pwd)
failures=0

fail() {
  printf 'not ok - %s\n' "$1" >&2
  failures=$((failures + 1))
}

pass() {
  printf 'ok - %s\n' "$1"
}

tmp_dir=$(mktemp -d)
trap 'rm -rf -- "$tmp_dir"' EXIT

fake_aws="$tmp_dir/aws"
cat >"$fake_aws" <<'FAKE_AWS'
#!/usr/bin/env bash
case "$1 $2" in
  'ecr wait') exit 0 ;;
  'ecr describe-image-scan-findings') printf '%s\n' "$SCAN_JSON" ;;
  *) printf 'Unexpected fake AWS call: %s\n' "$*" >&2; exit 64 ;;
esac
FAKE_AWS
chmod +x "$fake_aws"

export AWS_BIN="$fake_aws"
export AWS_REGION=us-east-1
repository=astra-agents-demo-app
digest=sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
allowlist="$tmp_dir/allowlist.json"

future_date=$(date -u -d '+7 days' +%F)
jq -n --arg expires "$future_date" '[{
  id: "CVE-2099-0001",
  owner: "Test owner",
  expires: $expires,
  reason: "Test-only unresolved vendor finding"
}]' >"$allowlist"

export SCAN_JSON='{"imageScanStatus":{"status":"COMPLETE"},"imageScanFindings":{"findingSeverityCounts":{"HIGH":1},"findings":[{"name":"CVE-2099-0001","severity":"HIGH"}]}}'
if "$AWS_DIR/verify-image-scan.sh" "$repository" "$digest" "$allowlist" >/dev/null; then
  pass 'scan policy accepts an unexpired allowlisted high finding'
else
  fail 'scan policy accepts an unexpired allowlisted high finding'
fi

export SCAN_JSON='{"imageScanStatus":{"status":"COMPLETE"},"imageScanFindings":{"findingSeverityCounts":{"CRITICAL":1},"findings":[{"name":"CVE-2099-0002","severity":"CRITICAL"}]}}'
if "$AWS_DIR/verify-image-scan.sh" "$repository" "$digest" "$allowlist" >/dev/null 2>&1; then
  fail 'scan policy blocks every critical finding'
else
  pass 'scan policy blocks every critical finding'
fi

export SCAN_JSON='{"imageScanStatus":{"status":"COMPLETE"},"imageScanFindings":{"findingSeverityCounts":{"HIGH":1},"findings":[{"name":"CVE-2099-0002","severity":"HIGH"}]}}'
if "$AWS_DIR/verify-image-scan.sh" "$repository" "$digest" "$allowlist" >/dev/null 2>&1; then
  fail 'scan policy blocks an unexpected high finding'
else
  pass 'scan policy blocks an unexpected high finding'
fi

export SCAN_JSON='{"imageScanStatus":{"status":"COMPLETE"},"imageScanFindings":{"findingSeverityCounts":{"CRITICAL":1},"enhancedFindings":[{"severity":"CRITICAL","packageVulnerabilityDetails":{"vulnerabilityId":"CVE-2099-0002"}}]}}'
if "$AWS_DIR/verify-image-scan.sh" "$repository" "$digest" "$allowlist" >/dev/null 2>&1; then
  fail 'scan policy blocks an enhanced critical finding'
else
  pass 'scan policy blocks an enhanced critical finding'
fi

export SCAN_JSON='{"imageScanStatus":{"status":"COMPLETE"},"imageScanFindings":{"findingSeverityCounts":{"HIGH":1},"enhancedFindings":[{"severity":"HIGH","packageVulnerabilityDetails":{"vulnerabilityId":"CVE-2099-0002"}}]}}'
if "$AWS_DIR/verify-image-scan.sh" "$repository" "$digest" "$allowlist" >/dev/null 2>&1; then
  fail 'scan policy blocks an unexpected enhanced high finding'
else
  pass 'scan policy blocks an unexpected enhanced high finding'
fi

export SCAN_JSON='{"imageScanStatus":{"status":"COMPLETE"},"imageScanFindings":{"findingSeverityCounts":{"HIGH":2},"findings":[{"name":"CVE-2099-0001","severity":"HIGH"}]}}'
if "$AWS_DIR/verify-image-scan.sh" "$repository" "$digest" "$allowlist" >/dev/null 2>&1; then
  fail 'scan policy fails closed when severity counts do not match findings'
else
  pass 'scan policy fails closed when severity counts do not match findings'
fi

cat >"$allowlist" <<'JSON'
[
  {
    "id": "CVE-2099-0001",
    "owner": "Test owner",
    "expires": "2000-01-01",
    "reason": "Expired test entry"
  }
]
JSON
export SCAN_JSON='{"imageScanStatus":{"status":"COMPLETE"},"imageScanFindings":{"findingSeverityCounts":{"HIGH":1},"findings":[{"name":"CVE-2099-0001","severity":"HIGH"}]}}'
if "$AWS_DIR/verify-image-scan.sh" "$repository" "$digest" "$allowlist" >/dev/null 2>&1; then
  fail 'scan policy blocks expired high-finding exceptions'
else
  pass 'scan policy blocks expired high-finding exceptions'
fi

cat >"$allowlist" <<'JSON'
[
  {
    "id": "CVE-2099-0001",
    "owner": "Test owner",
    "expires": "2099-99-99",
    "reason": "Malformed date"
  }
]
JSON
if "$AWS_DIR/verify-image-scan.sh" "$repository" "$digest" "$allowlist" >/dev/null 2>&1; then
  fail 'scan policy rejects a malformed exception date'
else
  pass 'scan policy rejects a malformed exception date'
fi

excessive_date=$(date -u -d '+90 days' +%F)
jq -n --arg expires "$excessive_date" '[{
  id: "CVE-2099-0001",
  owner: "Test owner",
  expires: $expires,
  reason: "Excessive exception lifetime"
}]' >"$allowlist"
if "$AWS_DIR/verify-image-scan.sh" "$repository" "$digest" "$allowlist" >/dev/null 2>&1; then
  fail 'scan policy rejects an exception longer than 31 days'
else
  pass 'scan policy rejects an exception longer than 31 days'
fi

if (( failures != 0 )); then
  printf '%s test(s) failed\n' "$failures" >&2
  exit 1
fi
