import "server-only";
import { createAIClient } from "./client";
export function aiConfigured() {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_MODEL?.trim(),
  );
}
export async function createResponse(
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return createAIClient({
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_MODEL ?? "",
  })(body, signal);
}
