import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startAuthApp, cookieClient } from "./helpers/auth-app.mjs";
const app = await startAuthApp({ withLearning: true });
const a = cookieClient(app.base),
  stranger = cookieClient(app.base);
const post = (client, path, body, origin = app.base) =>
  client(path, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const email = `immediate-recovery-${randomUUID()}@example.test`,
  password = "original-long-password",
  changed = "changed-long-password";
try {
  assert.equal(
    (await post(a, "/api/auth", { action: "signup", email, password })).status,
    200,
  );
  assert.equal(
    (
      await post(stranger, "/api/auth/recovery", {
        action: "update",
        password: changed,
        confirmation: changed,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await post(
        a,
        "/api/auth/recovery",
        { action: "request", email },
        "https://evil.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(a, "/api/auth/recovery", {
        action: "update",
        password: changed,
        confirmation: "mismatching",
      })
    ).status,
    400,
  );
  const request = await post(a, "/api/auth/recovery", {
    action: "request",
    email,
  });
  assert.equal(request.status, 200);
  const unknown = await post(stranger, "/api/auth/recovery", {
    action: "request",
    email: "missing@example.test",
  });
  assert.deepEqual(await request.json(), await unknown.json());
  const code = app.codes.get(email).code;
  assert.match(
    (await stranger(`/auth/callback?code=${code}`)).headers.get("location"),
    /error=confirmation/,
  );
  assert.match(
    (await a(`/auth/callback?code=${code}`)).headers.get("location"),
    /\/reset-password$/,
  );
  assert.match(
    (await a(`/auth/callback?code=${code}`)).headers.get("location"),
    /error=confirmation/,
  );
  const changedResponse = await post(a, "/api/auth/recovery", {
    action: "update",
    password: changed,
    confirmation: changed,
  });
  assert.equal(changedResponse.status, 200);
  assert.equal(
    (await post(a, "/api/auth", { action: "login", email, password })).status,
    400,
  );
  assert.equal(
    (await post(a, "/api/auth", { action: "login", email, password: changed }))
      .status,
    200,
  );
  assert.equal(
    (await post(a, "/api/events", { name: "lesson_completed" })).status,
    400,
  );
  assert.equal(
    (await post(stranger, "/api/events", { name: "onboarding_started" }))
      .status,
    401,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await post(a, "/api/events", { name: "onboarding_started" })).status,
      204,
    );
  const owner = app.users.get(email).user.id;
  const own = await app.learning.asUser(owner, (db) =>
    db.query("select name from public.product_events order by name"),
  );
  assert.deepEqual(
    own.rows.map((r) => r.name),
    ["onboarding_started", "signup"],
  );
  const other = randomUUID();
  await app.learning.seed(other);
  assert.equal(
    (
      await app.learning.asUser(other, (db) =>
        db.query("select * from public.product_events where user_id=$1", [
          owner,
        ]),
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    app.learning.asUser(owner, (db) =>
      db.query(
        "insert into public.product_events values($1,'lesson_completed','forged',now())",
        [owner],
      ),
    ),
  );
  app.controls.recoveryUnavailable = true;
  const unavailable = await post(a, "/api/auth/recovery", {
    action: "request",
    email,
  });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /PRIVATE/);
  if (process.argv.includes("--browser")) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1365, height: 900 },
      });
      page.setDefaultTimeout(25000);
      page.setDefaultNavigationTimeout(90000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(app.base + "/login");
      await page.getByRole("link", { name: "Забыли пароль?" }).click();
      await page.waitForURL("**/forgot-password");
      await page.getByRole("heading", { name: "Вернём доступ." }).waitFor();
      await page.waitForFunction(() => {
        const b = document.querySelector("form button.primary-button");
        return b && !b.disabled;
      });
      await page
        .getByLabel("Email", { exact: true })
        .fill("missing@example.test");
      await page
        .getByRole("button", { name: "Отправить ссылку", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Сервис временно недоступен" })
        .waitFor();
      assert.equal(
        await page.getByLabel("Email", { exact: true }).inputValue(),
        "missing@example.test",
      );
      app.controls.recoveryUnavailable = false;
      await page
        .getByRole("button", { name: "Отправить ссылку", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Если аккаунт" })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Повторить можно через минуту" })
          .isDisabled(),
        true,
      );
      await page.goto(app.base + "/reset-password");
      await page
        .getByRole("link", { name: "Запросить новое письмо" })
        .waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("link", { name: "Запросить новое письмо" }).click();
      await page.waitForURL("**/forgot-password");
      await page.getByRole("heading", { name: "Вернём доступ." }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page
        .getByLabel("Email", { exact: true })
        .fill("missing@example.test");
      await page.route("**/api/auth/recovery", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.abort().catch(() => {});
      });
      await page
        .getByRole("button", { name: "Отправить ссылку", exact: true })
        .click();
      await page.getByRole("button", { name: "Отменить ожидание" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Ожидание отменено" })
        .waitFor();
      await page.screenshot({
        path: "docs/previews/recovery-mobile.png",
        fullPage: true,
        caret: "initial",
      });
      await page.goto(app.base + "/preview/progress");
      await page.getByRole("heading", { name: "История занятий" }).waitFor();
      await page
        .getByRole("link", { name: "Пройти диагностику перед первым занятием" })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.goto(app.base + "/preview/learn");
      assert.equal(await page.locator(".resource-list").count(), 0);
      await page.unroute("**/api/auth/recovery");
      const login = await page.request.post(app.base + "/api/auth", {
        headers: { origin: app.base },
        data: { action: "login", email, password: changed },
      });
      assert.equal(login.status(), 200);
      await page.goto(app.base + "/reset-password");
      await page.getByLabel("Новый пароль", { exact: true }).fill("browser-new-password");
      await page.getByLabel("Повтори пароль", { exact: true }).fill("browser-wrong-password");
      await page.getByRole("button", { name: "Сохранить новый пароль" }).click();
      await page.getByRole("alert").filter({ hasText: "Пароли не совпадают" }).waitFor();
      await page.getByLabel("Повтори пароль", { exact: true }).fill("browser-new-password");
      await page.getByRole("button", { name: "Сохранить новый пароль" }).click();
      await page.getByRole("status").filter({ hasText: "Пароль изменён" }).waitFor();
      assert.equal(await page.getByLabel("Новый пароль", { exact: true }).count(), 0);
      assert.deepEqual(errors, []);
      console.log(
        "PASS: browser recovery error/retry/cancel, expired session, mobile overflow, empty history/resources, no page errors",
      );
    } finally {
      await browser.close();
    }
  }
  console.log(
    "PASS: recovery PKCE, one-time links, CSRF, validation, password login, neutral response, safe failure, analytics allowlist/dedupe/RLS",
  );
} finally {
  await app.close();
}
