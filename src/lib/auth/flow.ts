import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { safeNext } from "./request.ts";
import { profileSchema } from "../profile/schema.ts";

export const credentialsSchema = z.object({
  action: z.enum(["login", "signup"]),
  email: z.string().trim().pipe(z.email().max(254)),
  password: z.string().min(8).max(128),
  next: z.string().nullable().optional(),
});

export function destinationForProfile(
  data: unknown,
  next: string | null = null,
) {
  const profile = profileSchema.safeParse(data);
  if (!profile.success || !profile.data.onboardingComplete)
    return "/onboarding";
  const destination = safeNext(next);
  return destination === "/onboarding" ? "/dashboard" : destination;
}

// The identity comes from a verified Auth response, never the request body.
export async function destinationForUser(
  client: SupabaseClient,
  userId: string,
  next: string | null = null,
) {
  const { data, error } = await client
    .from("profiles")
    .select("data")
    .eq("id", userId)
    .maybeSingle();
  // Do not pretend a missing migration or failed read is a new learner.
  if (error || !data) throw new Error("Profile unavailable");
  return destinationForProfile(data.data, next);
}

export async function authenticate(
  client: SupabaseClient,
  input: z.infer<typeof credentialsSchema>,
  origin: string,
) {
  const result =
    input.action === "signup"
      ? await client.auth.signUp({
          email: input.email,
          password: input.password,
          options: { emailRedirectTo: `${origin}/auth/callback` },
        })
      : await client.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });
  if (result.error) {
    const status =
      result.error.status === 429
        ? 429
        : result.error.status && result.error.status >= 500
          ? 503
          : 400;
    return {
      status,
      body: {
        error:
          status === 429
            ? "Слишком много попыток. Подожди немного и повтори."
            : input.action === "signup"
              ? "Не удалось создать аккаунт. Проверь данные или попробуй позже."
              : "Не удалось войти. Проверь email, пароль и подтверждение почты.",
      },
    };
  }
  if (input.action === "signup" && !result.data.session) {
    return {
      status: 200,
      body: {
        message:
          "Проверь почту: если регистрация доступна, мы отправили ссылку для подтверждения. Открой её в том же браузере, где создавал аккаунт.",
      },
    };
  }
  if (!result.data.session || !result.data.user)
    throw new Error("Session unavailable");
  return {
    status: 200,
    body: {
      next: await destinationForUser(
        client,
        result.data.user.id,
        input.next ?? null,
      ),
    },
  };
}
