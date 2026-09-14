import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import { readGoal } from "@/lib/goals/storage";
import { saveGoalSchema } from "@/lib/goals/schema";
export async function GET() {
  const s = await getSession();
  if (!s) return Response.json({ error: "Войди в аккаунт." }, { status: 401 });
  try {
    return Response.json(
      { goal: await readGoal(s.client, s.user.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Не удалось загрузить цель." },
      { status: 503 },
    );
  }
}
export async function PUT(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const s = await getSession();
  if (!s) return Response.json({ error: "Войди в аккаунт." }, { status: 401 });
  let input;
  try {
    const text = await request.text();
    if (text.length > 5000) throw new Error();
    input = saveGoalSchema.parse(JSON.parse(text));
  } catch {
    return Response.json(
      { error: "Проверь цель, критерии и дату." },
      { status: 400 },
    );
  }
  try {
    const { version, requestId, ...draft } = input;
    const { data, error } = await s.client.rpc("commit_goal", {
      _expected_version: version,
      _request_id: requestId,
      _data: draft,
    });
    if (error) throw error;
    const goal = await readGoal(s.client, s.user.id);
    if (Number(data) < 0)
      return Response.json(
        {
          error:
            "Цель изменена в другой вкладке. Твой черновик сохранён в форме; обнови сохранённую версию перед повтором.",
          goal,
        },
        { status: 409 },
      );
    return Response.json(
      { goal },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Не удалось сохранить цель. Проверь подключение и завершение знакомства; повтори попытку.",
      },
      { status: 503 },
    );
  }
}
