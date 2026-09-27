import { curriculum } from "./curriculum.ts";
import { recommendedSkill, skillProgress } from "./selectors.ts";
import { weekKey } from "../profile/schedule.ts";
import type { LearningProfile, LearningState, SkillId } from "./types.ts";

export function availableFocus(state: LearningState) {
  return curriculum
    .filter(
      (s) =>
        !s.prerequisite || skillProgress(state, s.prerequisite).mastery >= 35,
    )
    .map((s) => s.id);
}
export function createWeeklyReview(
  state: LearningState,
  profile: LearningProfile,
  id: string,
  now: Date,
  suggested?: SkillId,
) {
  const from = new Date(+now - 7 * 86400000).toISOString(),
    at = now.toISOString();
  const inside = (time: string) => time >= from && time <= at;
  const sessions = state.sessions.filter(
    (s) => s.completedAt && inside(s.completedAt),
  ).length;
  const attempts = state.sessions
    .flatMap((s) => s.attempts ?? s.results)
    .filter((r) => inside(r.at));
  // time_spent is cumulative since questionStartedAt, including retries.
  // Count only the increase inside this window, never each retry's full time.
  const seconds = state.sessions.reduce((total, session) => {
    const byQuestion = new Map<string, { before: number; within: number }>();
    for (const result of session.attempts ?? session.results) {
      if (result.time_spent === undefined || result.at > at) continue;
      const time = byQuestion.get(result.questionId) ?? {
        before: 0,
        within: 0,
      };
      if (result.at < from)
        time.before = Math.max(time.before, result.time_spent);
      else time.within = Math.max(time.within, result.time_spent);
      byQuestion.set(result.questionId, time);
    }
    return (
      total +
      [...byQuestion.values()].reduce(
        (sum, t) => sum + Math.max(0, t.within - t.before),
        0,
      )
    );
  }, 0);
  const untrackedAnswers = attempts.filter(
    (r) => r.time_spent === undefined,
  ).length;
  const changes = curriculum.flatMap((s) => {
    const history = state.evidence
      .filter((e) => e.skill === s.id)
      .flatMap((e) => e.mastery_changes ?? [])
      .filter((c) => inside(c.at))
      .sort((a, b) => a.at.localeCompare(b.at));
    return history.length
      ? [{ skill: s.id, delta: history.at(-1)!.after - history[0].before }]
      : [];
  });
  const weakSkills = curriculum
    .filter((s) => {
      const p = skillProgress(state, s.id);
      return p.count > 0 && p.mastery < 35;
    })
    .map((s) => s.id);
  const submissions = Object.values(state.project?.submissions ?? {});
  const projectTasks = submissions.filter((s) => inside(s.at)).length;
  const suggestedFocus =
    suggested ?? recommendedSkill({ ...state, focus: null });
  if (!availableFocus(state).includes(suggestedFocus))
    throw new Error("Для этого фокуса сначала нужны базовые навыки.");
  const improved = changes.filter((c) => c.delta > 0).length;
  return {
    id,
    week: weekKey(now, profile.schedule?.timeZone),
    timeZone: profile.schedule?.timeZone ?? "UTC",
    from,
    at,
    source: suggested ? ("ai" as const) : ("prepared" as const),
    sessions,
    seconds,
    untrackedAnswers,
    evidence: state.evidence.filter((e) => inside(e.at)).length,
    changes,
    incompleteHistory: state.evidence.some(
      (e) => inside(e.at) && !e.history_complete,
    ),
    weakSkills,
    projectTasks,
    projectTotal: submissions.length,
    summary:
      sessions || attempts.length
        ? `За последние 7 дней завершено занятий: ${sessions}. Рост оценки подтверждён по направлениям: ${improved}. В проекте сдано задач за период: ${projectTasks}. ${weakSkills.length ? "Вернись к слабым темам короткими самостоятельными подходами." : "Закрепляй результат самостоятельными ответами и повторением."}`
        : "За последние 7 дней пока нет учебных ответов. Начни с короткого занятия: отсутствие практики не означает потерю навыка.",
    suggestedFocus,
    confirmedFocus: null,
    confirmedAt: null,
  };
}
