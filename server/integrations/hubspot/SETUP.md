# HubSpot CRM Integration — Setup Guide

## Overview
The HubSpot MCP server connects to a HubSpot portal via the CRM v3 REST API
using a **Private App token** (no OAuth redirect required). Supports contacts,
companies, deals, notes, and pipeline management.

## Prerequisites
1. A HubSpot account (free CRM: https://app.hubspot.com/signup)
2. Admin access to create a Private App
3. Your Portal ID (visible in HubSpot Settings URL or top-right account menu)

---

## Step 1 — Create a Private App

1. In HubSpot → **Settings** (gear icon) → **Integrations** → **Private Apps**
2. Click **Create a private app**
3. Fill in:
   - **Name**: `Nous Atlas Integration`
   - **Description**: `Agent orchestration via Nous Atlas platform`
4. Under **Scopes** → select the following:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.objects.companies.read`
   - `crm.objects.companies.write`
   - `crm.objects.deals.read`
   - `crm.objects.deals.write`
   - `crm.schemas.contacts.read`
   - `crm.schemas.deals.read`
   - `timeline` (for notes/engagements)
5. Click **Create app** → copy the **Access Token** (starts with `pat-na1-...`)

---

## Step 2 — Connect via Atlas Integration UI

1. Navigate to **Integrations** in the Atlas sidebar
2. Find **HubSpot** → click **Connect**
3. Enter:
   - **Private App Token**: `pat-na1-...` (from Step 1)
   - **Portal ID**: Your HubSpot Portal ID (numeric, e.g. `12345678`)
4. Click **Save** — credentials are stored in the Atlas AES-256-GCM vault

---

## Step 3 — Verify Connection

Test with a basic search:
```json
POST /api/integrations/hubspot/tools/hs_search_contacts
{
  "args": { "limit": 5 },
  "orgId": "<your-org-id>"
}
```

---

## Demo Scenario: Deal Qualification Agent

**Use case**: A revenue ops agent qualifies inbound leads and updates deal stages.

### Agent flow:
1. **hs_search_contacts** — `email: "john.smith@prospect.com"` → find the contact
2. **hs_get_contact** — `contactId: "<found ID>"`, `includeDeals: true` → get full context + associated deals
3. **hs_get_deal** — `dealId: "<associated deal ID>"` → check current stage and amount
4. **hs_update_deal_stage** — `dealId: "<deal ID>"`, `dealStage: "qualifiedtobuy"` → advance the deal
5. **hs_create_note** — `objectType: "deals"`, `objectId: "<deal ID>"`, `body: "Qualified via Nous Agent — ICP match score: 0.87"` → log the qualification

### Sample deal stage IDs (default pipeline):
| Stage | ID |
|-------|----|
| Appointment Scheduled | `appointmentscheduled` |
| Qualified to Buy | `qualifiedtobuy` |
| Presentation Scheduled | `presentationscheduled` |
| Decision Maker Bought In | `decisionmakerboughtin` |
| Contract Sent | `contractsent` |
| Closed Won | `closedwon` |
| Closed Lost | `closedlost` |

Note: Custom pipelines use different stage IDs. Use `GET /crm/v3/pipelines/deals` to enumerate yours.

### Sandbox / Test Data:
HubSpot has a sandbox environment accessible via:
**Settings → Account → Sandboxes** (requires Sales Hub Starter or above)

For free accounts, use the **demo data** option when first setting up your account,
or create test contacts/deals manually. All writes in test mode use a separate portal.

---

## Tool Reference

| Tool | Purpose |
|------|---------|
| `hs_search_contacts` | Search contacts by email, name, company, stage |
| `hs_get_contact` | Full contact record with companies and deals |
| `hs_create_contact` | Create contact with optional company association |
| `hs_update_contact` | Update contact properties |
| `hs_search_companies` | Search companies by name, domain, industry |
| `hs_get_deal` | Deal record with associated contacts |
| `hs_create_deal` | Create deal in a pipeline stage |
| `hs_update_deal_stage` | Move deal to new stage |
| `hs_create_note` | Add note to contact, company, or deal |
| `hs_search_deals` | Search deals by pipeline, stage, owner, amount |

---

## Credential Vault Fields

When stored in the Atlas credential vault, the HubSpot connection uses:

| Field | Description |
|-------|-------------|
| `api_key` | Private App token (`pat-na1-...`) |
| `portal_id` | HubSpot Portal ID (numeric string) |

---

## Rate Limits

HubSpot enforces the following limits for Private App tokens:
- **100 requests / 10 seconds** per token
- **Daily limit**: 250,000 API calls/day (varies by hub tier)
- **Search API**: 4 requests/second, 10,000 results/query

The Atlas integration handles rate-limit (`429`) responses with exponential backoff
via `RealMcpBase.fetchWithAuth()`. Retry-After headers are respected.

---

## Common Pipeline Stage Issues

- **Invalid stage ID**: Stage IDs are case-sensitive and must match your portal's pipeline exactly
- **Pipeline mismatch**: A stage must belong to the specified pipeline (or default pipeline)
- **Missing scope**: If create/update operations fail with 403, check that your Private App has write scopes enabled
