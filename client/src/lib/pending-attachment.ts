/**
 * sessionStorage handoff for "attach this generated file, then go compose a
 * request about it" -- used when the attach action happens on a page other
 * than Workspace (client/src/pages/files.tsx today). React state and a URL
 * param carrying the whole attachment object don't survive a page navigation
 * as cleanly as this does.
 *
 * A shared constant, not one page importing it from the other, so files.tsx
 * and workspace.tsx (both route-level lazy chunks) don't end up pulling each
 * other's module into their bundle.
 */
export const PENDING_ATTACHMENT_KEY = "workspace-pending-attachment";
