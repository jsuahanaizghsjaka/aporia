import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import { z } from "zod";
import { structuredResponse } from "@/lib/ai/structured";
import { AIError, publicAIError } from "@/lib/ai/errors";
import { goalDraftSchema } from "@/lib/goals/schema";
import { buildMemory } from "@/lib/ai/memory";
import { taskPrompt } from "@/prompts/tasks";
export const maxDuration = 90;
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const s = await getSession();
  if (!s) return Response.json({ error: "Войди в аккаунт." }, { status: 401 });
  let wish;
  try {
    const text = await request.text();
    if (text.length > 3000) throw new Error();
    wish = z
      .object({ wish: z.string().trim().min(3).max(1000) })
      .strict()
      .parse(JSON.parse(text)).wish;
  } catch {
    return Response.json(
      { error: "Опиши пожелание: от 3 до 1000 символов." },
      { status: 400 },
    );
  }
  try {
    const { data: p, error } = await s.client
      .from("profiles")
      .select("data")
      .eq("id", s.user.id)
      .maybeSingle();
    if (error) throw new AIError("AI_MEMORY");
    if (!p?.data?.onboardingComplete)
      return Response.json(
        { error: "Сначала подтверди профиль." },
        { status: 409 },
      );
    const quota = await s.client.rpc("consume_ai_request");
    if (quota.error) throw new AIError("AI_MEMORY");
    if (!quota.data) throw new AIError("AI_RATE_LIMIT", 60);
    const candidate = await structuredResponse(
      goalDraftSchema,
      "learning_goal",
      taskPrompt("goal"),
      { wish, memory: buildMemory(p.data) },
      request.signal,
    );
    return Response.json(
      { candidate: { ...candidate, target_date: null }, confirmed: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    const { status, ...data } = publicAIError(cause);
    return Response.json(data, { status });
  }
}
