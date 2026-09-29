import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import { structuredResponse } from "@/lib/ai/structured";
import { AIError, publicAIError } from "@/lib/ai/errors";
import { userProfileSchema } from "@/lib/ai/contracts";
import { buildMemory, recentConversation } from "@/lib/ai/memory";
import { taskPrompt } from "@/prompts/tasks";
import { readOnboardingState } from "@/lib/onboarding/ai-state";
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
    const [
      { data: profile, error: pError },
      { data: messages, error: mError },
    ] = await Promise.all([
      session.client
        .from("profiles")
        .select("data, version")
        .eq("id", session.user.id)
        .maybeSingle(),
      session.client
        .from("mentor_messages")
        .select("role,content,onboarding")
        .eq("user_id", session.user.id)
        .eq("conversation", "onboarding")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    if (pError || mError) throw new AIError("AI_MEMORY");
    if (!messages?.length)
      return Response.json(
        { error: "Сначала пройди знакомство." },
        { status: 409 },
      );
    const { data: allowed, error } =
      await session.client.rpc("consume_ai_request");
    if (error) throw new AIError("AI_MEMORY");
    if (!allowed) throw new AIError("AI_RATE_LIMIT", 60);
    const candidate = await structuredResponse(
      userProfileSchema,
      "profile_memory",
      taskPrompt("profile"),
      {
        memory: buildMemory(profile?.data ?? {}),
        onboarding_draft: readOnboardingState(
          messages.find((m) => m.role === "assistant" && m.onboarding)
            ?.onboarding,
        ),
        statements: recentConversation(
          messages.toReversed().filter((m) => m.role === "user"),
        ),
      },
      request.signal,
    );
    return Response.json(
      { candidate, version: Number(profile?.version ?? 0), confirmed: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    const { status, ...data } = publicAIError(cause);
    return Response.json(data, { status });
  }
}
