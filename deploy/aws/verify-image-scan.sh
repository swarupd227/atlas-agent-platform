#!/usr/bin/env bash
set -Eeuo pipefail

AWS_BIN=${AWS_BIN:-aws}
AWS_REGION=${AWS_REGION:-us-east-1}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

repository=${1:-}
digest=${2:-}
allowlist=${3:-"$SCRIPT_DIR/ecr-high-allowlist.json"}

die() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

[[ "$repository" =~ ^astra-agents-[a-z0-9][a-z0-9-]{0,11}-app$ ]] ||
  die "invalid Astra ECR repository: $repository"
[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || die 'image digest must be immutable sha256'
[[ -f "$allowlist" ]] || die "ECR High allowlist not found: $allowlist"

jq -e '
  type == "array" and
  all(.[];
    (.id | type == "string" and test("^CVE-[0-9]{4}-[0-9]+$")) and
    (.owner | type == "string" and length > 0) and
    (.expires | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")) and
    (.reason | type == "string" and length > 0)
  ) and
  ((map(.id) | length) == (map(.id) | unique | length))
' "$allowlist" >/dev/null || die 'invalid ECR High allowlist'

today=$(date -u +%F)
today_epoch=$(date -u -d "$today" +%s)
maximum_epoch=$(date -u -d "$today +31 days" +%s)
while IFS=$'\t' read -r id expiry; do
  normalized_expiry=$(date -u -d "$expiry" +%F 2>/dev/null) ||
    die "invalid expiry date for $id: $expiry"
  [[ "$normalized_expiry" == "$expiry" ]] || die "invalid expiry date for $id: $expiry"
  expiry_epoch=$(date -u -d "$expiry" +%s)
  (( expiry_epoch >= today_epoch )) || die "expired ECR High allowlist entry: $id"
  (( expiry_epoch <= maximum_epoch )) || die "ECR High allowlist entry exceeds 31 days: $id"
done < <(jq -r '.[] | [.id, .expires] | @tsv' "$allowlist")

"$AWS_BIN" ecr wait image-scan-complete \
  --region "$AWS_REGION" \
  --repository-name "$repository" \
  --image-id "imageDigest=$digest"

scan=$("$AWS_BIN" ecr describe-image-scan-findings \
  --region "$AWS_REGION" \
  --repository-name "$repository" \
  --image-id "imageDigest=$digest" \
  --output json)

status=$(jq -r '.imageScanStatus.status // "UNKNOWN"' <<<"$scan")
[[ "$status" == COMPLETE ]] || die "ECR scan status is $status"

normalized_findings=$(jq -c '[
  (.imageScanFindings.findings[]? | {
    id: .name,
    severity: .severity
  }),
  (.imageScanFindings.enhancedFindings[]? | {
    id: .packageVulnerabilityDetails.vulnerabilityId,
    severity: .severity
  })
]' <<<"$scan")

jq -e '
  type == "array" and
  all(.[];
    (.id | type == "string" and length > 0) and
    (.severity | IN("UNDEFINED", "INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"))
  )
' <<<"$normalized_findings" >/dev/null || die 'unrecognized ECR finding shape'

enumerated_counts=$(jq -c '
  group_by(.severity) |
  map({key: .[0].severity, value: length}) |
  from_entries
' <<<"$normalized_findings")
jq -e --argjson enumerated "$enumerated_counts" '
  (.imageScanFindings.findingSeverityCounts // {}) == $enumerated
' <<<"$scan" >/dev/null || die 'ECR severity counts do not match enumerated findings'

criticals=$(jq -r '.[] | select(.severity == "CRITICAL") | .id' \
  <<<"$normalized_findings" | sort -u)
[[ -z "$criticals" ]] || die "Critical ECR findings: ${criticals//$'\n'/, }"

unexpected_highs=$(jq -r --slurpfile allowed "$allowlist" '
  ($allowed[0] | map(.id)) as $ids |
  .[] |
  select(.severity == "HIGH" and (.id as $id | ($ids | index($id) | not))) |
  .id
' <<<"$normalized_findings" | sort -u)
[[ -z "$unexpected_highs" ]] || die "unexpected High ECR findings: ${unexpected_highs//$'\n'/, }"

jq -c '.imageScanFindings.findingSeverityCounts // {}' <<<"$scan"
