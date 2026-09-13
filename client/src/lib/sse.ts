/**
 * Server-sent events over a POST fetch (EventSource can't send a body).
 *
 * The parser is pure so it can be tested: it takes decoded text in arbitrary
 * chunks and calls onEvent once per complete `data:` event. Comment lines
 * (the server's `:hb` heartbeat) and other fields are ignored; CRLF and LF are
 * both accepted; multi-line data is joined with newlines as the spec says.
 */

export function createSseParser<T = unknown>(onEvent: (event: T) => void, onInvalid?: (raw: string) => void) {
  let buffer = "";
  let data: string[] = [];

  const dispatch = () => {
    if (data.length === 0) return;
    const raw = data.join("\n");
    data = [];
    try {
      onEvent(JSON.parse(raw) as T);
    } catch {
      onInvalid?.(raw);
    }
  };

  const line = (text: string) => {
    if (text === "") return dispatch();
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let index: number;
      while ((index = buffer.search(/\r\n|\r|\n/)) !== -1) {
        const newlineLength = buffer.startsWith("\r\n", index) ? 2 : 1;
        // A lone \r at the very end may be the first half of \r\n: wait for more.
        if (buffer[index] === "\r" && index === buffer.length - 1) break;
        line(buffer.slice(0, index));
        buffer = buffer.slice(index + newlineLength);
      }
    },
    /** The stream ended: flush an event that wasn't followed by a blank line. */
    end() {
      if (buffer) {
        line(buffer.replace(/\r$/, ""));
        buffer = "";
      }
      dispatch();
    },
  };
}

export interface StreamOptions<T> {
  body: unknown;
  headers?: Record<string, string>;
  onEvent: (event: T) => void;
  signal?: AbortSignal;
  /** Abort when nothing (not even a heartbeat) arrives for this long. */
  idleMs?: number;
}

export class SseHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** POST and read the response as SSE until the server closes it. */
export async function postSse<T>(url: string, options: StreamOptions<T>): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort);
  const idleMs = options.idleMs ?? 60_000;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(abort, idleMs);
  };

  try {
    resetIdle();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...options.headers },
      body: JSON.stringify(options.body),
      credentials: "include",
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      let message = res.statusText;
      try {
        const json = await res.json();
        message = json?.message ?? message;
      } catch {
        /* not JSON */
      }
      throw new SseHttpError(res.status, message || `Request failed (${res.status})`);
    }

    const parser = createSseParser<T>(options.onEvent);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } finally {
    if (idle) clearTimeout(idle);
    options.signal?.removeEventListener("abort", abort);
  }
}
