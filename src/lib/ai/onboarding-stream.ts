import { z } from "zod";
import { readSSE } from "./events.ts";
import { AIError } from "./errors.ts";
import {
  applyOnboardingAction,
  missingOnboarding,
  reviewOnboarding,
  type OnboardingState,
} from "../onboarding/ai-state.ts";
import { questions } from "../onboarding/lesson-zero.ts";
const callSchema = z.object({
  type: z.literal("function_call"),
  name: z.enum(["record_onboarding", "finish_onboarding"]),
  arguments: z.string().max(32000),
  status: z.literal("completed"),
});
export async function readOnboardingResponse(
  body: ReadableStream<Uint8Array>,
  state: OnboardingState,
  userStatements: string[],
  onDelta: (text: string) => void,
) {
  let complete = false,
    text = "",
    result: ReturnType<typeof applyOnboardingAction> | undefined;
  try {
    for await (const event of readSSE(body)) {
      if (complete) throw new AIError("AI_INVALID_RESPONSE");
      if (event.type === "response.output_text.delta") {
        if (typeof event.delta !== "string")
          throw new AIError("AI_INVALID_RESPONSE");
        text += event.delta;
        if (text.length > 16000) throw new AIError("AI_INVALID_RESPONSE");
        onDelta(event.delta);
      } else if (
        ["error", "response.failed", "response.incomplete"].includes(event.type)
      )
        throw new AIError("AI_INVALID_RESPONSE");
      else if (event.type === "response.completed") {
        if (
          event.response?.status !== "completed" ||
          !Array.isArray(event.response.output)
        )
          throw new AIError("AI_INVALID_RESPONSE");
        const calls = event.response.output.filter(
          (item) =>
            item &&
            typeof item === "object" &&
            "type" in item &&
            item.type === "function_call",
        );
        if (calls.length !== 1) throw new AIError("AI_INVALID_RESPONSE");
        const call = callSchema.parse(calls[0]);
        result = applyOnboardingAction(
          state,
          JSON.parse(call.arguments),
          userStatements,
        );
        const canFinish = missingOnboarding(result.state).length === 0;
        if (call.name === "finish_onboarding" && !canFinish) {
          const next = questions.find(
            (q) => q.key === result!.review.missing[0],
          );
          result.reply = `До итога осталось немного. ${next?.prompt ?? "Что ещё важно учесть?"}`;
        }
        result.state.phase =
          call.name === "finish_onboarding" && canFinish
            ? "review"
            : "collecting";
        result.review = reviewOnboarding(result.state);
        complete = true;
      }
    }
    if (!complete || !result) throw new AIError("AI_INVALID_RESPONSE");
    if (!text) onDelta(result.reply);
    return { ...result, text: result.reply };
  } catch (cause) {
    throw cause instanceof AIError ? cause : new AIError("AI_INVALID_RESPONSE");
  }
}
