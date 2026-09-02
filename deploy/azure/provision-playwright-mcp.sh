#!/usr/bin/env bash
# Provisions a Playwright MCP server (Microsoft's official browser-automation
# MCP server, mcr.microsoft.com/playwright/mcp) for the UI Validation Agent,
# and VNet-integrates the existing astra-agents-platform App Service so it
# can reach it privately.
#
# Why a VNet, not a public endpoint: @playwright/mcp has NO built-in
# authentication (confirmed against the project's own docs) -- anyone who
# found a public URL for it could drive a real browser through your Azure
# environment. Since Astra itself already runs in Azure, the container never
# needs to be reachable from outside Azure at all: it's deployed into an
# Azure Container Apps environment created with --internal-only true (no
# public load balancer, full stop -- stronger than per-app "internal
# ingress" alone), on a VNet that the App Service is then integrated into.
# Nothing about this endpoint is ever exposed to the public internet.
#
# Safe to re-run — every `az ... create` call below is idempotent (no-ops or
# updates in place if the resource already exists), matching provision.sh.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f config.env ]; then
  echo "Missing config.env — copy config.env.example to config.env and fill it in first (see provision.sh)." >&2
  exit 1
fi
# shellcheck disable=SC1091
source config.env

for v in RG LOCATION APP_NAME; do
  if [ -z "${!v:-}" ]; then
    echo "config.env: $v is not set — run provision.sh first, or fill it in." >&2
    exit 1
  fi
done

# --- Naming: override any of these in config.env if you want different names ---
MCP_VNET="${MCP_VNET:-astra-mcp-vnet}"
MCP_SUBNET_INFRA="${MCP_SUBNET_INFRA:-mcp-infra-subnet}"       # Container Apps environment infra subnet -- needs to be reasonably large (/23 recommended by Azure)
MCP_SUBNET_APPSVC="${MCP_SUBNET_APPSVC:-appsvc-integration-subnet}"  # App Service regional VNet integration -- delegated to Microsoft.Web/serverFarms, /27 minimum
MCP_ENV_NAME="${MCP_ENV_NAME:-astra-mcp-env}"
MCP_APP_NAME="${MCP_APP_NAME:-playwright-mcp}"

echo "=== 1/5: VNet + subnets ==="
if az network vnet show --resource-group "$RG" --name "$MCP_VNET" --output none 2>/dev/null; then
  echo "  $MCP_VNET already exists — skipping create."
else
  az network vnet create \
    --resource-group "$RG" --name "$MCP_VNET" \
    --location "$LOCATION" \
    --address-prefix 10.10.0.0/16 \
    --output none
fi

if az network vnet subnet show --resource-group "$RG" --vnet-name "$MCP_VNET" --name "$MCP_SUBNET_INFRA" --output none 2>/dev/null; then
  echo "  $MCP_SUBNET_INFRA already exists — skipping create."
else
  az network vnet subnet create \
    --resource-group "$RG" --vnet-name "$MCP_VNET" --name "$MCP_SUBNET_INFRA" \
    --address-prefixes 10.10.0.0/23 \
    --output none
fi

if az network vnet subnet show --resource-group "$RG" --vnet-name "$MCP_VNET" --name "$MCP_SUBNET_APPSVC" --output none 2>/dev/null; then
  echo "  $MCP_SUBNET_APPSVC already exists — skipping create."
else
  az network vnet subnet create \
    --resource-group "$RG" --vnet-name "$MCP_VNET" --name "$MCP_SUBNET_APPSVC" \
    --address-prefixes 10.10.2.0/27 \
    --delegations Microsoft.Web/serverFarms \
    --output none
fi

echo "=== 2/5: Container Apps environment (internal-only -- no public load balancer) ==="
INFRA_SUBNET_ID=$(az network vnet subnet show --resource-group "$RG" --vnet-name "$MCP_VNET" --name "$MCP_SUBNET_INFRA" --query id -o tsv)

if ! az extension show --name containerapp --output none 2>/dev/null; then
  echo "  Installing the containerapp CLI extension..."
  az extension add --name containerapp --only-show-errors
fi
az provider register --namespace Microsoft.App --wait 2>/dev/null || true
az provider register --namespace Microsoft.OperationalInsights --wait 2>/dev/null || true

if az containerapp env show --resource-group "$RG" --name "$MCP_ENV_NAME" --output none 2>/dev/null; then
  echo "  $MCP_ENV_NAME already exists — skipping create."
else
  az containerapp env create \
    --resource-group "$RG" --name "$MCP_ENV_NAME" \
    --location "$LOCATION" \
    --infrastructure-subnet-resource-id "$INFRA_SUBNET_ID" \
    --internal-only true \
    --output none
fi

echo "=== 3/5: Playwright MCP container app ==="
# --headless: no display needed in a container. --host 0.0.0.0: listen on all
# interfaces (required inside a container -- localhost-only would be
# unreachable). --port 8931: arbitrary but matches Microsoft's own example.
# --ingress internal: reachable only within the Container Apps environment's
# VNet, never from the public internet (this is belt-and-suspenders on top of
# the environment already being --internal-only).
if az containerapp show --resource-group "$RG" --name "$MCP_APP_NAME" --output none 2>/dev/null; then
  echo "  $MCP_APP_NAME already exists — skipping create. Re-run with 'az containerapp update' if you need to change its image/args."
else
  az containerapp create \
    --resource-group "$RG" --name "$MCP_APP_NAME" \
    --environment "$MCP_ENV_NAME" \
    --image mcr.microsoft.com/playwright/mcp:latest \
    --target-port 8931 \
    --ingress internal \
    --min-replicas 1 --max-replicas 1 \
    --cpu 1.0 --memory 2.0Gi \
    --command "npx" \
    --args "@playwright/mcp@latest,--port,8931,--host,0.0.0.0,--headless" \
    --output none
fi

echo "=== 4/5: VNet-integrate the existing App Service ==="
# Regional VNet integration lets astra-agents-platform reach anything on this
# VNet (including the internal Container Apps environment) over a private
# connection, without exposing either side to the public internet. This does
# NOT change how the public internet reaches the App Service itself -- only
# what the App Service can reach outbound.
az webapp vnet-integration add \
  --resource-group "$RG" --name "$APP_NAME" \
  --vnet "$MCP_VNET" --subnet "$MCP_SUBNET_APPSVC" \
  --output none

echo "=== 5/5: Resolving the internal URL ==="
MCP_FQDN=$(az containerapp show --resource-group "$RG" --name "$MCP_APP_NAME" --query properties.configuration.ingress.fqdn -o tsv)

echo ""
echo "Done."
echo ""
echo "Internal MCP server URL (only reachable from inside this VNet, i.e. from"
echo "astra-agents-platform itself now that it's VNet-integrated):"
echo ""
echo "  https://${MCP_FQDN}"
echo ""
echo "Next: in Astra, go to Agents > (advanced) > MCP Servers > Add Server, and register:"
echo "  URL:            https://${MCP_FQDN}"
echo "  Transport type: streamable-http"
echo ""
echo "Give the container a minute to finish starting (npx has to fetch @playwright/mcp"
echo "on first boot) before the Initialize handshake will succeed. Check logs with:"
echo "  az containerapp logs show --resource-group $RG --name $MCP_APP_NAME --follow"
