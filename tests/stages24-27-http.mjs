import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { startAuthApp, cookieClient } from "./helpers/auth-app.mjs";
const app = await startAuthApp({ withLearning: true, withAI: true });
const request = cookieClient(app.base),
  headers = { origin: app.base, "Content-Type": "application/json" };
const credentials = {
  email: "immediate-personal@example.test",
  password: "Test-password-2026!",
};
const post = (path, data) =>
  request(path, { method: "POST", headers, body: JSON.stringify(data) });
const json = async (r, status = 200) => {
  assert.equal(r.status, status, await r.clone().text());
  return r.json();
};
let learning, browser;
const send = async (action) =>
  (learning = await json(
    await post("/api/learning", {
      version: learning.version,
      requestId: randomUUID(),
      action,
    }),
  ));
try {
  await json(await post("/api/auth", { action: "signup", ...credentials }));
  const form = new FormData();
  form.set("version", "0");
  form.set(
    "profile",
    JSON.stringify({
      displayName: "Sinon",
      goal: "Создать Python API",
      onboardingComplete: true,
      dailyMinutes: 30,
      schedule: { timeZone: "Europe/Moscow", days: Array(7).fill(10) },
    }),
  );
  await json(
    await request("/api/profile", {
      method: "PUT",
      headers: { origin: app.base },
      body: form,
    }),
  );
  await json(
    await request("/api/goals", {
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
  learning = await json(await request("/api/learning"));
  await send({ type: "start_diagnostic" });
  for (let i = 0; i < 9; i++) await send({ type: "answer", answer: "" });
  await send({
    type: "start_lesson",
    mode: "learn",
    minutes: 60,
    teacher: "prepared",
  });
  assert.equal(learning.state.sessions.at(-1).minutes, 10);
  const before = structuredClone(learning.state.evidence);
  await send({ type: "recommend_resources", skill: "python", source: "ai" });
  assert.equal(learning.state.resourceSelections[0].source, "ai");
  const selection = learning.state.resourceSelections[0],
    target = {
      selectionId: selection.id,
      resourceId: selection.items[0].resourceId,
    };
  const envelope = {
    version: learning.version,
    requestId: randomUUID(),
    action: { type: "save_resource", ...target },
  };
  learning = await json(await post("/api/learning", envelope));
  assert.deepEqual(await json(await post("/api/learning", envelope)), learning);
  await json(
    await post("/api/learning", { ...envelope, requestId: randomUUID() }),
    409,
  );
  await send({ type: "open_resource", ...target });
  await send({ type: "rate_resource", ...target, helpful: true });
  const resourceCount = learning.state.resourceSelections.length;
  app.controls.aiMode = "malformed";
  await json(
    await post("/api/learning", {
      version: learning.version,
      requestId: randomUUID(),
      action: { type: "recommend_resources", skill: "python", source: "ai" },
    }),
    502,
  );
  app.controls.aiMode = "success";
  learning = await json(await request("/api/learning"));
  assert.equal(learning.state.resourceSelections.length, resourceCount);
  app.controls.resourceCandidate = { ids: ["https://evil.example"] };
  await json(
    await post("/api/learning", {
      version: learning.version,
      requestId: randomUUID(),
      action: { type: "recommend_resources", skill: "python", source: "ai" },
    }),
    502,
  );
  delete app.controls.resourceCandidate;
  app.controls.aiMode = "quota";
  const quotaFailure = await json(await post("/api/learning", {
    version:learning.version, requestId:randomUUID(),
    action:{type:"recommend_resources",skill:"python",source:"ai"},
  }),503);
  assert.equal(quotaFailure.code,"AI_QUOTA");
  assert.equal(JSON.stringify(quotaFailure).includes("PRIVATE_PROVIDER_DETAIL"),false);
  app.controls.aiMode = "success";
  await send({ type: "generate_weekly_review", source: "ai" });
  const review = learning.state.weeklyReviews[0];
  assert.equal(review.source, "ai");
  assert.equal(learning.state.focus, null);
  const calls = app.controls.aiRequests.length;
  await send({ type: "generate_weekly_review", source: "ai" });
  assert.equal(app.controls.aiRequests.length, calls);
  assert.equal(learning.state.weeklyReviews.length, 1);
  await send({
    type: "confirm_weekly_focus",
    reviewId: review.id,
    skill: "python",
  });
  assert.equal(learning.state.focus, "python");
  assert.deepEqual(learning.state.evidence, before);
  await json(
    await post("/api/learning", {
      version: learning.version,
      requestId: randomUUID(),
      action: {
        type: "generate_weekly_review",
        source: "prepared",
        sessions: 999,
      },
    }),
    400,
  );
  const logout = await request("/auth/logout", {
    method: "POST",
    headers: { origin: app.base },
  });
  assert.equal(logout.status, 303);
  await json(await request("/api/learning"), 401);
  await json(await post("/api/auth", { action: "login", ...credentials }));
  assert.deepEqual(
    (await json(await request("/api/learning"))).state,
    learning.state,
  );
  const other = cookieClient(app.base);
  await json(
    await other("/api/auth", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "signup",
        email: "immediate-personal-other@example.test",
        password: credentials.password,
      }),
    }),
  );
  const foreign = await json(await other("/api/learning"));
  assert.equal(foreign.state.resourceSelections.length, 0);
  assert.equal(foreign.state.weeklyReviews.length, 0);
  console.log(
    "PASS stages24-27 HTTP: schedule cap, AI allowlist/errors, persistence, CAS, idempotency, explicit focus, unchanged mastery, account isolation",
  );
  if (process.argv.includes("--browser")) {
    const { chromium } = await import("playwright"),
      { expect: baseExpect } = await import("playwright/test");
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
      await expect(
        page.getByRole("heading", { name: "Один источник. Затем практика." }),
      ).toBeVisible();
      const resources = page.locator(".resources-panel");
      await expect(resources).toContainText("Think Python");
      await resources.getByRole("button", { name: "Моя библиотека" }).click();
      await expect(resources.locator(".resource-card")).toHaveCount(1);
      await resources
        .getByRole("button", { name: "Не помогло", exact: true })
        .click();
      await expect(
        resources.getByRole("button", { name: "Не помогло", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.reload();
      await page.getByRole("button", { name: "Моя библиотека" }).click();
      await expect(
        page.getByRole("button", { name: "Не помогло", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await resources.scrollIntoViewIfNeeded();
      await page.screenshot({
        caret: "initial",
        path: `docs/previews/stages24-27-resources-${name}.png`,
      });
      await page.goto(app.base + "/progress");
      await expect(page.locator(".weekly-snapshot")).toContainText(
        "Подтверждён фокус: Python",
      );
      await page
        .getByRole("button", { name: "Подтвердить фокус", exact: true })
        .focus();
      await expect(
        page.getByRole("button", { name: "Подтвердить фокус", exact: true }),
      ).toBeFocused();
      await page.locator(".weekly-panel").scrollIntoViewIfNeeded();
      await page.screenshot({
        caret: "initial",
        path: `docs/previews/stages24-27-weekly-${name}.png`,
      });
      await page.goto(app.base + "/profile");
      await expect(
        page.getByLabel("Понедельник, минут", { exact: true }),
      ).toHaveValue(name === "desktop" ? "10" : "15");
      await page
        .getByLabel("Понедельник, минут", { exact: true })
        .fill(name === "desktop" ? "15" : "20");
      await page
        .getByRole("button", { name: "Сохранить изменения", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Изменения сохранены" }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Понедельник, минут", { exact: true }),
      ).toHaveValue(name === "desktop" ? "15" : "20");
      await page.reload();
      await expect(
        page.getByLabel("Понедельник, минут", { exact: true }),
      ).toHaveValue(name === "desktop" ? "15" : "20");
      await page.locator(".schedule-editor").scrollIntoViewIfNeeded();
      await page.screenshot({
        caret: "initial",
        path: `docs/previews/stages24-27-schedule-${name}.png`,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS stages24-27 browser: desktop/mobile materials, feedback, library, weekly focus, persisted schedule, keyboard, console",
    );
  }
} catch (error) {
  console.error(app.logs());
  throw error;
} finally {
  await browser?.close();
  await app.close();
}
