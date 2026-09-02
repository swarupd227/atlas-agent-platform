#!/usr/bin/env bash
# Provisions a Playwright MCP server (Microsoft's official browser-automation
# MCP server, mcr.microsoft.com/playwright/mcp) for the UI Validation Agent,
# VNet-integrates the existing astra-agents-platform App Service so it can
# reach it privately, and mounts a shared Azure Files share into both so the
# App Service can actually retrieve the screenshot files the container saves.
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
# Why the shared file share: verified live -- Playwright MCP's
# browser_take_screenshot tool does NOT return an inline image in its tool
# result. It saves the file to its own container filesystem and returns only
# a text filename reference, and this server's real Initialize handshake
# advertises capabilities: {tools: {}} with no "resources" capability, so
# there's no MCP-protocol way to read the file back either. Mounting the
# same Azure Files share into both the container (as Playwright's
# --output-dir) and this App Service (at a local path the app code reads
# directly) closes that gap with a plain filesystem read on the app's side --
# see server/tool-dispatcher.ts's captureFileBasedScreenshot for the code
# that actually persists it as a downloadable agentGeneratedFiles row.
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
# Storage account names must be globally unique, lowercase alphanumeric only,
# <=24 chars -- derived from APP_NAME plus a short hash of RG+APP_NAME so a
# collision with someone else's storage account is unlikely without you
# having to pick a name yourself.
MCP_STORAGE_ACCOUNT="${MCP_STORAGE_ACCOUNT:-$(echo -n "${APP_NAME}mcpevid" | tr -dc 'a-z0-9' | cut -c1-18)$(echo -n "${RG}${APP_NAME}" | md5sum | cut -c1-6)}"
MCP_FILE_SHARE="${MCP_FILE_SHARE:-mcp-evidence}"
MCP_MOUNT_PATH="/mnt/mcp-evidence"   # same path on both the container and the App Service, by convention -- not user-configurable, since server/tool-dispatcher.ts's default matches this exactly

echo "=== 1/6: VNet + subnets ==="
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

echo "=== 2/6: Shared storage account + file share (evidence handoff) ==="
az provider register --namespace Microsoft.Storage --wait 2>/dev/null || true

if az storage account show --resource-group "$RG" --name "$MCP_STORAGE_ACCOUNT" --output none 2>/dev/null; then
  echo "  $MCP_STORAGE_ACCOUNT already exists — skipping create."
else
  az storage account create \
    --resource-group "$RG" --name "$MCP_STORAGE_ACCOUNT" \
    --location "$LOCATION" \
    --sku Standard_LRS --kind StorageV2 \
    --output none
fi

MCP_STORAGE_KEY=$(az storage account keys list --resource-group "$RG" --account-name "$MCP_STORAGE_ACCOUNT" --query "[0].value" -o tsv)

if az storage share-rm show --resource-group "$RG" --storage-account "$MCP_STORAGE_ACCOUNT" --name "$MCP_FILE_SHARE" --output none 2>/dev/null; then
  echo "  $MCP_FILE_SHARE already exists — skipping create."
else
  az storage share-rm create \
    --resource-group "$RG" --storage-account "$MCP_STORAGE_ACCOUNT" --name "$MCP_FILE_SHARE" \
    --quota 5 \
    --output none
fi

echo "=== 3/6: Playwright MCP container instance ==="
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
# --output-dir: writes screenshots into the mounted Azure Files share instead
# of the container's own ephemeral filesystem -- see the file share note above.
az provider register --namespace Microsoft.ContainerInstance --wait 2>/dev/null || true

if az container show --resource-group "$RG" --name "$MCP_APP_NAME" --output none 2>/dev/null; then
  echo "  $MCP_APP_NAME already exists — skipping create. Delete it first ('az container delete') if you need to change its image/args/mounts, since ACI container groups are immutable once created."
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
    --azure-file-volume-account-name "$MCP_STORAGE_ACCOUNT" \
    --azure-file-volume-account-key "$MCP_STORAGE_KEY" \
    --azure-file-volume-share-name "$MCP_FILE_SHARE" \
    --azure-file-volume-mount-path "$MCP_MOUNT_PATH" \
    --command-line "npx @playwright/mcp@latest --port $MCP_PORT --host 0.0.0.0 --headless --allowed-hosts * --browser chromium --no-sandbox --output-dir $MCP_MOUNT_PATH" \
    --output none
fi

echo "=== 4/6: VNet-integrate the existing App Service ==="
# Regional VNet integration lets astra-agents-platform reach anything on this
# VNet (including the ACI container's private IP) over a private connection,
# without exposing either side to the public internet. This does NOT change
# how the public internet reaches the App Service itself -- only what the
# App Service can reach outbound.
az webapp vnet-integration add \
  --resource-group "$RG" --name "$APP_NAME" \
  --vnet "$MCP_VNET" --subnet "$MCP_SUBNET_APPSVC" \
  --output none

echo "=== 5/6: Mounting the same file share into the App Service ==="
# Linux App Service "custom storage mounts" expose an Azure Files share as a
# plain local path inside the app's own container -- server/tool-dispatcher.ts
# then just does a normal fs.readFile() against MCP_MOUNT_PATH, no Storage SDK
# or network call needed. This is a config-plane change on the Web App
# resource; it takes effect on the app's next restart, which the final
# `az webapp restart` below forces immediately rather than waiting for the
# next code deploy.
if az webapp config storage-account list --resource-group "$RG" --name "$APP_NAME" --query "[?name=='mcp-evidence']" -o tsv | grep -q .; then
  echo "  mcp-evidence mount already exists — skipping create."
else
  az webapp config storage-account add \
    --resource-group "$RG" --name "$APP_NAME" \
    --custom-id mcp-evidence \
    --storage-type AzureFiles \
    --account-name "$MCP_STORAGE_ACCOUNT" \
    --share-name "$MCP_FILE_SHARE" \
    --access-key "$MCP_STORAGE_KEY" \
    --mount-path "$MCP_MOUNT_PATH" \
    --output none
fi

az webapp restart --resource-group "$RG" --name "$APP_NAME" --output none

echo "=== 6/6: Resolving the internal address ==="
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
echo ""
echo "The App Service just restarted to pick up the new /mnt/mcp-evidence mount --"
echo "give it a minute before running anything through the UI Validation pipeline."
