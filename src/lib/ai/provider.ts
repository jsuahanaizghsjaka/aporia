import "server-only";
export function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);
}
export async function createResponse(
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  if (!aiConfigured()) throw new Error("AI_NOT_CONFIGURED");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...body,
      model: process.env.OPENAI_MODEL,
      store: false,
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(75_000)])
      : AbortSignal.timeout(75_000),
  });
  if (!response.ok) throw new Error(`AI_PROVIDER_${response.status}`);
  return response;
}
