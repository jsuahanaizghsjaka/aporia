import { AppShell } from "@/components/app-shell";
import { ProfileProvider } from "@/components/aporia/profile-provider";
import { readProfile } from "@/lib/supabase/session";
import { ObservedEvent } from "@/components/aporia/observed-event";
export const dynamic = "force-dynamic";
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await readProfile();
  return (
    <ProfileProvider initialProfile={profile}>
      <AppShell>
        <ObservedEvent name="onboarding_started" />
        {children}
      </AppShell>
    </ProfileProvider>
  );
}
