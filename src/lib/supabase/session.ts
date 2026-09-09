import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import {
  emptyProfile,
  profileSchema,
  type ProfileView,
} from "@/lib/profile/schema";

export const getSession = cache(async () => {
  const client = await createClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, user: data.user };
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function readProfile(): Promise<ProfileView> {
  const { client, user } = await requireSession();
  const { data, error } = await client
    .from("profiles")
    .select("data, avatar_path, version")
    .eq("id", user.id)
    .maybeSingle();
  if (error)
    throw new Error(
      "Не удалось загрузить профиль. Проверь подключение базы данных.",
    );
  if (!data) return emptyProfile;
  const profile = profileSchema.parse(data.data);
  const path =
    typeof data.avatar_path === "string" &&
    data.avatar_path.startsWith(`${user.id}/`)
      ? data.avatar_path
      : null;
  const signed = path
    ? await client.storage.from("avatars").createSignedUrl(path, 3600)
    : null;
  return {
    ...profile,
    avatarPath: path,
    avatarUrl: signed?.data?.signedUrl ?? null,
    version: Number(data.version),
  };
}
