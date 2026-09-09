import { teachingStages } from "./curriculum.ts";
import { activeSession, dueReviews, recommendedSkill } from "./selectors.ts";
import { concepts, grade, questionById, questions } from "./question-bank.ts";
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
  const correct = grade(question, answer);
  const previous = state.evidence
    .filter((item) => item.questionId === question.id)
    .at(-1);
  const review = state.reviews[question.id];
  // No new evidence from immediate retries or reopening a completed question.
  if (!previous || (review && Date.parse(review.due) <= now.getTime())) {
    requireThat(
      state.evidence.length < 5000,
      "История заполнена. Напиши в поддержку перед следующим занятием.",
    );
    const independence = [1, 0.75, 0.5, 0.25, 0, 0][stage];
    state.evidence.push({
      id: `${sessionId}:${question.id}`,
      questionId: question.id,
      skill: question.skill,
      kind,
      correct,
      independence,
      at: now.toISOString(),
      sessionId,
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
        completedAt: null,
        minutes: 10,
      });
      state.activeSession = requestId;
      event(state, "diagnostic_started", at);
      break;
    }
    case "start_session": {
      requireThat(state.diagnosticComplete, "Сначала пройди диагностику.");
      if (session) break;
      requireThat(
        state.sessions.length < 1000,
        "История занятий заполнена. Напиши в поддержку.",
      );
      const due = dueReviews(state, now);
      const skill = action.skill ?? recommendedSkill(state);
      const count = Math.max(
        1,
        Math.min(3, Math.floor(profile.dailyMinutes / 8)),
      );
      const bank = questions.filter(
        (q) => q.skill === skill && /\.[123]$/.test(q.id),
      );
      bank.sort(
        (a, b) =>
          state.evidence.filter((e) => e.questionId === a.id).length -
          state.evidence.filter((e) => e.questionId === b.id).length,
      );
      const ids = due.length
        ? due.slice(0, count).map(([id]) => id)
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
        minutes: profile.dailyMinutes,
      });
      state.activeSession = requestId;
      event(state, "session_started", at);
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
      session.results.push({
        questionId: question.id,
        answer: action.answer,
        correct,
        stage: session.stage,
        at,
      });
      if (session.kind === "diagnostic") {
        session.index++;
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
      session.stage = 0;
      if (session.index === session.questions.length)
        complete(state, session, at);
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
      };
      event(state, "project_started", at);
      break;
    }
    case "save_artifact": {
      requireThat(state.project, "Сначала выбери проект.");
      state.project.artifacts[action.skill] = action.artifact;
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
      const exposed = !!state.project.checks[action.skill];
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
  const { id, skill, prompt, code, choices } = question;
  return { id, skill, prompt, code, choices };
}
export function learningView(state: LearningState): LearningView {
  const session = activeSession(state);
  const question = session
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
  const solution =
    question && session?.results[session.index] ? question.solution : null;
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
          question: publicQuestion(
            questionById(session.questions[session.index]),
          ),
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
  next.project!.reviews[skill] = { artifact, text, at };
  event(next, "project_reviewed", at);
  return next;
}
