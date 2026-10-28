/**
 * The model a run asks for. An explicit choice from the caller wins (a team
 * worker passes its own agent's), then the agent's own configured model, and
 * the platform default only when neither names one. Provider and model always
 * come from the same source, so a caller that names only a provider is never
 * paired with the agent's model.
 *
 * Ten request routes (playground, gateway, A2A, webhooks, widget, replay,
 * canary) pass no model, so every agent they ran was put on openai/gpt-4.1
 * whatever it was configured with -- found 2026-10-28, when a Claude agent's
 * playground run requested gpt-4.1 and reached Claude only through quota
 * fallback.
 */
export interface RunModelSource {
  modelProvider?: string | null;
  modelName?: string | null;
}

export const DEFAULT_RUN_MODEL = { provider: "openai", model: "gpt-4.1" } as const;

export function resolveRunModel(
  options: RunModelSource | undefined,
  agent: RunModelSource | null | undefined,
): { provider: string; model: string; source: "caller" | "agent" | "default" } {
  const names = (s: RunModelSource | null | undefined): s is RunModelSource =>
    !!s && !!(s.modelProvider?.trim() || s.modelName?.trim());
  const source = names(options) ? "caller" : names(agent) ? "agent" : "default";
  const from = source === "caller" ? options : source === "agent" ? agent : undefined;
  return {
    provider: from?.modelProvider?.trim() || DEFAULT_RUN_MODEL.provider,
    model: from?.modelName?.trim() || DEFAULT_RUN_MODEL.model,
    source,
  };
}
