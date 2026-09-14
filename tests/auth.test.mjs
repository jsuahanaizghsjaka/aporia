import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticate,
  credentialsSchema,
  destinationForProfile,
  destinationForUser,
} from "../src/lib/auth/flow.ts";

const complete = {
  displayName: "Learner",
  goal: "Python backend",
  onboardingComplete: true,
};
const credentials = {
  action: "login",
  email: "learner@example.invalid",
  password: "Test-only-123",
};
function fixture({
  profile = complete,
  session = true,
  error = null,
  dbError = null,
  missing = false,
} = {}) {
  const calls = [];
  const result = {
    data: { user: { id: "verified-user" }, session: session ? {} : null },
    error,
  };
  const client = {
    auth: {
      signUp: async (args) => {
        calls.push(["signup", args]);
        return result;
      },
      signInWithPassword: async (args) => {
        calls.push(["login", args]);
        return result;
      },
    },
    from: (table) => {
      calls.push(["table", table]);
      return {
        select: () => ({
          eq: (column, id) => {
            calls.push([column, id]);
            return {
              maybeSingle: async () => ({
                data: missing ? null : { data: profile },
                error: dbError,
              }),
            };
          },
        }),
      };
    },
  };
  return { client, calls };
}
test("auth validates and trims email, preserves passwords, and rejects invalid actions", () => {
  const parsed = credentialsSchema.parse({
    ...credentials,
    email: "  learner@example.invalid  ",
    password: " spaced password ",
  });
  assert.equal(parsed.email, credentials.email);
  assert.equal(parsed.password, " spaced password ");
  for (const override of [
    { email: "bad" },
    { password: "short" },
    { password: "a".repeat(129) },
    { action: "admin" },
  ])
    assert.equal(
      credentialsSchema.safeParse({ ...credentials, ...override }).success,
      false,
    );
});
test("new and unfinished learners go to onboarding; completed learners go to dashboard", () => {
  for (const data of [
    {},
    null,
    { onboardingComplete: true },
    { ...complete, onboardingComplete: false },
  ])
    assert.equal(destinationForProfile(data, "/projects"), "/onboarding");
  assert.equal(destinationForProfile(complete), "/dashboard");
  assert.equal(destinationForProfile(complete, "/onboarding"), "/dashboard");
  assert.equal(destinationForProfile(complete, "/projects"), "/projects");
  for (const next of [
    "//foreign.example",
    "https://foreign.example",
    "/%2fescape",
    "javascript:alert(1)",
  ])
    assert.equal(destinationForProfile(complete, next), "/dashboard");
});
test("login reads only the verified user's profile and respects its actual state", async () => {
  for (const [profile, next] of [
    [{}, "/onboarding"],
    [complete, "/dashboard"],
  ]) {
    const { client, calls } = fixture({ profile });
    const result = await authenticate(
      client,
      { ...credentials, userId: "forged-user", onboardingComplete: true },
      "http://localhost:3000",
    );
    assert.deepEqual(result, { status: 200, body: { next } });
    assert.deepEqual(calls.at(-1), ["id", "verified-user"]);
  }
});
test("email confirmation signup returns a neutral message, never a premature session", async () => {
  const { client, calls } = fixture({ session: false });
  const result = await authenticate(
    client,
    { ...credentials, action: "signup" },
    "http://localhost:3000",
  );
  assert.equal(result.status, 200);
  assert.equal(typeof result.body.message, "string");
  assert.equal(result.body.next, undefined);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0][1].options.emailRedirectTo,
    "http://localhost:3000/auth/callback",
  );
});
test("signup with an immediate session sends a new learner to onboarding", async () => {
  const { client } = fixture({ profile: {} });
  assert.equal(
    (
      await authenticate(
        client,
        { ...credentials, action: "signup" },
        "http://localhost:3000",
      )
    ).body.next,
    "/onboarding",
  );
});
test("invalid credentials and rate limits never disclose provider errors or account existence", async () => {
  for (const [status, expected] of [
    [400, 400],
    [429, 429],
    [500, 503],
  ]) {
    const { client, calls } = fixture({
      error: { status, message: "secret provider details" },
    });
    const result = await authenticate(
      client,
      credentials,
      "http://localhost:3000",
    );
    assert.equal(result.status, expected);
    assert.equal(JSON.stringify(result).includes("secret provider"), false);
    assert.equal(calls.length, 1);
  }
});
test("missing profiles, DB failures and incomplete sessions never masquerade as successful login", async () => {
  for (const options of [
    { missing: true },
    { dbError: { message: "private details" } },
  ]) {
    const { client } = fixture(options);
    await assert.rejects(
      () => destinationForUser(client, "verified-user"),
      /Profile unavailable/,
    );
  }
  await assert.rejects(
    () =>
      authenticate(
        fixture({ session: false }).client,
        credentials,
        "http://localhost:3000",
      ),
    /Session unavailable/,
  );
});
