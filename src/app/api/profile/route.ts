import { z } from "zod";
import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
import { profileSchema } from "@/lib/profile/schema";
import { ProfileSaveError, saveProfileRecord } from "@/lib/profile/save";

export async function PUT(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const session = await getSession();
  if (!session)
    return Response.json(
      { error: "Войди в аккаунт, чтобы сохранить профиль." },
      { status: 401 },
    );
  if (Number(request.headers.get("content-length")) > 2 * 1024 * 1024)
    return Response.json({ error: "Фото слишком большое." }, { status: 413 });
  try {
    const form = await request.formData();
    const profile = profileSchema.parse(
      JSON.parse(String(form.get("profile"))),
    );
    const version = z
      .number()
      .int()
      .nonnegative()
      .parse(form.has("version") ? Number(form.get("version")) : undefined);
    const file = form.get("photo");
    if (file instanceof File && file.size > 1024 * 1024)
      return Response.json({ error: "Фото слишком большое." }, { status: 413 });
    const photo =
      file instanceof File
        ? { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type }
        : form.get("removePhoto") === "true"
          ? null
          : undefined;
    const saved = await saveProfileRecord(
      session.client,
      session.user.id,
      profile,
      version,
      photo,
    );
    return Response.json(
      { profile: saved },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ProfileSaveError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json(
        { error: "Проверь имя, цель и остальные поля профиля." },
        { status: 400 },
      );
    return Response.json(
      {
        error:
          "Не удалось сохранить профиль. Твои правки остались в форме — попробуй ещё раз.",
      },
      { status: 503 },
    );
  }
}
