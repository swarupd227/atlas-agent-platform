/**
 * Who a request is from, for the things that count requests per client (rate limits).
 *
 * Behind a proxy every request reaches the server from the proxy's address, so counting per `req.ip` counts everybody as one
 * client. If the deployment tells us how many proxies sit in front (ASTRA_TRUST_PROXY), Express reads the real client's address
 * from X-Forwarded-For; if it does not, nothing is trusted and the header is ignored (a caller cannot make up an address).
 */
import { ipKeyGenerator } from "express-rate-limit";

const IPV4_WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/;
const IPV6_BRACKETED = /^\[([0-9a-fA-F:.]+)\](?::\d{1,5})?$/;

/**
 * The client's address as a key: any port suffix removed (some platforms put the client's source port after the address, and a
 * key that changes with every connection limits nothing) and an IPv6 address reduced to its /56 (so changing the low bits does
 * not dodge a limit). "unknown" when there is none.
 */
export function clientAddress(req: { ip?: string | undefined }): string {
  let ip = (req.ip ?? "").trim();
  const v4 = IPV4_WITH_PORT.exec(ip);
  if (v4) ip = v4[1];
  const v6 = IPV6_BRACKETED.exec(ip);
  if (v6) ip = v6[1];
  return ip ? ipKeyGenerator(ip) : "unknown";
}

/**
 * ASTRA_TRUST_PROXY: how many proxies sit between the internet and this server (1 to 5), or unset for none.
 * Deliberately not `true`, which would believe whatever a caller puts in X-Forwarded-For.
 */
export function trustProxyHops(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.ASTRA_TRUST_PROXY?.trim();
  if (!raw) return null;
  if (!/^[1-5]$/.test(raw)) throw new Error("ASTRA_TRUST_PROXY must be the number of proxies in front of the server, 1 to 5 (not 'true': that would trust any X-Forwarded-For)");
  return Number(raw);
}

export function validateTrustProxyEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  try {
    trustProxyHops(env);
    return [];
  } catch (e: any) {
    return [e.message];
  }
}

export function describeTrustProxy(env: NodeJS.ProcessEnv = process.env): string {
  try {
    const n = trustProxyHops(env);
    return n === null ? "proxy=untrusted" : `proxy=${n}`;
  } catch {
    return "proxy=invalid";
  }
}
