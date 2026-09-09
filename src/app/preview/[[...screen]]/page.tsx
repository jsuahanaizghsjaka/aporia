import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ProfileProvider } from "@/components/aporia/profile-provider";
import { Dashboard } from "@/components/aporia/dashboard";
import { ProfileEditor } from "@/components/aporia/profile-editor";
import { PracticeScreen } from "@/components/aporia/practice";
import { MentorChat } from "@/components/aporia/mentor-chat";
import {
  RoadmapScreen,
  LearningScreen,
} from "@/components/aporia/learning-screens";
export const metadata: Metadata = {
  title: "Предпросмотр",
  robots: { index: false, follow: false },
};
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const { screen } = await params;
  const path = screen?.join("/") ?? "dashboard";
  const pages: Record<string, React.ReactNode> = {
    dashboard: <Dashboard />,
    profile: <ProfileEditor />,
    onboarding: <MentorChat onboarding />,
    learn: <PracticeScreen />,
    roadmap: <RoadmapScreen />,
    diagnostic: <LearningScreen screen="diagnostic" />,
    projects: <LearningScreen screen="projects" />,
    progress: <LearningScreen screen="progress" />,
  };
  if (!Object.hasOwn(pages, path)) notFound();
  return (
    <ProfileProvider preview>
      <AppShell>{pages[path]}</AppShell>
    </ProfileProvider>
  );
}
