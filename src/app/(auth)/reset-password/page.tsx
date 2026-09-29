import { PasswordRecovery } from "@/components/aporia/password-recovery";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Новый пароль | Aporia",
  robots: { index: false, follow: false },
};
export default async function ResetPassword() {
  const client = await createClient();
  const result = client ? await client.auth.getUser().catch(() => null) : null;
  return (
    <PasswordRecovery
      reset
      configured={!!client}
      allowed={!!result?.data.user && !result.error}
    />
  );
}
