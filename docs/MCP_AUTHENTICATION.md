# Authenticating to a remote MCP server

Each remote MCP server (and each REST connector imported from an OpenAPI spec) has one auth record.
It is set on the server's page under **Authentication**, or with `PUT /api/mcp-servers/<id>/auth`
(permission `manage_mcp_servers`). Values are encrypted at rest and are never shown back.

| Auth type | Sends |
|---|---|
| `none` | nothing |
| `bearer` | `Authorization: Bearer <token>` |
| `api_key` | `<headerName>: <value>` (default `X-API-Key`) |
| `basic` | `Authorization: Basic <base64(user:password)>` |
| `oauth2` | `Authorization: Bearer <accessToken>` (refreshed for a few known providers, such as Figma) |
| `oauth2_client_credentials` | `Authorization: Bearer <token>`, where Astra gets and renews the token itself |

## Additional headers

Any auth type except `none` can also send additional headers. A service that wants two credentials at
once, such as Adobe's `Authorization: Bearer <IMS token>` and `x-api-key: <client id>`, uses one auth
type for the first and an additional header for the second.

```json
{ "authType": "oauth2_client_credentials",
  "config": { "tokenUrl": "…", "clientId": "…", "clientSecret": "…",
              "extraHeaders": { "x-api-key": "<client id>" } } }
```

- Up to 10 headers, values up to 2048 characters, no line breaks.
- A header that the auth type or the MCP transport owns cannot be added: `Authorization`, `Host`,
  `Content-Type`, `Accept`, `Content-Length`, `Cookie`, `Origin`, `Mcp-Session-Id`, `Mcp-Protocol-Version`,
  anything starting `Proxy-` or `Sec-`, and the other hop-by-hop headers. If the auth type already sets a
  header of the same name, the auth type wins.
- Saving without `extraHeaders` keeps the ones stored; saving with `"extraHeaders": {}` removes them.
  (The screen never shows values, so a save that does not touch them must not lose them.)

## OAuth client credentials

Astra posts `grant_type=client_credentials` to the token URL with the client id and secret, keeps the
access token (encrypted, with the server's other settings) until a minute before it expires, and then
requests a new one. Use it for services that want a short-lived token: Adobe IMS server-to-server, an
Amazon Bedrock AgentCore Gateway with a JWT authorizer, or any OAuth 2.0 token endpoint.

| Setting | Meaning |
|---|---|
| `tokenUrl` | The token endpoint. `http` or `https`, no user name or password. Must be allowed by the outbound policy (`ASTRA_OUTBOUND_POLICY`, `ASTRA_ALLOWED_PRIVATE_CIDRS`). |
| `clientId`, `clientSecret` | The client. The secret is write-only; a save that leaves it out keeps the stored one. |
| `scope`, `audience` | Optional, sent as given. Use the format your provider documents. |
| `tokenAuthMethod` | `body` (default: `client_id` and `client_secret` in the request body) or `basic` (HTTP Basic, form-encoded as RFC 6749 section 2.3.1 says). |

Behaviour worth knowing:

- Only `Bearer` tokens are accepted. A token type of `MAC` is refused. A token with no `expires_in` is
  treated as lasting five minutes.
- If the token endpoint refuses or cannot be reached, the call that needed the token **fails with the
  reason** (the host, the HTTP status and the provider's `error`); it is never sent without a credential. A token that
  has not actually expired yet is used if renewal fails. After a failure Astra does not ask again for 30
  seconds, so a wrong secret does not hammer the provider.
- Many calls needing a token at once cause one request.
- Changing any of these settings discards the stored token, and a token fetched under old settings is not
  stored over new ones.
- The error shown never contains the secret or the token.

### Adobe

`tokenUrl` is the IMS token endpoint for your Adobe project, `scope` the scopes the project was granted,
`extraHeaders` has `x-api-key` set to the project's client id.

### AgentCore Gateway

With a JWT authorizer, use the identity provider's token endpoint and the client the gateway allows.
AWS SigV4 (IAM authorization on the gateway) is not supported.
