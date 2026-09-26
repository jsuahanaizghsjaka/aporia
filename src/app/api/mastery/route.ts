import { getSession } from "@/lib/supabase/session";
import { readLearning } from "@/lib/learning/storage";
import { masterySnapshot } from "@/lib/learning/mastery";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Войди в аккаунт." }, { status: 401 });
  try {
    const learning = await readLearning(session.client, session.user.id);
    return Response.json(masterySnapshot(learning.state), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "Не удалось загрузить уровень навыков." }, { status: 503 });
  }
}
