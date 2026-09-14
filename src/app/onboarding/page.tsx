import { MentorChat } from "@/components/aporia/mentor-chat";
import { readProfile } from "@/lib/supabase/session";
import { redirect } from "next/navigation";
import { aiConfigured } from "@/lib/ai/provider";
export default async function OnboardingPage() {
  const profile = await readProfile();
  if (profile.onboardingComplete) redirect("/dashboard");
  return <MentorChat onboarding aiAvailable={aiConfigured()} />;
}
