#!/usr/bin/env bash
# Creates a complete, isolated Astra Agents AWS deployment.
# Azure operations in this script are read-only.
set -Eeuo pipefail
umask 077
export AWS_PAGER=""
trap 'status=$?; printf "ERROR: deployment failed at line %s (exit %s).\n" "$LINENO" "$status" >&2; exit "$status"' ERR
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for required_command in aws az jq curl openssl awk sed grep; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'ERROR: required command is not installed: %s\n' "$required_command" >&2
    exit 1
  fi
done

show_phase() {
  printf '\n[%s] [Phase %s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2"
}

show_phase "0/10" "Validate authentication and pin deployment inputs"
# Phase 0.1 — Validate existing read/write sessions
aws sts get-caller-identity
az account show --output table

# Phase 0.2 — Validate the immutable CI image and initialize state
set -Eeuo pipefail
umask 077

export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION="$AWS_REGION"
export ACCOUNT_ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [[ "$ACCOUNT_ID" != 964604400233 ]]; then
  printf 'ERROR: authenticated AWS account %s is not the approved account 964604400233.\n' \
    "$ACCOUNT_ID" >&2
  exit 1
fi

export REPOSITORY_URL=https://github.com/swarupd227/atlas-agent-platform.git
export AZURE_RESOURCE_GROUP=astra-agents-rg
export AZURE_WEBAPP=astra-agents-artizent

export DEPLOYMENT_ID="${DEPLOYMENT_ID:-demo}"
if [[ ! "$DEPLOYMENT_ID" =~ ^[a-z0-9][a-z0-9-]{0,11}$ ]]; then
  printf 'ERROR: DEPLOYMENT_ID must use 1-12 lowercase letters, numbers, or hyphens.\n' >&2
  exit 1
fi

export APP_NAME=astra-agents
export RESOURCE_PREFIX="astra-agents-$DEPLOYMENT_ID"
export ENVIRONMENT="${DEPLOYMENT_ID}-isolated"
export EC2_INSTANCE_NAME="${EC2_INSTANCE_NAME:-${RESOURCE_PREFIX}-app}"
export ASTRA_STATE_ROOT="${ASTRA_STATE_ROOT:-$SCRIPT_DIR/state}"
export WORK_DIR="$ASTRA_STATE_ROOT/$DEPLOYMENT_ID"
export STATE_FILE="$WORK_DIR/deployment-state.env"

export ECR_REPOSITORY="${RESOURCE_PREFIX}-app"
export LOG_GROUP="/ec2/${RESOURCE_PREFIX}/app"
export DB_SUBNET_GROUP="${RESOURCE_PREFIX}-db-subnets"
export DB_INSTANCE_ID="${RESOURCE_PREFIX}-db"
export TARGET_GROUP_NAME="${RESOURCE_PREFIX}-tg"
export ALB_NAME="${RESOURCE_PREFIX}-alb"
export EC2_ROLE_NAME="${RESOURCE_PREFIX}-role"
export INSTANCE_PROFILE_NAME="${RESOURCE_PREFIX}-profile"
export APP_SECRET_NAME="astra-agents/${DEPLOYMENT_ID}/app-env"
export SOURCE_SECRET_NAME="astra-agents/${DEPLOYMENT_ID}/azure-source"
export ORIGIN_SECRET_NAME="astra-agents/${DEPLOYMENT_ID}/cloudfront-origin"
export WAF_NAME="${RESOURCE_PREFIX}-cloudfront"
export WAF_LOG_GROUP="aws-waf-logs-${RESOURCE_PREFIX}-cloudfront"
export IMAGE_DIGEST="${IMAGE_DIGEST:-}"
if [[ ! "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  printf 'ERROR: IMAGE_DIGEST must be a complete immutable sha256 digest produced by CI.\n' >&2
  exit 1
fi

export COMMIT_SHA
COMMIT_SHA=$(aws ecr describe-images \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPOSITORY" \
  --image-ids "imageDigest=$IMAGE_DIGEST" \
  --query 'imageDetails[0].imageTags[0]' \
  --output text)
if [[ ! "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'ERROR: digest %s is not tagged with a full source commit SHA.\n' "$IMAGE_DIGEST" >&2
  exit 1
fi
mkdir -p "$WORK_DIR"
: > "$STATE_FILE"

persist() {
  local variable
  for variable in "$@"; do
    printf 'export %s=%q\n' "$variable" "${!variable}" >> "$STATE_FILE"
  done
}

persist AWS_REGION AWS_DEFAULT_REGION ACCOUNT_ID REPOSITORY_URL COMMIT_SHA IMAGE_DIGEST \
  AZURE_RESOURCE_GROUP AZURE_WEBAPP DEPLOYMENT_ID APP_NAME RESOURCE_PREFIX \
  ENVIRONMENT EC2_INSTANCE_NAME WORK_DIR STATE_FILE ECR_REPOSITORY LOG_GROUP \
  DB_SUBNET_GROUP DB_INSTANCE_ID TARGET_GROUP_NAME ALB_NAME EC2_ROLE_NAME \
  INSTANCE_PROFILE_NAME APP_SECRET_NAME SOURCE_SECRET_NAME ORIGIN_SECRET_NAME \
  WAF_NAME WAF_LOG_GROUP ASTRA_STATE_ROOT

printf 'Pinned CI image: %s@%s (source %s)\n' "$ECR_REPOSITORY" "$IMAGE_DIGEST" "$COMMIT_SHA"

show_phase "1/10" "Create the isolated VPC, subnets, NAT gateway, and routes"
# Phase 1.1 — Create VPC and subnets
export VPC_ID
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.20.0.0/16 \
  --tag-specifications \
    "ResourceType=vpc,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-vpc},{Key=Application,Value=astra-agents},{Key=Environment,Value=$ENVIRONMENT}]" \
  --query 'Vpc.VpcId' --output text)

aws ec2 wait vpc-available --vpc-ids "$VPC_ID"
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support Value=true
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames Value=true

export PUBLIC_SUBNET_A PUBLIC_SUBNET_B APP_SUBNET_A DB_SUBNET_A DB_SUBNET_B
PUBLIC_SUBNET_A=$(aws ec2 create-subnet \
  --vpc-id "$VPC_ID" --availability-zone us-east-1a --cidr-block 10.20.1.0/24 \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-public-a},{Key=Tier,Value=public}]" \
  --query 'Subnet.SubnetId' --output text)

PUBLIC_SUBNET_B=$(aws ec2 create-subnet \
  --vpc-id "$VPC_ID" --availability-zone us-east-1b --cidr-block 10.20.2.0/24 \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-public-b},{Key=Tier,Value=public}]" \
  --query 'Subnet.SubnetId' --output text)

APP_SUBNET_A=$(aws ec2 create-subnet \
  --vpc-id "$VPC_ID" --availability-zone us-east-1a --cidr-block 10.20.11.0/24 \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-app-private-a},{Key=Tier,Value=application}]" \
  --query 'Subnet.SubnetId' --output text)

DB_SUBNET_A=$(aws ec2 create-subnet \
  --vpc-id "$VPC_ID" --availability-zone us-east-1a --cidr-block 10.20.21.0/24 \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-db-private-a},{Key=Tier,Value=database}]" \
  --query 'Subnet.SubnetId' --output text)

DB_SUBNET_B=$(aws ec2 create-subnet \
  --vpc-id "$VPC_ID" --availability-zone us-east-1b --cidr-block 10.20.22.0/24 \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-db-private-b},{Key=Tier,Value=database}]" \
  --query 'Subnet.SubnetId' --output text)

persist VPC_ID PUBLIC_SUBNET_A PUBLIC_SUBNET_B APP_SUBNET_A DB_SUBNET_A DB_SUBNET_B

# Phase 1.2 — Create internet gateway, NAT gateway, and routes
export IGW_ID NAT_EIP_ALLOCATION_ID NAT_GATEWAY_ID
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-igw}]" \
  --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"

export PUBLIC_ROUTE_TABLE_ID APP_ROUTE_TABLE_ID DB_ROUTE_TABLE_ID
PUBLIC_ROUTE_TABLE_ID=$(aws ec2 create-route-table \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-public-rt}]" \
  --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id "$PUBLIC_ROUTE_TABLE_ID" \
  --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID"
aws ec2 associate-route-table --route-table-id "$PUBLIC_ROUTE_TABLE_ID" --subnet-id "$PUBLIC_SUBNET_A" >/dev/null
aws ec2 associate-route-table --route-table-id "$PUBLIC_ROUTE_TABLE_ID" --subnet-id "$PUBLIC_SUBNET_B" >/dev/null

NAT_EIP_ALLOCATION_ID=$(aws ec2 allocate-address \
  --domain vpc \
  --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-nat-eip}]" \
  --query AllocationId --output text)

NAT_GATEWAY_ID=$(aws ec2 create-nat-gateway \
  --subnet-id "$PUBLIC_SUBNET_A" \
  --allocation-id "$NAT_EIP_ALLOCATION_ID" \
  --tag-specifications "ResourceType=natgateway,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-nat}]" \
  --query 'NatGateway.NatGatewayId' --output text)
aws ec2 wait nat-gateway-available --nat-gateway-ids "$NAT_GATEWAY_ID"

APP_ROUTE_TABLE_ID=$(aws ec2 create-route-table \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-app-private-rt}]" \
  --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id "$APP_ROUTE_TABLE_ID" \
  --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_GATEWAY_ID"
aws ec2 associate-route-table --route-table-id "$APP_ROUTE_TABLE_ID" --subnet-id "$APP_SUBNET_A" >/dev/null

DB_ROUTE_TABLE_ID=$(aws ec2 create-route-table \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-db-private-rt}]" \
  --query 'RouteTable.RouteTableId' --output text)
aws ec2 associate-route-table --route-table-id "$DB_ROUTE_TABLE_ID" --subnet-id "$DB_SUBNET_A" >/dev/null
aws ec2 associate-route-table --route-table-id "$DB_ROUTE_TABLE_ID" --subnet-id "$DB_SUBNET_B" >/dev/null

export NAT_PUBLIC_IP
NAT_PUBLIC_IP=$(aws ec2 describe-addresses \
  --allocation-ids "$NAT_EIP_ALLOCATION_ID" \
  --query 'Addresses[0].PublicIp' --output text)

persist IGW_ID NAT_EIP_ALLOCATION_ID NAT_GATEWAY_ID NAT_PUBLIC_IP \
  PUBLIC_ROUTE_TABLE_ID APP_ROUTE_TABLE_ID DB_ROUTE_TABLE_ID
printf 'Azure source connectivity must allow NAT public IP: %s\n' "$NAT_PUBLIC_IP"

show_phase "2/10" "Create security groups, ECR, logs, and RDS PostgreSQL"
# Phase 2.1 — Create security groups
export ALB_SG_ID APP_SG_ID DB_SG_ID
ALB_SG_ID=$(aws ec2 create-security-group \
  --group-name "${RESOURCE_PREFIX}-alb-sg" \
  --description 'Dedicated ALB ingress for isolated Astra Agents EC2' \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-alb-sg},{Key=Application,Value=astra-agents}]" \
  --query GroupId --output text)

APP_SG_ID=$(aws ec2 create-security-group \
  --group-name "${RESOURCE_PREFIX}-app-sg" \
  --description 'Dedicated application SG for isolated Astra Agents EC2' \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-app-sg},{Key=Application,Value=astra-agents}]" \
  --query GroupId --output text)

DB_SG_ID=$(aws ec2 create-security-group \
  --group-name "${RESOURCE_PREFIX}-db-sg" \
  --description 'Dedicated RDS SG for isolated Astra Agents EC2' \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${RESOURCE_PREFIX}-db-sg},{Key=Application,Value=astra-agents}]" \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress \
  --group-id "$APP_SG_ID" --protocol tcp --port 5000 --source-group "$ALB_SG_ID"
aws ec2 authorize-security-group-ingress \
  --group-id "$DB_SG_ID" --protocol tcp --port 5432 --source-group "$APP_SG_ID"

persist ALB_SG_ID APP_SG_ID DB_SG_ID

# Phase 2.2 — Validate the pre-created ECR repository and create the log group
export ECR_REPOSITORY="${RESOURCE_PREFIX}-app"
export ECR_REPOSITORY_ARN ECR_REPOSITORY_URI

ECR_REPOSITORY_ARN=$(aws ecr describe-repositories \
  --repository-names "$ECR_REPOSITORY" \
  --query 'repositories[0].repositoryArn' --output text)

ECR_REPOSITORY_URI=$(aws ecr describe-repositories \
  --repository-names "$ECR_REPOSITORY" \
  --query 'repositories[0].repositoryUri' --output text)

export LOG_GROUP="/ec2/${RESOURCE_PREFIX}/app"
aws logs create-log-group \
  --log-group-name "$LOG_GROUP" \
  --tags Application=astra-agents,Environment=$ENVIRONMENT
aws logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 30

persist ECR_REPOSITORY ECR_REPOSITORY_ARN ECR_REPOSITORY_URI LOG_GROUP

# Phase 2.3 — Create RDS PostgreSQL
export DB_SUBNET_GROUP="${RESOURCE_PREFIX}-db-subnets"
export DB_INSTANCE_ID="${RESOURCE_PREFIX}-db"

aws rds create-db-subnet-group \
  --db-subnet-group-name "$DB_SUBNET_GROUP" \
  --db-subnet-group-description 'Private database subnets for isolated Astra Agents EC2' \
  --subnet-ids "$DB_SUBNET_A" "$DB_SUBNET_B" \
  --tags Key=Application,Value=astra-agents Key=Environment,Value=$ENVIRONMENT >/dev/null

aws rds create-db-instance \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --db-instance-class db.t4g.small \
  --engine postgres \
  --engine-version 16.15 \
  --db-name astra \
  --master-username postgres \
  --manage-master-user-password \
  --allocated-storage 40 \
  --storage-type gp3 \
  --storage-encrypted \
  --db-subnet-group-name "$DB_SUBNET_GROUP" \
  --vpc-security-group-ids "$DB_SG_ID" \
  --backup-retention-period 7 \
  --no-publicly-accessible \
  --no-multi-az \
  --auto-minor-version-upgrade \
  --copy-tags-to-snapshot \
  --deletion-protection \
  --ca-certificate-identifier rds-ca-rsa2048-g1 \
  --tags Key=Name,Value=$DB_INSTANCE_ID Key=Application,Value=astra-agents Key=Environment,Value=$ENVIRONMENT >/dev/null

aws rds wait db-instance-available --db-instance-identifier "$DB_INSTANCE_ID"

export RDS_ENDPOINT RDS_MASTER_SECRET_ARN
RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --query 'DBInstances[0].Endpoint.Address' --output text)
RDS_MASTER_SECRET_ARN=$(aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --query 'DBInstances[0].MasterUserSecret.SecretArn' --output text)

test -n "$RDS_ENDPOINT"
test "$RDS_MASTER_SECRET_ARN" != None
persist DB_SUBNET_GROUP DB_INSTANCE_ID RDS_ENDPOINT RDS_MASTER_SECRET_ARN

aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Engine:Engine,Version:EngineVersion,Public:PubliclyAccessible,Encrypted:StorageEncrypted,DeletionProtection:DeletionProtection,Endpoint:Endpoint.Address}'

show_phase "3/10" "Create the ALB and CloudFront HTTPS endpoint"
# Phase 3.1 — Create target group and ALB
export TARGET_GROUP_ARN
TARGET_GROUP_ARN=$(aws elbv2 create-target-group \
  --name "$TARGET_GROUP_NAME" \
  --protocol HTTP \
  --port 5000 \
  --target-type instance \
  --vpc-id "$VPC_ID" \
  --health-check-protocol HTTP \
  --health-check-port traffic-port \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 2 \
  --matcher HttpCode=200 \
  --tags Key=Application,Value=astra-agents Key=Environment,Value=$ENVIRONMENT \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

export ALB_ARN ALB_DNS_NAME
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name "$ALB_NAME" \
  --type application \
  --scheme internet-facing \
  --ip-address-type ipv4 \
  --subnets "$PUBLIC_SUBNET_A" "$PUBLIC_SUBNET_B" \
  --security-groups "$ALB_SG_ID" \
  --tags Key=Application,Value=astra-agents Key=Environment,Value=$ENVIRONMENT \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

aws elbv2 wait load-balancer-available --load-balancer-arns "$ALB_ARN"
ALB_DNS_NAME=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' --output text)

export HTTP_LISTENER_ARN
HTTP_LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTP \
  --port 80 \
  --default-actions "Type=forward,TargetGroupArn=$TARGET_GROUP_ARN" \
  --query 'Listeners[0].ListenerArn' --output text)

persist TARGET_GROUP_ARN ALB_ARN ALB_DNS_NAME HTTP_LISTENER_ARN

# Phase 3.2 — Create CloudFront HTTPS distribution
export CACHE_POLICY_ID ORIGIN_REQUEST_POLICY_ID
CACHE_POLICY_ID=$(aws cloudfront list-cache-policies \
  --type managed \
  --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='Managed-CachingDisabled'].CachePolicy.Id | [0]" \
  --output text)

ORIGIN_REQUEST_POLICY_ID=$(aws cloudfront list-origin-request-policies \
  --type managed \
  --query "OriginRequestPolicyList.Items[?OriginRequestPolicy.OriginRequestPolicyConfig.Name=='Managed-AllViewerExceptHostHeader'].OriginRequestPolicy.Id | [0]" \
  --output text)

test "$CACHE_POLICY_ID" != None
test "$ORIGIN_REQUEST_POLICY_ID" != None

export CLOUDFRONT_CALLER_REFERENCE
CLOUDFRONT_CALLER_REFERENCE="${RESOURCE_PREFIX}-$(date -u +%Y%m%dT%H%M%SZ)"

jq -n \
  --arg caller "$CLOUDFRONT_CALLER_REFERENCE" \
  --arg origin "$ALB_DNS_NAME" \
  --arg cachePolicy "$CACHE_POLICY_ID" \
  --arg originPolicy "$ORIGIN_REQUEST_POLICY_ID" \
  '{
    CallerReference: $caller,
    Aliases: {Quantity: 0},
    DefaultRootObject: "",
    Origins: {
      Quantity: 1,
      Items: [{
        Id: "astra-agents-ec2-alb-origin",
        DomainName: $origin,
        OriginPath: "",
        CustomHeaders: {Quantity: 0},
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: "http-only",
          OriginSslProtocols: {Quantity: 1, Items: ["TLSv1.2"]},
          OriginReadTimeout: 60,
          OriginKeepaliveTimeout: 5
        },
        ConnectionAttempts: 3,
        ConnectionTimeout: 10,
        OriginShield: {Enabled: false}
      }]
    },
    OriginGroups: {Quantity: 0},
    DefaultCacheBehavior: {
      TargetOriginId: "astra-agents-ec2-alb-origin",
      TrustedSigners: {Enabled: false, Quantity: 0},
      TrustedKeyGroups: {Enabled: false, Quantity: 0},
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: {
        Quantity: 7,
        Items: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
        CachedMethods: {Quantity: 3, Items: ["GET", "HEAD", "OPTIONS"]}
      },
      SmoothStreaming: false,
      Compress: true,
      LambdaFunctionAssociations: {Quantity: 0},
      FunctionAssociations: {Quantity: 0},
      FieldLevelEncryptionId: "",
      CachePolicyId: $cachePolicy,
      OriginRequestPolicyId: $originPolicy
    },
    CacheBehaviors: {Quantity: 0},
    CustomErrorResponses: {Quantity: 0},
    Comment: "Astra Agents isolated EC2 default HTTPS",
    Logging: {Enabled: false, IncludeCookies: false, Bucket: "", Prefix: ""},
    PriceClass: "PriceClass_100",
    Enabled: true,
    ViewerCertificate: {
      CloudFrontDefaultCertificate: true,
      MinimumProtocolVersion: "TLSv1",
      CertificateSource: "cloudfront"
    },
    Restrictions: {GeoRestriction: {RestrictionType: "none", Quantity: 0}},
    WebACLId: "",
    HttpVersion: "http2and3",
    IsIPV6Enabled: true,
    ContinuousDeploymentPolicyId: "",
    Staging: false
  }' > "$WORK_DIR/cloudfront-distribution.json"

export CLOUDFRONT_DISTRIBUTION_ID CLOUDFRONT_DOMAIN PUBLIC_URL
CLOUDFRONT_RESULT=$(aws cloudfront create-distribution \
  --distribution-config "file://$WORK_DIR/cloudfront-distribution.json")
CLOUDFRONT_DISTRIBUTION_ID=$(jq -r '.Distribution.Id' <<<"$CLOUDFRONT_RESULT")
CLOUDFRONT_DOMAIN=$(jq -r '.Distribution.DomainName' <<<"$CLOUDFRONT_RESULT")
PUBLIC_URL="https://$CLOUDFRONT_DOMAIN"

aws cloudfront wait distribution-deployed --id "$CLOUDFRONT_DISTRIBUTION_ID"
persist CACHE_POLICY_ID ORIGIN_REQUEST_POLICY_ID CLOUDFRONT_CALLER_REFERENCE \
  CLOUDFRONT_DISTRIBUTION_ID CLOUDFRONT_DOMAIN PUBLIC_URL

aws cloudfront get-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --query 'Distribution.{Status:Status,DomainName:DomainName,Enabled:DistributionConfig.Enabled,Origin:DistributionConfig.Origins.Items[0].DomainName,ViewerProtocolPolicy:DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy}'

show_phase "4/10" "Read Azure settings and create isolated AWS secrets"
# Phase 4.1 — Read Azure settings
export AZURE_SETTINGS_FILE="$WORK_DIR/azure-app-settings.json"
az webapp config appsettings list \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_WEBAPP" \
  --output json > "$AZURE_SETTINGS_FILE"
chmod 600 "$AZURE_SETTINGS_FILE"

for key in \
  DATABASE_URL \
  ANTHROPIC_API_KEY \
  ASTRA_PUBLIC_API_KEY \
  AUDIT_SIGNING_PRIVATE_KEY \
  BOOTSTRAP_ADMIN_PASSWORD \
  DECISION_PROVIDER \
  DEFAULT_LLM_PROVIDER \
  ENABLE_DEMOS \
  INTEGRATION_VAULT_KEY \
  OPENAI_API_KEY \
  TYPESAFE_API_KEY; do
  jq -e --arg key "$key" 'any(.[]; .name == $key and (.value | type == "string"))' \
    "$AZURE_SETTINGS_FILE" >/dev/null
done

# Phase 4.2 — Store temporary Azure source connection
export SOURCE_SECRET_JSON="$WORK_DIR/azure-source-secret.json"
SOURCE_DATABASE_URL=$(jq -er '.[] | select(.name == "DATABASE_URL") | .value' \
  "$AZURE_SETTINGS_FILE")
jq -n --arg DATABASE_URL "$SOURCE_DATABASE_URL" \
  '{DATABASE_URL:$DATABASE_URL}' > "$SOURCE_SECRET_JSON"
chmod 600 "$SOURCE_SECRET_JSON"

export SOURCE_SECRET_ARN
SOURCE_SECRET_ARN=$(aws secretsmanager create-secret \
  --name "$SOURCE_SECRET_NAME" \
  --description 'Temporary read-only Azure PostgreSQL source for Astra migration' \
  --secret-string "file://$SOURCE_SECRET_JSON" \
  --tags Key=Application,Value=astra-agents Key=Environment,Value=$ENVIRONMENT Key=Purpose,Value=migration \
  --query ARN --output text)

unset SOURCE_DATABASE_URL
rm -f "$SOURCE_SECRET_JSON"
persist SOURCE_SECRET_ARN

# Phase 4.3 — Create application secret
export APP_SECRET_JSON="$WORK_DIR/app-env-secret.json"
APP_DB_PASSWORD=$(openssl rand -hex 24)
AWS_JWT_SECRET=$(openssl rand -hex 48)
TARGET_DATABASE_URL="postgresql://astra_app:${APP_DB_PASSWORD}@${RDS_ENDPOINT}:5432/astra?sslmode=require"

jq -n \
  --slurpfile azure "$AZURE_SETTINGS_FILE" \
  --arg DATABASE_URL "$TARGET_DATABASE_URL" \
  --arg JWT_SECRET "$AWS_JWT_SECRET" \
  --arg PUBLIC_URL "$PUBLIC_URL" '
  def setting($name):
    ($azure[0] | map(select(.name == $name)) | first | .value);
  {
    ANTHROPIC_API_KEY: setting("ANTHROPIC_API_KEY"),
    ASTRA_PUBLIC_API_KEY: setting("ASTRA_PUBLIC_API_KEY"),
    AUDIT_SIGNING_PRIVATE_KEY: setting("AUDIT_SIGNING_PRIVATE_KEY"),
    BOOTSTRAP_ADMIN_PASSWORD: setting("BOOTSTRAP_ADMIN_PASSWORD"),
    DATABASE_URL: $DATABASE_URL,
    DECISION_PROVIDER: setting("DECISION_PROVIDER"),
    DEFAULT_LLM_PROVIDER: setting("DEFAULT_LLM_PROVIDER"),
    ENABLE_DEMOS: setting("ENABLE_DEMOS"),
    INTEGRATION_VAULT_KEY: setting("INTEGRATION_VAULT_KEY"),
    JWT_SECRET: $JWT_SECRET,
    NODE_ENV: "production",
    OPENAI_API_KEY: setting("OPENAI_API_KEY"),
    PORT: "5000",
    PUBLIC_URL: $PUBLIC_URL,
    SECURITY_MODE: "production",
    TYPESAFE_API_KEY: setting("TYPESAFE_API_KEY")
  }' > "$APP_SECRET_JSON"

jq -e 'to_entries | all(.value != null and ((.value | tostring | contains("\n")) | not))' \
  "$APP_SECRET_JSON" >/dev/null
chmod 600 "$APP_SECRET_JSON"

export APP_SECRET_ARN
APP_SECRET_ARN=$(aws secretsmanager create-secret \
  --name "$APP_SECRET_NAME" \
  --description 'Production environment for isolated Astra Agents EC2' \
  --secret-string "file://$APP_SECRET_JSON" \
  --tags Key=Application,Value=astra-agents Key=Environment,Value=$ENVIRONMENT \
  --query ARN --output text)

unset APP_DB_PASSWORD AWS_JWT_SECRET TARGET_DATABASE_URL
rm -f "$APP_SECRET_JSON" "$AZURE_SETTINGS_FILE"
persist APP_SECRET_ARN

show_phase "5/10" "Create the EC2 IAM role and instance profile"
# Phase 5.1 — Create EC2 IAM role
cat > "$WORK_DIR/ec2-trust-policy.json" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON

aws iam create-role \
  --role-name "$EC2_ROLE_NAME" \
  --assume-role-policy-document "file://$WORK_DIR/ec2-trust-policy.json" \
  --tags Key=Application,Value=astra-agents Key=Environment,Value=$ENVIRONMENT >/dev/null

aws iam attach-role-policy \
  --role-name "$EC2_ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

jq -n \
  --arg ecr "$ECR_REPOSITORY_ARN" \
  --arg log "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:${LOG_GROUP}:*" \
  --arg secrets "arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:astra-agents/${DEPLOYMENT_ID}/*" \
  '{
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "ecr:GetAuthorizationToken",
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:DescribeImages"
        ],
        Resource: $ecr
      },
      {
        Effect: "Allow",
        Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
        Resource: $log
      },
      {
        Effect: "Allow",
        Action: "secretsmanager:GetSecretValue",
        Resource: $secrets
      }
    ]
  }' > "$WORK_DIR/ec2-runtime-policy.json"

aws iam put-role-policy \
  --role-name "$EC2_ROLE_NAME" \
  --policy-name astra-agents-ec2-runtime \
  --policy-document "file://$WORK_DIR/ec2-runtime-policy.json"

# Phase 5.2 — Add temporary migration permission
jq -n --arg secret "$RDS_MASTER_SECRET_ARN" '
{
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Action: "secretsmanager:GetSecretValue",
    Resource: $secret
  }]
}' > "$WORK_DIR/ec2-migration-policy.json"

aws iam put-role-policy \
  --role-name "$EC2_ROLE_NAME" \
  --policy-name astra-agents-ec2-migration-temp \
  --policy-document "file://$WORK_DIR/ec2-migration-policy.json"

aws iam create-instance-profile \
  --instance-profile-name "$INSTANCE_PROFILE_NAME" >/dev/null
aws iam add-role-to-instance-profile \
  --instance-profile-name "$INSTANCE_PROFILE_NAME" \
  --role-name "$EC2_ROLE_NAME"

export EC2_ROLE_NAME="${RESOURCE_PREFIX}-role"
export INSTANCE_PROFILE_NAME="${RESOURCE_PREFIX}-profile"
persist EC2_ROLE_NAME INSTANCE_PROFILE_NAME
sleep 10

show_phase "6/10" "Create and bootstrap the real EC2 instance"
# Phase 6 — Create the real EC2 instance
cat > "$WORK_DIR/ec2-user-data.sh" <<'BASH'
#!/usr/bin/env bash
set -Eeuo pipefail
dnf install -y docker jq postgresql16
systemctl enable --now docker
install -d -m 0755 /opt/astra-agent-platform
install -d -m 0700 /etc/astra-agents
install -d -m 0700 /var/lib/astra-migration
curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  -o /etc/astra-agents/aws-rds-global-bundle.pem
chmod 0644 /etc/astra-agents/aws-rds-global-bundle.pem
test -s /etc/astra-agents/aws-rds-global-bundle.pem
BASH

export AMI_ID
AMI_ID=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameter.Value' --output text)

export INSTANCE_ID
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type t3.medium \
  --subnet-id "$APP_SUBNET_A" \
  --security-group-ids "$APP_SG_ID" \
  --iam-instance-profile "Name=$INSTANCE_PROFILE_NAME" \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":40,"VolumeType":"gp3","Encrypted":true,"DeleteOnTermination":true}}]' \
  --metadata-options 'HttpTokens=required,HttpPutResponseHopLimit=2,HttpEndpoint=enabled' \
  --user-data "file://$WORK_DIR/ec2-user-data.sh" \
  --tag-specifications \
    "ResourceType=instance,Tags=[{Key=Name,Value=$EC2_INSTANCE_NAME},{Key=Application,Value=astra-agents},{Key=Environment,Value=$ENVIRONMENT},{Key=SourceCommit,Value=$COMMIT_SHA}]" \
    "ResourceType=volume,Tags=[{Key=Name,Value=${EC2_INSTANCE_NAME}-root},{Key=Application,Value=astra-agents},{Key=Environment,Value=$ENVIRONMENT}]" \
  --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-status-ok --instance-ids "$INSTANCE_ID"

until test "$(aws ssm describe-instance-information \
  --filters Key=InstanceIds,Values="$INSTANCE_ID" \
  --query 'length(InstanceInformationList)' --output text)" = 1; do
  sleep 10
done

persist AMI_ID INSTANCE_ID

aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].{Name:Tags[?Key==`Name`].Value|[0],InstanceId:InstanceId,State:State.Name,PrivateIp:PrivateIpAddress,PublicIp:PublicIpAddress,Subnet:SubnetId,Type:InstanceType,Image:ImageId,Profile:IamInstanceProfile.Arn}'

show_phase "7/10" "Migrate Azure PostgreSQL data to RDS"
# Phase 7.1 — Create database migration script
export MIGRATION_SCRIPT="$WORK_DIR/migrate-azure-to-rds.sh"
cat > "$MIGRATION_SCRIPT" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
AWS_REGION='$AWS_REGION'
MASTER_SECRET_ARN='$RDS_MASTER_SECRET_ARN'
APP_SECRET_ARN='$APP_SECRET_ARN'
SOURCE_SECRET_ARN='$SOURCE_SECRET_ARN'
RDS_ENDPOINT='$RDS_ENDPOINT'
EOF

cat >> "$MIGRATION_SCRIPT" <<'BASH'
install -d -m 0700 /var/lib/astra-migration
DUMP_PATH=/var/lib/astra-migration/azure.dump
LIST_PATH=/var/lib/astra-migration/restore.list

master_json=$(aws secretsmanager get-secret-value --region "$AWS_REGION" \
  --secret-id "$MASTER_SECRET_ARN" --query SecretString --output text)
app_json=$(aws secretsmanager get-secret-value --region "$AWS_REGION" \
  --secret-id "$APP_SECRET_ARN" --query SecretString --output text)
source_json=$(aws secretsmanager get-secret-value --region "$AWS_REGION" \
  --secret-id "$SOURCE_SECRET_ARN" --query SecretString --output text)

master_user=$(jq -r .username <<<"$master_json")
master_password=$(jq -r .password <<<"$master_json")
app_url=$(jq -r .DATABASE_URL <<<"$app_json")
source_url=$(jq -r .DATABASE_URL <<<"$source_json")
app_password=$(sed -E 's#^postgresql://astra_app:([^@]+)@.*#\1#' <<<"$app_url")

printf 'Source database evidence:\n'
psql "$source_url" -v ON_ERROR_STOP=1 -Atc \
  "select current_database(), current_setting('server_version'), pg_size_pretty(pg_database_size(current_database()));"

export PGPASSWORD="$master_password"
psql "host=$RDS_ENDPOINT port=5432 dbname=astra user=$master_user sslmode=require" \
  -v ON_ERROR_STOP=1 -v app_password="$app_password" <<'SQL'
SELECT format('CREATE ROLE astra_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'astra_app') \gexec
SELECT format('ALTER ROLE astra_app PASSWORD %L', :'app_password') \gexec
CREATE EXTENSION IF NOT EXISTS vector;
ALTER DATABASE astra OWNER TO astra_app;
ALTER SCHEMA public OWNER TO astra_app;
GRANT CONNECT ON DATABASE astra TO astra_app;
GRANT USAGE, CREATE ON SCHEMA public TO astra_app;
SQL
unset PGPASSWORD master_password master_json app_password

rm -f "$DUMP_PATH" "$LIST_PATH" "$LIST_PATH.all"
pg_dump --format=custom --no-owner --no-acl --file="$DUMP_PATH" "$source_url"
chmod 600 "$DUMP_PATH"
pg_restore --list "$DUMP_PATH" > "$LIST_PATH.all"
grep -Ev 'EXTENSION .* vector|COMMENT .* EXTENSION vector' "$LIST_PATH.all" > "$LIST_PATH"
pg_restore --exit-on-error --no-owner --no-acl \
  --use-list="$LIST_PATH" --dbname="$app_url" "$DUMP_PATH"

printf 'Target database evidence:\n'
psql "$app_url" -v ON_ERROR_STOP=1 -Atc \
  "select current_database(), current_setting('server_version'), pg_size_pretty(pg_database_size(current_database()));"
psql "$app_url" -v ON_ERROR_STOP=1 -Atc \
  "select extname, extversion from pg_extension where extname='vector';"
psql "$app_url" -v ON_ERROR_STOP=1 -Atc \
  "select count(*) from information_schema.tables where table_schema='public';"
BASH

chmod 700 "$MIGRATION_SCRIPT"

# Phase 7.2 — Run database migration
run_ssm_script() {
  local script_file=$1
  local comment=$2
  local parameter_file="$WORK_DIR/ssm-parameters.json"
  local command_id
  local wait_timeout="${SSM_WAIT_TIMEOUT_SECONDS:-3900}"
  local deadline status last_status=""

  if [[ ! "$wait_timeout" =~ ^[0-9]+$ ]]; then
    printf 'ERROR: SSM_WAIT_TIMEOUT_SECONDS must be a positive integer.\n' >&2
    return 1
  fi

  jq -Rs '{commands:[.]}' "$script_file" > "$parameter_file"
  command_id=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --comment "$comment" \
    --parameters "file://$parameter_file" \
    --timeout-seconds 3600 \
    --query 'Command.CommandId' --output text)

  deadline=$((SECONDS + wait_timeout))
  while (( SECONDS < deadline )); do
    status=$(aws ssm get-command-invocation \
      --command-id "$command_id" --instance-id "$INSTANCE_ID" \
      --query Status --output text 2>/dev/null || true)

    if [[ -n "$status" && "$status" != "$last_status" ]]; then
      printf '[%s] SSM command %s status: %s\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$command_id" "$status"
      last_status=$status
    fi

    case "$status" in
      Success)
        aws ssm get-command-invocation \
          --command-id "$command_id" --instance-id "$INSTANCE_ID"
        return 0
        ;;
      Failed|Cancelled|Cancelling|TimedOut|Undeliverable|Terminated)
        aws ssm get-command-invocation \
          --command-id "$command_id" --instance-id "$INSTANCE_ID"
        return 1
        ;;
      Pending|InProgress|Delayed|"") ;;
      *)
        printf 'ERROR: unexpected SSM command status: %s\n' "$status" >&2
        aws ssm get-command-invocation \
          --command-id "$command_id" --instance-id "$INSTANCE_ID" || true
        return 1
        ;;
    esac
    sleep 10
  done

  printf 'ERROR: SSM command %s exceeded %s seconds.\n' \
    "$command_id" "$wait_timeout" >&2
  aws ssm get-command-invocation \
    --command-id "$command_id" --instance-id "$INSTANCE_ID" || true
  return 1
}

run_ssm_script "$MIGRATION_SCRIPT" astra-azure-to-rds-migration

# Phase 7.3 — Remove temporary RDS master-secret permission
aws iam delete-role-policy \
  --role-name "$EC2_ROLE_NAME" \
  --policy-name astra-agents-ec2-migration-temp

show_phase "8/10" "Deploy the immutable CI image by digest"
# Phase 8.1 — Normalize the pull-only role and deploy through exact-instance SSM
ASTRA_STATE_ROOT="$ASTRA_STATE_ROOT" "$SCRIPT_DIR/operate.sh" harden-runtime-role \
  --deployment-id "$DEPLOYMENT_ID"
ASTRA_STATE_ROOT="$ASTRA_STATE_ROOT" "$SCRIPT_DIR/operate.sh" deploy-image \
  --deployment-id "$DEPLOYMENT_ID" \
  --digest "$IMAGE_DIGEST"

# Phase 8.2 — Register the EC2 target
aws elbv2 register-targets \
  --target-group-arn "$TARGET_GROUP_ARN" \
  --targets "Id=$INSTANCE_ID,Port=5000"

aws elbv2 wait target-in-service \
  --target-group-arn "$TARGET_GROUP_ARN" \
  --targets "Id=$INSTANCE_ID,Port=5000"

aws elbv2 describe-target-health \
  --target-group-arn "$TARGET_GROUP_ARN" \
  --query 'TargetHealthDescriptions[].{Target:Target.Id,Port:Target.Port,State:TargetHealth.State,Reason:TargetHealth.Reason}'

show_phase "9/10" "Verify public access, authentication, and reboot recovery"
# Phase 9.1 — Verify public health
curl -fsS "$PUBLIC_URL/health"
ASTRA_STATE_ROOT="$ASTRA_STATE_ROOT" "$SCRIPT_DIR/operate.sh" harden-edge \
  --deployment-id "$DEPLOYMENT_ID" \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID"
curl -sS -o /dev/null -w 'root=%{http_code}\n' "$PUBLIC_URL/"
curl -sS -o /dev/null -w 'dashboard=%{http_code}\n' "$PUBLIC_URL/dashboard"

aws cloudfront get-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --query 'Distribution.{Status:Status,Enabled:DistributionConfig.Enabled,Domain:DomainName}'

aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].{State:State.Name,PrivateIp:PrivateIpAddress,PublicIp:PublicIpAddress,SourceCommit:Tags[?Key==`SourceCommit`].Value|[0]}'

aws logs tail "$LOG_GROUP" --since 10m --format short

# Phase 9.2 — Verify authenticated APIs
export AUTH_CHECK_SCRIPT="$WORK_DIR/authenticated-check.sh"
cat > "$AUTH_CHECK_SCRIPT" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
AWS_REGION='$AWS_REGION'
APP_SECRET_ARN='$APP_SECRET_ARN'
PUBLIC_URL='$PUBLIC_URL'
EOF

cat >> "$AUTH_CHECK_SCRIPT" <<'BASH'
cookie_jar=/tmp/astra-auth-check-cookies.txt
trap 'rm -f "$cookie_jar"' EXIT
secret=$(aws secretsmanager get-secret-value --region "$AWS_REGION" \
  --secret-id "$APP_SECRET_ARN" --query SecretString --output text)
password=$(jq -r .BOOTSTRAP_ADMIN_PASSWORD <<<"$secret")

printf 'login='
curl -sS -c "$cookie_jar" -o /dev/null -w '%{http_code}\n' \
  -H 'Content-Type: application/json' \
  --data "$(jq -nc --arg username admin --arg password "$password" \
    '{username:$username,password:$password}')" \
  "$PUBLIC_URL/api/auth/login"

for endpoint in \
  /api/auth/me \
  /api/organizations/current \
  /api/overview \
  /api/alerts/critical-violations; do
  printf '%s=' "$endpoint"
  curl -sS -b "$cookie_jar" -o /dev/null -w '%{http_code}\n' \
    "$PUBLIC_URL$endpoint"
done
BASH

chmod 700 "$AUTH_CHECK_SCRIPT"
run_ssm_script "$AUTH_CHECK_SCRIPT" astra-authenticated-verification

# Phase 9.3 — Verify reboot recovery
aws ec2 reboot-instances --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-status-ok --instance-ids "$INSTANCE_ID"

until curl -fsS "$PUBLIC_URL/health" >/dev/null; do
  sleep 10
done

curl -fsS "$PUBLIC_URL/health"
ASTRA_STATE_ROOT="$ASTRA_STATE_ROOT" "$SCRIPT_DIR/operate.sh" verify \
  --deployment-id "$DEPLOYMENT_ID" \
  --digest "$IMAGE_DIGEST"

show_phase "10/10" "Remove migration-only credentials and files"
# Phase 10 — Remove migration-only material
aws secretsmanager delete-secret \
  --secret-id "$SOURCE_SECRET_ARN" \
  --recovery-window-in-days 7

cat > "$WORK_DIR/remove-migration-files.sh" <<'BASH'
#!/usr/bin/env bash
set -Eeuo pipefail
rm -f /var/lib/astra-migration/azure.dump
rm -f /var/lib/astra-migration/restore.list
rm -f /var/lib/astra-migration/restore.list.all
BASH
chmod 700 "$WORK_DIR/remove-migration-files.sh"
run_ssm_script "$WORK_DIR/remove-migration-files.sh" astra-remove-migration-files

rm -f "$WORK_DIR/ssm-parameters.json"
rm -f "$WORK_DIR/ec2-migration-policy.json"


printf '\nDeployment completed successfully.\n'
printf 'Deployment URL: %s\n' "$PUBLIC_URL"
printf 'EC2 instance name: %s\n' "$EC2_INSTANCE_NAME"
printf 'EC2 instance ID: %s\n' "$INSTANCE_ID"
printf '\nTo terminate only this newly created EC2 instance, copy and run:\n'
printf 'aws ec2 terminate-instances --region %q --instance-ids %q\n' "$AWS_REGION" "$INSTANCE_ID"
printf 'aws ec2 wait instance-terminated --region %q --instance-ids %q\n' "$AWS_REGION" "$INSTANCE_ID"
printf 'WARNING: terminating EC2 does not delete RDS, NAT, ALB, CloudFront, ECR, or other billable resources.\n'
