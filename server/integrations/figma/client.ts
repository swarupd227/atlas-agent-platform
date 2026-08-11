/**
 * Figma REST API v1 client.
 * Fetcher is injected by the MCP server so fetchWithAuth handles retries,
 * timeouts, and 429/5xx backoff.
 *
 * Auth: X-Figma-Token (Personal Access Token) — not Bearer.
 * Base URL: https://api.figma.com/v1
 */

export const FIGMA_BASE = "https://api.figma.com/v1";

export interface FigmaUser {
  id: string;
  email: string;
  handle: string;
  img_url: string;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  [key: string]: unknown;
}

export interface FigmaFile {
  name: string;
  role: string;
  lastModified: string;
  editorType: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  linkAccess?: string;
}

export interface FigmaFileNodesResponse {
  name: string;
  lastModified: string;
  nodes: Record<string, { document: FigmaNode } | null>;
}

export interface FigmaImagesResponse {
  err: string | null;
  images: Record<string, string | null>;
}

export interface FigmaComment {
  id: string;
  message: string;
  file_key: string;
  user: { handle: string; img_url: string };
  created_at: string;
  resolved_at: string | null;
  client_meta?: unknown;
}

export interface FigmaProject {
  id: string;
  name: string;
}

export interface FigmaProjectFile {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
}

export class FigmaAuthError extends Error {}
export class FigmaRateLimitError extends Error {}

export type FigmaFetcher = (path: string, options?: RequestInit) => Promise<Response>;

export class FigmaClient {
  constructor(private readonly fetcher: FigmaFetcher) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.fetcher(path, options);

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      let msg = errorText;
      try {
        const errJson = JSON.parse(errorText);
        msg = errJson?.message ?? errorText;
      } catch { /* not JSON */ }

      if (res.status === 401 || res.status === 403) {
        throw new FigmaAuthError("Figma authentication failed — check Personal Access Token");
      }
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        throw new FigmaRateLimitError(`Figma rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ""}`);
      }
      if (res.status === 404) throw new Error(`Figma resource not found: ${path}`);
      throw new Error(`Figma API ${res.status}: ${msg}`);
    }

    return res.json() as Promise<T>;
  }

  async getMe(): Promise<FigmaUser> {
    return this.request<FigmaUser>("/me");
  }

  async getFile(fileKey: string, params?: { depth?: number; geometry?: "paths" }): Promise<FigmaFile> {
    const sp = new URLSearchParams();
    if (params?.depth) sp.set("depth", String(params.depth));
    if (params?.geometry) sp.set("geometry", params.geometry);
    const qs = sp.toString();
    return this.request<FigmaFile>(`/files/${fileKey}${qs ? `?${qs}` : ""}`);
  }

  async getFileNodes(fileKey: string, ids: string[]): Promise<FigmaFileNodesResponse> {
    const sp = new URLSearchParams({ ids: ids.join(",") });
    return this.request<FigmaFileNodesResponse>(`/files/${fileKey}/nodes?${sp.toString()}`);
  }

  async getImages(fileKey: string, ids: string[], format: "jpg" | "png" | "svg" | "pdf" = "png"): Promise<FigmaImagesResponse> {
    const sp = new URLSearchParams({ ids: ids.join(","), format });
    return this.request<FigmaImagesResponse>(`/images/${fileKey}?${sp.toString()}`);
  }

  async getComments(fileKey: string): Promise<{ comments: FigmaComment[] }> {
    return this.request<{ comments: FigmaComment[] }>(`/files/${fileKey}/comments`);
  }

  async postComment(fileKey: string, message: string, clientMeta?: unknown): Promise<FigmaComment> {
    return this.request<FigmaComment>(`/files/${fileKey}/comments`, {
      method: "POST",
      body: JSON.stringify({ message, ...(clientMeta ? { client_meta: clientMeta } : {}) }),
    });
  }

  async getTeamProjects(teamId: string): Promise<{ name: string; projects: FigmaProject[] }> {
    return this.request(`/teams/${teamId}/projects`);
  }

  async getProjectFiles(projectId: string): Promise<{ name: string; files: FigmaProjectFile[] }> {
    return this.request(`/projects/${projectId}/files`);
  }
}
