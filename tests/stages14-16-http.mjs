import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { startAuthApp, cookieClient } from "./helpers/auth-app.mjs";
import { defaultRoadmap } from "../src/lib/roadmaps/derive.ts";
const app = await startAuthApp({
  withAI: true,
  withLearning: true,
  aiTimeoutMs: 800,
});
const request = cookieClient(app.base),
  headers = { origin: app.base, "Content-Type": "application/json" };
const credentials = {
  email: "immediate-lessons@example.test",
  password: "Test-password-2026!",
};
const post = (path, data, method = "POST") =>
  request(path, { method, headers, body: JSON.stringify(data) });
const json = async (r, status = 200) => {
  assert.equal(r.status, status, await r.clone().text());
  return r.json();
};
let learning, browser;
const envelope = (action) => ({
  version: learning.version,
  requestId: randomUUID(),
  action,
});
const send = async (action) => {
  const body = envelope(action);
  learning = await json(await post("/api/learning", body));
  return body;
};
const current = () =>
  learning.state.sessions.find((s) => s.id === learning.state.activeSession);
const start = {
  type: "start_lesson",
  minutes: 5,
  mode: "learn",
  teacher: "ai",
};
try {
  await json(await post("/api/auth", { action: "signup", ...credentials }));
  learning = await json(await request("/api/learning"));
  await json(await post("/api/learning", envelope(start)), 422);
  const form = new FormData();
  form.set(
    "profile",
    JSON.stringify({
      displayName: "Sinon",
      goal: "Создать API музыки",
      notes: "Учусь короткими подходами",
      dailyMinutes: 30,
      onboardingComplete: true,
    }),
  );
  form.set("version", "0");
  await json(
    await request("/api/profile", {
      method: "PUT",
      headers: { origin: app.base },
      body: form,
    }),
  );
  await json(
    await post(
      "/api/goals",
      {
        summary: "Создать API музыки на Python",
        success_criteria: ["Список треков доступен через API"],
        target_date: null,
        version: 0,
        requestId: randomUUID(),
      },
      "PUT",
    ),
  );
  await send({ type: "start_diagnostic" });
  for (let i = 0; i < 9; i++) await send({ type: "answer", answer: "" });
  await json(
    await post(
      "/api/roadmap",
      { ...defaultRoadmap(), version: 0, requestId: randomUUID() },
      "PUT",
    ),
  );
  for (const [mode, status] of [
    ["malformed", 502],
    ["unavailable", 503],
    ["timeout", 504],
  ]) {
    app.controls.aiMode = mode;
    const version = learning.version;
    const failure = await json(
      await post("/api/learning", envelope(start)),
      status,
    );
    assert.ok(!JSON.stringify(failure).includes("PRIVATE_PROVIDER_DETAIL"));
    learning = await json(await request("/api/learning"));
    assert.equal(learning.version, version);
    assert.equal(learning.state.activeSession, null);
  }
  app.controls.aiMode = "success";
  app.controls.aiAllowed = false;
  await json(await post("/api/learning", envelope(start)), 429);
  app.controls.aiAllowed = true;
  app.controls.teacherCandidate = {
    explanation: "The answer is 42",
    reflection: "test",
  };
  await json(await post("/api/learning", envelope(start)), 502);
  app.controls.teacherCandidate = {
    explanation: "analogy",
    reflection: "test",
  };
  const started = await send(start),
    calls = app.controls.aiRequests.length,
    id = current().id;
  assert.equal(current().lesson.phase, "theory");
  assert.equal(current().lesson.teacher.source, "ai");
  assert.equal(current().lesson.plan.estimated_time, 5);
  const ctx = JSON.parse(app.controls.aiRequests.at(-1).input);
  for (const field of [
    "memory",
    "goal",
    "skill",
    "mastery",
    "past_errors",
    "available_time",
    "project",
  ])
    assert.ok(field in ctx, field);
  assert.equal(ctx.available_time, 5);
  assert.match(JSON.stringify(ctx.memory.profile), /короткими подходами/);
  assert.equal(
    (await json(await post("/api/learning", started))).version,
    learning.version,
  );
  assert.equal(app.controls.aiRequests.length, calls);
  await json(
    await post("/api/learning", envelope({ type: "answer", answer: "42" })),
    422,
  );
  await json(
    await post(
      "/api/learning",
      envelope({
        type: "finish_project",
        reflection: "Пропустить практику и сразу закончить",
      }),
    ),
    422,
  );
  await send({ type: "finish_theory" });
  const oldVersion = learning.version;
  const wrong = await send({ type: "answer", answer: "" });
  assert.equal(current().stage, 1);
  assert.equal(learning.solution, null);
  learning = await json(await post("/api/learning", wrong));
  assert.equal(current().attempts.length, 1);
  await json(
    await post("/api/learning", {
      version: oldVersion,
      requestId: randomUUID(),
      action: { type: "hint" },
    }),
    409,
  );
  await json(
    await post("/api/learning", envelope({ type: "hint", stage: 5 })),
    400,
  );
  await request("/auth/logout", { method: "POST", headers });
  await json(await request("/api/learning"), 401);
  await json(await post("/api/auth", { action: "login", ...credentials }));
  learning = await json(await request("/api/learning"));
  assert.equal(current().id, id);
  assert.equal(current().stage, 1);
  for (let stage = 2; stage <= 5; stage++) {
    await send({ type: "answer", answer: "" });
    assert.equal(current().stage, stage);
    if (stage < 5) assert.equal(learning.solution, null);
  }
  await send({ type: "answer", answer: "" });
  const evidence = learning.state.evidence.filter((e) => e.sessionId === id);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].independence, 0);
  assert.equal(evidence[0].hints_used, 5);
  await send({ type: "next" });
  assert.equal(current().lesson.phase, "project");
  const before = learning.state.evidence;
  await send({
    type: "finish_project",
    reflection: "Проверю, что пользователь без треков получает пустой массив.",
  });
  assert.equal(learning.state.activeSession, null);
  assert.deepEqual(learning.state.evidence, before);
  const row = (
    await app.learning.db.query(
      "select * from public.learning_sessions where id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(row.status, "completed");
  assert.equal(row.hints_used, 5);
  const other = cookieClient(app.base);
  await other("/api/auth", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "signup",
      ...credentials,
      email: "immediate-lessons-b@example.test",
    }),
  });
  assert.equal(
    (await json(await other("/api/learning"))).state.sessions.length,
    0,
  );
  console.log(
    "PASS lessons HTTP: prerequisites, real route + local AI/SQL, context, errors, retries, phase persistence, teaching ladder, single evidence, isolation",
  );
  if (process.argv.includes("--browser")) {
    const { chromium } = await import("playwright");
    const { expect: baseExpect } = await import("playwright/test");
    const expect = baseExpect.configure({ timeout: 25000 });
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.APORIA_BROWSER_EXECUTABLE || undefined,
      args: ["--disable-dev-shm-usage"],
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
      await context.request.post(app.base + "/api/auth", {
        headers,
        data: { action: "login", ...credentials },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      page.setDefaultNavigationTimeout(90000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(app.base + "/learn");
      await page.getByLabel("Сколько времени есть сейчас?").selectOption("5");
      await page
        .getByRole("combobox", { name: /Объяснение/ })
        .selectOption(name === "desktop" ? "ai" : "prepared");
      await page
        .getByRole("button", { name: "Начать занятие", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Одна идея перед практикой" }),
      ).toBeVisible();
      await page.reload();
      await expect(page.locator('[aria-current="step"]')).toContainText(
        "Теория",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `docs/previews/stage15-theory-${name}.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Перейти к задаче" }).click();
      for (let stage = 1; stage <= 5; stage++) {
        await page
          .getByRole("button", { name: "Пока не знаю", exact: true })
          .click();
        await expect(page.locator(".teaching-bar")).toContainText(
          [
            "",
            "HINT_1",
            "HINT_2",
            "EXPLAIN",
            "PARTIAL_SOLUTION",
            "FULL_SOLUTION",
          ][stage],
        );
      }
      await page.reload();
      await expect(page.locator(".teaching-bar")).toContainText(
        "FULL_SOLUTION",
      );
      await page.screenshot({
        path: `docs/previews/stage16-hints-${name}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Пока не знаю", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Перейти к применению", exact: true })
        .click();
      await page
        .getByLabel("Код или объяснение применения")
        .fill(
          "Проверю, что API возвращает пустой массив для пользователя без треков.",
        );
      await page
        .getByRole("button", { name: "Завершить занятие", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Есть шаг вперёд." }),
      ).toBeVisible();
      await page.goto(app.base + "/progress");
      await page
        .locator(".history-item")
        .first()
        .locator(":scope > summary")
        .click();
      await expect(
        page
          .locator(".history-item")
          .first()
          .getByText(
            "Проверю, что API возвращает пустой массив для пользователя без треков.",
            { exact: true },
          ),
      ).toBeVisible();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `PASS lessons browser ${name}: AI/prepared → theory → wrong answers → reload → application → history; no errors or overflow`,
      );
    }
  }
} catch (error) {
  console.error(app.logs());
  throw error;
} finally {
  await browser?.close();
  await app.close();
}
