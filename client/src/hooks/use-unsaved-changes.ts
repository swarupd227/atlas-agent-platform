import { useEffect } from "react";

/**
 * Warns before losing in-progress work (UX audit F-8).
 *
 * Covers both exit paths:
 *  1. Hard exits (tab close, refresh, external nav) via `beforeunload`.
 *  2. In-app SPA navigation: wouter has no route-blocking API, so a
 *     capture-phase click listener intercepts anchor navigations (every wouter
 *     <Link> renders an <a>) and asks for confirmation while `when` is true.
 *
 * Usage: useUnsavedChanges(isDirty, "Your agent draft will be lost.");
 */
export function useUnsavedChanges(when: boolean, message = "You have unsaved changes. Leave this page?") {
  useEffect(() => {
    if (!when) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message; // required by Chrome to show the native prompt
    };

    const onClickCapture = (e: MouseEvent) => {
      // Modified clicks (new tab) don't discard this page's state.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      // Only guard real in-app navigations.
      if (!href.startsWith("/") || href === window.location.pathname + window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [when, message]);
}
