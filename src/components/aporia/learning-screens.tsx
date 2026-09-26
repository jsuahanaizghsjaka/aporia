"use client";
import { DiagnosticScreen } from "./practice";
import { ProgressScreen } from "./progress-screen";
import { ProjectScreen } from "./project-screen";
import { AdaptiveRoadmapScreen } from "./roadmap-screen";
export function RoadmapScreen() {
  return <AdaptiveRoadmapScreen />;
}
export function LearningScreen({
  screen,
}: {
  screen: "diagnostic" | "projects" | "progress";
}) {
  return screen === "diagnostic" ? (
    <DiagnosticScreen />
  ) : screen === "projects" ? (
    <ProjectScreen />
  ) : (
    <ProgressScreen />
  );
}
