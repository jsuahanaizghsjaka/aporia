import { readSSE } from "./events.ts";
import { AIError, isAIQuotaCode } from "./errors.ts";
export async function readAIText(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
) {
  let text = "",
    complete = false;
  try {
    for await (const event of readSSE(body)) {
      if (complete) throw new AIError("AI_INVALID_RESPONSE");
      if (
        event.type === "response.refusal.delta" ||
        event.type === "response.refusal.done"
      )
        throw new AIError("AI_INVALID_RESPONSE");
      if (event.type === "response.output_text.delta") {
        if (typeof event.delta !== "string")
          throw new AIError("AI_INVALID_RESPONSE");
        text += event.delta;
        if (text.length > 16000) throw new AIError("AI_INVALID_RESPONSE");
        onDelta(event.delta);
      } else if (event.type === "response.completed") {
        if (event.response?.status !== "completed")
          throw new AIError("AI_INVALID_RESPONSE");
        complete = true;
      } else if (
        ["error", "response.failed", "response.incomplete"].includes(event.type)
      )
        throw new AIError(
          isAIQuotaCode(
            event.code ?? event.error?.code ?? event.response?.error?.code,
          )
            ? "AI_QUOTA"
            : "AI_INVALID_RESPONSE",
        );
    }
    if (!complete || !text.trim()) throw new AIError("AI_INVALID_RESPONSE");
    return text;
  } catch (cause) {
    throw cause instanceof AIError ? cause : new AIError("AI_INVALID_RESPONSE");
  }
}
