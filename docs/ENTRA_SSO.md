# Sign in with Microsoft Entra ID

Astra can let people sign in with their Microsoft Entra ID account. It is a second way in **beside** the
user name and password, not a replacement: the password form, its cookie and its rate limit are
unchanged, and nothing is different until single sign-on is configured.

## What it does

- A "Sign in with Microsoft" button appears on the sign-in page. It starts an OpenID Connect
  authorization-code flow with PKCE against your Entra tenant.
- On the way back Astra checks the state, the PKCE verifier and, in the ID token, its RS256 signature
  (against your tenant's published keys), issuer, audience, expiry, nonce and tenant. Any failure refuses
  the sign-in and leaves no session.
- The person then gets exactly the session cookie a password sign-in gives (httpOnly, SameSite=Lax),
  so everything after sign-in behaves the same. It lasts 8 hours by default.
- **Who they are** is the object id Entra gives them in your tenant, not their e-mail address. Astra
  never links an SSO sign-in to an existing local account by e-mail or name.
- **What they can do** comes from the app roles Entra assigned them, worked out again at every sign-in:
  change or remove a role in Entra and it applies at their next sign-in.
- Their account is created at their first sign-in. It has no password that works.

## Set it up in Entra

1. **App registration.** In Entra ID, App registrations, New registration. Supported account types:
   *this organizational directory only*. Redirect URI, platform *Web*:
   `https://<your Astra address>/api/auth/sso/callback`.
2. **Client secret.** Certificates and secrets, New client secret. Copy the value.
3. **App roles.** App roles, Create app role, one per Astra role you want to hand out. Allowed member
   types: *Users/Groups*. The **Value** is what you map in Astra (for example `Astra.Admin`).
4. **Assign people.** Enterprise applications, your app, Users and groups: assign users or groups to
   roles. Under Properties set **Assignment required** to *Yes*, so people with no role cannot sign in at all.
5. **API permissions.** The default delegated `User.Read` is enough; Astra asks only for `openid`,
   `profile` and `email`.
6. **Multi-factor authentication.** Apply your Conditional Access policy to this application. Entra does
   the MFA; Astra can additionally refuse a token that does not show it (`requireMfa`, below).
7. *(Optional)* Token configuration, Add optional claim, ID token: `email`, so people have an address in Astra.

## Set it up in Astra

`ASTRA_SSO` is JSON (or `ASTRA_SSO_FILE`, a path to the same JSON); the secret is separate:
`ASTRA_SSO_CLIENT_SECRET` (or `ASTRA_SSO_CLIENT_SECRET_FILE`, a mounted secret). Terraform variables:
`sso` and `sso_client_secret` (sensitive, set with `TF_VAR_sso_client_secret`).

```json
{
  "tenantId": "<directory (tenant) id, a GUID>",
  "clientId": "<application (client) id>",
  "redirectUri": "https://<your Astra address>/api/auth/sso/callback",
  "roles": {
    "map": {
      "Astra.Admin": "admin",
      "Astra.Engineer": "agent_engineer",
      "Astra.Compliance": "compliance_security"
    }
  },
  "localLogin": "on",
  "sessionHours": 8,
  "requireMfa": true
}
```

| Setting | Meaning |
|---|---|
| `tenantId` | Your tenant's GUID. `common` and `organizations` are not accepted: one tenant only. |
| `clientId`, `redirectUri` | From the app registration. The redirect must be https (http only for localhost) and end in `/api/auth/sso/callback`. |
| `authority` | Optional. Default `https://login.microsoftonline.com`; a sovereign cloud has its own. |
| `roles.map` | App role value to Astra role: `admin`, `agent_engineer`, `ops_sre`, `compliance_security`, `outcome_owner`, `finance`, `expert_validator`, `domain_expert`. A person holding several mapped roles gets the most privileged of them (the order above, `admin` first). |
| `roles.default` | The Astra role for a person with none of the mapped app roles. Leave it out to refuse them. |
| `organizationId` | The organization new people join. Default: the platform's default organization. |
| `localLogin` | `on` (default): the password form stays open to everyone. `admins-only`: only administrators can use it (a break-glass account). There is deliberately no "off", so a mistaken setup cannot lock everyone out. |
| `sessionHours` | 1 to 24, default 8. |
| `requireMfa` | Refuse a sign-in whose token's `amr` claim does not include `mfa`. |
| `allowedEmailDomains` | Only people whose e-mail is in one of these domains. |
| `scopes`, `buttonLabel` | Extra scopes; the text of the button. |

A value Astra cannot use (a tenant that is not a GUID, a role that does not exist, a redirect on the
wrong path, no secret, a role map that grants nobody anything) **stops the server at start-up** with the
reason. The secret is read when the server starts, so rotating it needs a restart. The startup log shows
`sso=entra tenant=…` and never the secret.

The bootstrap administrator (`BOOTSTRAP_ADMIN_PASSWORD`) and any local administrator keep working as
before and are your way in if Entra is unavailable. Keep at least one.

## What to know

- **Signing out** ends the Astra session only; it does not sign the person out of Microsoft.
- **Removing someone in Entra** stops them signing in again, but an Astra session they already hold
  lasts until it expires (8 hours by default). Ending a session on demand arrives with SCIM provisioning.
- Astra does not read Entra groups, only the app roles in the token, which avoids the 200-group limit.
- To move someone off a local account onto SSO, create their SSO account by having them sign in, then
  remove or disable the old local one; accounts are not merged.

## When a sign-in fails

The person lands on the sign-in page with a message. The reason is in the server log
(`[sso] sign-in refused (<code>): <detail>`) and a `auth.sso_denied` event in the audit trail (the code
only). Codes: `invalid_state` (cookie missing, altered or older than 10 minutes, or a state mismatch),
`idp_error` (Microsoft refused, for example the person is not assigned and assignment is required),
`token_exchange_failed` (wrong client secret, redirect or PKCE, or Microsoft unreachable; under
`ASTRA_OUTBOUND_POLICY=enforce` the login host must be reachable), `invalid_token` (signature, issuer,
audience, expiry, nonce or tenant), `mfa_required`, `no_role`, `domain_not_allowed`,
`provisioning_failed`. Every successful sign-in is an `auth.sso_login` audit event.
