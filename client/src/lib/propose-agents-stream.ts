import { apiRequest } from "@/lib/queryClient";

// The propose-agents endpoint streams real SSE progress events while it
// works (see server/routes/improvements.ts) rather than returning plain
// JSON -- this call routinely takes 90-240s for larger teams. Every caller
// consumes the same "data: {...}\n\n" line format, so centralize the parser
// here instead of duplicating it per call site.
export async function streamProposeAgents(
  payload: unknown,
  onProgress: (message: string) => void,
  signal?: AbortSignal,
): Promise<any> {
  const res = await apiRequest("POST", "/api/ai/propose-agents", payload, signal);
  const reader = res.body?.getReader();
  if (!reader) {
    // No streaming body reader available (e.g. very old browser) -- fall
    // back to a plain JSON parse of whatever arrived so drafting still works.
    return await res.json();
  }
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let evt: any;
      try {
        evt = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (evt.type === "progress") {
        onProgress(evt.message || "Working...");
      } else if (evt.type === "done") {
        return evt.result;
      } else if (evt.type === "error") {
        const err: any = new Error(evt.error || "Failed to draft team");
        if (evt.timeout) err.timeout = true;
        throw err;
      }
    }
  }
  throw new Error("Connection closed before the draft finished. Try again.");
}
