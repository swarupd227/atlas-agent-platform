import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Changing this key (e.g. the current route) clears a caught error so
   *  navigating away recovers without a full reload. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

// A failed dynamic import (lazy route chunk) throws a ChunkLoadError. The
// commonest trigger in production is a *stale chunk after a deploy*: a user
// with the app already open still holds the previous index.html, so on their
// next route navigation the browser requests a chunk hash the server just
// replaced -> the import rejects and the page goes blank/errored until a hard
// refresh. That "intermittent freeze during navigation that a refresh fixes"
// is exactly what testers reported (UI-001). The remedy is always the same:
// fetch the fresh index.html, so we auto-reload once (guarded against loops).
export function isChunkLoadError(error: Error): boolean {
  const msg = error?.message || "";
  return (
    error?.name === "ChunkLoadError" ||
    /Loading (CSS )?chunk .* failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

/**
 * Route-level error boundary. Without it, any render crash (often triggered by
 * unexpected API error payloads) unmounts the whole page and the user sees a
 * blank shell. This renders a friendly fallback with a reload action instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      // Self-heal a stale-chunk-after-deploy by reloading to fetch the fresh
      // index.html. Time-window guard (not a permanent flag): auto-reload only
      // if we haven't already done so in the last 10s -- prevents a reload loop
      // when the chunk is genuinely unreachable (offline), yet still heals a
      // fresh stale-chunk error minutes later after the next deploy.
      const KEY = "astra-chunk-reload-at";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (!last || Date.now() - last > 10_000) {
        try { sessionStorage.setItem(KEY, String(Date.now())); } catch {}
        window.location.reload();
        return;
      }
    }
    console.error("[error-boundary] render error:", error.message, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      const chunk = isChunkLoadError(this.state.error);
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-12 min-h-[60vh]" data-testid="error-boundary-fallback">
          <AlertTriangle className="w-10 h-10 text-destructive" />
          <div className="text-center flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{chunk ? "A new version is available" : "Something went wrong"}</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              {chunk
                ? "The app was updated while this tab was open. Reload to get the latest version — your data is safe."
                : "This page hit an unexpected error. Your data is safe — reload the page or navigate elsewhere."}
            </p>
            {!chunk && (
              <p className="text-xs text-muted-foreground font-mono mt-2" data-testid="text-error-message">
                {this.state.error.message}
              </p>
            )}
          </div>
          <Button onClick={() => window.location.reload()} data-testid="button-error-reload">
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Reload Page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
