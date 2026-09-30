import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { startAuthApp, cookieClient } from "./helpers/auth-app.mjs";
import { questionById } from "../src/lib/learning/question-bank.ts";
const app = await startAuthApp({ withLearning: true });
const a = cookieClient(app.base),
  b = cookieClient(app.base);
const headers = { origin: app.base, "Content-Type": "application/json" };
const credentials = {
  email: "immediate-release@example.test",
  password: "Local-test-password-only!",
};
const post = (client, path, body) =>
  client(path, { method: "POST", headers, body: JSON.stringify(body) });
const json = async (response, status = 200) => {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
};
let learning, browser;
const send = async (action) =>
  (learning = await json(
    await post(a, "/api/learning", {
      version: learning.version,
      requestId: randomUUID(),
      action,
    }),
  ));
async function profile(client) {
  const form = new FormData();
  form.set("version", "0");
  form.set(
    "profile",
    JSON.stringify({
      displayName: "Тестер",
      goal: "Создать API на Python",
      interests: "музыка",
      dailyMinutes: 30,
      onboardingComplete: true,
    }),
  );
  await json(
    await client("/api/profile", {
      method: "PUT",
      headers: { origin: app.base },
      body: form,
    }),
  );
}
try {
  await json(await post(a, "/api/auth", { action: "signup", ...credentials }));
  await profile(a);
  await json(
    await a("/api/goals", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        summary: "Создать backend API на Python",
        success_criteria: ["API возвращает список записей"],
        target_date: null,
        version: 0,
        requestId: randomUUID(),
      }),
    }),
  );
  learning = await json(await a("/api/learning"));
  await send({ type: "start_diagnostic" });
  for (let i = 0; i < 9; i++) await send({ type: "answer", answer: "" });
  await send({
    type: "start_lesson",
    mode: "learn",
    teacher: "prepared",
    minutes: 5,
  });
  const session_id = learning.state.activeSession;
  await json(
    await post(a, "/api/learning", {
      version: learning.version,
      requestId: randomUUID(),
      action: { type: "session_feedback", session_id, helpful: true, note: "" },
    }),
    422,
  );
  await send({ type: "finish_theory" });
  await send({
    type: "answer",
    answer: questionById(learning.question.id).answers[0],
  });
  await send({ type: "next" });
  await send({
    type: "finish_project",
    reflection: "Проверю пустой список и список с двумя элементами.",
  });
  const evidence = learning.state.evidence;
  const envelope = {
    version: learning.version,
    requestId: randomUUID(),
    action: {
      type: "session_feedback",
      session_id,
      helpful: false,
      note: "Нужен ещё один пример",
    },
  };
  learning = await json(await post(a, "/api/learning", envelope));
  const duplicate = await json(await post(a, "/api/learning", envelope));
  assert.deepEqual(
    duplicate.state.sessionFeedback,
    learning.state.sessionFeedback,
  );
  assert.equal(duplicate.version, learning.version);
  await json(
    await post(a, "/api/learning", { ...envelope, requestId: randomUUID() }),
    409,
  );
  await send({
    type: "session_feedback",
    session_id,
    helpful: true,
    note: "Разобрался после практики",
  });
  assert.equal(learning.state.sessionFeedback.length, 1);
  assert.deepEqual(learning.state.evidence, evidence);
  const audit = await app.learning.db.query(
    await readFile(
      new URL("../supabase/checks/stages35-39.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(Number(audit.rows[0].feedback_count), 1);
  for (const key of [
    "invalid_ratings",
    "invalid_metadata",
    "missing_completed_sessions",
    "duplicate_session_feedback",
  ])
    assert.equal(Number(audit.rows[0][key]), 0, key);
  await a("/auth/logout", { method: "POST", headers });
  await json(await post(a, "/api/learning", envelope), 401);
  await json(await post(a, "/api/auth", { action: "login", ...credentials }));
  assert.deepEqual(
    (await json(await a("/api/learning"))).state.sessionFeedback,
    learning.state.sessionFeedback,
  );
  await json(
    await post(b, "/api/auth", {
      action: "signup",
      email: "immediate-release-other@example.test",
      password: credentials.password,
    }),
  );
  await profile(b);
  const foreign = await json(await b("/api/learning"));
  assert.deepEqual(foreign.state.sessionFeedback, []);
  await json(
    await post(b, "/api/learning", { ...envelope, version: foreign.version }),
    422,
  );
  const owner = app.users.get(credentials.email).user.id;
  const stranger = app.users.get("immediate-release-other@example.test").user
    .id;
  const invisible = await app.learning.asUser(stranger, (db) =>
    db.query(
      "select data->'sessionFeedback' from public.learning_states where user_id=$1",
      [owner],
    ),
  );
  assert.equal(invisible.rows.length, 0);
  await assert.rejects(
    app.learning.asUser(owner, (db) =>
      db.query("update public.learning_states set data='{}' where user_id=$1", [
        owner,
      ]),
    ),
  );
  console.log(
    "PASS stage35 HTTP+SQL: real persistence, session ownership, RLS, retries, stale version, relogin, unchanged evidence",
  );

  if (process.argv.includes("--browser")) {
    const { chromium } = await import("playwright");
    const { expect: baseExpect } = await import("playwright/test");
    const expect = baseExpect.configure({ timeout: 25000 });
    browser = await chromium.launch({
      executablePath: process.env.APORIA_BROWSER_EXECUTABLE || undefined,
    });
    await mkdir("docs/previews", { recursive: true });
    for (const [name, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      page.setDefaultNavigationTimeout(90000);
      const errors = [];
      let expectedFailure = false;
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (
          m.type() === "error" &&
          !(expectedFailure && m.text().includes("503"))
        )
          errors.push(m.text());
      });
      await page.goto(app.base);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Python backend",
      );
      await expect(page.locator(".landing-journey li")).toHaveCount(5);
      const start = page.getByRole("link", { name: "Начать обучение" }).first();
      await expect(start).toHaveAttribute("href", "/signup");
      await start.focus();
      await expect(start).toBeFocused();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `docs/previews/stages35-39-landing-${name}.png`,
        fullPage: true,
      });
      await context.request.post(app.base + "/api/auth", {
        headers,
        data: { action: "login", ...credentials },
      });
      await page.goto(app.base + "/learn");
      const feedback = page.getByRole("region", { name: "Отзыв о занятии" });
      await expect(
        feedback.getByRole("button", { name: "Да, полезно" }),
      ).toHaveAttribute("aria-pressed", "true");
      await feedback.getByRole("textbox").fill("");
      await feedback
        .getByRole("button", { name: "Не очень", exact: true })
        .click();
      await expect(feedback.getByRole("status")).toContainText(
        "Отзыв сохранён",
      );
      await feedback.getByRole("textbox").fill("Не хватило примера " + name);
      await expect(feedback.getByRole("status")).toContainText(
        "ещё не сохранён",
      );
      expectedFailure = true;
      await page.route("**/api/learning", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Не удалось сохранить. Попробуй ещё раз.",
          }),
        }),
      );
      await feedback
        .getByRole("button", { name: "Сохранить комментарий" })
        .click();
      await expect(feedback.getByRole("status")).toContainText(
        "Отзыв не сохранён",
      );
      await expect(feedback.getByRole("textbox")).toHaveValue(
        "Не хватило примера " + name,
      );
      await page.unroute("**/api/learning");
      expectedFailure = false;
      await feedback
        .getByRole("button", { name: "Сохранить комментарий" })
        .click();
      await expect(feedback.getByRole("status")).toContainText(
        "Отзыв сохранён",
      );
      await page.reload();
      await expect(feedback.getByRole("textbox")).toHaveValue(
        "Не хватило примера " + name,
      );
      await page.goto(app.base + `/progress/sessions/${session_id}`);
      await expect(
        page
          .getByRole("region", { name: "Отзыв о занятии" })
          .getByRole("textbox"),
      ).toHaveValue("Не хватило примера " + name);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `docs/previews/stages35-39-feedback-${name}.png`,
        fullPage: true,
      });
      // Restore the positive rating so both viewport runs start from the same state.
      await page.getByRole("button", { name: "Да, полезно" }).click();
      await expect(
        page
          .getByRole("region", { name: "Отзыв о занятии" })
          .getByRole("status"),
      ).toContainText("Отзыв сохранён");
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS stage35-36 browser: desktop/mobile landing, CTA, keyboard, feedback edit/reload/history, zero page/console errors, no overflow",
    );
  }
} catch (error) {
  console.error(app.logs());
  throw error;
} finally {
  await browser?.close();
  await app.close();
}
