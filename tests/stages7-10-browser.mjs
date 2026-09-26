import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { expect as baseExpect } from "playwright/test";
import { startAuthApp } from "./helpers/auth-app.mjs";
const expect = baseExpect.configure({ timeout: 25000 }),
  app = await startAuthApp({
    withAI: true,
    withLearning: true,
    aiTimeoutMs: 5000,
  });
let browser, page;
await mkdir("docs/previews", { recursive: true });
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.APORIA_BROWSER_EXECUTABLE || undefined,
    args: ["--disable-dev-shm-usage"],
  });
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      isMobile: name === "mobile",
      hasTouch: name === "mobile",
    });
    page = await context.newPage();
    page.setDefaultTimeout(25000);
    page.setDefaultNavigationTimeout(90000);
    const errors = [];
    let expectedFailure = false;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !expectedFailure) errors.push(m.text());
    });
    const creds = {
        email: `immediate-browser-${name}@example.test`,
        password: "Test-password-2026!",
      },
      headers = { origin: app.base };
    let res = await context.request.post(app.base + "/api/auth", {
      headers,
      data: { action: "signup", ...creds },
    });
    assert.equal(res.status(), 200);
    const owner = app.users.get(creds.email).user.id;
    // Stage 6 browser suite covers Lesson 0. This suite starts with its confirmed result.
    res = await context.request.put(app.base + "/api/profile", {
      headers,
      multipart: {
        profile: JSON.stringify({
          displayName: "Sinon",
          goal: "Изучить Python backend",
          onboardingComplete: true,
        }),
        version: "0",
      },
    });
    assert.equal(res.status(), 200);
    app.messages.push({
      id: randomUUID(),
      user_id: owner,
      role: "user",
      conversation: "onboarding",
      content: "Я учусь и работаю, 6 часов в неделю, люблю музыку.",
      request_id: randomUUID(),
      created_at: new Date().toISOString(),
    });
    app.controls.memoryCandidate = {
      name: "Sinon",
      occupation: "Разработчик",
      education: "Самостоятельно",
      goal_summary: "Изучить Python backend",
      weekly_available_hours: 6,
      interests: ["Музыка"],
      hobbies: ["Бег"],
      learning_preferences: ["Короткие задачи"],
      preferred_session_length: 30,
      notes: "Работаю вечером",
    };
    await page.goto(app.base + "/profile");
    await page
      .getByRole("button", {
        name: "Уточнить профиль из знакомства",
        exact: true,
      })
      .click();
    await expect(page.locator(".memory-review")).toContainText("Разработчик");
    assert.equal(app.profiles.get(owner).version, 1);
    await page
      .getByRole("button", { name: "Перенести в форму для проверки" })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Работа", exact: true }),
    ).toHaveValue("Разработчик");
    await page
      .getByRole("button", { name: "Очистить: образование", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Заметки для ментора", exact: true })
      .fill("Люблю короткие задания");
    await page
      .getByRole("button", { name: "Сохранить изменения", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Изменения сохранены" }),
    ).toBeVisible();
    assert.equal(app.profiles.get(owner).data.education, "");
    const goal = page.locator("#goal");
    app.controls.goalCandidate = {
      summary: "Создать музыкальный API на Python",
      success_criteria: [
        "Добавление и чтение плейлистов",
        "Тесты доступа проходят",
      ],
      target_date: "2026-10-30",
    };
    await goal
      .getByRole("button", { name: "Уточнить цель с AI", exact: true })
      .click();
    await expect(goal.getByRole("status")).toContainText("ещё не сохранено");
    assert.equal(
      (
        await app.learning.db.query(
          "select count(*) n from public.goals where user_id=$1",
          [owner],
        )
      ).rows[0].n,
      0,
    );
    await goal
      .getByRole("textbox", { name: "Измеримый результат", exact: true })
      .fill("Создать API плейлистов на Python");
    await goal.locator("input[type=date]").fill("2026-11-01");
    expectedFailure = true;
    await page.route("**/api/goals", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Сеть недоступна. Повтори попытку." }),
        });
      } else await route.continue();
    });
    await goal
      .getByRole("button", { name: "Подтвердить цель", exact: true })
      .click();
    await expect(goal.getByRole("alert")).toContainText("Сеть недоступна");
    await expect(
      goal.getByRole("textbox", { name: "Измеримый результат", exact: true }),
    ).toHaveValue("Создать API плейлистов на Python");
    await page.unroute("**/api/goals");
    const save = page.waitForResponse(
      (r) => r.url().endsWith("/api/goals") && r.request().method() === "PUT",
    );
    await goal
      .getByRole("button", { name: "Подтвердить цель", exact: true })
      .click();
    assert.equal((await save).status(), 200);
    await expect(goal.getByRole("alert")).toHaveCount(0);
    expectedFailure = false;
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Заметки для ментора", exact: true }),
    ).toHaveValue("Люблю короткие задания");
    await expect(
      goal.getByRole("textbox", { name: "Измеримый результат", exact: true }),
    ).toHaveValue("Создать API плейлистов на Python");
    await goal.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/previews/stage8-goal-${name}.png` });
    await page.goto(app.base + "/diagnostic");
    await page
      .getByRole("button", { name: "Начать диагностику", exact: true })
      .click();
    for (let i = 0; i < 9; i++) {
      await expect(page.locator(".exercise-meta")).toContainText(
        `${i + 1} / 9`,
      );
      const current = await (
        await context.request.get(app.base + "/api/learning")
      ).json();
      const q = current.question;
      // Answers are test-owned fixtures; no answer keys are read by the browser app.
      const { questionById } =
        await import("../src/lib/learning/question-bank.ts");
      const answer =
        q.kind === "coding"
          ? "def double(n):\n    return n + n"
          : questionById(q.id).answers[0];
      if (q.choices) {
        await page
          .locator(".answer-options label")
          .filter({ has: page.locator("input") })
          .filter({ hasText: answer })
          .first()
          .click();
      } else if (q.kind === "coding")
        await page
          .getByRole("textbox", { name: "Твой код", exact: true })
          .fill(answer);
      else
        await page
          .getByRole("textbox", { name: "Твой ответ", exact: true })
          .fill(answer);
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/learning") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Ответить", exact: true }).click();
      assert.equal((await response).status(), 200);
      if (i === 0) {
        await page.reload();
        await expect(page.locator(".exercise-meta")).toContainText("2 / 9");
      }
    }
    await expect(
      page.getByRole("heading", { name: "Точка старта найдена." }),
    ).toBeVisible();
    await page.goto(app.base + "/progress");
    await expect(page.locator(".skill-row")).toHaveCount(8);
    await expect(page.locator(".skill-root")).toContainText("Python backend");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `docs/previews/stage10-skills-${name}.png`,
      fullPage: true,
    });
    await context.request.post(app.base + "/auth/logout", { headers });
    await page.goto(app.base + "/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await context.request.post(app.base + "/api/auth", {
      headers,
      data: { action: "login", ...creds },
    });
    await page.goto(app.base + "/profile");
    await expect(
      page.getByRole("textbox", { name: "Заметки для ментора", exact: true }),
    ).toHaveValue("Люблю короткие задания");
    await expect(
      goal.getByRole("textbox", { name: "Измеримый результат", exact: true }),
    ).toHaveValue("Создать API плейлистов на Python");
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${name}: profile review/deletion, failed-save recovery, goal, nine-answer diagnosis, skill graph, logout/login, no overflow or console errors`,
    );
    await context.close();
  }
} catch (error) {
  console.error(app.logs());
  if (page)
    await page
      .screenshot({
        path: "docs/previews/stages7-10-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await app.close();
}
