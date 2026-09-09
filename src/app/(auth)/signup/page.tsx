import { AuthForm } from "@/components/aporia/auth-form";
import { supabaseConfig } from "@/lib/supabase/config";
import { getSession } from "@/lib/supabase/session";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  return <AuthForm signup configured={!!supabaseConfig()} />;
}
