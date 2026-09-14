import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/auth/request";
import { authenticate, credentialsSchema } from "@/lib/auth/flow";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  let input;
  try {
    input = credentialsSchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Проверь email. Пароль должен содержать от 8 до 128 символов." },
      { status: 400, headers },
    );
  }
  try {
    const client = await createClient();
    if (!client)
      return Response.json(
        {
          error:
            "Сервис аккаунтов пока не подключён. Можно посмотреть интерфейс без регистрации.",
        },
        { status: 503, headers },
      );
    const result = await authenticate(
      client,
      input,
      new URL(request.url).origin,
    );
    return Response.json(result.body, { status: result.status, headers });
  } catch {
    return Response.json(
      {
        error:
          "Не удалось завершить вход. Сервис временно недоступен. Попробуй ещё раз чуть позже.",
      },
      { status: 503, headers },
    );
  }
}
