/**
 * The Astra Library: an index of what the organization has, per section, for
 * the reader's role. Pure: the route loads the rows and says which sections
 * the role can see; a section it can't see is absent, not empty.
 */
import type { PermissionAction } from "../permissions";

export type LibrarySectionId = "conversations" | "agents" | "teams" | "outcomes" | "connectors" | "policies" | "processFlows";

export interface LibraryItem {
  id: string;
  name: string;
  detail: string | null;
  status: string | null;
  /** A question for Astra about this item, when a tool can answer it. */
  ask: string | null;
  /** Where the item lives: an Astra path ("/t/…") or a classic page. */
  href: string;
  /** True when href is inside the Astra shell. */
  inShell?: boolean;
}

export interface LibrarySection {
  id: LibrarySectionId;
  label: string;
  total: number;
  items: LibraryItem[];
}

export interface Library {
  query: string | null;
  sections: LibrarySection[];
  /** What the Library leaves out, and where it is. */
  elsewhere: string[];
}

export const LIBRARY_LIMIT = 50;

const LABELS: Record<LibrarySectionId, string> = {
  conversations: "Conversations",
  agents: "Agents",
  teams: "Teams",
  outcomes: "Outcomes",
  connectors: "Connectors",
  policies: "Policies",
  processFlows: "Process flows",
};

/** Any one of these permissions shows the section; null means every Astra user. */
const ACCESS: Record<LibrarySectionId, PermissionAction[] | null> = {
  conversations: null,
  agents: null, // everyone sees the agents they can run; view_agents sees them all
  teams: ["view_agents"],
  outcomes: null,
  connectors: ["view_agents"],
  policies: ["view_agents", "create_modify_policies", "manage_security"],
  processFlows: ["view_agents", "create_modify_outcomes", "create_modify_blueprints"],
};

export const LIBRARY_ORDER: LibrarySectionId[] = ["conversations", "agents", "teams", "outcomes", "connectors", "policies", "processFlows"];

export const LIBRARY_ELSEWHERE = [
  "Agent templates, eval suites, eval runs and the full connector catalogue aren't scoped to your organization yet, so they stay in the classic app.",
];

export function visibleLibrarySections(can: (p: PermissionAction) => boolean): LibrarySectionId[] {
  return LIBRARY_ORDER.filter((id) => ACCESS[id] === null || ACCESS[id]!.some(can));
}

export function normalizeQuery(q: unknown): string | null {
  return typeof q === "string" && q.trim() ? q.trim().slice(0, 100) : null;
}

export function matchesQuery(item: Pick<LibraryItem, "name" | "detail">, q: string | null): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return item.name.toLowerCase().includes(needle) || (item.detail ?? "").toLowerCase().includes(needle);
}

/** Filter by the query, then cap the list; `total` counts every match, not just the ones returned. */
export function buildLibrarySection(id: LibrarySectionId, items: LibraryItem[], q: string | null, limit = LIBRARY_LIMIT): LibrarySection {
  const matched = items.filter((i) => matchesQuery(i, q));
  return { id, label: LABELS[id], total: matched.length, items: matched.slice(0, limit) };
}
