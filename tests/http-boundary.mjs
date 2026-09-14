import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const port = 3101;
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "",
  SUPABASE_SECRET_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
};
const server = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk));
server.stderr.on("data", (chunk) => (logs += chunk));
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Server did not start: ${logs}`)),
      15000,
    );
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Ready")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited ${code}: ${logs}`));
    });
  });
  const request = (path, init = {}) =>
    fetch(base + path, { redirect: "manual", ...init });
  for (const path of [
    "/dashboard",
    "/profile",
    "/onboarding",
    "/learn",
    "/roadmap",
    "/diagnostic",
    "/projects",
    "/progress",
  ]) {
    const result = await request(path);
    assert.equal(result.status, 307, path);
    assert.equal(result.headers.get("location"), "/login", path);
  }
  for (const path of [
    "/",
    "/privacy",
    "/preview",
    "/preview/learn",
    "/preview/projects",
    "/preview/progress",
    "/preview/diagnostic",
    "/preview/profile",
    "/preview/onboarding",
    "/preview/roadmap",
    "/login",
    "/signup",
  ])
    assert.equal((await request(path)).status, 200, path);
  assert.equal((await request("/preview/does-not-exist")).status, 404);
  for (const path of [
    "/api/learning",
    "/api/learning/project-review",
    "/api/profile",
    "/api/mentor",
    "/api/onboarding/extract",
  ]) {
    const method = path === "/api/profile" ? "PUT" : "POST";
    assert.equal(
      (await request(path, { method, headers: { origin: base } })).status,
      401,
      path,
    );
    assert.equal(
      (
        await request(path, {
          method,
          headers: { origin: "https://foreign.example" },
        })
      ).status,
      403,
      path,
    );
  }
  assert.equal(
    (
      await request("/api/auth", {
        method: "POST",
        headers: { origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "signup",
          email: "test@example.invalid",
          password: "test-only-123",
        }),
      })
    ).status,
    503,
  );
  assert.equal(
    (await request("/api/mentor?conversation=onboarding")).status,
    401,
  );
  assert.equal((await request("/api/learning")).status, 401);
  assert.equal(
    (
      await request("/api/learning/preview", {
        method: "POST",
        headers: { origin: "https://foreign.example" },
      })
    ).status,
    403,
  );
  let state;
  const previewAction = async (action, requestId = randomUUID()) => {
    const response = await request("/api/learning/preview", {
      method: "POST",
      headers: { origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({
        state,
        action,
        requestId,
        profile: {
          onboardingComplete: true,
          dailyMinutes: 10,
          goal: "Learn Python",
          interests: "Music",
        },
      }),
    });
    const data = await response.json();
    if (response.ok) state = data.state;
    return { response, data };
  };
  let result = await previewAction({ type: "start_diagnostic" });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.question.answers, undefined);
  assert.equal((await previewAction({ type: "hint" })).response.status, 422);
  for (let i = 0; i < 9; i++)
    await previewAction({ type: "answer", answer: "" });
  assert.equal(state.diagnosticComplete, true);
  assert.equal(state.evidence.length, 9);
  await previewAction({ type: "start_session", mode: "learn" });
  const requestId = randomUUID();
  const evidenceBeforeAnswer = state.evidence.length;
  await previewAction({ type: "answer", answer: "10" }, requestId);
  await previewAction({ type: "answer", answer: "10" }, requestId);
  assert.equal(state.evidence.length, evidenceBeforeAnswer + 1);
  await previewAction({ type: "next" });
  assert.equal(state.activeSession, null);
  await previewAction({ type: "choose_project", projectId: "music" });
  await previewAction({
    type: "save_artifact",
    skill: "python",
    artifact: "def find_record(records, record_id): return None",
  });
  assert.match(state.project.artifacts.python, /find_record/);
  result = await previewAction(undefined);
  assert.equal(result.data.state.sessions.length, 2);
  assert.equal(result.data.state.project.id, "music");
  console.log(
    "PASS: protected routes, public/learning screens, CSRF/auth boundaries, unavailable providers, and full local learning loop with idempotent answers and restored project.",
  );
} finally {
  server.kill("SIGTERM");
}
