"use client";
import { LearningGate } from "./learning-provider";
import { DiagnosticScreen } from "./practice";
import { ProgressScreen, SkillRows } from "./progress-screen";
import { ProjectScreen } from "./project-screen";
export function RoadmapScreen() {
  return (
    <div className="page-enter learning-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ОДИН МАРШРУТ · PYTHON BACKEND</p>
          <h1>От первой строки до своего API.</h1>
          <p>
            Карта навыков и их основ. Миссия выбирает доступную тему, которую
            полезнее потренировать сейчас.
          </p>
        </div>
      </div>
      <LearningGate>
        <SkillRows resources />
      </LearningGate>
      <p className="quiet-copy">
        По одному основному источнику на тему. Достаточно материала для
        следующего шага, без бесконечного списка курсов.
      </p>
    </div>
  );
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
