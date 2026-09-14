import { AuthForm } from "@/components/aporia/auth-form";
import { supabaseConfig } from "@/lib/supabase/config";
import { redirectSignedInUser } from "@/lib/supabase/session";
export const dynamic = "force-dynamic";
export default async function SignupPage() {
  const initialError = await redirectSignedInUser();
  return (
    <AuthForm
      signup
      configured={!!supabaseConfig()}
      initialError={initialError || ""}
    />
  );
}
