/**
 * SSH tunnel (local port-forward) shared by every SQL connector's
 * "ssh_tunnel" connection mode. Opens an SSH connection to a bastion host,
 * then a local TCP listener on an ephemeral port; each local connection is
 * forwarded through the SSH channel to the real database host/port (which
 * only needs to be reachable FROM the bastion, not from the internet).
 *
 * Driver-agnostic by design: the caller just points its normal DB driver
 * at { localHost, localPort } exactly as if it were a direct connection --
 * none of the pg/mysql2/mssql client code needs to know a tunnel exists.
 *
 * Host key verification is TOFU (trust-on-first-use) pinning, not a
 * platform-managed known_hosts store: the first connection's fingerprint is
 * returned to the caller (surfaced via the connection-test response) so it
 * can be copied into the "SSH Host Key Fingerprint" credential field:
 * once set, a mismatched fingerprint on a later connection is rejected
 * outright rather than silently accepted, guarding against a
 * man-in-the-middle after the first trust decision.
 */

import { Client as SshClient } from "ssh2";
import net, { type Socket } from "net";
import type { SqlCredentials } from "./types";
import { requestTunnel as requestRelayTunnel } from "../../relay/relay-server";

const CONNECT_TIMEOUT_MS = 10_000;

export interface SshTunnelConfig {
  sshHost: string;
  sshPort?: number;
  sshUsername: string;
  sshPrivateKey?: string;
  sshPassphrase?: string;
  sshPassword?: string;
  targetHost: string;
  targetPort: number;
  /** Previously-pinned sha256 fingerprint (hex). If set, a mismatch fails the connection. */
  knownHostFingerprint?: string;
}

export interface OpenTunnelResult {
  localHost: string;
  localPort: number;
  /** The fingerprint presented this connection -- persist it to pin future connections. */
  hostFingerprint: string;
  close: () => Promise<void>;
}

export function openSshTunnel(config: SshTunnelConfig): Promise<OpenTunnelResult> {
  return new Promise((resolve, reject) => {
    if (!config.sshHost) return reject(new Error("SSH host is not configured. Connect via the Integrations settings."));
    if (!config.sshUsername) return reject(new Error("SSH username is not configured."));
    if (!config.sshPrivateKey && !config.sshPassword) {
      return reject(new Error("SSH private key or password is required."));
    }

    const ssh = new SshClient();
    let settled = false;
    let capturedFingerprint = "";
    let fingerprintMismatch = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      ssh.destroy();
      reject(err);
    };

    ssh.on("error", fail);
    ssh.on("close", () => {
      if (settled) return;
      fail(fingerprintMismatch
        ? new Error(`SSH host key fingerprint mismatch (got ${capturedFingerprint}, expected ${config.knownHostFingerprint}) -- refusing to connect. This could mean the bastion's key legitimately rotated, or a man-in-the-middle attack; verify out-of-band before updating the pinned fingerprint.`)
        : new Error("SSH connection closed before the tunnel was established."));
    });

    ssh.on("ready", () => {
      const server = net.createServer((localSocket: Socket) => {
        ssh.forwardOut("127.0.0.1", localSocket.remotePort ?? 0, config.targetHost, config.targetPort, (err, stream) => {
          if (err) { localSocket.destroy(); return; }
          localSocket.pipe(stream).pipe(localSocket);
          stream.on("error", () => localSocket.destroy());
          localSocket.on("error", () => stream.destroy());
        });
      });

      server.on("error", fail);
      server.listen(0, "127.0.0.1", () => {
        if (settled) { server.close(); return; }
        settled = true;
        const addr = server.address();
        const localPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve({
          localHost: "127.0.0.1",
          localPort,
          hostFingerprint: capturedFingerprint,
          close: () => new Promise<void>((res) => {
            server.close(() => { ssh.end(); res(); });
          }),
        });
      });
    });

    ssh.connect({
      host: config.sshHost,
      port: config.sshPort ?? 22,
      username: config.sshUsername,
      privateKey: config.sshPrivateKey,
      passphrase: config.sshPassphrase,
      password: config.sshPassword,
      readyTimeout: CONNECT_TIMEOUT_MS,
      hostHash: "sha256",
      hostVerifier: (fingerprint: string) => {
        capturedFingerprint = fingerprint;
        if (config.knownHostFingerprint && config.knownHostFingerprint !== fingerprint) {
          fingerprintMismatch = true;
          return false;
        }
        return true;
      },
    });
  });
}

/** Structural shape both openSshTunnel's and the relay agent's tunnel results satisfy. */
export interface Tunnel {
  localHost: string;
  localPort: number;
  hostFingerprint?: string;
  close: () => Promise<void>;
}

export interface ConnectionTarget {
  host: string;
  port: number;
  tunnel: Tunnel | null;
}

/**
 * Resolves the effective host/port a SQL client's driver should connect
 * to, transparently opening a tunnel first when the credentials say to
 * (ssh_tunnel: via a bastion host; relay_agent: via an outbound-only agent
 * running inside the client's network -- see server/relay/). Shared by all
 * three dialect clients so the tunnel-vs-direct branch only needs to be
 * written once. `defaultPort` is the dialect's standard port (5432/3306/
 * 1433), used when the credential map doesn't specify one.
 */
export async function resolveConnectionTarget(creds: SqlCredentials, defaultPort: number): Promise<ConnectionTarget> {
  const directHost = creds.host!;
  const directPort = creds.port ? Number(creds.port) : defaultPort;

  if (creds.connectionMode === "ssh_tunnel") {
    if (!creds.sshHost) throw new Error("SSH host is not configured for ssh_tunnel mode. Connect via the Integrations settings.");
    if (!creds.sshUsername) throw new Error("SSH username is not configured for ssh_tunnel mode.");
    const tunnel = await openSshTunnel({
      sshHost: creds.sshHost,
      sshPort: creds.sshPort ? Number(creds.sshPort) : undefined,
      sshUsername: creds.sshUsername,
      sshPrivateKey: creds.sshPrivateKey,
      sshPassphrase: creds.sshPassphrase,
      sshPassword: creds.sshPassword,
      targetHost: directHost,
      targetPort: directPort,
      knownHostFingerprint: creds.sshHostKeyFingerprint,
    });
    return { host: tunnel.localHost, port: tunnel.localPort, tunnel };
  }

  if (creds.connectionMode === "relay_agent") {
    if (!creds.relayAgentId) throw new Error("Relay agent is not configured for relay_agent mode. Connect via the Integrations settings.");
    const relayTunnel = await requestRelayTunnel(creds.relayAgentId, directHost, directPort);
    return { host: relayTunnel.localHost, port: relayTunnel.localPort, tunnel: relayTunnel };
  }

  return { host: directHost, port: directPort, tunnel: null };
}
