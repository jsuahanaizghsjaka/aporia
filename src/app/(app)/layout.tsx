import { AppShell } from "@/components/app-shell";
import { ProfileProvider } from "@/components/aporia/profile-provider";
import { readProfile } from "@/lib/supabase/session";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function LearningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await readProfile();
  if (!profile.onboardingComplete) redirect("/onboarding");
  return (
    <ProfileProvider initialProfile={profile}>
      <AppShell>{children}</AppShell>
    </ProfileProvider>
  );
}
