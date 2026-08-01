import { isChunkLoadError } from "@/components/error-boundary";
import { apiRequest } from "@/lib/queryClient";

// React error boundaries only catch errors thrown during rendering -- event
// handlers, unhandled promise rejections, and async callbacks are invisible
// to them by design (this is documented React behavior, not a gap in our
// boundary). Without these listeners, a hang caused by e.g. a rejected fetch
// in a click handler leaves no trace anywhere: no console entry, no report,
// nothing to diagnose after the fact. This installs the minimal global catch
// for those cases and files an auto-captured bug report so a report that
// used to be "it just froze, refreshing fixed it" comes with an actual
// message/stack next time.
//
// Chunk-load failures are excluded here: error-boundary.tsx already detects
// and self-heals those (auto-reload on stale-chunk-after-deploy), so
// reporting them again here would just be noise in the feedback queue every
// time the app is redeployed while a tab is open.

let lastReportAt = 0;
const REPORT_COOLDOWN_MS = 5_000;

function reportError(type: "error" | "unhandledrejection", message: string, stack?: string) {
  const now = Date.now();
  if (now - lastReportAt < REPORT_COOLDOWN_MS) return;
  lastReportAt = now;

  const feedbackText = [
    `Auto-captured ${type === "error" ? "uncaught error" : "unhandled promise rejection"}.`,
    `Message: ${message}`,
    `URL: ${window.location.href}`,
    `User agent: ${navigator.userAgent}`,
    `Time: ${new Date().toISOString()}`,
    stack ? `Stack:\n${stack}` : "",
  ].filter(Boolean).join("\n");

  // Fire-and-forget -- a failure to report must never itself throw or block anything.
  apiRequest("POST", "/api/feedback", {
    feedbackType: "bug",
    featureArea: "Client Runtime Error (auto-captured)",
    feedbackText,
    submittedBy: "auto-capture (client)",
  }).catch(() => {});
}

export function installGlobalErrorCapture() {
  window.addEventListener("error", (event) => {
    const error = event.error instanceof Error ? event.error : undefined;
    if (error && isChunkLoadError(error)) return;
    const message = error?.message || event.message || "Unknown error";
    console.error("[global-error-capture] uncaught error:", message, error?.stack);
    reportError("error", message, error?.stack);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const error = reason instanceof Error ? reason : undefined;
    if (error && isChunkLoadError(error)) return;
    const message = error ? error.message : String(reason);
    console.error("[global-error-capture] unhandled promise rejection:", reason);
    reportError("unhandledrejection", message, error?.stack);
  });
}
