const target = new URL(process.env.APORIA_TEST_PROVIDER_URL);
if (
  target.hostname !== "127.0.0.1" ||
  process.env.OPENAI_API_KEY !== "sk-local-test-only"
)
  throw new Error("Invalid AI fixture environment");
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.href === "https://api.openai.com/v1/responses") {
    const local = new URL("/v1/responses", target);
    return originalFetch(
      input instanceof Request ? new Request(local, input) : local,
      init,
    );
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("External network disabled in AI tests");
  return originalFetch(input, init);
};
const timeout = AbortSignal.timeout.bind(AbortSignal);
AbortSignal.timeout = (ms) =>
  timeout(
    ms === 75000 ? Number(process.env.APORIA_TEST_AI_TIMEOUT_MS || 500) : ms,
  );
