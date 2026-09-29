import { z } from "zod";
import { buildMemory, recentConversation } from "@/lib/ai/memory";
import { mentorTextSchema } from "@/lib/ai/output";
import { taskPrompt } from "@/prompts/tasks";
import { readGoal } from "@/lib/goals/storage";
import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import { createResponse, aiConfigured } from "@/lib/ai/provider";
import { readAIText } from "@/lib/ai/text-stream";
import { AIError, publicAIError } from "@/lib/ai/errors";
import { readOnboardingResponse } from "@/lib/ai/onboarding-stream";
import { lessonZeroInstructions } from "@/prompts/lesson-zero";
import {
  onboardingTools,
  readOnboardingState,
  reviewOnboarding,
  type OnboardingState,
} from "@/lib/onboarding/ai-state";
import { teachingInstructions } from "@/prompts/onboarding";
import { readLearning } from "@/lib/learning/storage";
import { activeSession, initialLearningState } from "@/lib/learning/selectors";
export const maxDuration = 90;
function aiFailure(cause: unknown) {
  const { status, ...data } = publicAIError(cause);
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(data.retryAfter ? { "Retry-After": String(data.retryAfter) } : {}),
    },
  });
}
const conversationSchema = z.enum(["onboarding", "learn", "help"]);
const inputSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  conversation: conversationSchema,
  requestId: z.uuid(),
});
export async function GET(request: Request) {
  const session = await getSession();
  if (!session)
    return Response.json(
      { error: "Для диалога нужен вход в аккаунт." },
      { status: 401 },
    );
  const conversation = conversationSchema.safeParse(
    new URL(request.url).searchParams.get("conversation"),
  );
  if (!conversation.success)
    return Response.json({ error: "Неизвестный диалог." }, { status: 400 });
  const { data, error } = await session.client
    .from("mentor_messages")
    .select("id, role, content, request_id, created_at, onboarding")
    .eq("user_id", session.user.id)
    .eq("conversation", conversation.data)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error)
    return Response.json(
      { error: "Не удалось загрузить разговор. Обнови страницу." },
      { status: 503 },
    );
  return Response.json(
    {
      messages: data
        .toReversed()
        .map(({ id, role, content, request_id, created_at }) => ({
          id,
          role,
          content,
          request_id,
          created_at,
        })),
      configured: aiConfigured(),
      onboarding:
        data[0]?.role === "assistant" && data[0].onboarding
          ? reviewOnboarding(readOnboardingState(data[0].onboarding))
          : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
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
      { error: "Войди в аккаунт, чтобы продолжить разговор." },
      { status: 401 },
    );
  let input;
  try {
    input = inputSchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Сообщение должно содержать от 1 до 4000 символов." },
      { status: 400 },
    );
  }
  const { client, user } = session;
  let learningState = initialLearningState();
  let confirmedGoal = null;
  if (input.conversation !== "onboarding") {
    try {
      const { state } = await readLearning(client, user.id);
      if (activeSession(state))
        return Response.json(
          {
            error:
              "Сначала заверши текущее задание. Подсказки доступны внутри занятия; в диагностике их нет.",
          },
          { status: 409 },
        );
      learningState = state;
      confirmedGoal = await readGoal(client, user.id);
    } catch {
      return Response.json(
        { error: "Учебная память недоступна. Попробуй позже." },
        { status: 503 },
      );
    }
  }
  const { data: existing, error: existingError } = await client
    .from("mentor_messages")
    .select("role, content, conversation, onboarding")
    .eq("user_id", user.id)
    .eq("request_id", input.requestId);
  if (existingError)
    return Response.json(
      { error: "Не удалось проверить историю разговора." },
      { status: 503 },
    );
  if (
    existing?.some(
      (message) =>
        message.conversation !== input.conversation ||
        (message.role === "user" && message.content !== input.content),
    )
  )
    return Response.json(
      { error: "Изменённое сообщение нужно отправить заново." },
      { status: 409 },
    );
  const encoder = new TextEncoder();
  const cached = existing?.find((message) => message.role === "assistant");
  if (cached)
    return new Response(
      JSON.stringify({ type: "delta", text: cached.content }) +
        "\n" +
        JSON.stringify({
          type: "done",
          ...(cached.onboarding
            ? {
                onboarding: reviewOnboarding(
                  readOnboardingState(cached.onboarding),
                ),
              }
            : {}),
        }) +
        "\n",
      {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  if (!aiConfigured()) return aiFailure(new AIError("AI_NOT_CONFIGURED"));
  const { data: allowed, error: limitError } =
    await client.rpc("consume_ai_request");
  if (limitError) return aiFailure(new AIError("AI_MEMORY"));
  if (!allowed)
    return aiFailure(
      new AIError(
        "AI_RATE_LIMIT",
        Math.ceil((3600000 - (Date.now() % 3600000)) / 1000),
      ),
    );
  if (!existing?.length) {
    const { error } = await client.from("mentor_messages").insert({
      user_id: user.id,
      conversation: input.conversation,
      role: "user",
      content: input.content,
      request_id: input.requestId,
    });
    if (error?.code === "23505")
      return Response.json(
        {
          error: "Сообщение уже отправляется. Повтори через несколько секунд.",
          retryAfter: 2,
          retryable: true,
        },
        { status: 409 },
      );
    if (error)
      return Response.json(
        { error: "Не удалось сохранить сообщение. Попробуй снова." },
        { status: 503 },
      );
  }
  const [
    { data: history, error: historyError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    client
      .from("mentor_messages")
      .select("role, content, onboarding")
      .eq("user_id", user.id)
      .eq("conversation", input.conversation)
      .order("created_at", { ascending: false })
      .limit(40),
    client.from("profiles").select("data").eq("id", user.id).maybeSingle(),
  ]);
  if (historyError || profileError)
    return Response.json(
      { error: "Память временно недоступна. Повтори отправку позже." },
      { status: 503 },
    );
  const onboardingState = readOnboardingState(
    history.find((m) => m.role === "assistant" && m.onboarding)?.onboarding,
  );
  const userStatements = history
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const upstreamAbort = new AbortController();
  const signal = AbortSignal.any([request.signal, upstreamAbort.signal]);
  let upstream: Response;
  try {
    upstream = await createResponse(
      {
        instructions:
          input.conversation === "onboarding"
            ? lessonZeroInstructions(onboardingState)
            : learningState.diagnosticComplete
              ? teachingInstructions(input.conversation)
              : taskPrompt("diagnostic"),
        input: [
          {
            role: "user",
            content: JSON.stringify({
              memory: buildMemory(
                profile?.data ?? {},
                learningState,
                confirmedGoal,
              ),
            }),
          },
          ...recentConversation(history.toReversed()),
        ],
        stream: true,
        max_output_tokens: input.conversation === "onboarding" ? 5000 : 1800,
        ...(input.conversation === "onboarding"
          ? {
              tools: onboardingTools,
              tool_choice: "required",
              parallel_tool_calls: false,
            }
          : {}),
      },
      signal,
    );
  } catch (cause) {
    return aiFailure(cause);
  }
  if (!upstream.body)
    return Response.json(
      { error: "Не удалось получить ответ. Попробуй снова." },
      { status: 503 },
    );
  let disconnected = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        if (!disconnected)
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        const onDelta = (delta: string) => send({ type: "delta", text: delta });
        let text: string,
          draft: OnboardingState | null = null;
        if (input.conversation === "onboarding") {
          const result = await readOnboardingResponse(
            upstream.body!,
            onboardingState,
            userStatements,
            onDelta,
          );
          text = result.text;
          draft = result.state;
        } else text = await readAIText(upstream.body!, onDelta);
        text = mentorTextSchema.parse(text);
        if (signal.aborted) throw new AIError("AI_CANCELLED");
        const { error } = await client.from("mentor_messages").insert({
          user_id: user.id,
          conversation: input.conversation,
          role: "assistant",
          content: text,
          request_id: input.requestId,
          onboarding: draft,
        });
        if (error?.code === "23505") {
          const { data, error: readError } = await client
            .from("mentor_messages")
            .select("content,onboarding")
            .eq("user_id", user.id)
            .eq("request_id", input.requestId)
            .eq("role", "assistant")
            .single();
          if (readError || !data?.content) throw new AIError("AI_MEMORY");
          text = data.content;
          draft = data.onboarding ? readOnboardingState(data.onboarding) : null;
        } else if (error) throw new AIError("AI_MEMORY");
        send({
          type: "done",
          text,
          ...(draft ? { onboarding: reviewOnboarding(draft) } : {}),
        });
      } catch (cause) {
        send({ type: "error", ...publicAIError(cause) });
      } finally {
        if (!disconnected) controller.close();
      }
    },
    cancel() {
      disconnected = true;
      upstreamAbort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
