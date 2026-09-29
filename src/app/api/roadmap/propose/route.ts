import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import { readGoal } from "@/lib/goals/storage";
import { readLearning } from "@/lib/learning/storage";
import { roadmapSchema } from "@/lib/ai/contracts";
import { structuredResponse } from "@/lib/ai/structured";
import { publicAIError } from "@/lib/ai/errors";
import { buildMemory } from "@/lib/ai/memory";
import { taskPrompt } from "@/prompts/tasks";

export const maxDuration = 90;

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Войди в аккаунт." }, { status: 401 });
  try {
    const [profileResult, goal, learning] = await Promise.all([
      session.client
        .from("profiles")
        .select("data")
        .eq("id", session.user.id)
        .maybeSingle(),
      readGoal(session.client, session.user.id),
      readLearning(session.client, session.user.id),
    ]);
    if (profileResult.error || !profileResult.data?.data) throw new Error();
    const profile = profileResult.data.data;
    if (!profile.onboardingComplete || !goal)
      return Response.json(
        { error: "Сначала заверши знакомство и подтверди цель." },
        { status: 409 },
      );
    if (!learning.state.diagnosticComplete)
      return Response.json(
        {
          error:
            "Сначала пройди диагностику — маршрут опирается на проверенные ответы.",
        },
        { status: 409 },
      );
    const { data: quota, error: quotaError } =
      await session.client.rpc("consume_ai_request");
    if (quotaError || !quota)
      return Response.json(
        { error: "Лимит запросов к ментору исчерпан. Попробуй позже." },
        { status: 429 },
      );
    const candidate = await structuredResponse(
      roadmapSchema,
      "python_backend_roadmap",
      taskPrompt("roadmap"),
      { memory: buildMemory(profile, learning.state, goal) },
      AbortSignal.any([request.signal, AbortSignal.timeout(85000)]),
    );
    return Response.json(
      { candidate, confirmed: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const publicError = publicAIError(error);
    return Response.json(publicError, { status: publicError.status });
  }
}
