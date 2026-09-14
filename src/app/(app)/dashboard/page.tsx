import { Dashboard } from "@/components/aporia/dashboard";
import { readProfile } from "@/lib/supabase/session";
import { redirect } from "next/navigation";
export default async function DashboardPage() {
  const profile = await readProfile();
  if (!profile.onboardingComplete) redirect("/onboarding");
  return <Dashboard />;
}
