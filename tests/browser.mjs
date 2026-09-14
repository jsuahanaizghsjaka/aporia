import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { expect as baseExpect } from "playwright/test";
import { startAuthApp } from "./helpers/auth-app.mjs";
import { statement, updates } from "./helpers/onboarding-data.mjs";
const expect = baseExpect.configure({ timeout: 20000 }),
  app = await startAuthApp({ withAI: true, aiTimeoutMs: 5000 });
let browser, page;
await mkdir("docs/previews", { recursive: true });
try {
  for (const path of [
    "/preview/onboarding",
    "/api/mentor?conversation=onboarding",
    "/api/profile",
  ]) {
    console.log("Preparing " + path);
    await (
      await fetch(app.base + path, { signal: AbortSignal.timeout(90000) })
    ).arrayBuffer();
  }
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
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(90000);
    const errors = [];
    let expectedNetworkError = false;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (
        m.type() === "error" &&
        !(expectedNetworkError && /Failed to load resource/.test(m.text()))
      )
        errors.push(m.text());
    });
    const headers = { origin: app.base },
      creds = {
        email: `immediate-stage6-${name}@example.test`,
        password: "Test-password-2026!",
      };
    const signup = await context.request.post(app.base + "/api/auth", {
      headers,
      data: { action: "signup", ...creds },
    });
    assert.equal((await signup.json()).next, "/onboarding");
    const owner = app.users.get(creds.email).user.id;
    assert.equal(app.profiles.get(owner).version, 0);
    await page.goto(app.base + "/dashboard");
    await expect(page).toHaveURL(app.base + "/onboarding");
    await page
      .getByRole("button", { name: "Начать знакомство", exact: true })
      .click();
    const input = page.getByRole("textbox", { name: "Сообщение ментору" });
    await expect(input).toBeEnabled();
    app.controls.onboardingAction = {
      name: "finish_onboarding",
      reply: "Проверим итог.",
      updates: updates.slice(0, 2),
    };
    await input.fill(statement);
    await input.press("Enter");
    await expect(page.locator(".chat-message.assistant").last()).toContainText(
      "До итога",
    );
    await expect(input).toBeEnabled();
    await expect(page).toHaveURL(app.base + "/onboarding");
    assert.equal(app.profiles.get(owner).version, 0);
    await page.reload();
    await page
      .getByRole("button", { name: "Начать знакомство", exact: true })
      .click();
    await expect(input).toBeEnabled();
    await expect(page.locator(".chat-side")).toContainText("Ещё обсудим");
    app.controls.aiMode = "rate";
    expectedNetworkError = true;
    app.controls.onboardingAction = {
      name: "record_onboarding",
      reply: "Продолжим знакомство.",
      updates: [],
    };
    await input.fill("Продолжим");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: /Повторить через/ }),
    ).toBeDisabled();
    app.controls.aiMode = "success";
    await page
      .getByRole("button", { name: "Повторить отправку", exact: true })
      .click();
    await expect(input).toBeEnabled();
    expectedNetworkError = false;
    app.controls.onboardingAction = {
      name: "finish_onboarding",
      reply: "Всё обсудили. Проверь итог.",
      updates: updates.slice(2),
    };
    await input.fill(statement);
    await input.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Вот что важно о тебе." }),
    ).toBeVisible();
    assert.equal(app.profiles.get(owner).version, 0);
    await expect(page).toHaveURL(app.base + "/onboarding");
    // A saved AI proposal survives reload but never auto-confirms the profile.
    await page.reload();
    await page
      .getByRole("button", { name: "Начать знакомство", exact: true })
      .click();
    await page
      .locator(".chat-side")
      .getByRole("button", { name: "Проверить профиль" })
      .click();
    await expect(page.locator(".lesson-summary")).toContainText("Нет проектов");
    await page.getByRole("button", { name: "Исправить профиль" }).click();
    await page
      .getByLabel("Одна цель в Python backend")
      .fill("API личной библиотеки");
    await page.getByRole("button", { name: "Вернуться к разговору" }).click();
    await page
      .locator(".chat-side")
      .getByRole("button", { name: "Проверить профиль" })
      .click();
    await expect(page.locator(".lesson-summary")).toContainText(
      "API личной библиотеки",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `docs/previews/stage6-${name}.png`,
      fullPage: true,
    });
    expectedNetworkError = true;
    await page.route("**/api/profile", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Тест: сохранение недоступно" }),
      }),
    );
    await page.getByRole("button", { name: "Всё верно, сохранить" }).click();
    await expect(page.locator(".error-message[role=alert]")).toContainText(
      "сохранение недоступно",
    );
    await expect(page).toHaveURL(app.base + "/onboarding");
    assert.equal(app.profiles.get(owner).version, 0);
    await page.unroute("**/api/profile");
    await page.getByRole("button", { name: "Всё верно, сохранить" }).click();
    await expect(page).toHaveURL(app.base + "/dashboard");
    expectedNetworkError = false;
    assert.equal(app.profiles.get(owner).data.goal, "API личной библиотеки");
    assert.equal(app.profiles.get(owner).data.onboardingComplete, true);
    await page.goto("about:blank");
    await context.request.post(app.base + "/auth/logout", { headers });
    await page.goto(app.base + "/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("about:blank");
    const login = await context.request.post(app.base + "/api/auth", {
      headers,
      data: { action: "login", ...creds },
    });
    assert.equal((await login.json()).next, "/dashboard");
    await page.goto(app.base + "/profile");
    await expect(page.getByLabel("Пожелание из знакомства")).toHaveValue(
      "API личной библиотеки",
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${name}: new learner redirect, early finish refused, draft/reload, rate retry, explicit review, retained edits, failed save, automatic dashboard, logout and relogin.`,
    );
    await context.close();
  }
} catch (error) {
  console.error(app.logs());
  if (page && !page.isClosed())
    console.error(
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  throw error;
} finally {
  await browser?.close();
  await app.close();
}
