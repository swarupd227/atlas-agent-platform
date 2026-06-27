# Nous ↔ n8n integration (bidirectional)

Nous integrates with n8n in **both directions**. Use n8n for broad deterministic
connectivity and triggers; use Nous for agentic orchestration, KPIs, and governance.

## Auth
The public API is guarded by an API key. Set `NOUS_PUBLIC_API_KEY` (the local dev
launcher uses `local-dev-public-api-key`). Send it as `X-API-Key: <key>` (or
`Authorization: Bearer <key>`).

---

## 1) n8n → Nous (inbound): trigger a Nous agent from n8n

**Endpoints**
- `POST /api/v1/runs` — body `{ "agentId": "<id>", "input": <any> }` → `202 { runId, statusUrl }`
- `GET  /api/v1/runs/:runId` → `{ runId, status, progress, result, error }`
  (`status`: `queued` → `processing` → `completed` | `failed`)

**Turnkey:** import [`nous-run-agent.template.json`](./nous-run-agent.template.json)
into n8n (Workflows → Import from File). It does POST → Wait → GET. Edit two
values: `REPLACE_WITH_AGENT_ID` and the `x-api-key`. From inside the n8n
container, Nous is reachable at `http://host.docker.internal:5000`.

**curl**
```bash
# start a run
curl -s -X POST http://127.0.0.1:5000/api/v1/runs \
  -H "x-api-key: local-dev-public-api-key" -H "content-type: application/json" \
  -d '{"agentId":"<AGENT_ID>","input":"hello"}'
# -> {"runId":"...","status":"queued","statusUrl":"/api/v1/runs/..."}

# poll
curl -s http://127.0.0.1:5000/api/v1/runs/<RUN_ID> -H "x-api-key: local-dev-public-api-key"
```

---

## 2) Nous → n8n (outbound): call an n8n workflow from Nous

**Endpoint**
- `POST /api/v1/integrations/n8n/call` — body `{ "webhookUrl": "<n8n webhook>", "payload": <any>, "apiKey": "<optional>" }`
  → returns `{ ok, status, data }` from the n8n workflow.

In n8n, create a workflow that starts with a **Webhook** node (set to "Respond:
Immediately" or "When last node finishes" to return data), then call it:

```bash
curl -s -X POST http://127.0.0.1:5000/api/v1/integrations/n8n/call \
  -H "x-api-key: local-dev-public-api-key" -H "content-type: application/json" \
  -d '{"webhookUrl":"http://localhost:5678/webhook/<path>","payload":{"hello":"from nous"}}'
```

The same `callN8nWorkflow()` helper (`server/integrations/n8n.ts`) is what a
process-flow "n8n" step / agent tool will call (Phase 2 wires it into the graph
runtime; today it's available via this endpoint).

---

## Local test loop (Docker)
```bash
# n8n
docker run -d --name nous-n8n -p 5678:5678 -e N8N_SECURE_COOKIE=false n8nio/n8n
# Nous (host) reaches n8n at http://localhost:5678 ; n8n reaches Nous at http://host.docker.internal:5000
```

## Roadmap (Phase 2)
- Published native node `n8n-nodes-nous` ("Run Nous Outcome" action + "Nous Trigger").
- First-class "n8n" node type in the Process Flow Studio with a deterministic executor.
