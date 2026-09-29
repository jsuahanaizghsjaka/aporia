import { z } from "zod";
import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import {
  readLearning,
  writeLearning,
  learningConfigured,
} from "@/lib/learning/storage";
import { learningView } from "@/lib/learning/engine";
import { activeSession } from "@/lib/learning/selectors";
import { skillSchema } from "@/lib/learning/types";
import { projectTasks } from "@/lib/learning/projects";
import {
  appendProjectMessage,
  learnProjectReply,
  projectLearnReplySchema,
  projectHelpReplySchema,
} from "@/lib/learning/project-mentor";
import { structuredResponse } from "@/lib/ai/structured";
import { AIError, publicAIError } from "@/lib/ai/errors";
import { buildMemory, recentConversation } from "@/lib/ai/memory";
import { readGoal } from "@/lib/goals/storage";
import { taskPrompt } from "@/prompts/tasks";
export const maxDuration = 90;
const schema = z.strictObject({
  requestId: z.uuid(),
  version: z.number().int().nonnegative(),
  skill: skillSchema,
  message: z.string().trim().min(3).max(2000),
});
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const session = await getSession();
  if (!session)
    return Response.json(
      { error: "Для проектного чата нужен вход." },
      { status: 401 },
    );
  if (!learningConfigured())
    return Response.json(
      { error: "Память проекта не подключена." },
      { status: 503 },
    );
  let input;
  try {
    const text = await request.text();
    if (text.length > 12000) throw new Error();
    input = schema.parse(JSON.parse(text));
  } catch {
    return Response.json(
      { error: "Проверь текст сообщения." },
      { status: 400 },
    );
  }
  try {
    const { state, version } = await readLearning(
      session.client,
      session.user.id,
    );
    const p = state.project;
    if (
      state.requestIds.includes(input.requestId) ||
      p?.messages?.some((m) => m.id === input.requestId)
    )
      return Response.json({ ...learningView(state), version });
    if (version !== input.version)
      return Response.json(
        {
          error:
            "Проект изменился. Проверь обновлённые данные и повтори вопрос.",
          ...learningView(state),
          version,
        },
        { status: 409 },
      );
    if (!p)
      return Response.json(
        { error: "Сначала выбери проект." },
        { status: 422 },
      );
    if (activeSession(state))
      return Response.json(
        {
          error:
            "Сначала заверши текущее занятие: проектный чат не заменяет его подсказки.",
        },
        { status: 409 },
      );
    if ((p.messages?.length ?? 0) >= 100)
      return Response.json(
        { error: "История проекта заполнена (100 сообщений)." },
        { status: 422 },
      );
    const quota = await session.client.rpc("consume_ai_request");
    if (quota.error) throw new AIError("AI_MEMORY");
    if (!quota.data) throw new AIError("AI_RATE_LIMIT", 60);
    const [profileResult, goal] = await Promise.all([
      session.client
        .from("profiles")
        .select("data")
        .eq("id", session.user.id)
        .maybeSingle(),
      readGoal(session.client, session.user.id),
    ]);
    if (profileResult.error) throw new AIError("AI_MEMORY");
    const context = {
      memory: buildMemory(profileResult.data?.data ?? {}, state, goal),
      current_task:
        p.plan?.tasks.find((t) => t.skill === input.skill) ??
        projectTasks[input.skill],
      skill: input.skill,
      mode: p.mode ?? "learn",
      artifact: p.artifacts[input.skill] ?? "",
      result: p.submissions?.[input.skill]
        ? {
            at: p.submissions[input.skill]!.at,
            report: p.submissions[input.skill]!.report,
          }
        : null,
      history: recentConversation(
        (p.messages ?? [])
          .filter((m) => m.skill === input.skill)
          .flatMap((m) => [
            { role: "user", content: m.question },
            { role: "assistant", content: m.reply },
          ]),
      ),
      question: input.message,
    };
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(75000),
    ]);
    let reply: string,
      decision: string | null = null;
    if (p.mode !== "help") {
      const choice = await structuredResponse(
        projectLearnReplySchema,
        "project_learn",
        taskPrompt("projectLearn"),
        context,
        signal,
      );
      reply = learnProjectReply(input.skill, choice);
    } else {
      const result = await structuredResponse(
        projectHelpReplySchema,
        "project_help",
        taskPrompt("projectHelp"),
        context,
        signal,
      );
      reply = result.reply;
      decision = result.decision;
    }
    signal.throwIfAborted();
    const next = appendProjectMessage(state, {
      id: input.requestId,
      skill: input.skill,
      question: input.message,
      reply,
      decision,
    });
    const updated = await writeLearning(session.user.id, version, next);
    if (updated < 0) {
      const latest = await readLearning(session.client, session.user.id);
      return Response.json(
        {
          error:
            "Проект изменился во время ответа. Ответ не сохранён; повтори вопрос.",
          ...learningView(latest.state),
          version: latest.version,
        },
        { status: 409 },
      );
    }
    return Response.json(
      { ...learningView(next), version: updated },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    const { status, ...error } = publicAIError(cause);
    return Response.json(error, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
