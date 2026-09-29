import { z } from "zod";
import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import { aiConfigured } from "@/lib/ai/provider";
import { projectReviewSchema } from "@/lib/ai/output";
import { buildMemory } from "@/lib/ai/memory";
import { readGoal } from "@/lib/goals/storage";
import { taskPrompt } from "@/prompts/tasks";
import { skillSchema } from "@/lib/learning/types";
import {
  learningConfigured,
  readLearning,
  writeLearning,
} from "@/lib/learning/storage";
import { addProjectReview, learningView } from "@/lib/learning/engine";
import { projectTasks } from "@/lib/learning/projects";
import { structuredResponse } from "@/lib/ai/structured";
import {
  learnProjectReply,
  projectLearnReplySchema,
} from "@/lib/learning/project-mentor";
import { activeSession } from "@/lib/learning/selectors";
export const maxDuration = 90;
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const session = await getSession();
  if (!session)
    return Response.json(
      { error: "Для разбора кода нужен вход." },
      { status: 401 },
    );
  if (!aiConfigured() || !learningConfigured())
    return Response.json(
      {
        error: "Разбор ментора пока недоступен. Черновик остаётся сохранённым.",
      },
      { status: 503 },
    );
  let skill;
  try {
    const body = await request.text();
    if (body.length > 1000) throw new Error();
    skill = z.object({ skill: skillSchema }).parse(JSON.parse(body)).skill;
  } catch {
    return Response.json(
      { error: "Неизвестный этап проекта." },
      { status: 400 },
    );
  }
  try {
    const { state, version } = await readLearning(
      session.client,
      session.user.id,
    );
    const artifact = state.project?.artifacts[skill];
    if (activeSession(state))
      return Response.json(
        { error: "Сначала заверши текущее занятие." },
        { status: 409 },
      );
    if (!artifact || artifact.trim().length < 20)
      return Response.json(
        { error: "Сначала сохрани решение: минимум 20 символов." },
        { status: 422 },
      );
    const previous = state.project!.reviews[skill];
    if (
      previous?.artifact === artifact &&
      previous.mode === (state.project?.mode ?? "learn")
    )
      return Response.json({ ...learningView(state), version });
    const { data: allowed, error } =
      await session.client.rpc("consume_ai_request");
    if (error || !allowed)
      return Response.json(
        {
          error:
            "Лимит разборов на этот час исчерпан или сервис недоступен. Попробуй позже.",
        },
        { status: error ? 503 : 429 },
      );
    const [profileResult, goal] = await Promise.all([
      session.client
        .from("profiles")
        .select("data")
        .eq("id", session.user.id)
        .maybeSingle(),
      readGoal(session.client, session.user.id),
    ]);
    if (profileResult.error) throw new Error("Memory unavailable");
    const context = {
      memory: buildMemory(profileResult.data?.data ?? {}, state, goal),
      current_task:
        state.project?.plan?.tasks.find((t) => t.skill === skill) ??
        projectTasks[skill],
      artifact,
    };
    let text: string;
    if (state.project?.mode !== "help") {
      const choice = await structuredResponse(
        projectLearnReplySchema,
        "project_learn",
        taskPrompt("projectLearn"),
        context,
        AbortSignal.any([request.signal, AbortSignal.timeout(75000)]),
      );
      text = learnProjectReply(skill, choice);
    } else {
      const result = await structuredResponse(
        projectReviewSchema,
        "project_review",
        taskPrompt("projectReview"),
        context,
        AbortSignal.any([request.signal, AbortSignal.timeout(75000)]),
      );
      text = result.reply;
    }
    request.signal.throwIfAborted();
    const next = addProjectReview(state, skill, artifact, text);
    const updated = await writeLearning(session.user.id, version, next);
    if (updated < 0)
      return Response.json(
        {
          error:
            "Проект изменился во время разбора. Обнови страницу и запроси разбор заново.",
        },
        { status: 409 },
      );
    return Response.json({ ...learningView(next), version: updated });
  } catch {
    return Response.json(
      { error: "Разбор не завершился. Черновик сохранён; попробуй позже." },
      { status: 503 },
    );
  }
}
