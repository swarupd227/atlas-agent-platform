# Astra Relay Agent

Lets Astra Agents reach a database inside your private network **without opening any inbound firewall port**.

The agent makes a single **outbound** WebSocket connection to your Astra instance. When an agent needs to query the database, Astra asks the relay to open a local TCP connection and bytes are relayed both ways. Your firewall only ever sees an outbound HTTPS/WSS connection.

Use this when the database is reachable only from inside a private network. If Astra can reach the database directly, use **Direct** mode instead; if you have a bastion host, use **SSH Tunnel**.

---

## 1. Create a relay agent in Astra

In Astra: **Integrations → Relay Agents → New Relay Agent**.

You get two values:

| Value | Used for |
|---|---|
| **Agent ID** | Paste into the SQL connector's **Relay Agent** field |
| **Token** | Used by this agent to authenticate. **Shown once** — copy it immediately |

If you lose the token, revoke the agent and create a new one.

## 2. Install

The agent needs **Node.js 18 or newer** on a machine that can reach the database.

**From a tarball** (what you'll usually be given):

```bash
npm install -g ./astra-relay-agent-1.0.0.tgz
```

**From source:**

```bash
cd relay-agent
npm install
npm start -- --url https://astra.example.com --token-file ./relay.token
```

To produce a tarball for distribution: `cd relay-agent && npm pack`

## 3. Run it

Put the token in a file rather than passing it on the command line — a token in an argument is visible to anyone who can list processes on the machine.

```bash
umask 077 && printf '%s' 'PASTE_TOKEN_HERE' > /etc/astra/relay.token

astra-relay-agent \
  --url https://astra.example.com \
  --token-file /etc/astra/relay.token
```

Expected output:

```
[relay-agent] Connecting to wss://astra.example.com/api/relay/agent ...
[relay-agent] Connected. Waiting for tunnel requests.
```

The agent's row in **Integrations → Relay Agents** flips to **online**.

### Configuration

| Flag | Environment variable | Notes |
|---|---|---|
| `--url` | `RELAY_PLATFORM_URL` | Your Astra URL. `https://` is upgraded to `wss://` automatically |
| `--token-file` | `RELAY_AGENT_TOKEN_FILE` | Path to a file containing only the token — **preferred** |
| `--token` | `RELAY_AGENT_TOKEN` | The token inline. Convenient for testing, avoid in production |

Flags take precedence over environment variables. `--help` prints usage.

## 4. Point the connector at it

In Astra, open the SQL connector (**Integrations → PostgreSQL / MySQL / SQL Server → Connect**) and set:

- **Connection Mode** → `Relay Agent`
- **Relay Agent** → the **Agent ID** from step 1
- **Host** / **Port** → the database address **as seen from the machine running this agent** — usually `localhost` and the standard port
- **Database**, **User**, **Password** → as normal

Then run the connection test.

> The relay carries raw TCP, so the database's own TLS settings still apply. `SSL Mode` behaves exactly as it would for a direct connection.

## Running it permanently (systemd)

`/etc/systemd/system/astra-relay-agent.service`:

```ini
[Unit]
Description=Astra Relay Agent
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/astra-relay-agent --url https://astra.example.com --token-file /etc/astra/relay.token
Restart=always
RestartSec=5
User=astra-relay
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now astra-relay-agent
sudo journalctl -u astra-relay-agent -f
```

## Behaviour notes

- **Reconnects automatically** with exponential backoff (1s → 30s) if the connection drops.
- **Stops on auth failure.** If the token is missing, invalid, or revoked, the agent exits rather than retrying a credential that cannot start working.
- **Clean shutdown.** On `SIGINT`/`SIGTERM` it closes open database connections and disconnects.
- **One agent, many connections.** Concurrent database connections are multiplexed over the single WebSocket.

## Security

- The token authenticates **this agent** to Astra. Treat it like a password: keep it in a root-owned, `0600` file, and never commit it.
- Revoking in **Integrations → Relay Agents** invalidates the token immediately and disconnects the agent.
- The agent only opens connections Astra explicitly asks for, to the host/port configured on the connector — it does not expose the network generally.
- Use `wss://` in production. Plaintext `ws://` to a non-local host logs a warning, since database traffic would not be encrypted in transit.
