import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import {
  readOnboardingState,
  reviewOnboarding,
} from "@/lib/onboarding/ai-state";
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Войди в аккаунт." }, { status: 401 });
  const { data, error } = await session.client
    .from("mentor_messages")
    .select("role,onboarding")
    .eq("user_id", session.user.id)
    .eq("conversation", "onboarding")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error)
    return Response.json(
      { error: "Не удалось прочитать черновик. Попробуй позже." },
      { status: 503 },
    );
  if (data[0]?.role !== "assistant" || !data[0]?.onboarding)
    return Response.json(
      { error: "Дождись ответа ментора или заполни профиль самостоятельно." },
      { status: 409 },
    );
  return Response.json(
    reviewOnboarding(readOnboardingState(data[0].onboarding)),
    { headers: { "Cache-Control": "no-store" } },
  );
}
