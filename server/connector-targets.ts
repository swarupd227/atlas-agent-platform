/**
 * Where an enterprise connector sends its calls, as the customer typed it.
 *
 * A connector's address is a credential field (a Jira base URL, a SAP OData URL, a NetSuite account
 * id, a Zendesk subdomain). Some are used as a whole URL, some are pasted into a hostname, and the
 * credentials the connector holds are sent to whatever that comes to. Two things are checked here:
 *
 *  - the SHAPE: a field that becomes a hostname may hold only what a hostname part holds, and a URL
 *    carries no user name, query or fragment. A value like "evil.com/x?" in an account id is never
 *    legitimate, so it is refused when saved whatever the outbound policy says.
 *  - the ADDRESS the shaped value points at, which is judged by the outbound policy
 *    (server/url-safety.ts: ASTRA_OUTBOUND_POLICY and ASTRA_ALLOWED_PRIVATE_CIDRS).
 *
 * The rules mirror how each connector builds its URL, so what is accepted here is what the
 * connector would have used.
 */
import { vetMcpUrl } from "./url-safety";

export interface TargetProblem {
  key: string;
  message: string;
}

type Kind =
  /** A whole URL used as it is: it carries its own scheme. */
  | "url"
  /** The connector strips any scheme and uses https:// plus the rest (host, port, maybe a path). */
  | "urlOrHost"
  /** A bare host name (and optional port) after the scheme and trailing slash are stripped. */
  | "host"
  /** A value pasted into a longer host name or a path segment. */
  | "label";

interface Rule {
  key: string;
  kind: Kind;
  /** For "label": what the (normalised) value must match. */
  pattern?: RegExp;
  /** For "label": the same clean-up the connector does before it uses the value. */
  normalize?: (v: string) => string;
  /** Said in the message: what the field is. */
  what: string;
}

const LABEL_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const HOST = /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:\d{1,5})?$/;

const RULES: Record<string, Rule[]> = {
  jira: [
    { key: "base_url", kind: "urlOrHost", what: "Jira base URL" },
    { key: "instance_url", kind: "urlOrHost", what: "Jira instance URL" },
  ],
  salesforce: [{ key: "instance_url", kind: "url", what: "Salesforce instance URL" }],
  servicenow: [{ key: "instance_url", kind: "url", what: "ServiceNow instance URL" }],
  sap: [{ key: "base_url", kind: "url", what: "SAP base URL" }],
  databricks: [{ key: "host", kind: "url", what: "Databricks workspace URL" }],
  n8n: [{ key: "baseUrl", kind: "url", what: "n8n base URL" }],
  netsuite: [{ key: "account_id", kind: "label", pattern: LABEL_NAME, what: "NetSuite account id" }],
  zendesk: [{
    key: "subdomain", kind: "label", what: "Zendesk subdomain",
    normalize: (v) => v.replace(/^https?:\/\//, "").replace(/\.zendesk\.com.*$/, "").replace(/\/+$/, ""),
    pattern: /^[A-Za-z0-9-]{1,63}$/,
  }],
  workday: [
    { key: "hostname", kind: "host", what: "Workday host" },
    { key: "tenant_name", kind: "label", pattern: LABEL_NAME, what: "Workday tenant name" },
  ],
  snowflake: [{ key: "account", kind: "label", pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, what: "Snowflake account identifier" }],
};

const BAD_CHARS = /[\s\\\u0000-\u001f\u007f]/;

function parseWebAddress(raw: string, what: string, schemeOptional: boolean): { url?: URL; problem?: string } {
  const value = raw.trim();
  if (BAD_CHARS.test(value)) return { problem: `${what} contains characters that cannot be part of a web address.` };
  let text = value;
  if (!/^https?:\/\//i.test(text)) {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(text)) return { problem: `${what} must be an http or https address.` };
    if (!schemeOptional) return { problem: `${what} must start with https:// (or http://).` };
    text = `https://${text}`;
  }
  if (/[?#]/.test(text)) return { problem: `${what} must not have a query string or fragment.` };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { problem: `${what} is not a valid web address.` };
  }
  if (url.username || url.password || /^https?:\/\/[^/]*@/i.test(text)) return { problem: `${what} must not contain a user name or password.` };
  if (!url.hostname) return { problem: `${what} has no host.` };
  return { url };
}

/** The URL a "urlOrHost" value is used as: the connector drops any scheme and always uses https. */
function stripScheme(v: string): string {
  return v.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/**
 * Problems with the address fields of a connector's credentials. `onlyKeys` limits the check to
 * fields being changed, so editing one field is not blocked by an unrelated one already saved.
 * A field that is absent or empty is not a shape problem (a required one is the form's concern).
 */
export function checkConnectorTargets(integrationId: string, credentials: Record<string, string>, onlyKeys?: string[]): TargetProblem[] {
  const problems: TargetProblem[] = [];
  for (const rule of RULES[integrationId] ?? []) {
    if (onlyKeys && !onlyKeys.includes(rule.key)) continue;
    const raw = credentials[rule.key];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    let message: string | undefined;
    switch (rule.kind) {
      case "url":
        message = parseWebAddress(raw, rule.what, false).problem;
        break;
      case "urlOrHost":
        message = parseWebAddress(/^https?:\/\//i.test(raw.trim()) ? stripScheme(raw) : raw, rule.what, true).problem;
        break;
      case "host": {
        const host = stripScheme(raw);
        if (!HOST.test(host)) message = `${rule.what} must be a host name such as wd5.myworkday.com.`;
        break;
      }
      case "label": {
        const value = (rule.normalize ?? ((v: string) => v.trim()))(raw);
        if (!rule.pattern!.test(value)) message = `${rule.what} is not valid: it may hold only letters, digits and hyphens (and underscores or dots where the vendor uses them), not a URL or path.`;
        break;
      }
    }
    if (message) problems.push({ key: rule.key, message });
  }
  return problems;
}

/** The URLs a connector's address fields lead to, for the outbound policy to judge. */
export function connectorTargetUrls(integrationId: string, credentials: Record<string, string>, onlyKeys?: string[]): Array<{ key: string; url: string }> {
  const out: Array<{ key: string; url: string }> = [];
  for (const rule of RULES[integrationId] ?? []) {
    if (rule.kind === "label") continue;
    if (onlyKeys && !onlyKeys.includes(rule.key)) continue;
    const raw = credentials[rule.key];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const url = rule.kind === "url" ? raw.trim() : `https://${stripScheme(raw)}`;
    out.push({ key: rule.key, url });
  }
  return out;
}

export type VetResult = { ok: true } | { ok: false; message: string; problems: TargetProblem[] };

/**
 * What the connect and edit routes run before anything is stored. A malformed address is refused in
 * every mode. A well-formed one is judged by the outbound policy: refused under "enforce", logged
 * under "audit", ignored when "off".
 */
export async function vetConnectorCredentials(integrationId: string, credentials: Record<string, string>, onlyKeys?: string[]): Promise<VetResult> {
  const problems = checkConnectorTargets(integrationId, credentials, onlyKeys);
  if (problems.length > 0) return { ok: false, message: problems.map((p) => p.message).join(" "), problems };
  for (const { key, url } of connectorTargetUrls(integrationId, credentials, onlyKeys)) {
    const verdict = await vetMcpUrl(url, `connector:${integrationId}`);
    if (!verdict.ok) {
      const p = { key, message: `That address is not allowed by this deployment's outbound policy: ${verdict.message}` };
      return { ok: false, message: p.message, problems: [p] };
    }
  }
  return { ok: true };
}
