import { AuthForm } from "@/components/aporia/auth-form";
import { supabaseConfig } from "@/lib/supabase/config";
import { getSession } from "@/lib/supabase/session";
import { redirect } from "next/navigation";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const params = await searchParams;
  return (
    <AuthForm
      configured={!!supabaseConfig()}
      confirmationError={params.error === "confirmation"}
    />
  );
}
