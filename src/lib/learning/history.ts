import { curriculum } from "./curriculum.ts";
import type { Evidence, LearningState, Session } from "./types.ts";
export const evidenceKinds: Record<Evidence["kind"], string> = {
  diagnostic: "Диагностика",
  exercise: "Задание",
  quiz: "Квиз",
  project: "Проверка понимания проекта",
  review: "Повторение",
};
export const progressGroups = {
  strong: "Сильные",
  learning: "В процессе",
  weak: "Нужна практика",
  not_started: "Не начаты",
} as const;
export type ProgressGroup = keyof typeof progressGroups;
export function progressGroup(p: {
  mastery: number;
  confidence: number;
  count: number;
}): ProgressGroup {
  if (!p.count) return "not_started";
  if (p.mastery >= 70 && p.confidence >= 45) return "strong";
  return p.mastery >= 35 ? "learning" : "weak";
}
export function evidenceDelta(e: Evidence) {
  return (e.mastery_changes ?? []).reduce(
    (sum, c) => sum + c.after - c.before,
    0,
  );
}
export function sessionHistory(state: LearningState, session: Session) {
  const evidence = state.evidence.filter((e) => e.sessionId === session.id);
  const skills = curriculum.filter((s) =>
    session.questions.some((q) => q.startsWith(s.id + ".")),
  );
  const complete = evidence.every(
    (e) => e.history_complete && !!e.mastery_changes?.length,
  );
  const changes = skills.map((s) => ({
    skill: s.id,
    title: s.short,
    delta: evidence
      .filter((e) => e.skill === s.id)
      .reduce((sum, e) => sum + evidenceDelta(e), 0),
  }));
  const seconds = session.completedAt
    ? Math.max(
        0,
        Math.round(
          (Date.parse(session.completedAt) - Date.parse(session.startedAt)) /
            1000,
        ),
      )
    : null;
  return {
    evidence,
    complete,
    changes,
    seconds,
    topic: skills.map((s) => s.short).join(" · ") || "Python backend",
    correct: session.results.filter((r) => r.correct).length,
    total: session.questions.length,
  };
}
export function durationLabel(seconds: number | null) {
  if (seconds === null) return "Ещё не завершено";
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes} мин ${seconds % 60} с`
    : `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}
export const formatHistoryDate = (value: string) =>
  new Intl.DateTimeFormat("ru", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export const signedDelta = (n: number) => `${n > 0 ? "+" : ""}${n} п. п.`;
