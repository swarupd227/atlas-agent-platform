/**
 * Translates the raw error text from a failed SQL connection attempt into
 * plain language a business user configuring the connection can act on.
 * The raw message stays available too (callers append this alongside it,
 * not instead of it) -- this is a hint, not a replacement for the real
 * error, since the mapping below is necessarily incomplete.
 *
 * Built directly from a live failure encountered testing ssh_tunnel mode:
 * the SSH handshake succeeded (host key fingerprint captured fine) but the
 * bastion had AllowTcpForwarding disabled, and the only error that reached
 * the caller was Postgres's generic "Connection terminated unexpectedly" --
 * nothing hinting the real problem was at the SSH layer. See tunnel.ts's
 * forwardOut error-propagation fix (907b491) for the other half of this.
 */

const PATTERNS: [RegExp, string][] = [
  [/administratively prohibited/i,
    "The SSH bastion rejected the port-forward request. Its sshd_config likely has \"AllowTcpForwarding no\" -- ask whoever manages the bastion to enable it."],
  [/is not connected/i,
    "The relay agent isn't currently connected to the platform. Confirm the relay-agent.js process is running in the client's network and hasn't crashed or lost network access."],
  [/host key fingerprint mismatch/i,
    "The bastion's SSH host key doesn't match what was pinned on first connect. This can mean the bastion was legitimately rebuilt (its key rotated) or a man-in-the-middle -- verify the new fingerprint out-of-band before updating it."],
  [/ECONNREFUSED/,
    "The target refused the connection outright -- confirm the host/port are correct and something is actually listening there."],
  [/ETIMEDOUT|connect ETIMEDOUT|timed out/i,
    "The connection attempt timed out -- likely a firewall silently dropping the traffic rather than rejecting it, or a wrong host/IP. If using a bastion or relay agent, confirm it can reach the target from where it's actually running."],
  [/ENOTFOUND|getaddrinfo/i,
    "The hostname couldn't be resolved -- check for a typo, or that this host is only resolvable from inside the client's network (in which case it needs ssh_tunnel or relay_agent mode, not direct)."],
  [/password authentication failed|access denied for user|login failed for user/i,
    "The database rejected the username/password. Double-check the credentials, and that this user is allowed to connect from this connection mode's source (some databases restrict by source IP)."],
  [/self signed certificate|certificate verify failed/i,
    "TLS certificate verification failed. If this is a self-managed database with a self-signed cert, try SSL Mode \"require\" instead of \"verify-full\"."],
  [/terminated unexpectedly/i,
    "The connection closed before the database handshake completed. If you're using ssh_tunnel or relay_agent mode, this usually means the tunnel itself failed silently (e.g. forwarding disabled, or the far side timed out) rather than anything about the database -- check the tunnel/relay status, not just these credentials."],
];

export function explainConnectionError(rawMessage: string | undefined): string | undefined {
  if (!rawMessage) return undefined;
  for (const [pattern, explanation] of PATTERNS) {
    if (pattern.test(rawMessage)) return explanation;
  }
  return undefined;
}
