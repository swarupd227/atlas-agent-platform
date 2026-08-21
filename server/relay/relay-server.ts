/**
 * Platform side of the relay tunnel: a WebSocket endpoint relay agents
 * connect to (outbound, from inside a client's network), and
 * requestTunnel() -- the counterpart to the SSH tunnel's openSshTunnel()
 * in ../sql/tunnel.ts. Same shape: opens a local TCP listener, hands back
 * {localHost, localPort}, and a SqlConnector client points its normal
 * driver at that address exactly as if it were direct -- the relay is
 * invisible to the three dialect clients.
 *
 * One relay agent's WebSocket carries every concurrent DB connection a
 * SqlConnector opens through it, multiplexed by streamId (see protocol.ts).
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { randomUUID } from "crypto";
import net, { type Socket } from "net";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { relayAgents } from "@shared/schema";
import { hashRelayToken } from "./routes";
import { encodeControlFrame, decodeControlFrame, encodeDataFrame, decodeDataFrame, type ControlFrame } from "./protocol";

interface StreamEntry {
  localSocket: Socket;
  resolveOpen: () => void;
  rejectOpen: (e: Error) => void;
}

interface ConnectedAgent {
  id: string;
  ws: WebSocket;
  streams: Map<string, StreamEntry>;
  /** Cleared on each ping, set by the agent's pong -- see the heartbeat below. */
  isAlive: boolean;
}

// An idle relay carries no traffic between queries, and hosting front ends
// (Azure App Service among them) reap idle WebSockets after a few minutes.
// Pinging keeps the connection from looking idle, and drops entries whose
// agent has gone away without a clean close -- otherwise connectedAgents
// keeps reporting an agent as online and requestTunnel() hands work to a
// socket nothing is listening on.
const HEARTBEAT_MS = 30_000;

const connectedAgents = new Map<string, ConnectedAgent>();

export function isAgentConnected(agentId: string): boolean {
  return connectedAgents.has(agentId);
}

export function attachRelayServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/api/relay/agent" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const authHeader = req.headers["authorization"];
    const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) { ws.close(4001, "Missing bearer token"); return; }

    let agentId: string;
    try {
      const tokenHash = hashRelayToken(token);
      const [agent] = await db.select().from(relayAgents).where(eq(relayAgents.tokenHash, tokenHash)).limit(1);
      if (!agent || agent.revokedAt) { ws.close(4003, "Invalid or revoked token"); return; }
      agentId = agent.id;
    } catch {
      ws.close(1011, "Auth lookup failed");
      return;
    }

    // A reconnect (agent process restarted) replaces the stale entry rather
    // than being rejected -- the old socket, if still technically open, is
    // terminated so it can't keep stale streams alive.
    const existing = connectedAgents.get(agentId);
    if (existing) existing.ws.terminate();

    const entry: ConnectedAgent = { id: agentId, ws, streams: new Map(), isAlive: true };
    connectedAgents.set(agentId, entry);
    ws.on("pong", () => { entry.isAlive = true; });
    await db.update(relayAgents).set({ status: "online", lastSeenAt: new Date() }).where(eq(relayAgents.id, agentId)).catch(() => {});

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        try {
          const { streamId, payload } = decodeDataFrame(data);
          entry.streams.get(streamId)?.localSocket.write(payload);
        } catch { /* malformed frame -- drop */ }
        return;
      }
      let frame: ControlFrame;
      try {
        frame = decodeControlFrame(data.toString("utf8"));
      } catch {
        return;
      }
      const stream = entry.streams.get(frame.streamId);
      if (!stream) return;
      if (frame.type === "opened") stream.resolveOpen();
      else if (frame.type === "error") { stream.rejectOpen(new Error(frame.message)); entry.streams.delete(frame.streamId); }
      else if (frame.type === "close") { stream.localSocket.end(); entry.streams.delete(frame.streamId); }
    });

    ws.on("close", () => {
      if (connectedAgents.get(agentId) === entry) connectedAgents.delete(agentId);
      for (const stream of Array.from(entry.streams.values())) stream.localSocket.destroy();
      entry.streams.clear();
      db.update(relayAgents).set({ status: "offline" }).where(eq(relayAgents.id, agentId)).catch(() => {});
    });
    ws.on("error", () => ws.close());
  });

  const heartbeat = setInterval(() => {
    for (const entry of Array.from(connectedAgents.values())) {
      if (!entry.isAlive) {
        // Missed the previous ping: terminate rather than close, so the
        // 'close' handler above runs immediately and clears the entry instead
        // of waiting on a handshake the peer will never complete.
        entry.ws.terminate();
        continue;
      }
      entry.isAlive = false;
      try { entry.ws.ping(); } catch { /* 'close' will clean this entry up */ }
    }
  }, HEARTBEAT_MS);

  wss.on("close", () => clearInterval(heartbeat));
}

const OPEN_TIMEOUT_MS = 15_000;

export interface RelayTunnelResult {
  localHost: string;
  localPort: number;
  close: () => Promise<void>;
}

/**
 * Opens a local TCP listener; each connection to it is relayed through the
 * named agent's WebSocket to targetHost:targetPort as seen from inside the
 * client's network. The local socket is held paused until the agent
 * confirms its own connection to the real target succeeded ("opened"), so
 * a DB driver's first bytes (e.g. Postgres's startup packet) can never be
 * forwarded into a target connection that isn't actually up yet.
 */
export function requestTunnel(relayAgentId: string, targetHost: string, targetPort: number): Promise<RelayTunnelResult> {
  return new Promise((resolve, reject) => {
    const agent = connectedAgents.get(relayAgentId);
    if (!agent) {
      reject(new Error(`Relay agent '${relayAgentId}' is not connected. Confirm the agent process is running and reachable.`));
      return;
    }

    const server = net.createServer((localSocket: Socket) => {
      const streamId = randomUUID();
      localSocket.pause();

      const timeout = setTimeout(() => {
        localSocket.destroy(new Error("Relay agent did not confirm the tunnel in time"));
        agent.streams.delete(streamId);
      }, OPEN_TIMEOUT_MS);

      agent.streams.set(streamId, {
        localSocket,
        resolveOpen: () => { clearTimeout(timeout); localSocket.resume(); },
        rejectOpen: (e) => { clearTimeout(timeout); localSocket.destroy(e); },
      });

      agent.ws.send(encodeControlFrame({ type: "open", streamId, targetHost, targetPort }));

      localSocket.on("data", (chunk: Buffer) => {
        if (agent.ws.readyState === WebSocket.OPEN) agent.ws.send(encodeDataFrame(streamId, chunk));
      });
      localSocket.on("close", () => {
        clearTimeout(timeout);
        if (agent.ws.readyState === WebSocket.OPEN) agent.ws.send(encodeControlFrame({ type: "close", streamId }));
        agent.streams.delete(streamId);
      });
      localSocket.on("error", () => localSocket.destroy());
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const localPort = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        localHost: "127.0.0.1",
        localPort,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}
