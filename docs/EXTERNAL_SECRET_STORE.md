# Keeping connector credentials in AWS Secrets Manager

By default Astra keeps connector credentials (an API token, an OAuth secret) in its own database, encrypted
with a key from `INTEGRATION_VAULT_KEY`. With an external secret store they live in **AWS Secrets Manager**
instead: the database holds only a reference such as `{"v":2,"store":"aws-sm","name":"astra/prod/mcp-auth/…"}`,
never a secret value. Access to the secret is then governed by IAM, recorded in CloudTrail, and can be
rotated by your own tooling.

It is a switch. **Off unless `ASTRA_SECRETS_MANAGER_PREFIX` is set**, and with it unset nothing changes:
the same encrypted blobs are written and read the same way, and no AWS library is loaded.

## What moves in this version

| Credentials | Kind | Stored in Secrets Manager when switched on |
|---|---|---|
| MCP server credentials (a Bearer token, an API key, an OAuth client secret and its cached token, extra headers) | `mcp-auth` | **Yes** |
| Enterprise connector connections (Jira, Salesforce, ServiceNow, ...) | `connection` | Not yet: stays in the database |
| Per-agent connector identities | `agent-connection` | Not yet |
| OAuth app registrations | `oauth-app` | Not yet |
| LLM provider keys | | Not covered: set the lockdown option `llmKeys` to `"env-only"` and supply keys from the environment |

`ASTRA_SECRETS_MANAGER_KINDS` accepts all four names so a setting written today keeps its meaning, but a
kind that is not yet moved over does nothing (the server says so at start-up). The default is what this
version moves: `mcp-auth`.

## How it behaves

- **A credential is written to the store the next time it is saved**, and the database column then holds
  the reference. Credentials saved before you switched it on keep working from the database and move across
  when they are next written (a token refresh counts). An update of a credential already in the store goes
  to the same secret.
- **No fallback.** A reference contains no secret, so if Secrets Manager cannot be read the call that needs
  it fails with an error. It never falls back to something else.
- **Switching it off is not silent.** A reference met by a server with no store configured is an error on
  read and on write, and nothing is written anywhere. Move credentials back before removing the setting.
- **A short memory.** A read is kept for 60 seconds (`ASTRA_SECRETS_MANAGER_CACHE_SECONDS`, 0 to 3600) so a
  busy connector does not call AWS on every request; a write updates it at once. A secret you rotate
  outside Astra is picked up within that time.
- **Start-up check.** The server creates, reads, updates, reads and deletes a throwaway secret at boot.
  A missing permission stops it (`[FATAL] The external secret store cannot be used`) instead of failing the
  first connector call.
- **Deleting.** A secret that is let go of is marked for deletion with a 7-day recovery window (the shortest
  AWS allows). Removing an MCP server does not currently remove its credentials row, so its secret stays
  until that row is cleaned up; an orphan costs $0.40 a month.

## Set it up

1. **Choose a prefix**, ending in `/`, for example `astra/prod/`. Every secret Astra creates is named
   `<prefix><kind>/<random id>` and tagged `managed-by=astra`.
2. **Give the application's role** (instance profile, task role or service account) this, on that prefix only:

   ```json
   {
     "Effect": "Allow",
     "Action": ["secretsmanager:CreateSecret", "secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue",
                "secretsmanager:DeleteSecret", "secretsmanager:TagResource"],
     "Resource": "arn:aws:secretsmanager:<region>:<account>:secret:astra/prod/*"
   }
   ```

   If you name a customer-managed KMS key to encrypt the secrets (`ASTRA_SECRETS_MANAGER_KMS_KEY_ID`), the
   role also needs `kms:GenerateDataKey` and `kms:Decrypt` on it (and the key policy must allow Secrets
   Manager to use it for your account). With the Terraform in `deploy/terraform/aws`, set
   `secrets_manager_prefix` and it adds the policy above and passes the settings to the app.
3. **Check it** as the same role the application will use:

   ```bash
   ASTRA_SECRETS_MANAGER_PREFIX=astra/prod/ AWS_REGION=eu-central-1 node scripts/check-secrets-manager.mjs
   ```

   It creates, reads, updates and deletes (with the 7-day recovery window Astra uses) a throwaway secret
   and prints the latency; that secret then stays marked for deletion, unreadable, until AWS purges it. **This is the
   check that matters:** the automated tests use a stand-in for Secrets Manager built from AWS's
   documentation, and this is how the real service proves it behaves the same.
4. **Set `ASTRA_SECRETS_MANAGER_PREFIX`** (and the region) and deploy. The `[config]` line shows
   `secrets=aws-sm(mcp-auth)`. Save an MCP server's credentials (or let a token refresh) and the secret
   appears under your prefix.

## Settings

| Setting | |
|---|---|
| `ASTRA_SECRETS_MANAGER_PREFIX` | Turns it on. A path ending in `/`. |
| `ASTRA_SECRETS_MANAGER_REGION` | Or `AWS_REGION`. |
| `ASTRA_SECRETS_MANAGER_KINDS` | Comma list of kinds to store there. Default `mcp-auth`. |
| `ASTRA_SECRETS_MANAGER_KMS_KEY_ID` | Optional customer-managed key for the secrets. |
| `ASTRA_SECRETS_MANAGER_ENDPOINT` | A VPC endpoint (https; http only for localhost). |
| `ASTRA_SECRETS_MANAGER_TIMEOUT_MS` | 500 to 60000, default 5000. |
| `ASTRA_SECRETS_MANAGER_CACHE_SECONDS` | 0 to 3600, default 60. |

## Cost and limits

$0.40 per secret per month and $0.05 per 10,000 API calls. A secret holds up to 64 KB; Astra refuses a
credential set over 60,000 bytes. AWS advises writing a secret no more often than every 10 minutes
sustained, which an hourly token refresh stays well inside. The calls use the AWS SDK and its own HTTP
client, not the platform's outbound policy (`ASTRA_OUTBOUND_POLICY`), because the endpoint is AWS's; for a
private path use a VPC endpoint and set `ASTRA_SECRETS_MANAGER_ENDPOINT`.
