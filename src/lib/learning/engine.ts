import { teachingStages } from "./curriculum.ts";
import { selectMission, type MissionContext } from "./mission.ts";
import { resolveTeacher } from "./teacher.ts";
import {
  activeSession,
  dueReviews,
  recommendedSkill,
  skillProgress,
} from "./selectors.ts";
import { generateProjectPlan } from "./projects.ts";
import {
  concepts,
  grade,
  questionById,
  questionKind,
  questions,
} from "./question-bank.ts";
import type {
  LearningAction,
  LearningProfile,
  LearningState,
  LearningView,
  Question,
  Session,
  SkillId,
} from "./types.ts";
const DAY = 86400000;
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function event(state: LearningState, name: string, at: string) {
  state.events = [...state.events, { name, at }].slice(-300);
}
function observe(
  state: LearningState,
  question: Question,
  answer: string,
  stage: number,
  kind: "diagnostic" | "exercise" | "review" | "project",
  sessionId: string,
  now: Date,
) {
  const before = skillProgress(state, question.skill).mastery;
  const correct = grade(question, answer);
  const previous = state.evidence
    .filter((item) => item.questionId === question.id)
    .at(-1);
  const review = state.reviews[question.id];
  // No new evidence from immediate retries or reopening a completed question.
  const independence = [1, 0.75, 0.5, 0.25, 0, 0][stage];
  let observed = false;
  if (previous?.sessionId === sessionId) {
    observed = true;
    previous.answer = answer;
    previous.correct = correct;
    previous.independence = Math.min(previous.independence, independence);
    previous.hints_used = Math.max(previous.hints_used ?? 0, stage);
  } else if (!previous || (review && Date.parse(review.due) <= now.getTime())) {
    requireThat(
      state.evidence.length < 5000,
      "История заполнена. Напиши в поддержку перед следующим занятием.",
    );
    observed = true;
    state.evidence.push({
      answer,
      source_id: `${sessionId}:${question.id}`,
      history_complete: true,
      mastery_changes: [],
      id: `${sessionId}:${question.id}`,
      questionId: question.id,
      skill: question.skill,
      kind,
      correct,
      independence,
      at: now.toISOString(),
      sessionId,
      hints_used: stage,
    });
    const interval =
      correct && independence === 1
        ? Math.min(5, (review?.interval ?? -1) + 1)
        : 0;
    state.reviews[question.id] = {
      due: new Date(
        now.getTime() + [1, 3, 7, 14, 30, 60][interval] * DAY,
      ).toISOString(),
      interval,
    };
  }
  if (observed) {
    const evidence = state.evidence
      .filter((item) => item.questionId === question.id)
      .at(-1)!;
    evidence.source_id ??= evidence.id;
    const changes = (evidence.mastery_changes ??= []);
    requireThat(
      changes.length < 100,
      "Лимит наблюдений для задания достигнут.",
    );
    changes.push({
      before,
      after: skillProgress(state, question.skill).mastery,
      at: now.toISOString(),
    });
  }
  return correct;
}
function complete(state: LearningState, session: Session, at: string) {
  session.completedAt = at;
  state.activeSession = null;
  if (session.kind === "diagnostic") state.diagnosticComplete = true;
  event(
    state,
    session.kind === "diagnostic"
      ? "diagnostic_completed"
      : "session_completed",
    at,
  );
}
export function applyAction(
  current: LearningState,
  action: LearningAction,
  profile: LearningProfile,
  requestId: string,
  now = new Date(),
  context?: Pick<MissionContext, "goal" | "roadmap">,
): LearningState {
  if (current.requestIds.includes(requestId)) return current;
  const state = structuredClone(current),
    at = now.toISOString();
  const session = activeSession(state);
  requireThat(
    profile.onboardingComplete || action.type === "resource_open",
    "Сначала подтверди цель и профиль в знакомстве.",
  );
  switch (action.type) {
    case "set_mode":
      requireThat(
        session && session.kind !== "diagnostic",
        "Режим меняется только в учебном занятии.",
      );
      session.mode = action.mode;
      // Switching back never erases help already exposed.
      event(state, "session_mode_changed", at);
      break;
    case "set_project_mode":
      requireThat(state.project, "Сначала выбери проект.");
      state.project.mode = action.mode;
      break;
    case "start_diagnostic": {
      requireThat(
        !state.diagnosticComplete,
        "Диагностика уже пройдена. Дальше — практика и повторение.",
      );
      if (session) break;
      requireThat(
        state.sessions.length < 1000,
        "История занятий заполнена. Напиши в поддержку.",
      );
      state.sessions.push({
        id: requestId,
        kind: "diagnostic",
        mode: "learn",
        questions: questions
          .filter((q) => q.id.endsWith(".d"))
          .map((q) => q.id),
        index: 0,
        stage: 0,
        results: [],
        startedAt: at,
        questionStartedAt: at,
        completedAt: null,
        minutes: 10,
      });
      state.activeSession = requestId;
      event(state, "diagnostic_started", at);
      break;
    }
    case "start_lesson":
    case "start_session": {
      requireThat(state.diagnosticComplete, "Сначала пройди диагностику.");
      if (session) break;
      requireThat(
        state.sessions.length < 1000,
        "История занятий заполнена. Напиши в поддержку.",
      );
      const lesson = action.type === "start_lesson";
      const minutes = lesson ? action.minutes : profile.dailyMinutes;
      const mission = selectMission(
        {
          state,
          profile,
          goal: context?.goal ?? { summary: profile.goal },
          roadmap: context?.roadmap ?? null,
          availableMinutes: minutes,
        },
        now,
      );
      const skill = lesson
        ? mission.today_skill
        : (action.skill ?? recommendedSkill(state));
      const due = dueReviews(state, now).filter(
        ([id]) => !lesson || id.startsWith(skill + "."),
      );
      const count = Math.max(
        1,
        Math.min(3, Math.floor(lesson ? mission.exercise / 5 : minutes / 8)),
      );
      const bank = questions.filter(
        (q) => q.skill === skill && /\.[123]$/.test(q.id),
      );
      bank.sort(
        (a, b) =>
          state.evidence.filter((e) => e.questionId === a.id).length -
          state.evidence.filter((e) => e.questionId === b.id).length,
      );
      const level =
        skillProgress(state, skill).mastery < 35
          ? 1
          : skillProgress(state, skill).mastery < 65
            ? 2
            : 3;
      const variants = Array.from(
        { length: 20 },
        (_, i) => `${skill}.v1.${level}.${i}`,
      ).sort(
        (a, b) =>
          state.evidence.filter((e) => e.questionId === a).length -
          state.evidence.filter((e) => e.questionId === b).length,
      );
      const ids = due.length
        ? due.slice(0, count).map(([id]) => id)
        : lesson
          ? variants.slice(0, count)
          : bank.slice(0, count).map((q) => q.id);
      state.sessions.push({
        id: requestId,
        kind: due.length ? "review" : "practice",
        mode: action.mode,
        questions: ids,
        index: 0,
        stage: 0,
        results: [],
        startedAt: at,
        completedAt: null,
        minutes,
        attempts: [],
        questionStartedAt: at,
        ...(lesson
          ? {
              lesson: {
                plan: {
                  today_skill: skill,
                  estimated_time: minutes,
                  reason: mission.reason,
                  goal: mission.goal,
                  theory: mission.theory,
                  exercise: mission.exercise,
                  project: mission.project,
                },
                phase: "theory" as const,
                teacher: resolveTeacher(
                  skill,
                  { explanation: "concept", reflection: "example" },
                  "prepared",
                ),
              },
            }
          : {}),
      });
      state.activeSession = requestId;
      event(state, "session_started", at);
      break;
    }
    case "finish_theory": {
      requireThat(
        session?.lesson?.phase === "theory",
        "Сначала открой теорию текущего занятия.",
      );
      session.lesson.phase = "exercise";
      session.questionStartedAt = at;
      event(state, "theory_completed", at);
      break;
    }
    case "finish_project": {
      requireThat(
        session?.lesson?.phase === "project",
        "Сначала заверши практику занятия.",
      );
      requireThat(
        action.reflection.trim().length >= 20,
        "Опиши применение: минимум 20 символов.",
      );
      session.lesson.reflection = action.reflection;
      complete(state, session, at);
      break;
    }
    case "hint": {
      requireThat(
        session && session.kind !== "diagnostic",
        "В диагностике подсказок нет.",
      );
      requireThat(
        !session.results[session.index],
        "Ответ уже проверен — переходи к следующему заданию.",
      );
      requireThat(
        !session.lesson || session.lesson.phase === "exercise",
        "Сначала перейди к практике.",
      );
      session.stage =
        session.mode === "help"
          ? 5
          : Math.min(teachingStages.length - 1, session.stage + 1);
      event(state, "hint_requested", at);
      break;
    }
    case "answer": {
      requireThat(session, "Сначала начни занятие.");
      requireThat(!session.results[session.index], "Этот ответ уже сохранён.");
      requireThat(
        !session.lesson || session.lesson.phase === "exercise",
        "Сначала перейди к практике.",
      );
      const attempts = (session.attempts ??= []);
      requireThat(
        attempts.length < 100,
        "Лимит попыток в этом занятии достигнут.",
      );
      const question = questionById(session.questions[session.index]);
      const correct = observe(
        state,
        question,
        action.answer,
        session.stage,
        session.kind === "practice" ? "exercise" : session.kind,
        session.id,
        now,
      );
      const result = {
        questionId: question.id,
        answer: action.answer,
        correct,
        stage: session.stage,
        at,
        hints_used: session.stage,
        skill_id: question.skill,
        time_spent: Math.min(
          7200,
          Math.max(
            0,
            Math.floor(
              (now.getTime() -
                Date.parse(session.questionStartedAt ?? session.startedAt)) /
                1000,
            ),
          ),
        ),
      };
      attempts.push(result);
      if (session.kind === "diagnostic" || correct || session.stage === 5)
        session.results.push(result);
      else
        session.stage =
          session.mode === "help" ? 5 : Math.min(5, session.stage + 1);
      if (session.kind === "diagnostic") {
        session.index++;
        session.questionStartedAt = at;
        if (session.index === session.questions.length)
          complete(state, session, at);
      }
      event(state, "answer_submitted", at);
      break;
    }
    case "next": {
      requireThat(
        session && session.results[session.index],
        "Сначала ответь или выбери «Пока не знаю».",
      );
      session.index++;
      session.questionStartedAt = at;
      session.stage = 0;
      if (session.index === session.questions.length) {
        if (session.lesson) session.lesson.phase = "project";
        else complete(state, session, at);
      }
      break;
    }
    case "choose_project": {
      requireThat(
        state.diagnosticComplete,
        "Проект выбираем после диагностики.",
      );
      requireThat(!state.project, "У тебя уже есть один активный проект.");
      state.project = {
        id: action.projectId,
        startedAt: at,
        artifacts: {},
        checkpoints: [],
        checks: {},
        reviews: {},
        plan: generateProjectPlan(
          state,
          profile,
          context?.goal?.summary ?? profile.goal,
          action.projectId,
        ),
        mode: "learn",
        assistance: {},
        submissions: {},
        messages: [],
        decisions: [],
      };
      event(state, "project_started", at);
      break;
    }
    case "save_artifact": {
      requireThat(state.project, "Сначала выбери проект.");
      state.project.artifacts[action.skill] = action.artifact;
      const submitted = state.project.submissions?.[action.skill];
      if (submitted && submitted.artifact !== action.artifact) {
        delete state.project.submissions![action.skill];
      }
      event(state, "artifact_saved", at);
      break;
    }
    case "project_answer": {
      requireThat(
        state.project &&
          state.project.artifacts[action.skill]?.trim().length >= 20,
        "Сначала сохрани код или описание решения: минимум 20 символов.",
      );
      requireThat(
        !session || session.kind !== "diagnostic",
        "Заверши диагностику прежде, чем перейти к проекту.",
      );
      const question = questionById(`${action.skill}.project`);
      if (state.project.checks[action.skill]?.correct) break;
      const exposed =
        !!state.project.checks[action.skill] ||
        !!state.project.assistance?.[action.skill] ||
        !!state.project.reviews[action.skill];
      const correct = observe(
        state,
        question,
        action.answer,
        exposed ? 5 : 0,
        "project",
        requestId,
        now,
      );
      state.project.checks[action.skill] = {
        questionId: question.id,
        answer: action.answer,
        correct,
        stage: exposed ? 5 : 0,
        at,
      };
      if (correct && !state.project.checkpoints.includes(action.skill))
        state.project.checkpoints.push(action.skill);
      event(state, "project_checkpoint_checked", at);
      break;
    }
    case "submit_task": {
      requireThat(state.project, "Сначала выбери проект.");
      const artifact = state.project.artifacts[action.skill];
      requireThat(
        artifact?.trim().length >= 20 &&
          state.project.checks[action.skill]?.correct,
        "Сначала сохрани решение и пройди проверку понимания.",
      );
      (state.project.submissions ??= {})[action.skill] = {
        artifact,
        report: action.report,
        at,
      };
      event(state, "project_task_submitted", at);
      break;
    }
    case "save_decision": {
      requireThat(state.project, "Сначала выбери проект.");
      const decisions = (state.project.decisions ??= []);
      requireThat(decisions.length < 30, "В проекте уже сохранено 30 решений.");
      requireThat(
        !decisions.some(
          (d) => d.skill === action.skill && d.text === action.text,
        ),
        "Это решение уже сохранено.",
      );
      decisions.push({
        id: requestId,
        skill: action.skill,
        text: action.text,
        at,
      });
      event(state, "project_decision_saved", at);
      break;
    }
    case "feedback": {
      requireThat(
        state.sessions.some((s) => s.id === action.target && s.completedAt) ||
          /^resource:(python|git|sql|http|fastapi|auth|testing|docker)$/.test(
            action.target,
          ),
        "Этот материал или занятие не найдены.",
      );
      state.feedback = state.feedback.filter((f) => f.target !== action.target);
      requireThat(state.feedback.length < 1000, "История отзывов заполнена.");
      state.feedback.push({
        target: action.target,
        rating: action.rating,
        note: action.note,
        at,
      });
      event(state, "feedback_saved", at);
      break;
    }
    case "set_focus":
      state.focus = action.skill;
      event(state, "focus_confirmed", at);
      break;
    case "resource_open":
      event(state, `resource_open:${action.skill}`, at);
      break;
  }
  state.requestIds = [...state.requestIds, requestId].slice(-200);
  return state;
}
function publicQuestion(question: Question) {
  const { id, skill, prompt, code, choices, level } = question;
  return {
    id,
    skill,
    prompt,
    code,
    choices,
    level,
    kind: questionKind(question),
  };
}
export function learningView(state: LearningState): LearningView {
  const session = activeSession(state);
  const question =
    session &&
    (!session.lesson || session.lesson.phase === "exercise") &&
    session.index < session.questions.length
      ? questionById(session.questions[session.index])
      : null;
  const stage = session?.stage ?? 0;
  const help =
    question && session?.kind !== "diagnostic"
      ? [
          null,
          question.hints[0],
          question.hints[1],
          concepts[question.skill],
          question.partial,
          question.solution,
        ][stage]
      : null;
  const solution = question && stage === 5 ? question.solution : null;
  return {
    state,
    question: question ? publicQuestion(question) : null,
    help,
    solution,
    projectQuestions: state.project
      ? questions.filter((q) => q.id.endsWith(".project")).map(publicQuestion)
      : [],
    projectFeedback: Object.fromEntries(
      Object.keys(state.project?.checks ?? {}).map((skill) => [
        skill,
        questionById(`${skill}.project`).solution,
      ]),
    ),
  };
}
export function mentorLearningContext(state: LearningState) {
  const session = activeSession(state);
  return {
    active: session
      ? {
          kind: session.kind,
          question:
            session.index < session.questions.length
              ? publicQuestion(questionById(session.questions[session.index]))
              : null,
          stage: teachingStages[session.stage],
          mode: session.mode,
        }
      : null,
    evidence: state.evidence.slice(-16),
    recentSessions: state.sessions.slice(-5).map((item) => ({
      kind: item.kind,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      questions: item.questions,
      results: item.results.map((result) => ({
        questionId: result.questionId,
        correct: result.correct,
        stage: result.stage,
      })),
    })),
    project: state.project
      ? {
          id: state.project.id,
          checkpoints: state.project.checkpoints,
          savedStages: Object.keys(state.project.artifacts),
          latestReviews: Object.entries(state.project.reviews)
            .sort((a, b) => b[1].at.localeCompare(a[1].at))
            .slice(0, 2)
            .map(([skill, review]) => ({
              skill,
              text: review.text.slice(0, 1500),
              at: review.at,
            })),
        }
      : null,
    focus: state.focus,
  };
}
export function addProjectReview(
  state: LearningState,
  skill: SkillId,
  artifact: string,
  text: string,
  at = new Date().toISOString(),
): LearningState {
  requireThat(
    state.project?.artifacts[skill] === artifact,
    "Код изменился во время разбора. Запроси новый разбор.",
  );
  const next = structuredClone(state);
  next.project!.reviews[skill] = {
    artifact,
    text,
    at,
    mode: state.project?.mode ?? "learn",
  };
  event(next, "project_reviewed", at);
  return next;
}
