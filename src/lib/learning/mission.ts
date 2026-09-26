import {
  activeSession,
  dueReviews,
  recommendedSkill,
  skillProgress,
} from "./selectors.ts";
import { curriculum } from "./curriculum.ts";
import { roadmapWithState } from "../roadmaps/derive.ts";
import type { RoadmapRecord } from "../roadmaps/schema.ts";
import type { LearningProfile, LearningState, SkillId } from "./types.ts";
export type MissionContext = {
  state: LearningState;
  profile: LearningProfile;
  goal: { summary: string } | null;
  roadmap: RoadmapRecord | null;
  availableMinutes: number;
};
export function selectMission(context: MissionContext, now = new Date()) {
  const { state, profile, goal, roadmap } = context;
  const current = activeSession(state);
  const minutes =
    current?.lesson?.plan.estimated_time ??
    Math.min(120, Math.max(5, Math.floor(context.availableMinutes)));
  let skill: SkillId = recommendedSkill(state);
  let kind:
    "onboarding" | "goal" | "diagnostic" | "resume" | "review" | "practice" =
    "practice";
  let reason =
    "Начнём с доступной темы, которой пока не хватает подтверждённой практики.";
  let path = "/learn";
  if (!profile.onboardingComplete) {
    kind = "onboarding";
    path = "/onboarding";
    reason = "Сначала познакомимся и выберем удобный ритм.";
  } else if (current) {
    kind = "resume";
    const id =
      current.questions[Math.min(current.index, current.questions.length - 1)];
    skill =
      current.lesson?.plan.today_skill ??
      curriculum.find((s) => id?.startsWith(s.id + "."))?.id ??
      skill;
    path = current.kind === "diagnostic" ? "/diagnostic" : "/learn";
    reason =
      "Продолжим сохранённое занятие с того же места. Новая сессия не создаётся.";
  } else if (!goal) {
    kind = "goal";
    path = "/profile";
    reason = "Подтверди одну цель и критерии её достижения.";
  } else if (!state.diagnosticComplete) {
    kind = "diagnostic";
    path = "/diagnostic";
    reason =
      "Девять заданий определят точку старта. Можно пройти их за несколько подходов.";
  } else {
    const due = dueReviews(state, now).find(([id]) =>
      curriculum.some((s) => id.startsWith(s.id + ".")),
    );
    const route = roadmapWithState(roadmap, state).find(
      (s) => s.state === "current",
    );
    if (due) {
      kind = "review";
      skill = due[0].split(".")[0] as SkillId;
      reason = "Срок повторения уже наступил. Начнём с самого раннего задания.";
    } else if (route) {
      skill = route.skill_id;
      reason = "Это текущий шаг подтверждённого маршрута. " + route.reason;
    }
    const errors = state.sessions
      .slice(-5)
      .flatMap((s) => s.attempts ?? s.results)
      .filter((r) => r.questionId.startsWith(skill + ".") && !r.correct).length;
    if (errors)
      reason += ` В последних занятиях здесь было ошибок: ${errors}; сначала разберём опору.`;
    if (state.project)
      reason += state.project.checkpoints.includes(skill)
        ? " В проекте проверим граничный случай знакомого этапа."
        : " Затем применим навык к следующей части проекта.";
    reason += ` Сегодня используем ${minutes} минут из указанного тобой времени.`;
  }
  const theory = Math.max(1, Math.floor(minutes * 0.2));
  const project = Math.max(1, Math.floor(minutes * 0.25));
  const short = curriculum.find((s) => s.id === skill)?.short ?? "Python";
  return {
    today_skill: skill,
    estimated_time: minutes,
    reason: reason.slice(0, 1500),
    goal: goal?.summary ?? profile.goal,
    theory,
    exercise: minutes - theory - project,
    project,
    kind,
    path,
    title:
      kind === "resume"
        ? "Продолжим с того же места"
        : kind === "review"
          ? `${short}: время повторить`
          : kind === "diagnostic"
            ? "Найдём точку старта"
            : kind === "onboarding"
              ? "Сначала познакомимся"
              : kind === "goal"
                ? "Определим результат"
                : `${short}: один понятный шаг`,
    mastery: skillProgress(state, skill),
    savedPlan: current?.lesson?.plan ?? null,
  };
}
