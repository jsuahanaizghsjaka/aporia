import { AIError, retryAfterSeconds } from "./errors.ts";
export function createAIClient(options: {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}) {
  return async (body: Record<string, unknown>, callerSignal?: AbortSignal) => {
    if (!options.apiKey.trim() || !options.model.trim())
      throw new AIError("AI_NOT_CONFIGURED");
    const deadline = AbortSignal.timeout(options.timeoutMs ?? 75000);
    const signal = callerSignal
      ? AbortSignal.any([deadline, callerSignal])
      : deadline;
    const classify = (cause: unknown) =>
      callerSignal?.aborted
        ? new AIError(
            callerSignal.reason?.name === "TimeoutError"
              ? "AI_TIMEOUT"
              : "AI_CANCELLED",
          )
        : deadline.aborted
          ? new AIError("AI_TIMEOUT")
          : cause instanceof AIError
            ? cause
            : new AIError("AI_UNAVAILABLE");
    try {
      const response = await (options.fetch ?? fetch)(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...body,
            model: options.model.trim(),
            store: false,
          }),
          signal,
        },
      );
      if (!response.ok) {
        if (response.status === 429) {
          const data = await response.json().catch(() => null);
          const quota = [
            "insufficient_quota",
            "credit_balance_exhausted",
            "billing_hard_limit_reached",
            "organization_usage_limit_reached",
            "organization_spend_limit_exceeded",
            "project_spend_limit_exceeded",
          ].includes(data?.error?.code);
          throw new AIError(
            quota ? "AI_QUOTA" : "AI_RATE_LIMIT",
            quota
              ? undefined
              : (retryAfterSeconds(response.headers.get("retry-after")) ?? 60),
          );
        }
        await response.body?.cancel();
        throw new AIError(
          [400, 401, 403, 404, 422].includes(response.status)
            ? "AI_ACCESS"
            : [408, 504].includes(response.status)
              ? "AI_TIMEOUT"
              : "AI_UNAVAILABLE",
        );
      }
      const mime = response.headers.get("content-type")?.split(";")[0].trim();
      if (
        !response.body ||
        mime !== (body.stream ? "text/event-stream" : "application/json")
      ) {
        await response.body?.cancel();
        throw new AIError("AI_INVALID_RESPONSE");
      }
      const reader = response.body.getReader();
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              reader.releaseLock();
              controller.close();
            } else controller.enqueue(value);
          } catch (cause) {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
            controller.error(classify(cause));
          }
        },
        async cancel() {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        },
      });
      return new Response(stream, {
        status: response.status,
        headers: response.headers,
      });
    } catch (cause) {
      throw classify(cause);
    }
  };
}
