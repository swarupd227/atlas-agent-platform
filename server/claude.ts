import Anthropic from "@anthropic-ai/sdk";

export const anthropicClient = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  jsonMode?: boolean;
  model?: string;
}): Promise<string> {
  const systemPrompt = opts.jsonMode
    ? `${opts.system}\n\nReturn ONLY valid JSON with no markdown fences or prose.`
    : opts.system;
  const response = await anthropicClient.messages.create({
    model: opts.model ?? "claude-opus-4-5",
    system: systemPrompt,
    messages: [{ role: "user", content: opts.user }],
    max_tokens: opts.maxTokens ?? 4096,
  });
  return (response.content.find((b: any) => b.type === "text") as any)?.text ?? "";
}

export function stripJsonFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const openFence = raw.match(/```(?:json)?\s*([\s\S]*)/);
  if (openFence) return openFence[1].trim();
  return raw.trim();
}
