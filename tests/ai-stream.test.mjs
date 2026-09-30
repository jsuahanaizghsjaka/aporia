import test from "node:test";
import assert from "node:assert/strict";
import { readAIText } from "../src/lib/ai/text-stream.ts";
import { createAIClient } from "../src/lib/ai/client.ts";
import { readOnboardingResponse } from "../src/lib/ai/onboarding-stream.ts";
import { publicAIError } from "../src/lib/ai/errors.ts";

const delta = { type: "response.output_text.delta", delta: "Привет 👋" };
const done = { type: "response.completed", response: { status: "completed" } };
const sse = (events) =>
  events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join("");

test("HTTP 200 streaming quota failures are non-retryable, safe and never complete either chat flow", async () => {
  for (const event of [
    {
      type: "error",
      code: "credit_balance_exhausted",
      message: "PRIVATE_PROVIDER_DETAIL",
    },
    {
      type: "response.failed",
      response: {
        status: "failed",
        error: {
          code: "insufficient_quota",
          message: "PRIVATE_PROVIDER_DETAIL",
        },
      },
    },
  ])
    for (const flow of ["text", "onboarding"]) {
      const body = new Response(sse([delta, event])).body;
      await assert.rejects(
        flow === "text"
          ? readAIText(body, () => {})
          : readOnboardingResponse(body, {}, [], () => {}),
        (error) => {
          const safe = publicAIError(error);
          assert.equal(safe.code, "AI_QUOTA");
          assert.equal(safe.retryable, false);
          assert.doesNotMatch(JSON.stringify(safe), /PRIVATE_PROVIDER_DETAIL/);
          return true;
        },
      );
    }
});

test("text chat preserves Cyrillic and emoji across single-byte SSE chunks", async () => {
  const bytes = new TextEncoder().encode(sse([delta, done]));
  let index = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (index === bytes.length) controller.close();
      else controller.enqueue(bytes.slice(index, ++index));
    },
  });
  const seen = [];
  assert.equal(await readAIText(body, (text) => seen.push(text)), delta.delta);
  assert.equal(seen.join(""), delta.delta);
});

test("partial, failed, empty and corrupted text streams never become a saved answer", async () => {
  for (const wire of [
    sse([delta]),
    sse([done]),
    sse([delta, { type: "response.incomplete" }]),
    sse([delta, { type: "response.failed" }]),
    sse([delta, done, { type: "error" }]),
    sse([delta, done]) + "data: {broken}",
    sse([{ ...delta, delta: "x".repeat(16001) }, done]),
  ]) {
    await assert.rejects(
      readAIText(new Response(wire).body, () => {}),
      {
        code: "AI_INVALID_RESPONSE",
      },
    );
  }
});

test("deadline and user cancellation remain distinguishable after response headers", async () => {
  // Keep this isolated test alive while AbortSignal.timeout's unref'ed timer runs.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    for (const cancel of [false, true]) {
      const caller = new AbortController();
      const client = createAIClient({
        apiKey: "local-test-key",
        model: "fixture-model",
        timeoutMs: cancel ? 1000 : 10,
        fetch: async (_url, { signal }) =>
          new Response(
            new ReadableStream({
              start(controller) {
                signal.addEventListener(
                  "abort",
                  () => controller.error(signal.reason),
                  { once: true },
                );
              },
            }),
            { headers: { "Content-Type": "text/event-stream" } },
          ),
      });
      const response = await client({ stream: true }, caller.signal);
      if (cancel) caller.abort();
      await assert.rejects(
        readAIText(response.body, () => {}),
        {
          code: cancel ? "AI_CANCELLED" : "AI_TIMEOUT",
        },
      );
    }
  } finally {
    clearTimeout(keepAlive);
  }
});
