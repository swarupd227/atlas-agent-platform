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
# needs to be reachable from outside Azure at all: it's deployed as an Azure
# Container Instance directly inside a VNet subnet, which gets it a private
# IP only -- ACI does not allow a public IP when deployed into a VNet, so
# this is enforced by Azure itself, not just a config flag we could get
# wrong. Nothing about this endpoint is ever exposed to the public internet.
#
# Why ACI and not Container Apps: the first version of this script used
# Container Apps, which needs an AKS node pool behind the scenes even for a
# single always-on container. That hit a real ManagedEnvironmentSubnetDelegationError
# (fixed, see git history) and then a real AKSCapacityHeavyUsage error in
# centralus -- a live regional capacity constraint, not something retryable
# via config. ACI has no AKS underneath at all, so neither failure mode can
# recur. The tradeoff: ACI's VNet deployment has no built-in DNS name, so the
# registered MCP URL is the container's private IP rather than a hostname --
# see the note printed at the end about what happens if the container is
# ever deleted and recreated.
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
MCP_SUBNET_INFRA="${MCP_SUBNET_INFRA:-mcp-infra-subnet}"       # ACI's own subnet -- delegated to Microsoft.ContainerInstance/containerGroups
MCP_SUBNET_APPSVC="${MCP_SUBNET_APPSVC:-appsvc-integration-subnet}"  # App Service regional VNet integration -- delegated to Microsoft.Web/serverFarms, /27 minimum
MCP_APP_NAME="${MCP_APP_NAME:-playwright-mcp}"
MCP_PORT=8931

echo "=== 1/4: VNet + subnets ==="
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
  echo "  $MCP_SUBNET_INFRA already exists — updating delegation."
  # Re-applied unconditionally, in case an earlier run of this script (before
  # the Container Apps -> ACI switch) left it delegated to
  # Microsoft.App/environments instead -- a subnet delegation is replaced,
  # not additive, so this is exactly what moving it over requires.
  az network vnet subnet update \
    --resource-group "$RG" --vnet-name "$MCP_VNET" --name "$MCP_SUBNET_INFRA" \
    --delegations Microsoft.ContainerInstance/containerGroups \
    --output none
else
  az network vnet subnet create \
    --resource-group "$RG" --vnet-name "$MCP_VNET" --name "$MCP_SUBNET_INFRA" \
    --address-prefixes 10.10.0.0/23 \
    --delegations Microsoft.ContainerInstance/containerGroups \
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

echo "=== 2/4: Playwright MCP container instance ==="
# --headless: no display needed in a container. --host 0.0.0.0: listen on all
# interfaces (required inside a container -- localhost-only would be
# unreachable). --port: arbitrary but matches Microsoft's own example.
# --allowed-hosts '*': Playwright MCP has its own DNS-rebinding protection on
# top of network placement -- by default it only serves requests whose Host
# header is literally "localhost:<port>", which real-MCP-verified live
# ("Access is only allowed at localhost:8931" from the server itself the
# first time this ran against the container's actual VNet IP). Disabling it
# here is safe specifically BECAUSE the real security boundary is the VNet
# placement below, not this header check: the container has no public IP at
# all, so nothing outside Azure can reach it regardless of what Host header
# it would accept.
# Deploying with --vnet/--subnet is what forces a private-only IP -- ACI
# rejects a public IP request when a VNet is specified, so there's no flag to
# accidentally get this wrong.
# --browser chromium --no-sandbox: verified live -- with no --browser flag the
# server defaulted to the "chrome" channel and failed with "Chromium
# distribution 'chrome' is not found at /opt/google/chrome/chrome". Per
# Microsoft's own docs, the official Docker image only supports headless
# Chromium (the bundled, Playwright-managed browser, not a system Chrome
# install), and their own example for this exact image passes --no-sandbox
# alongside it (needed to launch Chromium as root in a container).
az provider register --namespace Microsoft.ContainerInstance --wait 2>/dev/null || true

if az container show --resource-group "$RG" --name "$MCP_APP_NAME" --output none 2>/dev/null; then
  echo "  $MCP_APP_NAME already exists — skipping create. Delete it first ('az container delete') if you need to change its image/args, since ACI container groups are immutable once created."
else
  az container create \
    --resource-group "$RG" --name "$MCP_APP_NAME" \
    --location "$LOCATION" \
    --image mcr.microsoft.com/playwright/mcp:latest \
    --os-type Linux \
    --cpu 1 --memory 2 \
    --ports "$MCP_PORT" \
    --vnet "$MCP_VNET" --subnet "$MCP_SUBNET_INFRA" \
    --restart-policy Always \
    --command-line "npx @playwright/mcp@latest --port $MCP_PORT --host 0.0.0.0 --headless --allowed-hosts * --browser chromium --no-sandbox" \
    --output none
fi

echo "=== 3/4: VNet-integrate the existing App Service ==="
# Regional VNet integration lets astra-agents-platform reach anything on this
# VNet (including the ACI container's private IP) over a private connection,
# without exposing either side to the public internet. This does NOT change
# how the public internet reaches the App Service itself -- only what the
# App Service can reach outbound.
az webapp vnet-integration add \
  --resource-group "$RG" --name "$APP_NAME" \
  --vnet "$MCP_VNET" --subnet "$MCP_SUBNET_APPSVC" \
  --output none

echo "=== 4/4: Resolving the internal address ==="
# ACI's VNet deployment mode has no built-in DNS name (unlike Container
# Apps' ingress FQDN) -- the private IP itself is the address. It's stable
# across restarts of this same container group, but WILL change if the
# container group is ever deleted and recreated (e.g. to change its image),
# so re-run this script's final step (or just `az container show`) to get
# the current IP after any such change, and re-register it in Astra.
MCP_IP=$(az container show --resource-group "$RG" --name "$MCP_APP_NAME" --query ipAddress.ip -o tsv)

echo ""
echo "Done."
echo ""
echo "Internal MCP server address (only reachable from inside this VNet, i.e. from"
echo "astra-agents-platform itself now that it's VNet-integrated):"
echo ""
echo "  http://${MCP_IP}:${MCP_PORT}"
echo ""
echo "Next: in Astra, go to Agents > (advanced) > MCP Servers > Add Server, and register:"
echo "  URL:            http://${MCP_IP}:${MCP_PORT}"
echo "  Transport type: streamable-http"
echo ""
echo "Give the container a minute to finish starting (npx has to fetch @playwright/mcp"
echo "on first boot) before the Initialize handshake will succeed. Check logs with:"
echo "  az container logs --resource-group $RG --name $MCP_APP_NAME"
echo ""
echo "If this address ever stops responding after an image/arg change, the container"
echo "group had to be deleted and recreated and its IP has changed -- re-run:"
echo "  az container show --resource-group $RG --name $MCP_APP_NAME --query ipAddress.ip -o tsv"
echo "and update the URL registered in Astra to match."
