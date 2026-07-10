# n8n-nodes-astra-agents

A native [n8n](https://n8n.io) community node for **Astra Agents**. Drop an
**Astra Agents** node into any n8n workflow to run agents and fetch results — no
raw HTTP plumbing.

## Operations
- **Run Agent** — start an agent run (`agentId` + `input`); optionally wait and
  return the result (polls the run to completion within a timeout).
- **Get Run Result** — fetch a run's status/result by `runId`.

## Credentials — "Astra Agents API"
- **Base URL** — the Astra Agents server (from an n8n Docker container use
  `http://host.docker.internal:5000`).
- **API Key** — the value of `ASTRA_PUBLIC_API_KEY` on the Astra Agents server.

## Build
```bash
cd integrations/n8n-nodes-nous
npm install
npm run build      # -> dist/
```

## Install into n8n (local / self-hosted)
**Option A — community nodes UI:** once published to npm, Settings → Community
Nodes → Install → `n8n-nodes-astra-agents`.

**Option B — local custom extension (no publish):**
```bash
npm run build
mkdir -p ~/.n8n/custom && cp -r dist/* ~/.n8n/custom/
# (Docker) mount the built package into the container's custom dir and restart:
#   -v $(pwd)/dist:/home/node/.n8n/custom
```
Restart n8n; the **Astra Agents** node and **Astra Agents API** credential appear
in the editor.

## Publish
```bash
npm run build && npm publish --access public
```

This node calls the Astra Agents public API (`POST /api/v1/runs`, `GET /api/v1/runs/:id`)
documented in [`../n8n/README.md`](../n8n/README.md).
