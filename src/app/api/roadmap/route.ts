import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import { readGoal } from "@/lib/goals/storage";
import { roadmapSaveSchema, validRoadmapOrder } from "@/lib/roadmaps/schema";
import { readRoadmap } from "@/lib/roadmaps/storage";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Войди в аккаунт." }, { status: 401 });
  try {
    return Response.json({ roadmap: await readRoadmap(session.client, session.user.id) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "Не удалось загрузить маршрут." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  const session = await getSession();
  if (!session) return Response.json({ error: "Войди в аккаунт." }, { status: 401 });
  let input;
  try {
    const text = await request.text();
    if (text.length > 8000) throw new Error();
    input = roadmapSaveSchema.parse(JSON.parse(text));
    if (!validRoadmapOrder(input)) throw new Error();
  } catch {
    return Response.json({ error: "Проверь порядок и причины в маршруте." }, { status: 400 });
  }
  try {
    const goal = await readGoal(session.client, session.user.id);
    if (!goal) return Response.json({ error: "Сначала подтверди цель." }, { status: 409 });
    const { version, requestId, items } = input;
    const { data, error } = await session.client.rpc("commit_roadmap", {
      _expected_version: version,
      _request_id: requestId,
      _goal_id: goal.id,
      _data: { items },
    });
    if (error) throw error;
    const roadmap = await readRoadmap(session.client, session.user.id);
    if (Number(data) < 0) return Response.json({
      error: "Маршрут изменён в другой вкладке. Обнови сохранённую версию и повтори попытку.", roadmap,
    }, { status: 409 });
    return Response.json({ roadmap }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Не удалось сохранить маршрут. Повтори попытку." }, { status: 503 });
  }
}
