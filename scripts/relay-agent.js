#!/usr/bin/env node
/**
 * Relay Agent — deployed inside a client's private network to let the
 * platform reach a database that has no inbound access at all (Phase 3 of
 * the SQL connector connection-mode plan; Phase 1: direct-connect, Phase 2:
 * SSH tunnel). Opens a single OUTBOUND WebSocket to the platform and, on
 * each "open" request, makes a local TCP connection to the real database
 * (reachable from inside this network) and relays bytes both ways --
 * nothing needs to be opened on this side's firewall.
 *
 * Usage:
 *   RELAY_PLATFORM_URL=wss://your-astra-instance.example.com \
 *   RELAY_AGENT_TOKEN=<token from POST /api/relay-agents> \
 *   node scripts/relay-agent.js
 *
 * This MVP runs from within the atlas-agent-platform checkout (it uses this
 * repo's own `ws` dependency). A real client-distributed build would ship
 * as its own small package (this file + a package.json pinning `ws`) so it
 * has no dependency on the rest of the platform's source tree.
 *
 * The wire protocol implemented below (control frames as WS text/JSON,
 * data frames as WS binary with a 36-byte streamId prefix) MUST stay in
 * sync with server/relay/protocol.ts -- duplicated here, not imported,
 * since this script runs standalone outside the TypeScript build.
 */

import WebSocket from "ws";
import net from "net";

const PLATFORM_URL = process.env.RELAY_PLATFORM_URL;
const TOKEN = process.env.RELAY_AGENT_TOKEN;
const STREAM_ID_LEN = 36;

if (!PLATFORM_URL || !TOKEN) {
  console.error("RELAY_PLATFORM_URL and RELAY_AGENT_TOKEN are required.");
  process.exit(1);
}

function encodeControlFrame(frame) {
  return JSON.stringify(frame);
}
function decodeControlFrame(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed.type !== "string" || typeof parsed.streamId !== "string") {
    throw new Error("Malformed relay control frame");
  }
  return parsed;
}
function encodeDataFrame(streamId, payload) {
  return Buffer.concat([Buffer.from(streamId, "ascii"), payload]);
}
function decodeDataFrame(buf) {
  return { streamId: buf.subarray(0, STREAM_ID_LEN).toString("ascii"), payload: buf.subarray(STREAM_ID_LEN) };
}

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
let reconnectDelay = RECONNECT_MIN_MS;

function connect() {
  const url = `${PLATFORM_URL.replace(/\/$/, "")}/api/relay/agent`;
  console.log(`[relay-agent] Connecting to ${url} ...`);
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` } });

  /** @type {Map<string, net.Socket>} */
  const streams = new Map();

  ws.on("open", () => {
    console.log("[relay-agent] Connected. Waiting for tunnel requests.");
    reconnectDelay = RECONNECT_MIN_MS;
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      const { streamId, payload } = decodeDataFrame(data);
      streams.get(streamId)?.write(payload);
      return;
    }

    let frame;
    try {
      frame = decodeControlFrame(data.toString("utf8"));
    } catch {
      return;
    }

    if (frame.type === "open") {
      const socket = net.connect(frame.targetPort, frame.targetHost);
      streams.set(frame.streamId, socket);

      socket.on("connect", () => {
        ws.send(encodeControlFrame({ type: "opened", streamId: frame.streamId }));
      });
      socket.on("data", (chunk) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(encodeDataFrame(frame.streamId, chunk));
      });
      socket.on("error", (err) => {
        ws.send(encodeControlFrame({ type: "error", streamId: frame.streamId, message: err.message }));
        streams.delete(frame.streamId);
      });
      socket.on("close", () => {
        if (ws.readyState === WebSocket.OPEN) ws.send(encodeControlFrame({ type: "close", streamId: frame.streamId }));
        streams.delete(frame.streamId);
      });
    } else if (frame.type === "close") {
      streams.get(frame.streamId)?.end();
      streams.delete(frame.streamId);
    }
  });

  ws.on("close", (code, reason) => {
    for (const socket of streams.values()) socket.destroy();
    streams.clear();
    console.log(`[relay-agent] Disconnected (${code} ${reason || ""}). Reconnecting in ${reconnectDelay}ms.`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  });

  ws.on("error", (err) => {
    console.error("[relay-agent] Connection error:", err.message);
  });
}

connect();
