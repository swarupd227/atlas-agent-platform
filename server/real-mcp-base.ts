import { decryptCredentialMap } from "./credential-vault";
import { storage } from "./storage";

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface RealMcpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export abstract class RealMcpBase {
  abstract readonly integrationId: string;
  abstract readonly tools: RealMcpToolDef[];

  abstract handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>
  ): Promise<McpToolResult>;

  async getCredentials(orgId: string): Promise<Record<string, string> | null> {
    const conn = await storage.getIntegrationConnection(orgId, this.integrationId);
    if (!conn || !conn.credentialBlob || conn.status === "disconnected") return null;
    try {
      return decryptCredentialMap(conn.credentialBlob);
    } catch {
      return null;
    }
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    orgId: string
  ): Promise<McpToolResult> {
    const credentials = await this.getCredentials(orgId);
    if (!credentials) {
      return {
        content: [{ type: "text", text: `Integration '${this.integrationId}' is not connected for this organization.` }],
        isError: true,
      };
    }
    try {
      return await this.handleTool(toolName, args, credentials);
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Tool '${toolName}' failed: ${err?.message ?? "Unknown error"}` }],
        isError: true,
      };
    }
  }

  protected ok(data: unknown): McpToolResult {
    return {
      content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
    };
  }

  protected err(message: string): McpToolResult {
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }

  protected async fetchWithAuth(
    url: string,
    options: RequestInit & { bearerToken?: string; basicAuth?: { username: string; password: string } }
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string> | undefined),
    };

    if (options.bearerToken) {
      headers["Authorization"] = `Bearer ${options.bearerToken}`;
    } else if (options.basicAuth) {
      const encoded = Buffer.from(`${options.basicAuth.username}:${options.basicAuth.password}`).toString("base64");
      headers["Authorization"] = `Basic ${encoded}`;
    }

    const { bearerToken: _b, basicAuth: _ba, ...rest } = options;
    return fetch(url, { ...rest, headers });
  }
}
