# Provision people from Microsoft Entra ID (SCIM)

With [single sign-on](ENTRA_SSO.md) people can sign in with Microsoft. SCIM is the other half: Entra
**creates, updates and deactivates** those people in Astra, so removing someone in your directory takes
their access away here without anyone having to remember to. Nothing is different until a SCIM token is
set, and it never touches the user name and password accounts.

## What it does

- Entra calls Astra's SCIM API (`https://<your Astra address>/scim/v2`) with a secret bearer token.
- **Create** a person in Entra's provisioning scope and they appear in Astra, ready for their first
  Microsoft sign-in. **Update** their user name or e-mail and it follows.
- **Deactivate** them (unassign the app, disable the account, or delete them) and Astra:
  - refuses their next sign-in with a clear message, and
  - ends the sessions they already have. A session is checked against the person every request, with a
    30-second memory: on the instance that received the SCIM call it ends at once, on another instance
    within 30 seconds.
- The row is kept (the audit trail points at it). Bringing them back in Entra reactivates the same
  account, and sessions from before their removal stay ended.
- Every create, change and deactivation is written to the audit log (ids and the names of what changed,
  never their address).

## What it deliberately cannot do

- **It cannot see a local account.** Only people who sign in through SSO, in your tenant and organization,
  exist as far as SCIM is concerned. A local account is not listed, cannot be read, changed or
  deactivated through it, and is never matched by name or e-mail.
- **A person is their Entra object id.** If a user name is already taken by another account, creating the
  person fails with 409 instead of merging with that account.
- **No groups.** Give people their access by assigning the app role. (`/Groups` answers 404.)
- **No passwords.** SSO accounts have none.
- **Password sessions are not touched.** Only people who sign in with Microsoft are deprovisioned, which
  is exactly who SCIM manages.

## Set it up in Astra

SCIM needs single sign-on already configured (the tenant is what ties a provisioned person to their
sign-in); with a token and no SSO the server refuses to start.

| Setting | |
|---|---|
| `ASTRA_SCIM_TOKEN` (or `ASTRA_SCIM_TOKEN_FILE`, a mounted secret) | The bearer token. At least 32 characters: `openssl rand -hex 32`. |
| `ASTRA_SCIM_TOKEN_NEXT` | A second token accepted beside the first, to rotate without a gap. |

Terraform variable: `scim_token` (sensitive, set with `TF_VAR_scim_token`).

Rotating: set `ASTRA_SCIM_TOKEN_NEXT` to the new value and deploy; paste the new token into Entra; then
move it into `ASTRA_SCIM_TOKEN`, clear `ASTRA_SCIM_TOKEN_NEXT` and deploy again.

## Set it up in Entra

1. Enterprise applications, your Astra app, **Provisioning**, mode **Automatic**.
2. **Tenant URL**: `https://<your Astra address>/scim/v2`. **Secret token**: the value of
   `ASTRA_SCIM_TOKEN`. **Test connection** must succeed.
3. Mappings, **Provision Microsoft Entra ID Users**:
   - `userName` from `userPrincipalName` (the default).
   - **`externalId` must come from `objectId`.** The default in a custom app is `mailNickname`; change the
     source attribute. Astra refuses anything that is not a GUID, because the object id is what ties the
     provisioned person to their Microsoft sign-in.
   - `active` from `Switch([IsSoftDeleted], , "False", "True", "True", "False")` (the default).
   - `emails[type eq "work"].value` from `mail` (optional).
   - Remove the attributes Astra does not keep (display name, address, manager ...). It ignores them
     rather than failing, but fewer mappings means less noise in the provisioning log.
4. Mappings, **Provision Microsoft Entra ID Groups**: set to *No* (or disable it).
5. Settings: **Scope** *Sync only assigned users and groups*, then assign the people (as for SSO).
6. Turn **Provisioning Status** on.

### Roles

Sign-in works out a person's Astra role from the app roles in their token every time, so nothing
provisioned decides it. SCIM sets the role a provisioned person has *before* their first sign-in:

- If your provisioning sends a `roles` attribute, each app role value goes through the same map as sign-in
  (`ASTRA_SSO` `roles.map`; the most privileged wins).
- Otherwise they get the SSO default role if there is one, or the **least privileged** role
  (`domain_expert`), and their real role is set at their first sign-in.

## Checking it

```bash
TOKEN=<your token>
curl -s -H "Authorization: Bearer $TOKEN" https://<your Astra address>/scim/v2/ServiceProviderConfig
curl -s -H "Authorization: Bearer $TOKEN" "https://<your Astra address>/scim/v2/Users?count=5"
```

Without a token, or with SCIM off, the answers are 401 and 404. The startup log line shows `scim=on` or
`scim=off`.

## Not covered

Group provisioning, bulk operations, and SCIM for local accounts. Deprovisioning a person ends their
**Astra** access; it does not revoke anything they were given outside it (an API key they minted, a
connector credential).
