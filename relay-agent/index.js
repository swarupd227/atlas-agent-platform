#!/usr/bin/env node
/**
 * Astra Relay Agent — runs inside a customer's private network so the
 * platform can reach a database that has no inbound access at all (the
 * third SQL connector connection mode, alongside direct and SSH tunnel).
 *
 * Opens a single OUTBOUND WebSocket to the platform; on each "open" request
 * it makes a local TCP connection to the real database (reachable from
 * inside this network) and relays bytes both ways. Nothing needs to be
 * opened on this side's firewall.
 *
 * This is the standalone, customer-distributable build: it depends only on
 * `ws`, never on the platform's source tree. The wire protocol below MUST
 * stay in sync with server/relay/protocol.ts -- duplicated deliberately,
 * since this package ships on its own.
 */

import WebSocket from "ws";
import net from "net";
import { readFileSync } from "fs";

const STREAM_ID_LEN = 36;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

// ── Configuration ───────────────────────────────────────────────────────────
// CLI flags win over environment variables so a systemd unit can set a
// baseline that an operator can override ad hoc when debugging.

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    // A flag with no value (--help), or followed by another flag rather than
    // its value, is a boolean -- don't swallow the next flag as its argument.
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[arg.slice(2)] = true;
    else out[arg.slice(2)] = argv[++i];
  }
  return out;
}

const argv = process.argv.slice(2);
const args = parseArgs(argv);

if (args.help || argv.includes("-h")) {
  console.log(`Astra Relay Agent

Usage:
  astra-relay-agent --url <platform-url> --token-file <path>
  astra-relay-agent --url <platform-url> --token <token>

Options:
  --url          Astra platform URL (wss://… or https://…). Env: RELAY_PLATFORM_URL
  --token-file   File containing only the agent token. Env: RELAY_AGENT_TOKEN_FILE
  --token        The agent token directly. Env: RELAY_AGENT_TOKEN
                 Prefer --token-file: a token passed as an argument is visible
                 to anyone who can list processes on this machine.
  --help         Show this message.

Get the URL and token from Astra: Integrations → Relay Agents → New Relay Agent.
The token is shown once at creation and cannot be recovered afterwards.`);
  process.exit(0);
}

function resolveToken() {
  const file = args["token-file"] ?? process.env.RELAY_AGENT_TOKEN_FILE;
  if (file) {
    try {
      const contents = readFileSync(file, "utf8").trim();
      if (!contents) throw new Error("file is empty");
      return contents;
    } catch (err) {
      console.error(`[relay-agent] Could not read token from ${file}: ${err.message}`);
      process.exit(1);
    }
  }
  return args.token ?? process.env.RELAY_AGENT_TOKEN ?? null;
}

const rawUrl = args.url ?? process.env.RELAY_PLATFORM_URL ?? null;
const TOKEN = resolveToken();

if (!rawUrl || !TOKEN) {
  console.error("[relay-agent] Missing configuration.\n");
  if (!rawUrl) console.error("  Platform URL: pass --url or set RELAY_PLATFORM_URL");
  if (!TOKEN) console.error("  Agent token:  pass --token-file (preferred) / --token, or set RELAY_AGENT_TOKEN_FILE / RELAY_AGENT_TOKEN");
  console.error("\nRun with --help for details.");
  process.exit(1);
}

// Accept an http(s) URL and upgrade it, so pasting the address straight out
// of a browser works rather than failing on a scheme the WS client rejects.
const PLATFORM_URL = rawUrl
  .replace(/\/+$/, "")
  .replace(/^http:/i, "ws:")
  .replace(/^https:/i, "wss:");

if (!/^wss?:/i.test(PLATFORM_URL)) {
  console.error(`[relay-agent] Platform URL must start with wss:// (or https://), got: ${rawUrl}`);
  process.exit(1);
}

if (/^ws:/i.test(PLATFORM_URL) && !/^ws:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(PLATFORM_URL)) {
  console.warn("[relay-agent] WARNING: connecting over plaintext ws:// to a non-local host — database traffic will not be encrypted in transit. Use wss:// in production.");
}

// ── Wire protocol (mirrors server/relay/protocol.ts) ────────────────────────

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

// ── Connection loop ─────────────────────────────────────────────────────────

let reconnectDelay = RECONNECT_MIN_MS;
let shuttingDown = false;
let activeWs = null;
let activeStreams = new Map();

function connect() {
  if (shuttingDown) return;

  const url = `${PLATFORM_URL}/api/relay/agent`;
  console.log(`[relay-agent] Connecting to ${url} ...`);
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  activeWs = ws;

  /** @type {Map<string, net.Socket>} */
  const streams = new Map();
  activeStreams = streams;

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
      console.log(`[relay-agent] Opening stream ${frame.streamId} → ${frame.targetHost}:${frame.targetPort}`);
      const socket = net.connect(frame.targetPort, frame.targetHost);
      streams.set(frame.streamId, socket);

      socket.on("connect", () => {
        ws.send(encodeControlFrame({ type: "opened", streamId: frame.streamId }));
      });
      socket.on("data", (chunk) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(encodeDataFrame(frame.streamId, chunk));
      });
      socket.on("error", (err) => {
        console.error(`[relay-agent] Stream ${frame.streamId} error: ${err.message}`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encodeControlFrame({ type: "error", streamId: frame.streamId, message: err.message }));
        }
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

    if (shuttingDown) return;

    // 4001/4003 are the server's auth rejections (missing / invalid or
    // revoked token). Retrying can't fix those, and hammering a revoked
    // token just fills the platform's logs -- fail loudly instead.
    if (code === 4001 || code === 4003) {
      console.error(`[relay-agent] Authentication rejected: ${reason || code}. Check the token, or issue a new relay agent in Astra.`);
      process.exit(1);
    }

    console.log(`[relay-agent] Disconnected (${code} ${reason || ""}). Reconnecting in ${reconnectDelay}ms.`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  });

  ws.on("error", (err) => {
    console.error("[relay-agent] Connection error:", err.message);
  });
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[relay-agent] ${signal} received — closing ${activeStreams.size} stream(s) and disconnecting.`);
  for (const socket of activeStreams.values()) socket.destroy();
  activeStreams.clear();
  try {
    activeWs?.close(1000, "agent shutting down");
  } catch { /* already gone */ }
  // Give the close frame a moment to flush before exiting.
  setTimeout(() => process.exit(0), 250);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

connect();
