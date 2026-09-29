import { PasswordRecovery } from "@/components/aporia/password-recovery";
import { supabaseConfig } from "@/lib/supabase/config";
export const metadata = { title: "Восстановить пароль | Aporia" };
export default function ForgotPassword() {
  return <PasswordRecovery configured={!!supabaseConfig()} />;
}
