# Astra Agents on AWS EC2

This directory is the authoritative AWS deployment runbook. It creates or updates an isolated deployment without writing to Azure. Azure CLI access is used only to read the existing App Service settings and PostgreSQL connection for a fresh migration.

## Deployment phases

1. **Build:** GitHub Actions resolves the requested ref, permits only commits contained in `origin/main`, builds one image, and pushes it to the deployment's immutable ECR repository.
2. **Provision:** `provision.sh` creates the isolated VPC, RDS database, ALB, CloudFront distribution, EC2 instance, migration, and AWS-only secrets. EC2 pulls an exact image digest; it never builds or pushes an image.
3. **Harden:** `operate.sh` restricts the EC2 role, authenticates CloudFront-to-ALB requests, limits ALB ingress to the CloudFront managed prefix list, attaches WAF, and rotates only the AWS JWT secret when requested.
4. **Verify or remove:** Runtime verification checks the exact digest and local health through SSM. `cleanup.sh` deletes only the deployment recorded in its state directory.

## Prerequisites

- Bash, AWS CLI v2, Azure CLI, Git, GitHub CLI, `jq`, `curl`, and `openssl`.
- AWS account `964604400233` in `us-east-1`.
- An authenticated AWS profile and Azure session. Authentication is deliberately outside the scripts.
- GitHub collaborator access to `swarupd227/atlas-agent-platform`.
- For a fresh migration, Azure PostgreSQL must accept the printed AWS NAT public IP before Phase 7 runs.

```bash
aws login --remote
aws sts get-caller-identity
az login
az account show --output table
gh auth login
```

All commands below run from the repository root.

## One-time GitHub OIDC role

```bash
deploy/aws/operate.sh bootstrap-ci --deployment-id demo
```

The GitHub role can push only to `astra-agents-*-app` ECR repositories. It cannot invoke SSM, read Secrets Manager, or change EC2. The EC2 role is separately limited to image pulls, its application secret, and its application log group.

## Build the latest approved main commit

Create or normalize the deployment ECR repository first:

```bash
export DEPLOYMENT_ID=demo
deploy/aws/operate.sh bootstrap-repository --deployment-id "$DEPLOYMENT_ID"
```

Start the manual workflow and wait for it:

```bash
gh workflow run build-aws-image.yml \
  --ref main \
  -f source_ref=main \
  -f deployment_id="$DEPLOYMENT_ID"

RUN_ID=$(gh run list \
  --workflow build-aws-image.yml \
  --branch main \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

Resolve the latest `main` commit and its immutable digest. Both checks must succeed:

```bash
export COMMIT_SHA
COMMIT_SHA=$(git ls-remote https://github.com/swarupd227/atlas-agent-platform.git \
  refs/heads/main | awk 'NR == 1 {print $1}')
[[ "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]

export IMAGE_DIGEST
IMAGE_DIGEST=$(aws ecr describe-images \
  --region us-east-1 \
  --repository-name "astra-agents-${DEPLOYMENT_ID}-app" \
  --image-ids "imageTag=$COMMIT_SHA" \
  --query 'imageDetails[0].imageDigest' \
  --output text)
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]
```

## Update the existing demo safely

The following commands target exactly one running EC2 instance whose tags are `Name=astra-agents-demo-app` and `Environment=demo-isolated`. Zero or multiple matches stop before mutation.

```bash
export DEPLOYMENT_ID=demo
export DISTRIBUTION_ID=E1GWRYUCBXLAI7
export IMAGE_DIGEST='<sha256 digest returned above>'

deploy/aws/operate.sh harden-runtime-role --deployment-id "$DEPLOYMENT_ID"
deploy/aws/operate.sh deploy-image \
  --deployment-id "$DEPLOYMENT_ID" \
  --digest "$IMAGE_DIGEST"
deploy/aws/operate.sh verify \
  --deployment-id "$DEPLOYMENT_ID" \
  --digest "$IMAGE_DIGEST"
deploy/aws/operate.sh harden-edge \
  --deployment-id "$DEPLOYMENT_ID" \
  --distribution-id "$DISTRIBUTION_ID"
deploy/aws/operate.sh rotate-jwt \
  --deployment-id "$DEPLOYMENT_ID" \
  --digest "$IMAGE_DIGEST"
```

`rotate-jwt` changes only `JWT_SECRET` in the AWS application secret. It does not change the admin password, SSO, vault key, audit key, AI keys, Azure settings, or Azure resources. Existing AWS browser sessions must sign in again.

The WAF IP reputation rule blocks immediately. Common, known-bad-input, and rate rules start in Count mode so their sampled requests can be reviewed before a later promotion to Block.

Default application URL:

```text
https://dosxs94skuhq2.cloudfront.net
```

## Roll back the existing demo

Container deployment automatically restores the prior container if the replacement fails its local health check. To undo a completed JWT rotation or edge hardening, use the captured deployment state:

```bash
deploy/aws/operate.sh rollback-jwt \
  --deployment-id demo \
  --digest "$IMAGE_DIGEST"

deploy/aws/operate.sh rollback-edge --deployment-id demo
```

Edge rollback intentionally restores the previously public ALB configuration. Use it only to recover service, then diagnose before hardening again.

## Create a fresh isolated deployment

Choose a new deployment ID; do not reuse `demo` or another instance's ID.

```bash
export DEPLOYMENT_ID=teamdemo
deploy/aws/operate.sh bootstrap-repository --deployment-id "$DEPLOYMENT_ID"
```

Run the build workflow for this ID, then resolve `COMMIT_SHA` and `IMAGE_DIGEST` with the commands in the build section. Start provisioning only after the digest exists:

```bash
export ASTRA_STATE_ROOT="$PWD/deploy/aws/state"
DEPLOYMENT_ID="$DEPLOYMENT_ID" \
IMAGE_DIGEST="$IMAGE_DIGEST" \
ASTRA_STATE_ROOT="$ASTRA_STATE_ROOT" \
  deploy/aws/provision.sh
```

The provisioner prints every phase and the final CloudFront URL. It reads Azure settings and source data but does not edit Azure. It generates a distinct AWS JWT secret, application database password, CloudFront origin secret, VPC, EC2 instance, RDS database, ALB, CloudFront distribution, and WAF for the deployment ID.

## Delete one complete deployment

This permanently removes the deployment recorded at `deploy/aws/state/<deployment-id>/deployment-state.env`, including EC2, RDS, ALB, CloudFront, WAF, WAF logs, ECR, secrets, IAM, NAT, subnets, security groups, and VPC. RDS is deleted without a final snapshot.

```bash
export DEPLOYMENT_ID=teamdemo
export ASTRA_STATE_ROOT="$PWD/deploy/aws/state"
ASTRA_STATE_ROOT="$ASTRA_STATE_ROOT" deploy/aws/cleanup.sh
```

At the prompt, type exactly:

```text
DELETE teamdemo PERMANENTLY
```

To terminate only the recorded EC2 instance while retaining all other billable resources:

```bash
source "deploy/aws/state/$DEPLOYMENT_ID/deployment-state.env"
aws ec2 terminate-instances --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-terminated --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
```

## Explicitly out of scope

- No custom domain or ACM certificate is configured; the default CloudFront HTTPS URL remains in use.
- No Route 53 or external DNS record is changed.
- No Bedrock migration or AI-provider routing change is made.
- No SSO or bootstrap-admin-password change is made.
- No Azure application, database, setting, or resource is modified.
