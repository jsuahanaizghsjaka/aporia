import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyOnboarding,
  applyOnboardingAction,
  missingOnboarding,
  readOnboardingState,
  reviewOnboarding,
} from "../src/lib/onboarding/ai-state.ts";
import { readOnboardingResponse } from "../src/lib/ai/onboarding-stream.ts";
import { readChatResponse } from "../src/lib/ai/chat-stream.ts";
import { createAIClient } from "../src/lib/ai/client.ts";
import { publicAIError } from "../src/lib/ai/errors.ts";
import { updates, statement } from "./helpers/onboarding-data.mjs";
const action = (list = updates) => ({ reply: "Проверь итог.", updates: list });
function stream(name, list = updates, output) {
  const frames = [
    { type: "response.output_text.delta", delta: "Проверь итог." },
    {
      type: "response.completed",
      response: {
        status: "completed",
        output: output ?? [
          {
            type: "function_call",
            status: "completed",
            name,
            arguments: JSON.stringify(action(list)),
          },
        ],
      },
    },
  ];
  return new Response(
    frames.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join(""),
  ).body;
}
test("all topics are explicit, immutable and distinct from profile confirmation", () => {
  const start = emptyOnboarding(),
    next = applyOnboardingAction(start, action(updates.slice(0, 2)), [
      statement,
    ]);
  assert.equal(missingOnboarding(start).length, 11);
  assert.equal(missingOnboarding(next.state).length, 9);
  assert.equal(next.review.ready, false);
  assert.equal(next.review.candidate.onboardingComplete, undefined);
  assert.equal(next.review.candidate.mastery, undefined);
});
test("only explicit optional skips resolve unknowns; name and goal cannot be skipped", () => {
  const skipped = updates.map((u) =>
    ["displayName", "goal"].includes(u.field)
      ? u
      : {
          ...u,
          status: "skipped",
          value: "",
          evidence: "Пропускаю личные темы",
        },
  );
  const next = applyOnboardingAction(emptyOnboarding(), action(skipped), [
    statement,
    "Пропускаю личные темы",
  ]);
  assert.deepEqual(missingOnboarding(next.state), []);
  assert.equal(next.review.candidate.dailyMinutes, 25);
  assert.equal(next.review.candidate.currentProjects, "");
  assert.throws(() =>
    applyOnboardingAction(
      emptyOnboarding(),
      action([{ ...updates[0], status: "skipped", value: "" }]),
      [statement],
    ),
  );
});
test("ungrounded facts, duplicate updates, excessive text and invalid minutes are rejected", () => {
  for (const list of [
    [{ ...updates[0], evidence: "Не говорил" }],
    [{ ...updates[0], field: "mastery" }],
    [updates[0], updates[0]],
    [{ ...updates[0], value: "x".repeat(61) }],
    [{ ...updates[9], value: "121" }],
  ])
    assert.throws(() =>
      applyOnboardingAction(emptyOnboarding(), action(list), [statement]),
    );
});
test("corrections and missing topics survive draft serialization", () => {
  const first = applyOnboardingAction(
    emptyOnboarding(),
    action(updates.slice(0, 2)),
    [statement],
  );
  const next = applyOnboardingAction(
    readOnboardingState(JSON.parse(JSON.stringify(first.state))),
    action([
      { ...updates[1], value: "API библиотеки", evidence: "API библиотеки" },
    ]),
    ["Хочу API библиотеки"],
  );
  assert.equal(next.review.candidate.goal, "API библиотеки");
  assert.equal(next.review.missing.length, 9);
});
test("finish cannot override missing fields; record never silently finishes", async () => {
  const early = await readOnboardingResponse(
    stream("finish_onboarding", updates.slice(0, 2)),
    emptyOnboarding(),
    [statement],
    () => {},
  );
  assert.equal(early.review.ready, false);
  assert.match(early.text, /До итога/);
  const done = await readOnboardingResponse(
    stream("finish_onboarding"),
    emptyOnboarding(),
    [statement],
    () => {},
  );
  assert.equal(done.review.ready, true);
  assert.equal(reviewOnboarding(readOnboardingState(done.state)).ready, true);
  const record = await readOnboardingResponse(
    stream("record_onboarding"),
    emptyOnboarding(),
    [statement],
    () => {},
  );
  assert.equal(record.review.ready, false);
});
test("invalid, missing and duplicate function calls fail closed", async () => {
  const call = {
    type: "function_call",
    status: "completed",
    name: "finish_onboarding",
    arguments: JSON.stringify(action()),
  };
  for (const body of [
    stream("delete_account"),
    stream("finish_onboarding", updates, []),
    stream("finish_onboarding", updates, [call, call]),
    new Response("data: {invalid}\n\n").body,
  ])
    await assert.rejects(
      readOnboardingResponse(body, emptyOnboarding(), [statement], () => {}),
      { code: "AI_INVALID_RESPONSE" },
    );
});
test("proposal is exposed to browser only after a complete valid saved response", async () => {
  const proposal = reviewOnboarding(emptyOnboarding());
  const text =
    JSON.stringify({ type: "delta", text: "Итог" }) +
    "\n" +
    JSON.stringify({ type: "done", onboarding: proposal }) +
    "\n";
  const seen = [],
    response = (t) =>
      new Response(t, { headers: { "Content-Type": "application/x-ndjson" } });
  await readChatResponse(
    response(text),
    () => {},
    (s) => seen.push(s),
  );
  assert.deepEqual(seen, [proposal]);
  await assert.rejects(
    readChatResponse(
      response(text + "broken"),
      () => {},
      (s) => seen.push(s),
    ),
  );
  assert.equal(seen.length, 1);
});
test("provider errors stay sanitized; model and key remain server-side", async () => {
  for (const [status, code, expected] of [
    [429, "insufficient_quota", "AI_QUOTA"],
    [429, "rate_limit_exceeded", "AI_RATE_LIMIT"],
    [401, "invalid_api_key", "AI_ACCESS"],
  ]) {
    const client = createAIClient({
      apiKey: "sk-sentinel",
      model: "server-model",
      fetch: async (_url, init) => {
        assert.equal(JSON.parse(init.body).model, "server-model");
        assert.equal(JSON.parse(init.body).store, false);
        assert.ok(!init.body.includes("sk-sentinel"));
        return Response.json(
          { error: { code, message: "private-sentinel" } },
          { status, headers: { "Retry-After": "2" } },
        );
      },
    });
    await assert.rejects(client({ model: "untrusted", store: true }), (e) => {
      assert.equal(e.code, expected);
      assert.doesNotMatch(
        JSON.stringify(publicAIError(e)),
        /private-sentinel|sk-sentinel/,
      );
      return true;
    });
  }
});
