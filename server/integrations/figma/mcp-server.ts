/**
 * Figma MCP Server — 8 real tools via the Figma REST API v1.
 * Extends RealMcpBase; auth via Personal Access Token (X-Figma-Token header).
 * Mounted at /api/integrations/figma
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { FigmaClient, FIGMA_BASE } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  figma_get_me,
  figma_get_file,
  figma_get_file_nodes,
  figma_get_images,
  figma_get_comments,
  figma_post_comment,
  figma_get_team_projects,
  figma_get_project_files,
} from "./tools";

export class FigmaMcpServer extends RealMcpBase {
  readonly integrationId = "figma";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "figma_get_me",
      description: "Get the current Figma user's identity (id, email, handle) for the connected Personal Access Token.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "figma_get_file",
      description: "Get a Figma file's document tree, name, version, and thumbnail.",
      inputSchema: {
        type: "object",
        properties: {
          file_key: { type: "string", description: "Figma file key, from the file URL (required)" },
          depth: { type: "number", description: "Limit how many levels of the document tree to return" },
        },
        required: ["file_key"],
      },
    },
    {
      name: "figma_get_file_nodes",
      description: "Get specific nodes (frames, components, layers) from a Figma file by node id.",
      inputSchema: {
        type: "object",
        properties: {
          file_key: { type: "string", description: "Figma file key (required)" },
          node_ids: { type: "array", items: { type: "string" }, description: "Node ids to fetch (required)" },
        },
        required: ["file_key", "node_ids"],
      },
    },
    {
      name: "figma_get_images",
      description: "Render Figma nodes to image URLs (PNG/JPG/SVG/PDF export).",
      inputSchema: {
        type: "object",
        properties: {
          file_key: { type: "string", description: "Figma file key (required)" },
          node_ids: { type: "array", items: { type: "string" }, description: "Node ids to render (required)" },
          format: { type: "string", enum: ["jpg", "png", "svg", "pdf"], description: "Export format (default: png)" },
        },
        required: ["file_key", "node_ids"],
      },
    },
    {
      name: "figma_get_comments",
      description: "List comments on a Figma file.",
      inputSchema: {
        type: "object",
        properties: {
          file_key: { type: "string", description: "Figma file key (required)" },
        },
        required: ["file_key"],
      },
    },
    {
      name: "figma_post_comment",
      description: "Post a comment on a Figma file.",
      inputSchema: {
        type: "object",
        properties: {
          file_key: { type: "string", description: "Figma file key (required)" },
          message: { type: "string", description: "Comment text (required)" },
        },
        required: ["file_key", "message"],
      },
    },
    {
      name: "figma_get_team_projects",
      description: "List the projects belonging to a Figma team.",
      inputSchema: {
        type: "object",
        properties: {
          team_id: { type: "string", description: "Figma team id (required)" },
        },
        required: ["team_id"],
      },
    },
    {
      name: "figma_get_project_files",
      description: "List the files belonging to a Figma project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Figma project id (required)" },
        },
        required: ["project_id"],
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const token = credentials.access_token ?? credentials.token;
    if (!token) return this.err("Figma Personal Access Token is not configured");

    const fetcher = async (path: string, options?: RequestInit) => {
      const url = path.startsWith("http") ? path : `${FIGMA_BASE}${path}`;
      return this.fetchWithAuth(url, {
        ...options,
        orgId,
        headers: {
          ...(options?.headers as Record<string, string> | undefined),
          "X-Figma-Token": token,
        },
      });
    };

    const client = new FigmaClient(fetcher);

    switch (toolName) {
      case "figma_get_me":              return figma_get_me(client);
      case "figma_get_file":            return figma_get_file(client, args);
      case "figma_get_file_nodes":      return figma_get_file_nodes(client, args);
      case "figma_get_images":          return figma_get_images(client, args);
      case "figma_get_comments":        return figma_get_comments(client, args);
      case "figma_post_comment":        return figma_post_comment(client, args);
      case "figma_get_team_projects":   return figma_get_team_projects(client, args);
      case "figma_get_project_files":   return figma_get_project_files(client, args);
      default:
        return this.err(`Unknown Figma tool: ${toolName}`);
    }
  }
}

export const figmaMcpServer = new FigmaMcpServer();

export function createFigmaRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "figma", tools: figmaMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: figmaMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args = (req.body?.args ?? req.body) as Record<string, unknown>;

    const result = await figmaMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const credentials = await figmaMcpServer.getCredentials(orgId);
    if (!credentials) {
      return res.json({ connected: false, error: "No credentials configured" });
    }

    const token = credentials.access_token ?? credentials.token;
    if (!token) {
      return res.json({ connected: false, error: "Personal Access Token is missing" });
    }

    try {
      const testRes = await figmaMcpServer["fetchWithAuth"](`${FIGMA_BASE}/me`, {
        orgId,
        headers: { "X-Figma-Token": token },
      });
      const connected = testRes.ok;
      const body = testRes.ok ? await testRes.json() : null;
      res.json({
        connected,
        statusCode: testRes.status,
        integration: "figma",
        user: connected ? { handle: (body as any)?.handle, email: (body as any)?.email } : null,
      });
    } catch (err: any) {
      res.json({ connected: false, error: err?.message ?? "Connection test failed" });
    }
  });

  return router;
}
