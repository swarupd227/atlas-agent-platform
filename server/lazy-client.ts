// Self-host boot fix (found while verifying Initiative 2 P2's file-backed
// secrets): several modules construct an SDK client (OpenAI) at module-load
// time, unconditionally — e.g. `const openai = new OpenAI({ apiKey: process
// .env.OPENAI_API_KEY })`. The OpenAI SDK's constructor throws synchronously
// when no apiKey resolves from any source. Every one of those modules sits on
// the server's static import chain (reached via server/routes.ts before the
// app starts listening), so on a deployment with no OpenAI key configured —
// an Anthropic-only self-host being the common case — the ENTIRE process
// crashes at boot, even though the OpenAI-backed feature in that file might
// never be used.
//
// createLazyClient defers the real construction until the client is first
// used, via a Proxy, so every existing call site (`openai.chat.completions
// .create(...)`, `openai.audio.transcriptions.create(...)`, …) keeps working
// completely unchanged when a key IS configured — and a genuinely
// unconfigured client only fails the specific request that touches it,
// instead of the whole server.

export function createLazyClient<T extends object>(factory: () => T): T {
  let real: T | undefined;
  const resolve = (): T => {
    if (real === undefined) real = factory();
    return real;
  };
  return new Proxy({} as T, {
    get(_target, prop, _receiver) {
      const client = resolve();
      const value = Reflect.get(client as object, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
    has(_target, prop) {
      return prop in (resolve() as object);
    },
  });
}
