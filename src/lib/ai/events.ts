/** Parse SSE safely across arbitrary byte/chunk boundaries, including CRLF. */
export async function* readSSE(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data && data !== "[DONE]")
          yield JSON.parse(data) as {
            type: string;
            delta?: string;
            response?: { status?: string };
          };
      }
      if (done) break;
    }
    if (buffer.trim()) throw new Error("Incomplete event stream");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
