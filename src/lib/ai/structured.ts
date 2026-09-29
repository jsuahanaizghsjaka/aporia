import "server-only";
import { z } from "zod";
import { createResponse } from "./provider";
import { AIError } from "./errors";
import { parseStructuredOutput } from "./output";
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
  try {
    return parseStructuredOutput(schema, await response.json());
  } catch (cause) {
    throw cause instanceof AIError ? cause : new AIError("AI_INVALID_RESPONSE");
  }
}
