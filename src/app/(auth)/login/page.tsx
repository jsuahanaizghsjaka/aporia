import { AuthForm } from "@/components/aporia/auth-form";
import { supabaseConfig } from "@/lib/supabase/config";
import { redirectSignedInUser } from "@/lib/supabase/session";
import { safeNext } from "@/lib/auth/request";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next ?? null);
  const sessionError = await redirectSignedInUser(next);
  return (
    <AuthForm
      configured={!!supabaseConfig()}
      confirmationError={params.error === "confirmation"}
      initialError={
        sessionError ||
        (params.error === "service"
          ? "Сервис временно недоступен. Попробуй войти ещё раз."
          : "")
      }
      next={next}
    />
  );
}
