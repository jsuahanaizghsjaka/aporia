import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startAuthApp, cookieClient } from "./helpers/auth-app.mjs";
import { updates, statement } from "./helpers/onboarding-data.mjs";
import { readChatResponse } from "../src/lib/ai/chat-stream.ts";
const app = await startAuthApp({ withAI: true }),
  request = cookieClient(app.base),
  headers = { origin: app.base, "Content-Type": "application/json" };
const creds = {
  email: "immediate-onboarding@example.test",
  password: "Test-password-2026!",
};
const auth = (action) =>
  request("/api/auth", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...creds }),
  });
const send = (text, id = randomUUID()) =>
  request("/api/mentor", {
    method: "POST",
    headers,
    body: JSON.stringify({
      conversation: "onboarding",
      content: text,
      requestId: id,
    }),
  });
async function read(res) {
  let snapshot;
  const text = await readChatResponse(
    res,
    () => {},
    (s) => (snapshot = s),
  );
  return { text, snapshot };
}
try {
  assert.equal((await send("До входа")).status, 401);
  assert.equal((await auth("signup")).status, 200);
  const owner = app.users.get(creds.email).user.id;
  assert.deepEqual(app.profiles.get(owner).data, {});
  app.controls.onboardingAction = {
    name: "finish_onboarding",
    reply: "Готово",
    updates: updates.slice(0, 2),
  };
  const first = await read(await send(statement));
  assert.equal(first.snapshot.ready, false);
  assert.equal(first.snapshot.missing.length, 9);
  assert.equal(app.profiles.get(owner).version, 0);
  await request("/auth/logout", { method: "POST", headers });
  await auth("login");
  const history = await (
    await request("/api/mentor?conversation=onboarding")
  ).json();
  assert.equal(history.onboarding.missing.length, 9);
  app.controls.onboardingAction = {
    name: "finish_onboarding",
    reply: "Проверь итог.",
    updates: updates.slice(2),
  };
  const finalId = randomUUID(),
    finish = await read(await send(statement, finalId));
  assert.equal(finish.snapshot.ready, true);
  assert.equal(app.profiles.get(owner).version, 0);
  const before = app.controls.aiRequests.length,
    quota = app.controls.aiLimitCalls;
  app.controls.aiAllowed = false;
  assert.equal(
    (await read(await send(statement, finalId))).snapshot.ready,
    true,
  );
  assert.equal(app.controls.aiRequests.length, before);
  assert.equal(app.controls.aiLimitCalls, quota);
  app.controls.aiAllowed = true;
  assert.equal(
    (await request("/api/onboarding/extract", { method: "POST", headers }))
      .status,
    200,
  );
  assert.equal(app.controls.aiRequests.length, before);
  app.controls.aiMode = "stream-quota";
  const beforeStreamFailure = app.messages.filter(
    (m) => m.role === "assistant",
  ).length;
  await assert.rejects(
    read(await send("Тест лимита внутри потока")),
    (error) => {
      assert.equal(error.retryable, false);
      assert.match(error.message, /Лимит сервиса AI исчерпан/);
      assert.doesNotMatch(error.message, /PRIVATE_PROVIDER_DETAIL/);
      return true;
    },
  );
  assert.equal(
    app.messages.filter((m) => m.role === "assistant").length,
    beforeStreamFailure,
  );
  app.controls.aiMode = "success";
  app.controls.onboardingAction = {
    name: "record_onboarding",
    reply: "Уточню.",
    updates: [],
  };
  for (const [mode, status] of [
    ["rate", 429],
    ["quota", 503],
    ["access", 503],
    ["timeout", 504],
    ["wrong-type", 502],
  ]) {
    app.controls.aiMode = mode;
    const id = randomUUID(),
      res = await send(mode, id);
    assert.equal(res.status, status, mode);
    if (mode === "rate") assert.equal(res.headers.get("retry-after"), "2");
    assert.doesNotMatch(
      await res.text(),
      /PRIVATE_PROVIDER_DETAIL|sk-local-test-only/,
    );
    app.controls.aiMode = "success";
    await read(await send(mode, id));
    assert.equal(app.messages.filter((m) => m.request_id === id).length, 2);
  }
  for (const mode of ["incomplete", "empty", "malformed"]) {
    app.controls.aiMode = mode;
    const id = randomUUID();
    await assert.rejects(read(await send(mode, id)));
    assert.equal(
      app.messages.filter((m) => m.request_id === id && m.role === "assistant")
        .length,
      0,
    );
  }
  app.controls.aiMode = "success";
  app.controls.messageWriteFailure = "assistant";
  const id = randomUUID();
  await assert.rejects(read(await send("Сбой записи", id)));
  assert.equal(
    app.messages.filter((m) => m.request_id === id && m.role === "assistant")
      .length,
    0,
  );
  app.controls.messageWriteFailure = "";
  await read(await send("Сбой записи", id));
  const form = new FormData();
  form.set("version", "0");
  form.set(
    "profile",
    JSON.stringify({
      ...finish.snapshot.candidate,
      goal: "Исправленная цель Python",
      onboardingComplete: true,
    }),
  );
  assert.equal(
    (
      await request("/api/profile", {
        method: "PUT",
        headers: { origin: app.base },
        body: form,
      })
    ).status,
    200,
  );
  await request("/auth/logout", { method: "POST", headers });
  assert.equal((await (await auth("login")).json()).next, "/dashboard");
  const other = cookieClient(app.base);
  await other("/api/auth", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "signup",
      ...creds,
      email: "immediate-isolated@example.test",
    }),
  });
  assert.deepEqual(
    (await (await other("/api/mentor?conversation=onboarding")).json())
      .messages,
    [],
  );
  assert.doesNotMatch(app.logs(), /PRIVATE_PROVIDER_DETAIL|sk-local-test-only/);
  console.log(
    "PASS stage 6 HTTP: early finish, missing topics/relogin, proposal without profile write, cached retry, errors, explicit confirmation and isolation.",
  );
} catch (error) {
  console.error(app.logs());
  throw error;
} finally {
  await app.close();
}
