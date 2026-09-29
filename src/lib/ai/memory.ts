import { memoryFromProfile } from "../profile/memory.ts";
import { profileSchema } from "../profile/schema.ts";
import { initialLearningState, activeSession } from "../learning/selectors.ts";
import { type LearningState } from "../learning/types.ts";
import { diagnosticResult, masteryUpdate } from "./contracts.ts";

export const memoryLimits = Object.freeze({
  sessions: 5,
  errors: 8,
  decisions: 8,
  messages: 8,
  conversationChars: 12000,
});
const clip = (value: string, limit: number) =>
  value.length > limit ? value.slice(0, limit) + "…" : value;

// Input is chronological. Always retain the latest user message, then the newest
// contiguous context that fits. A bounded tail is not a summary of older facts.
export function recentConversation(
  messages: readonly { role: string; content: string }[],
) {
  const selected: { role: "user" | "assistant"; content: string }[] = [];
  let remaining = memoryLimits.conversationChars;
  for (const message of messages.slice(-memoryLimits.messages).toReversed()) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const content = clip(message.content, 4000);
    if (content.length > remaining) break;
    selected.push({ role: message.role, content });
    remaining -= content.length;
  }
  return selected.reverse();
}

export function buildMemory(
  rawProfile: unknown,
  state: LearningState | undefined = undefined,
  goal: {
    summary: string;
    success_criteria?: string[];
    target_date?: string | null;
  } | null = null,
  now = new Date(),
) {
  const learningAvailable = state !== undefined;
  state ??= initialLearningState();
  const profile = profileSchema.parse(rawProfile);
  const active = activeSession(state);
  const project = state.project;
  const recent = state.sessions.slice(-memoryLimits.sessions);
  return {
    version: 1 as const,
    profile: {
      ...memoryFromProfile(profile),
      goal_summary: goal?.summary ?? profile.goal,
      confirmed_goal: goal
        ? {
            summary: goal.summary,
            success_criteria: goal.success_criteria ?? [],
            target_date: goal.target_date ?? null,
          }
        : null,
      context: profile.context,
      experience: profile.experience,
      workStudy: profile.workStudy,
      weeklyAvailability: profile.weeklyAvailability,
      currentProjects: profile.currentProjects,
    },
    learning: {
      available: learningAvailable,
      diagnostic_completed: learningAvailable ? state.diagnosticComplete : null,
      diagnostic: diagnosticResult(state),
      skills: learningAvailable ? masteryUpdate(state).skills : [],
      recent_errors: recent
        .flatMap((s) =>
          (s.attempts ?? s.results)
            .filter((r) => !r.correct)
            .map((r) => ({
              question: r.questionId,
              at: r.at,
              answer: clip(r.answer, 240),
              hints_used: r.hints_used ?? r.stage,
            })),
        )
        .slice(-memoryLimits.errors),
      focus:
        state.focusUntil && state.focusUntil <= now.toISOString()
          ? null
          : state.focus,
      active: active
        ? {
            kind: active.kind,
            mode: active.mode,
            question: active.questions[active.index] ?? null,
            stage: active.stage,
            phase: active.lesson?.phase ?? null,
          }
        : null,
    },
    project: project
      ? {
          id: project.id,
          title: project.plan?.title ?? project.id,
          goal: project.plan?.goal ?? null,
          mode: project.mode ?? "learn",
          tasks: (project.plan?.tasks ?? []).map((t) => ({
            skill: t.skill,
            title: t.title,
            submitted: !!project.submissions?.[t.skill],
            understanding_checked: project.checkpoints.includes(t.skill),
          })),
          saved_skills: Object.keys(project.artifacts),
          decisions: (project.decisions ?? [])
            .slice(-memoryLimits.decisions)
            .map((d) => ({
              skill: d.skill,
              text: clip(d.text, 500),
              at: d.at,
            })),
          progress: {
            submitted: Object.keys(project.submissions ?? {}).length,
            total: 8,
            checked_skills: project.checkpoints,
          },
        }
      : null,
    recent: {
      available: learningAvailable,
      sessions: recent.map((s) => ({
        id: s.id,
        kind: s.kind,
        started_at: s.startedAt,
        completed_at: s.completedAt,
        skill: s.lesson?.plan.today_skill ?? null,
        answered: s.results.length,
        correct: s.results.filter((r) => r.correct).length,
      })),
      coverage:
        "Последние занятия; отсутствие старых событий в контексте не означает, что их не было.",
    },
  };
}
