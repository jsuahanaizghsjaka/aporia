import { redirectSignedInUser } from "@/lib/supabase/session";
import { supabaseConfig } from "@/lib/supabase/config";
import { Landing } from "@/components/aporia/landing";
export const dynamic = "force-dynamic";
export default async function Home() {
  await redirectSignedInUser();
  return <Landing configured={!!supabaseConfig()} />;
}
