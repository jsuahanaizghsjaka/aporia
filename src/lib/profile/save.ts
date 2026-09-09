import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearnerProfile } from "./schema";

export class ProfileSaveError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function validatePreparedAvatar(bytes: Uint8Array, type: string) {
  if (type !== "image/webp" || bytes.length < 20 || bytes.length > 1024 * 1024)
    throw new ProfileSaveError(
      "Подготовь фото в редакторе и попробуй снова.",
      400,
    );
  const signature = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  const declaredSize = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(4, true);
  if (
    signature(0, 4) !== "RIFF" ||
    signature(8, 12) !== "WEBP" ||
    !["VP8 ", "VP8L", "VP8X"].includes(signature(12, 16)) ||
    declaredSize !== bytes.length - 8
  )
    throw new ProfileSaveError("Некорректный формат изображения.", 400);
}

export async function saveProfileRecord(
  client: SupabaseClient,
  userId: string,
  profile: LearnerProfile,
  version: number,
  photo?: { bytes: Uint8Array; type: string } | null,
) {
  const { data: existing, error: readError } = await client
    .from("profiles")
    .select("avatar_path, version")
    .eq("id", userId)
    .maybeSingle();
  if (readError)
    throw new ProfileSaveError(
      "Не удалось загрузить профиль. Попробуй позже.",
      503,
    );
  const conflict = () =>
    new ProfileSaveError(
      "Профиль изменился в другой вкладке. Твои правки остались в форме. Скопируй нужный текст и обнови страницу перед сохранением.",
      409,
    );
  if (Number(existing?.version ?? 0) !== version) throw conflict();
  const oldPath =
    typeof existing?.avatar_path === "string" &&
    existing.avatar_path.startsWith(`${userId}/`)
      ? existing.avatar_path
      : null;
  let avatarPath = oldPath;
  let uploaded: string | null = null;
  let commitStarted = false;
  const storage = client.storage.from("avatars");
  const remove = async (path: string) => {
    try {
      await storage.remove([path]);
    } catch {
      /* Cleanup is best effort. */
    }
  };
  try {
    if (photo) {
      validatePreparedAvatar(photo.bytes, photo.type);
      uploaded = `${userId}/${crypto.randomUUID()}.webp`;
      const { error } = await storage.upload(uploaded, photo.bytes, {
        contentType: "image/webp",
        upsert: false,
        cacheControl: "3600",
      });
      if (error)
        throw new ProfileSaveError(
          "Фото не загрузилось. Попробуй ещё раз.",
          503,
        );
      avatarPath = uploaded;
    } else if (photo === null) avatarPath = null;
    const signed = avatarPath
      ? await storage.createSignedUrl(avatarPath, 3600)
      : null;
    if (signed?.error)
      throw new ProfileSaveError(
        "Не удалось подготовить фото. Попробуй ещё раз.",
        503,
      );
    const saved = { ...profile, avatarPath };
    commitStarted = true;
    const { data, error } = await client.rpc("commit_profile", {
      _expected_version: version,
      _data: saved,
      _avatar_path: avatarPath,
    });
    // A network error can arrive after PostgreSQL committed. Keep the uploaded
    // object in this ambiguous case; deleting it could break the saved profile.
    if (error || data == null)
      throw new ProfileSaveError(
        "Не удалось подтвердить сохранение. Обнови страницу, чтобы проверить профиль; правки пока остаются в форме.",
        503,
      );
    if (Number(data) < 0) {
      commitStarted = false;
      throw conflict();
    }
    uploaded = null;
    if (oldPath && oldPath !== avatarPath) await remove(oldPath);
    return {
      ...saved,
      version: Number(data),
      avatarUrl: signed?.data?.signedUrl ?? null,
    };
  } catch (error) {
    if (uploaded && !commitStarted) await remove(uploaded);
    throw error;
  }
}
