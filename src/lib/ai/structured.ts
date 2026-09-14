import "server-only";
import { z } from "zod";
import { createResponse } from "./provider";
import { AIError } from "./errors";
export async function structuredResponse<T>(
  schema: z.ZodType<T>,
  name: string,
  instructions: string,
  input: unknown,
  signal: AbortSignal,
): Promise<T> {
  const response = await createResponse(
    {
      instructions,
      input: JSON.stringify(input),
      stream: false,
      max_output_tokens: 4000,
      text: {
        format: {
          type: "json_schema",
          name,
          strict: true,
          schema: z.toJSONSchema(schema, { target: "draft-7" }),
        },
      },
    },
    signal,
  );
  const data = await response.json();
  if (data.status !== "completed" || !Array.isArray(data.output))
    throw new AIError("AI_INVALID_RESPONSE");
  const parts = data.output.flatMap((item: { content?: unknown[] }) =>
    Array.isArray(item.content) ? item.content : [],
  );
  if (parts.some((p: { type?: string }) => p.type === "refusal"))
    throw new AIError("AI_INVALID_RESPONSE");
  const text = parts
    .filter((p: { type?: string }) => p.type === "output_text")
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  try {
    if (!text || text.length > 20000) throw new Error();
    return schema.parse(JSON.parse(text));
  } catch {
    throw new AIError("AI_INVALID_RESPONSE");
  }
}
