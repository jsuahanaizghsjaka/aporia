import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/auth/request";
import { recoveryMessage, recoverySchema } from "@/lib/auth/recovery";

const headers = { "Cache-Control": "private, no-store" };
const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers });
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return reply({ error: "Недопустимый источник запроса." }, 403);
  let input;
  try {
    const text = await request.text();
    if (text.length > 2048) throw new Error();
    input = recoverySchema.parse(JSON.parse(text));
  } catch {
    return reply(
      {
        error:
          "Проверь email или оба пароля: от 8 до 128 символов, пароли должны совпадать.",
      },
      400,
    );
  }
  try {
    const client = await createClient();
    if (!client) throw new Error();
    if (input.action === "request") {
      const { error } = await client.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${new URL(request.url).origin}/auth/callback`,
      });
      if (error?.status === 429)
        return reply(
          { error: "Слишком много писем. Подожди несколько минут и повтори." },
          429,
        );
      if (error && (!error.status || error.status >= 500)) throw new Error();
      // The same response for missing and existing accounts; never expose provider details.
      return reply({ message: recoveryMessage });
    }
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user)
      return reply(
        {
          error: "Ссылка устарела или сессия завершена. Запроси новое письмо.",
        },
        401,
      );
    const { error } = await client.auth.updateUser({
      password: input.password,
    });
    if (error)
      return reply(
        {
          error:
            error.status === 429
              ? "Слишком много попыток. Попробуй позже."
              : "Не удалось изменить пароль. Выбери другой пароль или запроси новое письмо.",
        },
        error.status === 429 ? 429 : 400,
      );
    // Changing a password is also available to a verified signed-in user.
    // Do not claim global JWT revocation: existing access tokens expire separately.
    await client.auth.signOut({ scope: "global" });
    return reply({ message: "Пароль изменён. Войди с новым паролем." });
  } catch {
    return reply(
      {
        error:
          "Сервис временно недоступен. Проверь соединение и повтори позже.",
      },
      503,
    );
  }
}
