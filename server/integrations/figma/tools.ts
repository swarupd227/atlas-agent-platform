/**
 * Figma tool implementations — 8 tools.
 * Each function receives a FigmaClient and the validated args.
 */

import { FigmaClient } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

// ── Tool: figma_get_me ──────────────────────────────────────────────────────

export async function figma_get_me(client: FigmaClient): Promise<McpToolResult> {
  const user = await client.getMe();
  return ok({ id: user.id, email: user.email, handle: user.handle });
}

// ── Tool: figma_get_file ────────────────────────────────────────────────────

export async function figma_get_file(client: FigmaClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const file_key = args.file_key as string | undefined;
  if (!file_key) throw new Error("file_key is required");
  const depth = args.depth as number | undefined;

  const file = await client.getFile(file_key, depth ? { depth } : undefined);
  return ok({
    name: file.name,
    role: file.role,
    last_modified: file.lastModified,
    version: file.version,
    thumbnail_url: file.thumbnailUrl,
    document: file.document,
  });
}

// ── Tool: figma_get_file_nodes ──────────────────────────────────────────────

export async function figma_get_file_nodes(client: FigmaClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const file_key = args.file_key as string | undefined;
  const node_ids = args.node_ids as string[] | undefined;
  if (!file_key) throw new Error("file_key is required");
  if (!node_ids || node_ids.length === 0) throw new Error("node_ids is required (array of node id strings)");

  const result = await client.getFileNodes(file_key, node_ids);
  return ok({ name: result.name, last_modified: result.lastModified, nodes: result.nodes });
}

// ── Tool: figma_get_images ──────────────────────────────────────────────────

export async function figma_get_images(client: FigmaClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const file_key = args.file_key as string | undefined;
  const node_ids = args.node_ids as string[] | undefined;
  const format = (args.format as "jpg" | "png" | "svg" | "pdf" | undefined) ?? "png";
  if (!file_key) throw new Error("file_key is required");
  if (!node_ids || node_ids.length === 0) throw new Error("node_ids is required (array of node id strings)");

  const result = await client.getImages(file_key, node_ids, format);
  if (result.err) return err(`Figma image export error: ${result.err}`);
  return ok({ images: result.images });
}

// ── Tool: figma_get_comments ────────────────────────────────────────────────

export async function figma_get_comments(client: FigmaClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const file_key = args.file_key as string | undefined;
  if (!file_key) throw new Error("file_key is required");

  const { comments } = await client.getComments(file_key);
  return ok({
    count: comments.length,
    comments: comments.map(c => ({
      id: c.id,
      message: c.message,
      author: c.user.handle,
      created_at: c.created_at,
      resolved: !!c.resolved_at,
    })),
  });
}

// ── Tool: figma_post_comment ────────────────────────────────────────────────

export async function figma_post_comment(client: FigmaClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const file_key = args.file_key as string | undefined;
  const message = args.message as string | undefined;
  if (!file_key) throw new Error("file_key is required");
  if (!message) throw new Error("message is required");

  const comment = await client.postComment(file_key, message, args.client_meta);
  return ok({ id: comment.id, message: comment.message, created_at: comment.created_at });
}

// ── Tool: figma_get_team_projects ───────────────────────────────────────────

export async function figma_get_team_projects(client: FigmaClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const team_id = args.team_id as string | undefined;
  if (!team_id) throw new Error("team_id is required");

  const result = await client.getTeamProjects(team_id);
  return ok({ team_name: result.name, projects: result.projects });
}

// ── Tool: figma_get_project_files ───────────────────────────────────────────

export async function figma_get_project_files(client: FigmaClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const project_id = args.project_id as string | undefined;
  if (!project_id) throw new Error("project_id is required");

  const result = await client.getProjectFiles(project_id);
  return ok({
    project_name: result.name,
    files: result.files.map(f => ({ key: f.key, name: f.name, last_modified: f.last_modified })),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}

function err(message: string): McpToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
