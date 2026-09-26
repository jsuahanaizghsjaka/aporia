import { z } from "zod";
import { readGoal } from "@/lib/goals/storage";
import { readRoadmap } from "@/lib/roadmaps/storage";
import { selectMission } from "@/lib/learning/mission";
import { prepareTeacher } from "@/lib/learning/teacher-server";
import { activeSession } from "@/lib/learning/selectors";
import { AIError, publicAIError } from "@/lib/ai/errors";
export const maxDuration = 90;
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
    if (
      input.action.type === "start_diagnostic" &&
      !state.activeSession &&
      !state.diagnosticComplete &&
      !(await readGoal(session.client, session.user.id))
    )
      return Response.json(
        { error: "Сначала подтверди учебную цель в профиле." },
        { status: 422 },
      );
    let next;
    const profile = profileSchema.parse(data?.data ?? emptyProfile);
    let context;
    let teacher;
    if (input.action.type === "choose_project") {
      const goal = await readGoal(session.client, session.user.id);
      if (!goal)
        return Response.json(
          { error: "Сначала подтверди учебную цель." },
          { status: 422 },
        );
      context = { goal, roadmap: null };
    }
    if (input.action.type === "start_lesson" && !activeSession(state)) {
      const [goal, roadmap] = await Promise.all([
        readGoal(session.client, session.user.id),
        readRoadmap(session.client, session.user.id),
      ]);
      if (!goal || !profile.onboardingComplete || !state.diagnosticComplete)
        return Response.json(
          { error: "Сначала подтверди профиль, цель и заверши диагностику." },
          { status: 422 },
        );
      context = { goal, roadmap };
      if (input.action.teacher === "ai") {
        try {
          const quota = await session.client.rpc("consume_ai_request");
          if (quota.error) throw new AIError("AI_MEMORY");
          if (!quota.data) throw new AIError("AI_RATE_LIMIT", 60);
          const mission = selectMission({
            ...context,
            state,
            profile,
            availableMinutes: input.action.minutes,
          });
          teacher = await prepareTeacher(
            profile,
            mission,
            state,
            AbortSignal.any([request.signal, AbortSignal.timeout(75000)]),
          );
        } catch (cause) {
          const { status, ...failure } = publicAIError(cause);
          return Response.json(failure, {
            status,
            headers: { "Cache-Control": "no-store" },
          });
        }
      }
    }
    try {
      next = applyAction(
        state,
        input.action,
        profile,
        input.requestId,
        new Date(),
        context,
      );
      if (teacher) {
        const created = activeSession(next);
        if (created?.lesson) created.lesson.teacher = teacher;
      }
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
