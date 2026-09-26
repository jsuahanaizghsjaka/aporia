import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { startAuthApp, cookieClient } from "./helpers/auth-app.mjs";
import { questionById } from "../src/lib/learning/question-bank.ts";
import { sessionHistory } from "../src/lib/learning/history.ts";
const app = await startAuthApp({ withLearning: true });
const request = cookieClient(app.base),
  headers = { origin: app.base, "Content-Type": "application/json" };
const credentials = {
  email: "immediate-history@example.test",
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
async function saveProfile(client) {
  const form = new FormData();
  form.set("version", "0");
  form.set(
    "profile",
    JSON.stringify({
      displayName: "Sinon",
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
  await json(await post("/api/auth", { action: "signup", ...credentials }));
  await saveProfile(request);
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
    teacher: "prepared",
    minutes: 5,
  });
  await send({ type: "finish_theory" });
  await send({ type: "answer", answer: "WRONG" });
  const envelope = {
    version: learning.version,
    requestId: randomUUID(),
    action: {
      type: "answer",
      answer: questionById(learning.question.id).answers[0],
    },
  };
  learning = await json(await post("/api/learning", envelope));
  const same = await json(await post("/api/learning", envelope));
  assert.deepEqual(same.state.evidence, learning.state.evidence);
  await json(
    await post("/api/learning", {
      version: learning.version,
      requestId: randomUUID(),
      action: {
        type: "answer",
        answer: "x",
        mastery_changes: [{ before: 0, after: 95 }],
        source_id: "forged",
      },
    }),
    400,
  );
  await send({ type: "next" });
  await send({
    type: "finish_project",
    reflection: "Проверю пустой список и поиск по неизвестному id.",
  });
  const session = learning.state.sessions.at(-1),
    path = `/progress/sessions/${session.id}`;
  const h = sessionHistory(learning.state, session);
  assert.equal(h.complete, true);
  assert.ok(h.changes[0].delta > 0);
  const row = (
    await app.learning.db.query(
      "select * from public.mastery_evidence where session_id=$1",
      [session.id],
    )
  ).rows[0];
  assert.equal(row.mastery_changes.length, 2);
  assert.equal(row.source_id, learning.state.evidence.at(-1).source_id);
  const baseline = JSON.stringify(learning.state.evidence);
  for (const route of ["/progress", path]) {
    const r = await request(route);
    assert.equal(r.status, 200);
  }
  assert.equal(
    JSON.stringify((await json(await request("/api/learning"))).state.evidence),
    baseline,
  );
  await request("/auth/logout", {
    method: "POST",
    headers: { origin: app.base },
  });
  const anonymous = await request(path, { redirect: "manual" });
  assert.ok([302, 303, 307].includes(anonymous.status));
  assert.match(anonymous.headers.get("location"), /login/);
  await json(await post("/api/auth", { action: "login", ...credentials }));
  assert.equal(
    JSON.stringify((await json(await request("/api/learning"))).state.evidence),
    baseline,
  );
  const other = cookieClient(app.base),
    b = {
      email: "immediate-other-history@example.test",
      password: credentials.password,
    };
  await json(
    await other("/api/auth", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "signup", ...b }),
    }),
  );
  await saveProfile(other);
  const foreign = await json(await other("/api/learning"));
  assert.equal(foreign.state.sessions.length, 0);
  assert.equal(foreign.state.evidence.length, 0);
  console.log(
    "PASS stages21-23 HTTP: evidence, exact changes, retry, forgery rejection, read-only history, logout/relogin, owner isolation",
  );
  if (process.argv.includes("--browser")) {
    const { chromium } = await import("playwright");
    const { expect: baseExpect } = await import("playwright/test");
    const expect = baseExpect.configure({ timeout: 25000 });
    browser = await chromium.launch({
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
      await page.goto(app.base + "/progress");
      await expect(page.locator(".skill-row")).toHaveCount(8);
      await page.getByLabel("Группа навыков").selectOption("not_started");
      await expect(
        page.getByText("В этой группе пока нет навыков."),
      ).toBeVisible();
      await page.getByLabel("Группа навыков").selectOption("weak");
      await expect(page.locator(".skill-row")).toHaveCount(8);
      await page.getByLabel("Группа навыков").selectOption("all");
      await page
        .locator(".skill-row")
        .first()
        .getByText("Почему такой уровень?", { exact: true })
        .click();
      await expect(page.locator(".evidence-ledger").first()).toContainText(
        "Изменение mastery:",
      );
      await page.screenshot({
        path: `docs/previews/stages21-23-progress-${name}.png`,
        fullPage: true,
      });
      const first = page.locator(".history-item").first();
      await first.locator(":scope > summary").click();
      await expect(first).toContainText("Изменение mastery");
      await expect(first).toContainText("Длительность:");
      await first.locator(".session-permalink").click();
      await expect(page).toHaveURL(app.base + path);
      await expect(
        page.getByRole("heading", { name: /Занятие:/ }),
      ).toBeVisible();
      await expect(page.locator(".session-mastery")).toContainText("п. п.");
      await page.getByText(/Все попытки ·/).click();
      await expect(page.locator(".session-body")).toContainText("WRONG");
      await page.reload();
      await expect(
        page.getByRole("heading", { name: /Занятие:/ }),
      ).toBeVisible();
      const back = page.getByRole("link", { name: "← К прогрессу и истории" });
      await back.focus();
      await expect(back).toBeFocused();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `docs/previews/stages21-23-session-${name}.png`,
        fullPage: true,
      });
      await context.request.post(app.base + "/api/auth", {
        headers,
        data: { action: "login", ...b },
      });
      await page.goto(app.base + path);
      await expect(
        page.locator(".progress-empty").getByRole("alert"),
      ).toContainText("Занятие не найдено");
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS stages21-23 browser: desktop/mobile filters, evidence, session links, reload, keyboard, no overflow or console errors, foreign session denied",
    );
  }
} catch (error) {
  console.error(app.logs());
  throw error;
} finally {
  await browser?.close();
  await app.close();
}
