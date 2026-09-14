// Local protocol fixture only. No test hooks or fake credentials enter app code.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { learningDatabase } from "./learning-db.mjs";
import { fakeAI } from "./ai-provider.mjs";
import { createRequire } from "node:module";
import { once } from "node:events";
const require = createRequire(import.meta.url);

export async function startAuthApp({
  withAI = false,
  aiTimeoutMs = 500,
  withLearning = false,
} = {}) {
  const learning = withLearning ? await learningDatabase() : null;
  const users = new Map(),
    profiles = new Map(),
    codes = new Map(),
    tokens = new Map();
  const messages = [];
  const controls = {
    profileUnavailable: false,
    logoutUnavailable: false,
    aiMode: "success",
    aiRequests: [],
    aiAborted: 0,
    aiAllowed: true,
    aiLimitCalls: 0,
    messageUnavailable: false,
    messageWriteFailure: "",
  };
  const issueSession = (user) => {
    const encode = (value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.${Buffer.from(randomUUID()).toString("base64url")}`;
    tokens.set(token, user);
    return {
      access_token: token,
      refresh_token: randomUUID(),
      expires_in: 3600,
      token_type: "bearer",
      user,
    };
  };
  const provider = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    try {
      let text = "";
      for await (const chunk of req) text += chunk;
      const body = text ? JSON.parse(text) : {};
      if (withAI && url.pathname === "/v1/responses")
        return fakeAI(body, res, controls);
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      const current = tokens.get(token);
      if (
        learning &&
        (await learning.route(
          url,
          body,
          current,
          token === "sb_secret_local_learning_only",
          send,
          req,
        ))
      )
        return;
      if (url.pathname === "/auth/v1/signup") {
        if (users.has(body.email))
          return send(200, { user: { id: randomUUID(), identities: [] } });
        const user = {
          id: randomUUID(),
          email: body.email,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          created_at: new Date().toISOString(),
        };
        const immediate = body.email.startsWith("immediate-");
        users.set(body.email, {
          user,
          password: body.password,
          confirmed: immediate,
        });
        profiles.set(user.id, {
          id: user.id,
          data: {},
          avatar_path: null,
          version: 0,
        });
        await learning?.seed(user.id);
        codes.set(body.email, {
          code: randomUUID(),
          challenge: body.code_challenge,
        });
        return send(200, immediate ? issueSession(user) : user);
      }
      if (url.pathname === "/auth/v1/token") {
        if (url.searchParams.get("grant_type") === "pkce") {
          const entry = [...codes.entries()].find(
            ([, value]) => value.code === body.auth_code,
          );
          if (
            !entry ||
            createHash("sha256")
              .update(body.code_verifier || "")
              .digest("base64url") !== entry[1].challenge
          )
            return send(400, {
              msg: "Invalid code",
              code: "bad_code_verifier",
            });
          const record = users.get(entry[0]);
          record.confirmed = true;
          codes.delete(entry[0]);
          return send(200, issueSession(record.user));
        }
        const record = users.get(body.email);
        if (!record || record.password !== body.password || !record.confirmed)
          return send(400, {
            msg: "Invalid credentials",
            code: "invalid_credentials",
          });
        return send(200, issueSession(record.user));
      }
      if (url.pathname === "/auth/v1/user")
        return send(current ? 200 : 401, current || { msg: "No session" });
      if (url.pathname === "/auth/v1/logout") {
        if (controls.logoutUnavailable)
          return send(503, { msg: "Provider unavailable" });
        tokens.delete(token);
        return send(204, null);
      }
      if (!current) return send(401, { message: "No session" });
      if (url.pathname === "/rest/v1/rpc/consume_ai_request") {
        controls.aiLimitCalls++;
        return send(200, controls.aiAllowed);
      }
      if (url.pathname === "/rest/v1/mentor_messages") {
        if (controls.messageUnavailable)
          return send(503, { message: "PRIVATE_PROVIDER_DETAIL" });
        if (req.method === "POST") {
          if (body.user_id !== current.id) return send(403, {});
          if (controls.messageWriteFailure === body.role)
            return send(503, { message: "PRIVATE_PROVIDER_DETAIL" });
          if (
            messages.some(
              (m) =>
                m.user_id === current.id &&
                m.request_id === body.request_id &&
                m.role === body.role,
            )
          )
            return send(409, { code: "23505" });
          messages.push({
            ...body,
            id: randomUUID(),
            created_at: new Date(Date.now() + messages.length).toISOString(),
          });
          return send(201, null);
        }
        let found = messages.filter((m) => m.user_id === current.id);
        for (const key of ["user_id", "conversation", "request_id", "role"]) {
          const filter = url.searchParams.get(key)?.replace(/^eq\./, "");
          if (filter) found = found.filter((m) => m[key] === filter);
        }
        if (url.searchParams.get("order")?.includes("desc"))
          found = found.toReversed();
        const limit = Number(url.searchParams.get("limit"));
        if (limit) found = found.slice(0, limit);
        return send(
          200,
          req.headers.accept?.includes("vnd.pgrst.object") ? found[0] : found,
        );
      }
      if (url.pathname === "/rest/v1/profiles") {
        if (controls.profileUnavailable)
          return send(503, { message: "private database error" });
        const id = url.searchParams.get("id")?.replace(/^eq\./, "");
        return send(
          200,
          req.headers.accept?.includes("vnd.pgrst.object")
            ? id === current.id
              ? (profiles.get(id) ?? null)
              : null
            : id === current.id && profiles.has(id)
              ? [profiles.get(id)]
              : [],
        );
      }
      if (url.pathname === "/rest/v1/rpc/commit_profile") {
        const row = profiles.get(current.id);
        if (row.version !== body._expected_version) return send(200, -1);
        row.data = body._data;
        row.avatar_path = body._avatar_path;
        row.version++;
        await learning?.profile(current.id, row.data, row.version);
        return send(200, row.version);
      }
      if (
        [
          "/rest/v1/mentor_messages",
          "/rest/v1/learning_states",
          "/rest/v1/goals",
        ].includes(url.pathname)
      )
        return send(200, []);
      return send(404, { message: "Unknown fixture endpoint" });
    } catch {
      send(500, { message: "Fixture failure" });
    }
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const providerUrl = `http://127.0.0.1:${provider.address().port}`;
  const base = "http://127.0.0.1:3102";
  const env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: providerUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_auth_test_only",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SECRET_KEY: withLearning ? "sb_secret_local_learning_only" : "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    OPENAI_API_KEY: "",
    OPENAI_MODEL: "",
  };
  if (withAI)
    Object.assign(env, {
      OPENAI_API_KEY: "sk-local-test-only",
      OPENAI_MODEL: "fixture-model",
      APORIA_TEST_PROVIDER_URL: providerUrl,
      APORIA_TEST_AI_TIMEOUT_MS: String(aiTimeoutMs),
      NODE_OPTIONS: `--import=${new URL("./ai-transport.mjs", import.meta.url).href}`,
    });
  const server = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3102",
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let logs = "";
  server.stdout.on("data", (chunk) => {
    logs = (logs + chunk).slice(-20000);
  });
  server.stderr.on("data", (chunk) => {
    logs = (logs + chunk).slice(-20000);
  });
  const close = async () => {
    if (process.platform === "win32" && server.pid && server.exitCode === null)
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    else server.kill("SIGTERM");
    if (server.exitCode === null)
      await Promise.race([
        once(server, "exit"),
        new Promise((resolve) => setTimeout(resolve, 3000).unref()),
      ]);
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
    await learning?.close();
  };
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Auth test app timeout: ${logs}`)),
        20000,
      );
      server.once("error", reject);
      server.stdout.on("data", (chunk) => {
        if (String(chunk).includes("Ready")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error(`Auth test app exited: ${logs}`));
      });
    });
    return {
      base,
      learning,
      codes,
      profiles,
      users,
      messages,
      controls,
      close,
      logs: () => logs,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export function cookieClient(base) {
  const cookies = new Map();
  return async (path, init = {}) => {
    const response = await fetch(base + path, {
      redirect: "manual",
      ...init,
      headers: {
        cookie: [...cookies]
          .map(([key, value]) => `${key}=${value}`)
          .join("; "),
        ...init.headers,
      },
    });
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0];
      const i = pair.indexOf("=");
      cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return response;
  };
}
