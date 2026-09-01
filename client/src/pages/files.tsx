/**
 * Files — every document an agent has produced, across every run.
 *
 * Workspace's My Work only shows the 10 most recent runs, so a document older
 * than that was reachable only by its raw URL. This is the page that closes
 * that gap: GET /api/agent-files lists every row (metadata only -- server/
 * storage.ts's listAgentGeneratedFiles deliberately excludes the bytes column
 * so this list doesn't drag every document's content into memory).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileText, Presentation, Download, Pencil, Search, Loader2, Palette, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ui-vocab";
import { FileAttach, type AttachedFile } from "@/components/file-attach";
import { PENDING_ATTACHMENT_KEY } from "@/lib/pending-attachment";

interface AgentFileRow {
  id: string;
  agentId: string;
  workspaceRunId: string | null;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  source: "platform" | "anthropic";
  createdAt: string | null;
  agentName: string | null;
  agentModel: string | null;
}

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType?.includes("presentation")) return <Presentation className="w-4 h-4 text-orange-500 shrink-0" />;
  return <FileText className="w-4 h-4 text-red-500 shrink-0" />;
}

interface BrandAssetRow {
  id: string;
  filename: string;
  kind: string;
  sizeBytes: number | null;
  summary?: string;
  createdAt: string | null;
}

/**
 * The org's standing brand assets — logo, deck templates, approved imagery.
 * Anything uploaded here is auto-attached to every document-capable Workspace
 * run (workspace-run.ts resolveBrandAssetIds), so agents apply the brand
 * without the user re-attaching files per conversation. The five most recent
 * assets ride along; deleting one here stops it immediately.
 */
function BrandAssetsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: assets = [], isLoading } = useQuery<BrandAssetRow[]>({
    queryKey: ["/api/files?context=brand"],
  });

  async function remove(asset: BrandAssetRow) {
    setDeletingId(asset.id);
    try {
      await apiRequest("DELETE", `/api/files/${asset.id}`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/files?context=brand"] });
    } catch (e: any) {
      toast({ title: "Could not remove asset", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card data-testid="card-brand-assets">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" /> Brand Assets
          </h2>
          <p className="text-xs text-muted-foreground">
            Logo, templates, and approved imagery. The five most recent are automatically available to every
            document-generating agent run — no need to attach them each time.
          </p>
        </div>

        <FileAttach
          context="brand"
          value={[]}
          onChange={() => queryClient.invalidateQueries({ queryKey: ["/api/files?context=brand"] })}
          variant="dropzone"
          label="Add a brand asset"
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : assets.length > 0 && (
          <div className="flex flex-col divide-y" data-testid="brand-assets-list">
            {assets.map(a => (
              <div key={a.id} className="flex items-center gap-3 py-2 text-sm" data-testid={`brand-asset-${a.id}`}>
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="truncate font-medium">{a.filename}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {[a.summary, formatBytes(a.sizeBytes), relTime(a.createdAt)].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  disabled={deletingId === a.id}
                  className="text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
                  title="Remove this brand asset"
                  data-testid={`button-brand-asset-remove-${a.id}`}
                >
                  {deletingId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Files() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const { data: files = [], isLoading } = useQuery<AgentFileRow[]>({
    queryKey: ["/api/agent-files"],
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter(f =>
      (f.filename ?? "").toLowerCase().includes(q) ||
      (f.agentName ?? "").toLowerCase().includes(q),
    );
  }, [files, query]);

  async function editInWorkspace(file: AgentFileRow) {
    setAttachingId(file.id);
    try {
      const res = await apiRequest("POST", `/api/agent-files/${file.id}/attach`, {});
      const attached = await res.json();
      const asAttachment: AttachedFile = {
        id: attached.id, filename: attached.filename, kind: attached.kind,
        sizeBytes: attached.sizeBytes, summary: attached.summary, charCount: attached.charCount,
      };
      // Handed off via sessionStorage, not React state or a URL param carrying
      // the whole object -- Workspace is a separate mounted page, and this is
      // the smallest payload that survives the navigation.
      sessionStorage.setItem(PENDING_ATTACHMENT_KEY, JSON.stringify(asAttachment));
      navigate("/workspace");
    } catch (e: any) {
      toast({ title: "Failed to attach file", description: e.message, variant: "destructive" });
    } finally {
      setAttachingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-4xl mx-auto w-full" data-testid="page-files">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" /> Files
        </h1>
        <p className="text-sm text-muted-foreground">
          Every document an agent has generated — decks, reports, spreadsheets. Workspace's My Work only shows your 10 most recent runs; this shows all of them.
        </p>
      </div>

      <BrandAssetsCard />

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by filename or agent…"
          className="pl-8 h-9"
          data-testid="input-files-search"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={query ? "No matching files" : "No documents generated yet"}
              description={query ? "Try a different search." : "Ask an agent to build you a deck or report from the Workspace."}
            />
          ) : (
            <div className="flex flex-col divide-y" data-testid="files-list">
              {filtered.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 text-sm" data-testid={`file-row-${f.id}`}>
                  <FileIcon mimeType={f.mimeType} />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="truncate font-medium">{f.filename || "Untitled document"}</span>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                      {f.agentName && <span>{f.agentName}</span>}
                      <span>{formatBytes(f.sizeBytes)}</span>
                      {f.createdAt && <span>{relTime(f.createdAt)}</span>}
                      <Badge variant="outline" className="text-[9px] font-normal">
                        {f.source === "platform" ? "platform renderer" : "Anthropic skill"}
                      </Badge>
                    </div>
                  </div>
                  <a
                    href={`/api/agent-files/${f.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                    data-testid={`link-files-download-${f.id}`}
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                  <button
                    type="button"
                    onClick={() => editInWorkspace(f)}
                    disabled={attachingId === f.id}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline shrink-0 disabled:opacity-50"
                    data-testid={`button-files-edit-${f.id}`}
                    title="Attach this file in Workspace so you can ask an agent to change it"
                  >
                    {attachingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
