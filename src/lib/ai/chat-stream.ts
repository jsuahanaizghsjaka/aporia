export class ChatFailure extends Error {
  retryAfter: number;
  retryable: boolean;
  constructor(message: string, retryAfter = 0, retryable = true) {
    super(message);
    this.name = "ChatFailure";
    this.retryAfter = retryAfter;
    this.retryable = retryable;
  }
}
const invalid = () =>
  new ChatFailure(
    "Ответ прервался или оказался некорректным. Повтори отправку.",
  );
function failure(data: Record<string, unknown>) {
  return new ChatFailure(
    typeof data.error === "string" && data.error.length <= 500
      ? data.error
      : "Ментор временно недоступен. Повтори отправку.",
    typeof data.retryAfter === "number" &&
      Number.isSafeInteger(data.retryAfter) &&
      data.retryAfter > 0
      ? Math.min(86400, data.retryAfter)
      : 0,
    data.retryable !== false,
  );
}
export async function readChatResponse(
  response: Response,
  onText: (text: string) => void,
  onOnboarding?: (snapshot: unknown) => void,
) {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw failure(data && typeof data === "object" ? data : {});
  }
  if (
    !response.body ||
    response.headers.get("content-type")?.split(";")[0].trim() !==
      "application/x-ndjson"
  )
    throw invalid();
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "",
    text = "",
    complete = false,
    onboarding: unknown;
  try {
    for (;;) {
      const chunk = await reader.read();
      buffer += chunk.done
        ? decoder.decode()
        : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 64000) throw invalid();
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (!event || complete) throw invalid();
        if (event.type === "error") throw failure(event);
        if (event.type === "delta" && typeof event.text === "string") {
          text += event.text;
          if (text.length > 16000) throw invalid();
          onText(text);
        } else if (event.type === "done") {
          if (event.text !== undefined) {
            if (typeof event.text !== "string") throw invalid();
            text = event.text;
          }
          if (!text.trim() || text.length > 16000) throw invalid();
          complete = true;
          onboarding = event.onboarding;
          onText(text);
        } else throw invalid();
      }
      if (chunk.done) break;
    }
    if (!complete || buffer.trim()) throw invalid();
    if (onboarding !== undefined) onOnboarding?.(onboarding);
    return text;
  } catch (cause) {
    if (
      cause instanceof ChatFailure ||
      (cause instanceof Error &&
        ["AbortError", "TimeoutError"].includes(cause.name))
    )
      throw cause;
    throw invalid();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
