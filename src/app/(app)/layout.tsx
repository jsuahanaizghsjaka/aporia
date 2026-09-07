import { AppShell } from "@/components/app-shell";

export default function LearningLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
