import test from "node:test";
import assert from "node:assert/strict";
import { inspectEnvironment, probeServices } from "../scripts/doctor.mjs";
const configured = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.example.invalid",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  SUPABASE_SECRET_KEY: "sb_secret_fixture",
  OPENAI_API_KEY: "sk-test-secret",
  OPENAI_MODEL: "test-model",
};
test("auth-only doctor needs no AI/admin keys and only probes public Auth settings", async () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: configured.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      configured.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  assert.ok(
    inspectEnvironment(env, { authOnly: true }).every(
      (check) => check.status === "pass",
    ),
  );
  const calls = [];
  const results = await probeServices(
    env,
    async (url, init) => {
      calls.push(url);
      assert.equal(init.method, "GET");
      return Response.json({ external: { email: true } });
    },
    { authOnly: true },
  );
  assert.deepEqual(calls, [`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`]);
  assert.equal(results[0].status, "pass");
  assert.equal(
    inspectEnvironment(
      { ...env, NEXT_PUBLIC_OTHER: "sk-exposed" },
      { authOnly: true },
    ).find((check) => check.name === "public-env").status,
    "fail",
  );
});
test("doctor detects missing values and accidental exposure without printing secret values", () => {
  assert.ok(inspectEnvironment({}).some((check) => check.status === "fail"));
  assert.ok(
    inspectEnvironment(configured).every((check) => check.status === "pass"),
  );
  const exposed = {
    ...configured,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: configured.SUPABASE_SECRET_KEY,
  };
  const report = inspectEnvironment(exposed);
  assert.equal(
    report.find((check) => check.name === "public-env").status,
    "fail",
  );
  assert.ok(!JSON.stringify(report).includes(configured.SUPABASE_SECRET_KEY));
  const legacy = `eyJ.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
  assert.equal(
    inspectEnvironment({ ...configured, NEXT_PUBLIC_OTHER: legacy }).find(
      (check) => check.name === "public-env",
    ).status,
    "fail",
  );
});
test("doctor accepts local Supabase and rejects insecure external, credential-bearing and malformed URLs", () => {
  for (const url of [
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "https://db.example.invalid/",
  ])
    assert.equal(
      inspectEnvironment({ ...configured, NEXT_PUBLIC_SUPABASE_URL: url })[0]
        .status,
      "pass",
    );
  for (const url of [
    "http://external.example",
    "https://user:password@db.example",
    "not a URL",
    "https://db.example?token=secret",
  ])
    assert.equal(
      inspectEnvironment({ ...configured, NEXT_PUBLIC_SUPABASE_URL: url })[0]
        .status,
      "fail",
    );
});
test("live doctor only reads metadata, never reads learner rows or calls a paid generation", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    const data = url.endsWith("/settings")
      ? { external: { email: true } }
      : url.includes("limit=0")
        ? []
        : url.endsWith("/rest/v1/")
          ? { paths: { "/rpc/commit_profile": {} } }
          : url.includes("/bucket/")
            ? {
                public: false,
                allowed_mime_types: ["image/webp"],
                file_size_limit: 1048576,
              }
            : { id: "test-model" };
    return Response.json(data);
  };
  const report = await probeServices(configured, fetcher);
  assert.equal(calls.length, 6);
  assert.ok(report.every((check) => check.status === "pass"));
  assert.ok(
    calls
      .filter((call) =>
        /profiles\?|learning_states\?|mentor_messages\?/.test(call.url),
      )
      .every((call) => call.url.endsWith("limit=0")),
  );
  assert.ok(
    calls.some((call) =>
      call.url.endsWith("/mentor_messages?select=id,onboarding&limit=0"),
    ),
  );
  assert.ok(!calls.some((call) => call.url.includes("/responses")));
  assert.ok(!JSON.stringify(report).includes("sk-test-secret"));
  let called = false;
  await probeServices({}, async () => {
    called = true;
  });
  assert.equal(called, false);
});
test("live doctor flags the exact missing onboarding column before release", async () => {
  const report = await probeServices(configured, async (url) =>
    url.includes("/mentor_messages?")
      ? Response.json({ code: "42703" }, { status: 400 })
      : Response.json(
          url.endsWith("/settings")
            ? { external: { email: true } }
            : url.includes("limit=0")
              ? []
              : url.includes("/bucket/")
                ? {
                    public: false,
                    allowed_mime_types: ["image/webp"],
                    file_size_limit: 1048576,
                  }
                : { id: "test-model" },
        ),
  );
  assert.equal(
    report.find((check) => check.name === "mentor-onboarding-schema")?.status,
    "fail",
  );
  assert.ok(!JSON.stringify(report).includes("42703"));
});
test("live doctor reports unavailable services without exposing their bodies or exceptions", async () => {
  const report = await probeServices(configured, async () => {
    throw new Error("sk-sensitive-provider-detail");
  });
  assert.ok(report.every((check) => check.status === "fail"));
  assert.ok(!JSON.stringify(report).includes("sk-sensitive"));
  const wrongBucket = await probeServices(configured, async () =>
    Response.json({ public: true }),
  );
  assert.equal(
    wrongBucket.find((check) => check.name === "avatars").status,
    "fail",
  );
});
