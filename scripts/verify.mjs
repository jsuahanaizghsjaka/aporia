import { spawnSync } from "node:child_process";

const npm = process.env.npm_execpath;
if (!npm) {
  console.error("Запусти проверки через npm run verify.");
  process.exit(2);
}
// Never let local QA write into a real account or call a paid model. These
// explicit empty values also override .env files during Next's build.
const env = { ...process.env, APORIA_TEST_NO_DEV_CACHE: "1" };
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
])
  env[key] = "";
for (const task of [
  "lint",
  "test",
  "build",
  "test:http",
  "test:auth",
  "test:ai",
  "test:milestones",
  "test:stages-11-13",
  "test:lessons",
  "test:projects",
  "test:history",
  "test:personal",
  "test:architecture:http",
  "test:reliability:http",
  "test:release",
]) {
  const result = spawnSync(process.execPath, [npm, "run", task], {
    env,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    console.error(`Проверка ${task} не завершена успешно.`);
    process.exit(result.status || 1);
  }
}
console.log(
  "Все локальные проверки прошли. Для облачного выпуска задай env и выполни отдельный npm run build.",
);
