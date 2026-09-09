import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin, safeNext } from "@/lib/auth/request";
const inputSchema = z.object({
  action: z.enum(["login", "signup"]),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  next: z.string().nullable().optional(),
});
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const client = await createClient();
  if (!client)
    return Response.json(
      {
        error:
          "Сервис аккаунтов пока не подключён. Можно посмотреть интерфейс без регистрации.",
      },
      { status: 503 },
    );
  let input;
  try {
    input = inputSchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Проверь email. Пароль должен содержать от 8 до 128 символов." },
      { status: 400 },
    );
  }
  if (input.action === "signup") {
    const { data, error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${new URL(request.url).origin}/auth/callback?next=/onboarding`,
      },
    });
    if (error)
      return Response.json(
        {
          error:
            "Не удалось создать аккаунт. Проверь данные или попробуй позже.",
        },
        { status: 400 },
      );
    return Response.json(
      data.session
        ? { next: "/onboarding" }
        : {
            message:
              "Проверь почту: если регистрация доступна, мы отправили ссылку для подтверждения.",
          },
    );
  }
  const { error } = await client.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error)
    return Response.json(
      {
        error: "Не удалось войти. Проверь email, пароль и подтверждение почты.",
      },
      { status: 400 },
    );
  return Response.json({ next: safeNext(input.next ?? null) });
}
