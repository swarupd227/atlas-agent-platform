import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Paperclip, X, Loader2, FileText, FileSpreadsheet, Presentation, AlertCircle, Image as ImageIcon } from "lucide-react";

/**
 * Shared attachment control for every surface that takes a file — the Workspace
 * chat box, the agent wizard, process flow authoring.
 *
 * Uploading happens here rather than at submit time, so the user sees the file
 * accepted (or rejected, with the reason) immediately instead of discovering at
 * send time that their .xls was unreadable. Parents receive ids only.
 */

export interface AttachedFile {
  id: string;
  filename: string;
  kind: string;
  sizeBytes: number;
  /** "3 sheets: Q3, Notes", "12 slides" — from the server's reader. */
  summary?: string;
  charCount?: number;
}

interface Props {
  /** Where these are being uploaded from; recorded on the row. */
  context: "workspace" | "wizard" | "process_flow" | "eval" | "playground" | "other";
  value: AttachedFile[];
  onChange: (files: AttachedFile[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  /** Renders a full drop zone instead of just a button — for surfaces where
   *  uploading IS the primary action rather than an accessory to typing. */
  variant?: "inline" | "dropzone";
  label?: string;
}

function iconFor(kind: string) {
  if (kind === "xlsx") return FileSpreadsheet;
  if (kind === "pptx") return Presentation;
  if (kind === "image") return ImageIcon;
  return FileText;
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttach({ context, value, onChange, disabled, maxFiles = 5, variant = "inline", label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { toast } = useToast();

  // Accept string and limits come from the server so the picker cannot drift
  // from what the reader actually supports.
  const { data: config } = useQuery<{ accept: string; maxBytes: number; supportedLabel: string }>({
    queryKey: ["/api/files/config"],
    staleTime: Infinity,
  });

  const send = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const room = maxFiles - value.length;
    if (room <= 0) {
      toast({ title: `Up to ${maxFiles} files`, description: "Remove one before adding another.", variant: "destructive" });
      return;
    }

    const form = new FormData();
    for (const f of files.slice(0, room)) form.append("files", f);
    form.append("context", context);

    setBusy(true);
    try {
      // Not apiRequest(): that sets Content-Type: application/json, which
      // strips the multipart boundary and the upload arrives with no files.
      const res = await fetch("/api/files/upload", { method: "POST", body: form, credentials: "include" });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        toast({ title: "Upload failed", description: body?.message ?? `HTTP ${res.status}`, variant: "destructive" });
        return;
      }

      // A partial success still returns 201: readable files are attached and
      // the unreadable ones are reported individually, so one bad file in a
      // multi-select doesn't discard the rest.
      const accepted = (body?.files ?? []).filter((f: any) => !f.error);
      const rejected = (body?.files ?? []).filter((f: any) => f.error);
      for (const r of rejected) {
        toast({ title: `Could not read ${r.filename}`, description: r.error, variant: "destructive" });
      }
      const empties = accepted.filter((f: any) => f.summary === "no readable text");
      for (const e of empties) {
        // Worth saying out loud: a scanned PDF uploads "successfully" and
        // contains nothing, which otherwise looks like the agent ignoring it.
        toast({ title: `${e.filename} has no readable text`, description: "It may be a scanned image. The agent will not be able to read it." });
      }
      if (accepted.length) onChange([...value, ...accepted]);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [context, value, onChange, maxFiles, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled || busy) return;
    send(Array.from(e.dataTransfer.files ?? []));
  }, [disabled, busy, send]);

  const picker = (
    <input
      ref={inputRef}
      type="file"
      multiple
      className="hidden"
      accept={config?.accept}
      onChange={(e) => send(Array.from(e.target.files ?? []))}
      data-testid={`input-file-attach-${context}`}
    />
  );

  const chips = value.length > 0 && (
    <div className="flex flex-wrap gap-1.5">
      {value.map((f) => {
        const Icon = iconFor(f.kind);
        const unreadable = f.summary === "no readable text";
        return (
          <span
            key={f.id}
            className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs"
            data-testid={`chip-file-${f.id}`}
            title={`${f.filename} — ${prettySize(f.sizeBytes)}${f.summary ? ` — ${f.summary}` : ""}`}
          >
            {unreadable
              ? <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
              : <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            <span className="max-w-[180px] truncate">{f.filename}</span>
            {f.summary && f.summary !== f.kind && (
              <span className="text-muted-foreground">· {f.summary}</span>
            )}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v.id !== f.id))}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${f.filename}`}
              data-testid={`button-remove-file-${f.id}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}
    </div>
  );

  if (variant === "dropzone") {
    return (
      <div className="flex flex-col gap-2">
        {picker}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !disabled && !busy && inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
          } ${disabled || busy ? "opacity-60 pointer-events-none" : ""}`}
          data-testid={`dropzone-${context}`}
        >
          {busy
            ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            : <Paperclip className="w-5 h-5 text-muted-foreground" />}
          <span className="text-sm">{label ?? "Drop a file here, or click to choose"}</span>
          <span className="text-[11px] text-muted-foreground">
            {config?.supportedLabel ?? "PDF, Word, Excel, PowerPoint, CSV, JSON, or text"}
          </span>
        </div>
        {chips}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {picker}
      {chips}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={disabled || busy || value.length >= maxFiles}
          onClick={() => inputRef.current?.click()}
          data-testid={`button-attach-${context}`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5 mr-1.5" />}
          {label ?? "Attach file"}
        </Button>
        {dragging && <span className="text-xs text-primary">Drop to attach</span>}
      </div>
    </div>
  );
}
