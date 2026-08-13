import { Brain, Wrench, ShieldCheck, Globe, Sparkles, Database, Network, SquareFunction } from "lucide-react";

// Shared between team-graph-editor.tsx (palette + config panels) and
// team-graph-canvas.tsx (node card rendering) -- lives here instead of being
// exported from either page/component file to avoid a circular import
// (team-graph-editor.tsx renders TeamGraphCanvas, so TeamGraphCanvas can't
// import back from it).

export const NODE_COLOR_MAP: Record<string, string> = {
  internal_agent: "bg-blue-500",
  tool_set: "bg-amber-500",
  edge_gate: "bg-orange-500",
  remote_agent: "bg-purple-500",
  skill: "bg-teal-500",
  knowledge_base: "bg-emerald-500",
  // Distinct from remote_agent's purple -- a Sub-Flow calls another of THIS
  // org's own team flows (executeTeamReferenceNode), not an external A2A peer.
  sub_flow: "bg-indigo-500",
  // A JSONata transform, not an agent call -- kept visually distinct (slate,
  // not one of the "does work" colors) since it's deterministic and free.
  expression: "bg-slate-500",
};

export const NODE_ICON_MAP: Record<string, typeof Brain> = {
  internal_agent: Brain,
  tool_set: Wrench,
  edge_gate: ShieldCheck,
  remote_agent: Globe,
  skill: Sparkles,
  knowledge_base: Database,
  sub_flow: Network,
  expression: SquareFunction,
};

export const TRUST_TIER_COLORS: Record<string, string> = {
  full: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  verified: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  basic: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  untrusted: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
};
