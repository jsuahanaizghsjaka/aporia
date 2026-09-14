import { getSession } from "@/lib/supabase/session";
import { graphSchema } from "@/lib/learning/skill-graph";
export async function GET() {
  const s = await getSession();
  if (!s) return Response.json({ error: "Войди в аккаунт." }, { status: 401 });
  try {
    const [catalog, progress] = await Promise.all([
      s.client
        .from("skills")
        .select("id,title,parent_skill_id,prerequisite_skill_id,position")
        .order("position"),
      s.client
        .from("user_skills")
        .select(
          "skill_id,mastery_score,confidence,evidence_count,last_practiced",
        )
        .eq("user_id", s.user.id),
    ]);
    if (catalog.error || progress.error) throw new Error();
    return Response.json(
      graphSchema.parse({ skills: catalog.data, user_skills: progress.data }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Не удалось загрузить карту навыков. Повтори попытку." },
      { status: 503 },
    );
  }
}
