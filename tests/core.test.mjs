import assert from "node:assert/strict";
import test from "node:test";
import { readSSE } from "../src/lib/ai/events.ts";
import { safeNext, isSameOrigin } from "../src/lib/auth/request.ts";
import { profileSchema, validateAvatar } from "../src/lib/profile/schema.ts";

function streamBytes(input, chunkSize) {
  const bytes = new TextEncoder().encode(input);
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize)
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
      controller.close();
    },
  });
}
test("SSE preserves Cyrillic split inside UTF-8 characters and CRLF boundaries", async () => {
  const events = [];
  for await (const event of readSSE(
    streamBytes(
      'event: message\r\ndata: {"type":"response.output_text.delta","delta":"Привет 🌌"}\r\n\r\ndata: {"type":"response.completed"}\n\ndata: [DONE]\n\n',
      1,
    ),
  ))
    events.push(event);
  assert.equal(events[0].delta, "Привет 🌌");
  assert.equal(events[1].type, "response.completed");
  assert.equal(events.length, 2);
});
test("SSE fails on truncated or invalid events instead of reporting completion", async () => {
  await assert.rejects(async () => {
    for await (const event of readSSE(
      streamBytes('data: {"type":"response.completed"}', 3),
    ))
      void event;
  }, /Incomplete/);
  await assert.rejects(async () => {
    for await (const event of readSSE(streamBytes("data: invalid\n\n", 3)))
      void event;
  }, SyntaxError);
});
test("auth redirects reject external URLs, protocol-relative URLs, and encoded paths", () => {
  for (const unsafe of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/dashboard?next=https://evil.example",
  ])
    assert.equal(safeNext(unsafe), "/dashboard");
  assert.equal(safeNext("/onboarding"), "/onboarding");
});
test("mutations fail closed for missing or foreign origins", () => {
  assert.equal(
    isSameOrigin(new Request("https://aporia.example/api/profile")),
    false,
  );
  assert.equal(
    isSameOrigin(
      new Request("https://aporia.example/api/profile", {
        headers: { origin: "https://evil.example" },
      }),
    ),
    false,
  );
  assert.equal(
    isSameOrigin(
      new Request("https://aporia.example/api/profile", {
        headers: { origin: "https://aporia.example" },
      }),
    ),
    true,
  );
});
test("profile rejects invalid time, excessive data and unknown avatar choices", () => {
  for (const input of [
    { dailyMinutes: 0 },
    { dailyMinutes: NaN },
    { dailyMinutes: 121 },
    { displayName: "a".repeat(61) },
    { avatarPreset: "javascript:alert(1)" },
  ])
    assert.equal(profileSchema.safeParse(input).success, false);
  assert.equal(
    profileSchema.parse({ displayName: "  Лена  ", admin: true }).displayName,
    "Лена",
  );
  assert.equal(
    Object.hasOwn(profileSchema.parse({ admin: true }), "admin"),
    false,
  );
});
test("avatar upload rejects SVG, empty files and oversized files", () => {
  assert.ok(validateAvatar({ type: "image/svg+xml", size: 100 }));
  assert.ok(validateAvatar({ type: "image/jpeg", size: 0 }));
  assert.ok(validateAvatar({ type: "image/png", size: 6 * 1024 * 1024 }));
  assert.equal(validateAvatar({ type: "image/webp", size: 10000 }), null);
});

test("completed profiles require a real name and goal", () => {
  assert.equal(
    profileSchema.safeParse({
      onboardingComplete: true,
      displayName: "  ",
      goal: "  ",
    }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      onboardingComplete: true,
      displayName: "Лена",
      goal: "Создать API",
    }).success,
    true,
  );
});
