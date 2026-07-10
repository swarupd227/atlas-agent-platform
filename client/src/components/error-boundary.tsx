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
    console.error("[error-boundary] render error:", error.message, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-12 min-h-[60vh]" data-testid="error-boundary-fallback">
          <AlertTriangle className="w-10 h-10 text-destructive" />
          <div className="text-center flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              This page hit an unexpected error. Your data is safe — reload the page or navigate elsewhere.
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-2" data-testid="text-error-message">
              {this.state.error.message}
            </p>
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
