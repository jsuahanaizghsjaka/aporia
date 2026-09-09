import { curriculum } from "./curriculum.ts";
import type { LearningProfile, LearningState, SkillId } from "./types.ts";
export const initialLearningState = (): LearningState => ({
  schema: 1,
  diagnosticComplete: false,
  sessions: [],
  activeSession: null,
  evidence: [],
  reviews: {},
  project: null,
  feedback: [],
  events: [],
  focus: null,
  requestIds: [],
});
export function activeSession(state: LearningState) {
  return (
    state.sessions.find(
      (session) => session.id === state.activeSession && !session.completedAt,
    ) ?? null
  );
}
export function skillProgress(state: LearningState, skill: SkillId) {
  const entries = state.evidence.filter((item) => item.skill === skill);
  // Each question contributes at most its three most recent spaced observations.
  const occurrences = new Map<string, number>();
  const recent = [...entries].reverse().filter((entry) => {
    const count = (occurrences.get(entry.questionId) ?? 0) + 1;
    occurrences.set(entry.questionId, count);
    return count <= 3;
  });
  const mass = recent.reduce(
    (sum, item) => sum + (item.kind === "diagnostic" ? 0.6 : 1),
    0,
  );
  const earned = recent.reduce(
    (sum, item) =>
      sum +
      (item.correct ? item.independence : 0) *
        (item.kind === "diagnostic" ? 0.6 : 1),
    0,
  );
  const diversity = new Set(recent.map((item) => item.questionId)).size;
  const mastery = mass
    ? Math.min(
        95,
        Math.round(100 * (earned / mass) * (1 - Math.exp(-mass / 4))),
      )
    : 0;
  const confidence = Math.min(
    95,
    Math.round((1 - Math.exp(-mass / 5)) * Math.min(1, diversity / 3) * 100),
  );
  return {
    mastery,
    confidence,
    count: entries.length,
    last: entries.at(-1) ?? null,
  };
}
export function dueReviews(state: LearningState, now: Date) {
  return Object.entries(state.reviews)
    .filter(([, review]) => Date.parse(review.due) <= now.getTime())
    .sort((a, b) => a[1].due.localeCompare(b[1].due));
}
export function recommendedSkill(state: LearningState): SkillId {
  const unlocked = curriculum.filter(
    (skill) =>
      !skill.prerequisite ||
      skillProgress(state, skill.prerequisite).mastery >= 35,
  );
  if (state.focus && unlocked.some((skill) => skill.id === state.focus))
    return state.focus;
  return [...unlocked].sort(
    (a, b) =>
      skillProgress(state, a.id).mastery - skillProgress(state, b.id).mastery,
  )[0].id;
}
export function dailyMission(
  state: LearningState,
  profile: LearningProfile,
  now: Date,
) {
  const active = activeSession(state);
  if (!profile.onboardingComplete)
    return {
      title: "Сначала познакомимся",
      reason: "Одна цель и удобный ритм — основа твоего маршрута.",
      path: "/onboarding",
      minutes: 5,
    };
  if (active)
    return {
      title: "Продолжим с того же места",
      reason: `В занятии осталось ${active.questions.length - active.index} заданий. Ответы уже сохранены.`,
      path: active.kind === "diagnostic" ? "/diagnostic" : "/learn",
      minutes: active.minutes,
    };
  if (!state.diagnosticComplete)
    return {
      title: "Найдём твою точку старта",
      reason:
        "Восемь коротких заданий без подсказок. «Пока не знаю» — тоже полезный ответ.",
      path: "/diagnostic",
      minutes: 10,
    };
  const due = dueReviews(state, now);
  const skill = curriculum.find((item) => item.id === recommendedSkill(state))!;
  return {
    title: due.length
      ? "Вернём знания в рабочую память"
      : `${skill.short}: один шаг глубже`,
    reason: due.length
      ? `${due.length} заданий пора повторить. Начнём с самого раннего.`
      : `${skill.detail}. ${state.focus === skill.id ? "Это выбранный тобой фокус." : "Эта тема доступна по основам и пока требует больше практики."}`,
    path: "/learn",
    minutes: profile.dailyMinutes,
  };
}
export function weeklySummary(state: LearningState, now: Date) {
  const since = now.getTime() - 7 * 86400000;
  const evidence = state.evidence.filter(
    (item) => Date.parse(item.at) >= since,
  );
  const sessions = state.sessions.filter(
    (item) => item.completedAt && Date.parse(item.completedAt) >= since,
  );
  const before: LearningState = {
    ...state,
    evidence: state.evidence.filter((item) => Date.parse(item.at) < since),
  };
  const changes = curriculum.map((skill) => ({
    ...skill,
    delta:
      skillProgress(state, skill.id).mastery -
      skillProgress(before, skill.id).mastery,
  }));
  return {
    sessions: sessions.length,
    evidence: evidence.length,
    independent: evidence.filter(
      (item) => item.correct && item.independence === 1,
    ).length,
    changes,
  };
}

export function weeklyFocus(state: LearningState, now: Date) {
  const since = now.getTime() - 7 * 86400000;
  const hard = [...state.feedback]
    .reverse()
    .find((item) => item.rating === "hard" && Date.parse(item.at) >= since);
  const question = state.sessions.find((item) => item.id === hard?.target)
    ?.questions[0];
  const candidate = hard?.target.startsWith("resource:")
    ? hard.target.slice("resource:".length)
    : question?.split(".")[0];
  const skill = curriculum.find((item) => item.id === candidate)?.id;
  return { skill: skill ?? recommendedSkill(state), fromFeedback: !!skill };
}
