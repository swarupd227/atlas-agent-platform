// Static registry of MCP servers that support a real OAuth 2.0 + PKCE
// connect flow. Servers are matched by URL hostname (mcpServers has no
// "provider" column). Add an entry here to onboard a new provider.

export interface McpOAuthProvider {
  id: string;
  name: string;
  matchesUrl: (url: string) => boolean;
  authorizationUrl: string;
  tokenUrl: string;
  refreshUrl: string;
  defaultScopes: string[];
  /** Figma requires HTTP Basic auth for token exchange; most providers accept client_id/secret in the body. */
  tokenAuthMethod: "basic" | "body";
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
}

function hostnameMatches(url: string, pattern: RegExp): boolean {
  try {
    return pattern.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export const MCP_OAUTH_PROVIDERS: McpOAuthProvider[] = [
  {
    id: "figma",
    name: "Figma",
    matchesUrl: (url) => hostnameMatches(url, /(^|\.)figma\.com$/i),
    authorizationUrl: "https://www.figma.com/oauth",
    tokenUrl: "https://api.figma.com/v1/oauth/token",
    refreshUrl: "https://api.figma.com/v1/oauth/refresh",
    defaultScopes: ["current_user:read", "file_content:read"],
    tokenAuthMethod: "basic",
    clientIdEnvVar: "FIGMA_MCP_CLIENT_ID",
    clientSecretEnvVar: "FIGMA_MCP_CLIENT_SECRET",
  },
];

export function findMcpOAuthProvider(url: string | null | undefined): McpOAuthProvider | undefined {
  if (!url) return undefined;
  return MCP_OAUTH_PROVIDERS.find((p) => p.matchesUrl(url));
}

export function isMcpOAuthProviderConfigured(provider: McpOAuthProvider): boolean {
  return !!process.env[provider.clientIdEnvVar] && !!process.env[provider.clientSecretEnvVar];
}

export function getMcpOAuthClientCredentials(provider: McpOAuthProvider): { clientId: string; clientSecret: string } {
  return {
    clientId: process.env[provider.clientIdEnvVar] ?? "",
    clientSecret: process.env[provider.clientSecretEnvVar] ?? "",
  };
}
