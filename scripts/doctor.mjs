import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);

function jwtRole(key) {
  try {
    return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
      .role;
  } catch {
    return null;
  }
}
export function inspectEnvironment(env, { authOnly = false } = {}) {
  const checks = [];
  const add = (name, ok, message) =>
    checks.push({ name, status: ok ? "pass" : "fail", message });
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  let validURL = false;
  try {
    const parsed = new URL(url);
    validURL =
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      ["", "/"].includes(parsed.pathname) &&
      (parsed.protocol === "https:" ||
        (parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)));
  } catch {
    /* Missing or invalid URL; never echo its contents. */
  }
  add(
    "supabase-url",
    validURL,
    validURL
      ? "URL Supabase задан."
      : "Задай корректный NEXT_PUBLIC_SUPABASE_URL.",
  );
  const publicKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  const publicOK =
    publicKey.startsWith("sb_publishable_") || jwtRole(publicKey) === "anon";
  add(
    "supabase-public-key",
    publicOK,
    publicOK
      ? "Публичный ключ задан."
      : "Нужен publishable или anon key; серверный ключ сюда не подходит.",
  );
  const secretKey =
    env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  const secretOK =
    secretKey.startsWith("sb_secret_") || jwtRole(secretKey) === "service_role";
  add(
    "supabase-server-key",
    secretOK,
    secretOK
      ? "Серверный ключ задан."
      : "Задай SUPABASE_SECRET_KEY или SUPABASE_SERVICE_ROLE_KEY.",
  );
  const exposed = Object.entries(env).some(
    ([name, value]) =>
      name.startsWith("NEXT_PUBLIC_") &&
      value &&
      (/SECRET|SERVICE_ROLE|OPENAI_API_KEY/.test(name) ||
        value.startsWith("sb_secret_") ||
        value.startsWith("sk-") ||
        jwtRole(value) === "service_role"),
  );
  add(
    "public-env",
    !exposed,
    exposed
      ? "Серверный секрет найден в NEXT_PUBLIC_. Удали его из публичных переменных и замени ключ."
      : "Серверные ключи не найдены в публичных переменных.",
  );
  add(
    "ai-key",
    Boolean(env.OPENAI_API_KEY?.trim()),
    env.OPENAI_API_KEY?.trim()
      ? "Ключ AI задан."
      : "Задай OPENAI_API_KEY на сервере.",
  );
  add(
    "ai-model",
    Boolean(env.OPENAI_MODEL?.trim()),
    env.OPENAI_MODEL?.trim() ? "Модель AI задана." : "Задай OPENAI_MODEL.",
  );
  return authOnly
    ? checks.filter((check) =>
        ["supabase-url", "supabase-public-key", "public-env"].includes(
          check.name,
        ),
      )
    : checks;
}

export async function probeServices(
  env,
  fetcher = fetch,
  { authOnly = false } = {},
) {
  if (
    inspectEnvironment(env, { authOnly }).some(
      (check) => check.status !== "pass",
    )
  )
    return [];
  const root = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const publicKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = (key = "") => ({
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
  });
  const probes = [
    {
      name: "auth",
      url: `${root}/auth/v1/settings`,
      headers: headers(publicKey),
      validate: (data) => data?.external?.email === true,
    },
    {
      name: "profiles-schema",
      url: `${root}/rest/v1/profiles?select=id,version&limit=0`,
      headers: headers(secretKey),
      validate: Array.isArray,
    },
    {
      name: "learning-schema",
      url: `${root}/rest/v1/learning_states?select=user_id,version&limit=0`,
      headers: headers(secretKey),
      validate: Array.isArray,
    },
    {
      name: "mentor-onboarding-schema",
      url: `${root}/rest/v1/mentor_messages?select=id,onboarding&limit=0`,
      headers: headers(secretKey),
      validate: Array.isArray,
    },
    {
      name: "avatars",
      url: `${root}/storage/v1/bucket/avatars`,
      headers: headers(secretKey),
      validate: (data) =>
        data?.public === false &&
        data?.allowed_mime_types?.includes("image/webp") &&
        data?.file_size_limit === 1048576,
    },
    {
      name: "ai-model-access",
      url: `https://api.openai.com/v1/models/${encodeURIComponent(env.OPENAI_MODEL)}`,
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      validate: (data) => data?.id === env.OPENAI_MODEL,
    },
  ];
  return Promise.all(
    probes
      .filter((probe) => !authOnly || probe.name === "auth")
      .map(async (probe) => {
        try {
          const response = await fetcher(probe.url, {
            method: "GET",
            headers: probe.headers,
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok)
            return {
              name: probe.name,
              status: "fail",
              message: `Сервис ответил HTTP ${response.status}. Проверь настройки и миграции.`,
            };
          if (!probe.validate(await response.json()))
            return {
              name: probe.name,
              status: "fail",
              message:
                "Ответ получен, но настройки или схема не соответствуют Aporia.",
            };
          return {
            name: probe.name,
            status: "pass",
            message: "Проверка чтения прошла.",
          };
        } catch {
          return {
            name: probe.name,
            status: "fail",
            message:
              "Сервис недоступен или ответ не распознан. Проверь сеть и настройки.",
          };
        }
      }),
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--live", "--json", "--auth"].includes(arg))) {
    console.error(
      "Использование: npm run doctor -- [--auth] [--live] [--json]",
    );
    process.exitCode = 2;
    return;
  }
  const { loadEnvConfig } = require("@next/env");
  // Same .env precedence as the production build. No secret values are printed.
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const authOnly = args.includes("--auth");
  const checks = inspectEnvironment(process.env, { authOnly });
  if (args.includes("--live"))
    checks.push(...(await probeServices(process.env, fetch, { authOnly })));
  const report = {
    ready: checks.every((check) => check.status === "pass"),
    liveRequested: args.includes("--live"),
    checks,
    note: authOnly
      ? "Проверяются настройки Auth, не сам вход. Нужны миграция 004 и ручной цикл регистрации/выхода/повторного входа. AI и серверный ключ для этапа 3 не требуются."
      : "Проверка конфигурации не заменяет вход двумя аккаунтами, загрузку фото и Responses API. Локальный /preview работает без ключей.",
  };
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("Aporia · готовность окружения");
    for (const check of checks)
      console.log(
        `${check.status === "pass" ? "OK" : "НУЖНО"} ${check.name}: ${check.message}`,
      );
    console.log(report.note);
    if (!args.includes("--live"))
      console.log(
        "Сеть не проверялась. Для проверок чтения: npm run doctor -- --live",
      );
  }
  if (!report.ready) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
