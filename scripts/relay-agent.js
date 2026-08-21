#!/usr/bin/env node
/**
 * Moved. This was an in-repo MVP copy of the relay agent; the shipping one is
 * the standalone package under relay-agent/, which depends only on `ws` and so
 * can be installed by a customer without a checkout of this repo -- which is
 * the whole point, since it runs inside THEIR network.
 *
 * Kept as a pointer rather than deleted for two reasons: anyone part-way
 * through a setup that referenced this path gets told where it went instead of
 * a bare "module not found", and a second implementation of the same wire
 * protocol is a standing drift hazard against server/relay/protocol.ts.
 */

console.error(`
This script has moved to the standalone 'astra-relay-agent' package
(relay-agent/ in this repo).

  From source:  cd relay-agent && npm install
                node index.js --url https://<your-astra-host> --token-file ./relay.token

  Packaged:     cd relay-agent && npm pack
                npm install -g ./astra-relay-agent-1.0.0.tgz
                astra-relay-agent --url https://<your-astra-host> --token-file ./relay.token

Create the agent and copy its token under Integrations -> Relay Agents in
Astra. See relay-agent/README.md for full setup, including a systemd unit.
`);
process.exit(1);
