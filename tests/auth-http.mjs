import assert from "node:assert/strict";
import { startAuthApp, cookieClient } from "./helpers/auth-app.mjs";
const app = await startAuthApp();
async function assertRedirect(response, path) {
  const location = response.headers.get("location");
  if (location) {
    assert.ok([303, 307].includes(response.status));
    assert.equal(new URL(location, app.base).pathname, path);
    return;
  }
  // Next.js may already have streamed the shell: redirect() then emits a
  // real refresh meta tag instead of changing the HTTP status/Location.
  assert.equal(response.status, 200);
  const html = await response.text();
  const redirectMeta = html.match(/<meta id="__next-page-redirect"[^>]*>/)?.[0];
  assert.ok(
    redirectMeta?.includes(`url=${path}"`),
    `Missing redirect meta to ${path}`,
  );
}
try {
  const request = cookieClient(app.base);
  const headers = { origin: app.base, "Content-Type": "application/json" };
  const credentials = {
    email: "qa@example.invalid",
    password: "Test-only-123",
  };
  const auth = (action, extra = {}) =>
    request("/api/auth", {
      method: "POST",
      headers,
      body: JSON.stringify({ action, ...credentials, ...extra }),
    });
  assert.equal(
    (await request("/api/auth", { method: "POST", headers, body: "{broken" }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signup", ...credentials }),
      })
    ).status,
    403,
  );
  assert.equal((await auth("login")).status, 400);
  const signup = await auth("signup");
  assert.equal(signup.status, 200);
  assert.equal(typeof (await signup.json()).message, "string");
  assert.ok(
    app.profiles.has(app.users.get(credentials.email).user.id),
    "profile exists before email confirmation",
  );
  assert.equal((await request("/dashboard")).headers.get("location"), "/login");
  assert.equal((await auth("login")).status, 400, "unconfirmed email rejected");
  const code = app.codes.get(credentials.email).code;
  const foreignBrowser = cookieClient(app.base);
  const badBrowser = await foreignBrowser(`/auth/callback?code=${code}`);
  assert.match(
    badBrowser.headers.get("location"),
    /login\?error=confirmation$/,
  );
  const confirmation = await request(
    `/auth/callback?code=${code}&next=https://foreign.example`,
  );
  assert.match(confirmation.headers.get("location"), /\/onboarding$/);
  assert.match(confirmation.headers.get("cache-control"), /no-store/);
  for (const path of [
    "/",
    "/login",
    "/signup",
    "/dashboard",
    "/learn",
    "/profile",
    "/projects",
    "/progress",
    "/roadmap",
    "/diagnostic",
  ])
    await assertRedirect(await request(path), "/onboarding");
  assert.equal((await request("/onboarding")).status, 200);
  assert.equal(
    (await request("/auth/logout")).status,
    405,
    "GET cannot sign out",
  );
  assert.equal(
    (
      await request("/auth/logout", {
        method: "POST",
        headers: { origin: "https://foreign.example" },
      })
    ).status,
    403,
  );
  const logout = () =>
    request("/auth/logout", { method: "POST", headers: { origin: app.base } });
  assert.equal((await logout()).status, 303);
  assert.equal((await request("/dashboard")).headers.get("location"), "/login");
  assert.equal(
    (await (await auth("login")).json()).next,
    "/onboarding",
    "unfinished learner returns to onboarding",
  );
  const form = new FormData();
  const lessonContext = {
    context: "Меняю направление после университета",
    experience: "Пишу небольшие скрипты",
    workStudy: "Учусь и работаю по вечерам",
    weeklyAvailability: "Вт и чт утром, суббота после обеда",
    interests: "Музыка и история",
    hobbies: "Бег и гитара",
    preferences: "Небольшие задачи с примерами",
    currentProjects: "API для домашней библиотеки",
    dailyMinutes: 45,
  };
  form.set(
    "profile",
    JSON.stringify({
      displayName: "QA learner",
      goal: "Python backend",
      ...lessonContext,
      onboardingComplete: true,
    }),
  );
  form.set("version", "0");
  const saved = await request("/api/profile", {
    method: "PUT",
    headers: { origin: app.base },
    body: form,
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  const savedProfile = (await saved.json()).profile;
  for (const [key, value] of Object.entries(lessonContext))
    assert.equal(
      savedProfile[key],
      value,
      `${key} survives profile validation`,
    );
  app.controls.logoutUnavailable = true;
  assert.equal(
    (await logout()).status,
    503,
    "logout failure must not report success",
  );
  app.controls.logoutUnavailable = false;
  // Supabase clears local cookies even when remote revocation fails.
  // Never restore them or claim the remote session was revoked.
  await assertRedirect(await request("/dashboard"), "/login");
  assert.equal((await (await auth("login")).json()).next, "/dashboard");
  const owner = app.users.get(credentials.email).user.id;
  assert.equal(app.profiles.get(owner).version, 1);
  for (const [key, value] of Object.entries(lessonContext))
    assert.equal(
      app.profiles.get(owner).data[key],
      value,
      `${key} persists after login`,
    );
  const profilePage = await request("/profile");
  assert.equal(profilePage.status, 200);
  const profileHtml = await profilePage.text();
  for (const value of Object.values(lessonContext).filter(
    (item) => typeof item === "string",
  ))
    assert.ok(
      profileHtml.includes(value),
      "saved Lesson 0 answer reaches the profile editor",
    );
  await assertRedirect(await request("/onboarding"), "/dashboard");
  assert.equal((await request("/dashboard")).status, 200);
  await logout();
  assert.equal(
    (await (await auth("login")).json()).next,
    "/dashboard",
    "completed profile persists after login",
  );
  const second = cookieClient(app.base);
  const secondSignup = await second("/api/auth", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...credentials,
      action: "signup",
      email: "immediate-b@example.invalid",
    }),
  });
  assert.equal((await secondSignup.json()).next, "/onboarding");
  const secondPage = await second("/onboarding");
  assert.equal(
    (await secondPage.text()).includes("QA learner"),
    false,
    "second account never sees the first profile",
  );
  app.controls.profileUnavailable = true;
  const unavailable = await auth("login");
  assert.equal(unavailable.status, 503);
  assert.equal(
    (await unavailable.text()).includes("private database error"),
    false,
  );
  assert.equal(
    (await request("/login")).status,
    200,
    "profile outage must not cause redirect loop",
  );
  app.controls.profileUnavailable = false;
  const forged = await request("/api/auth", {
    method: "POST",
    headers: { ...headers, origin: "https://foreign.example" },
    body: JSON.stringify({ ...credentials, action: "login" }),
  });
  assert.equal(forged.status, 403);
  console.log(
    "PASS: actual Next.js signup/PKCE/cookies, login/logout, new/returning redirects, full Lesson 0 profile save/re-login/read, account separation and provider failures (local Auth fixture; not live Supabase).",
  );
} catch (error) {
  console.error(app.logs());
  throw error;
} finally {
  await app.close();
}
