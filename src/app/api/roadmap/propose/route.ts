import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import { readGoal } from "@/lib/goals/storage";
import { readLearning } from "@/lib/learning/storage";
import { masterySnapshot } from "@/lib/learning/mastery";
import { roadmapDraftSchema, validRoadmapOrder } from "@/lib/roadmaps/schema";
import { structuredResponse } from "@/lib/ai/structured";
import { publicAIError } from "@/lib/ai/errors";
import { memoryFromProfile } from "@/lib/profile/memory";

export const maxDuration = 90;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  const session = await getSession();
  if (!session) return Response.json({ error: "Войди в аккаунт." }, { status: 401 });
  try {
    const [profileResult, goal, learning] = await Promise.all([
      session.client.from("profiles").select("data").eq("id", session.user.id).maybeSingle(),
      readGoal(session.client, session.user.id),
      readLearning(session.client, session.user.id),
    ]);
    if (profileResult.error || !profileResult.data?.data) throw new Error();
    const profile = profileResult.data.data;
    if (!profile.onboardingComplete || !goal) return Response.json({ error: "Сначала заверши знакомство и подтверди цель." }, { status: 409 });
    if (!learning.state.diagnosticComplete) return Response.json({ error: "Сначала пройди диагностику — маршрут опирается на проверенные ответы." }, { status: 409 });
    const { data: quota, error: quotaError } = await session.client.rpc("consume_ai_request");
    if (quotaError || !quota) return Response.json({ error: "Лимит запросов к ментору исчерпан. Попробуй позже." }, { status: 429 });
    const candidate = await structuredResponse(
      roadmapDraftSchema,
      "python_backend_roadmap",
      "Ты составляешь только порядок восьми навыков Python backend. Верни каждый навык ровно один раз. Соблюдай зависимости: Python до Git, SQL и HTTP; HTTP до FastAPI; FastAPI до Authentication и Testing; Testing до Docker. Пиши короткие конкретные причины на русском. Не утверждай, что пользователь уже умеет то, чего не подтверждают данные.",
      { profile: memoryFromProfile(profile), goal, mastery: masterySnapshot(learning.state) },
      AbortSignal.timeout(85000),
    );
    if (!validRoadmapOrder(candidate)) throw new Error("Неверный порядок навыков.");
    return Response.json({ candidate, confirmed: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const publicError = publicAIError(error);
    return Response.json(publicError, { status: publicError.status });
  }
}
