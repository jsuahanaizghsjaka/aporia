import { readSSE } from "./events.ts";
import { AIError } from "./errors.ts";
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
        ["response.output_text.delta", "response.refusal.delta"].includes(
          event.type,
        )
      ) {
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
        throw new AIError("AI_INVALID_RESPONSE");
    }
    if (!complete || !text.trim()) throw new AIError("AI_INVALID_RESPONSE");
    return text;
  } catch (cause) {
    throw cause instanceof AIError ? cause : new AIError("AI_INVALID_RESPONSE");
  }
}
