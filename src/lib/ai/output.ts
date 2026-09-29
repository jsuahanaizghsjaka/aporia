import { z } from "zod";
import { AIError } from "./errors.ts";

export const mentorTextSchema = z.string().trim().min(1).max(16000);
export const projectReviewSchema = z.strictObject({
  reply: z.string().trim().min(10).max(6000),
});

// Validate the provider envelope before looking for application JSON. Reasoning
// items may precede the one assistant message; unexpected output types fail closed.
export function parseStructuredOutput<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): T {
  try {
    const envelope = z
      .object({
        status: z.literal("completed"),
        output: z.array(z.unknown()).min(1).max(20),
      })
      .parse(raw);
    const messages: string[] = [];
    for (const item of envelope.output) {
      const base = z.object({ type: z.string() }).parse(item);
      if (base.type === "reasoning") continue;
      const message = z
        .object({
          type: z.literal("message"),
          status: z.literal("completed").optional(),
          content: z
            .array(
              z.strictObject({
                type: z.literal("output_text"),
                text: z.string().min(1).max(20000),
                annotations: z.array(z.unknown()).optional(),
                logprobs: z.array(z.unknown()).optional(),
              }),
            )
            .length(1),
        })
        .parse(item);
      messages.push(message.content[0].text);
    }
    if (messages.length !== 1) throw new Error();
    return schema.parse(JSON.parse(messages[0]));
  } catch {
    throw new AIError("AI_INVALID_RESPONSE");
  }
}
