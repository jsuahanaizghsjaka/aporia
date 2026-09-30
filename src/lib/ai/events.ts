/** Parse SSE safely across arbitrary byte/chunk boundaries, including CRLF. */
export async function* readSSE(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      if (buffer.length > 256000) throw new Error("Event too large");
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data && data !== "[DONE]") {
          const event = JSON.parse(data);
          if (!event || Array.isArray(event) || typeof event.type !== "string")
            throw new Error("Invalid event");
          yield event as {
            type: string;
            delta?: string;
            code?: unknown;
            error?: { code?: unknown };
            response?: {
              status?: string;
              output?: unknown[];
              error?: { code?: unknown };
            };
          };
        }
      }
      if (done) break;
    }
    if (buffer.trim()) throw new Error("Incomplete event stream");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
