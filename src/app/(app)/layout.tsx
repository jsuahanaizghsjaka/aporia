import { AppShell } from "@/components/app-shell";
import { ProfileProvider } from "@/components/aporia/profile-provider";
import { readProfile } from "@/lib/supabase/session";
export const dynamic = "force-dynamic";
export default async function LearningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await readProfile();
  return (
    <ProfileProvider initialProfile={profile}>
      <AppShell>{children}</AppShell>
    </ProfileProvider>
  );
}
