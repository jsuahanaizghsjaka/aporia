import { z } from "zod";
import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import { actionSchema } from "@/lib/learning/types";
import { applyAction, learningView } from "@/lib/learning/engine";
import {
  readLearning,
  writeLearning,
  learningConfigured,
} from "@/lib/learning/storage";
import { emptyProfile, profileSchema } from "@/lib/profile/schema";
const inputSchema = z.object({
  requestId: z.uuid(),
  version: z.number().int().nonnegative(),
  action: actionSchema,
});
export async function GET() {
  const session = await getSession();
  if (!session)
    return Response.json(
      { error: "Для сохранения занятий нужен вход." },
      { status: 401 },
    );
  try {
    const { state, version } = await readLearning(
      session.client,
      session.user.id,
    );
    return Response.json(
      { ...learningView(state), version },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Учебная память пока недоступна. Попробуй ещё раз позже." },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const session = await getSession();
  if (!session)
    return Response.json(
      { error: "Войди в аккаунт, чтобы сохранить занятие." },
      { status: 401 },
    );
  if (!learningConfigured())
    return Response.json(
      { error: "Сохранение занятий пока не подключено." },
      { status: 503 },
    );
  let input;
  try {
    const body = await request.text();
    if (body.length > 20000) throw new Error();
    input = inputSchema.parse(JSON.parse(body));
  } catch {
    return Response.json({ error: "Проверь данные задания." }, { status: 400 });
  }
  try {
    const [{ state, version }, { data, error }] = await Promise.all([
      readLearning(session.client, session.user.id),
      session.client
        .from("profiles")
        .select("data")
        .eq("id", session.user.id)
        .maybeSingle(),
    ]);
    if (error) throw new Error("Не удалось загрузить профиль.");
    if (state.requestIds.includes(input.requestId))
      return Response.json({ ...learningView(state), version });
    if (version !== input.version)
      return Response.json(
        {
          error:
            "Занятие изменилось в другой вкладке. Данные обновлены — повтори действие.",
          ...learningView(state),
          version,
        },
        { status: 409 },
      );
    let next;
    try {
      next = applyAction(
        state,
        input.action,
        profileSchema.parse(data?.data ?? emptyProfile),
        input.requestId,
      );
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error ? error.message : "Действие недоступно.",
        },
        { status: 422 },
      );
    }
    const updated = await writeLearning(session.user.id, version, next);
    if (updated < 0) {
      const latest = await readLearning(session.client, session.user.id);
      return Response.json(
        {
          error: "Занятие изменилось в другой вкладке. Повтори действие.",
          ...learningView(latest.state),
          version: latest.version,
        },
        { status: 409 },
      );
    }
    return Response.json({ ...learningView(next), version: updated });
  } catch {
    return Response.json(
      {
        error: "Не удалось сохранить учебную память. Повтори действие.",
        retryable: true,
      },
      { status: 503 },
    );
  }
}
