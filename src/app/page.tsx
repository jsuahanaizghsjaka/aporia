import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/session";
import { supabaseConfig } from "@/lib/supabase/config";
import { Landing } from "@/components/aporia/landing";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (await getSession()) redirect("/dashboard");
  return <Landing configured={!!supabaseConfig()} />;
}
