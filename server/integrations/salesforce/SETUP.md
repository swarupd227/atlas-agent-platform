# Salesforce CRM Integration — Setup Guide

## Overview
The Salesforce MCP server connects directly to a Salesforce org via the REST API + SOQL.
It supports both **production** (`login.salesforce.com`) and **sandbox** (`test.salesforce.com`) orgs.

## Prerequisites
1. A Salesforce org (Developer Edition is free: https://developer.salesforce.com/signup)
2. Admin access to create a Connected App
3. Your org's Instance URL (e.g. `https://yourorg.my.salesforce.com`)

---

## Step 1 — Create a Connected App

1. In Salesforce Setup → **App Manager** → **New Connected App**
2. Fill in:
   - **Connected App Name**: `Nous Atlas Integration`
   - **API Name**: `Nous_Atlas_Integration`
   - **Contact Email**: your admin email
3. Under **API (Enable OAuth Settings)**:
   - ✅ Enable OAuth Settings
   - **Callback URL**: `https://your-replit-app.replit.app/api/integrations/oauth/callback`
   - **Selected OAuth Scopes**:
     - `Access and manage your data (api)`
     - `Perform requests on your behalf at any time (refresh_token, offline_access)`
4. Save → wait 2–10 minutes for propagation

---

## Step 2 — Get OAuth Credentials

After the Connected App is created:
- Go to **App Manager** → find your app → **View**
- Note the **Consumer Key** (Client ID) and **Consumer Secret** (Client Secret)

Set these as environment variables:
```
OAUTH_SALESFORCE_CLIENT_ID=<Consumer Key>
OAUTH_SALESFORCE_CLIENT_SECRET=<Consumer Secret>
```

---

## Step 3 — Connect via Atlas Integration UI

1. Navigate to **Integrations** in the Atlas sidebar
2. Find **Salesforce** → click **Connect**
3. Complete the OAuth flow — you'll be redirected to Salesforce to authorize
4. After redirect, your `access_token`, `refresh_token`, and `instance_url` are stored in the encrypted credential vault

---

## Step 4 — Sandbox Support

For sandbox orgs, credentials must include `sandbox: "true"`. The Atlas OAuth flow
automatically handles this when `test.salesforce.com` is used as the authorization endpoint.

To override: update the integration connection with `credentials.sandbox = "true"`.

---

## Demo Scenario: Account Enrichment Agent

**Use case**: A sales agent needs full context on a prospect account before a call.

### Agent flow:
1. **sf_search** — `searchTerm: "Acme"` → find the Acme Corp account
2. **sf_get_account** — `accountId: "<found ID>"` → pull all contacts, open opportunities, recent cases
3. **sf_create_case** — `subject: "Pre-Call Research — Acme Corp"`, `accountId: "<found ID>"` → log a case for tracking

### Sample SOQL queries to explore your org:
```sql
-- Find accounts with open opportunities
SELECT Id, Name, Industry, AnnualRevenue FROM Account
WHERE Id IN (SELECT AccountId FROM Opportunity WHERE IsClosed = false)
ORDER BY AnnualRevenue DESC NULLS LAST
LIMIT 10

-- Recent high-priority cases
SELECT Id, CaseNumber, Subject, Status, Priority, Account.Name
FROM Case
WHERE Priority = 'High' AND Status != 'Closed'
ORDER BY CreatedDate DESC LIMIT 20

-- Opportunities closing this quarter
SELECT Id, Name, StageName, Amount, CloseDate, Account.Name
FROM Opportunity
WHERE IsClosed = false AND CloseDate = THIS_QUARTER
ORDER BY Amount DESC NULLS LAST LIMIT 20
```

### Developer Edition seed data:
A fresh Developer Edition org includes sample Accounts, Contacts, Leads, and Opportunities
in the **Sample Data** app. Enable it via Setup → Sample Data → **Add Sample Data**.

---

## Tool Reference

| Tool | Purpose |
|------|---------|
| `sf_query` | Run any SOQL query |
| `sf_get_record` | Fetch single record by ID |
| `sf_create_record` | Create Contact/Account/Opportunity/Case/Lead/Task |
| `sf_update_record` | Update any record fields |
| `sf_search` | SOSL global search across objects |
| `sf_list_objects` | Enumerate org objects and field metadata |
| `sf_get_account` | Enriched account view with contacts, opps, cases |
| `sf_get_opportunity` | Opportunity with stage history and contacts |
| `sf_create_case` | Open a support case |
| `sf_update_case_status` | Advance case workflow status |
| `sf_add_case_comment` | Append public or private comment to a case |
| `sf_log_activity` | Log a Task or Event against any record |

---

## Credential Vault Fields

When stored in the Atlas credential vault, the Salesforce connection uses:

| Field | Description |
|-------|-------------|
| `access_token` | OAuth access token (rotated on 401) |
| `refresh_token` | Long-lived refresh token |
| `instance_url` | Your org URL, e.g. `https://yourorg.my.salesforce.com` |
| `token_type` | `Bearer` |
| `sandbox` | `"true"` for sandbox orgs |

---

## Rate Limits

- **API calls**: 15,000/24h (Developer Edition), 100,000+/24h (paid)
- **Concurrent API requests**: 25 per org
- **SOQL query rows**: 50,000/request (use `LIMIT` to stay under)
- **SOSL search results**: 2,000 per object type

Token refresh is automatic on 401 / `INVALID_SESSION_ID` errors.
