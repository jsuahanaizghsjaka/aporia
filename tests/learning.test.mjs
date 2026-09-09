import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  applyAction,
  learningView,
  addProjectReview,
} from "../src/lib/learning/engine.ts";
import {
  initialLearningState,
  activeSession,
  skillProgress,
  dailyMission,
  dueReviews,
  weeklySummary,
  weeklyFocus,
} from "../src/lib/learning/selectors.ts";
import {
  grade,
  questionById,
  questions,
} from "../src/lib/learning/question-bank.ts";
import { stateSchema, actionSchema } from "../src/lib/learning/types.ts";
const profile = {
  onboardingComplete: true,
  goal: "Сделать музыкальный API",
  dailyMinutes: 25,
  interests: "Музыка",
};
const now = new Date("2026-09-08T10:00:00.000Z");
const step = (state, action, date = now) =>
  applyAction(state, action, profile, randomUUID(), date);
function diagnosed(correct = true) {
  let state = step(initialLearningState(), { type: "start_diagnostic" });
  for (let i = 0; i < 8; i++) {
    const q = questionById(activeSession(state).questions[i]);
    state = step(state, {
      type: "answer",
      answer: correct ? q.answers[0] : "",
    });
  }
  return state;
}
function finishSession(state, date = now) {
  while (activeSession(state)) {
    const session = activeSession(state);
    const question = questionById(session.questions[session.index]);
    state = step(state, { type: "answer", answer: question.answers[0] }, date);
    state = step(state, { type: "next" }, date);
  }
  return state;
}
test("diagnostic requires confirmed goal; resumes one session; no hints or answer keys", () => {
  assert.throws(
    () =>
      applyAction(
        initialLearningState(),
        { type: "start_diagnostic" },
        { ...profile, onboardingComplete: false },
        randomUUID(),
        now,
      ),
    /подтверди/,
  );
  const state = step(initialLearningState(), { type: "start_diagnostic" });
  assert.equal(step(state, { type: "start_diagnostic" }).sessions.length, 1);
  assert.throws(() => step(state, { type: "hint" }), /подсказок нет/);
  assert.throws(
    () => step(state, { type: "start_session", mode: "help" }),
    /диагностику/,
  );
  const view = learningView(state);
  assert.equal(view.question.answers, undefined);
  assert.equal(view.help, null);
  assert.equal(view.solution, null);
  assert.equal(initialLearningState().sessions.length, 0);
});
test("diagnostic persists all eight results and yields conservative mastery", () => {
  const state = diagnosed();
  assert.equal(state.diagnosticComplete, true);
  assert.equal(state.evidence.length, 8);
  assert.equal(activeSession(state), null);
  assert.equal(state.sessions[0].completedAt, now.toISOString());
  const progress = skillProgress(state, "python");
  assert.equal(progress.mastery, 14);
  assert.ok(progress.confidence < 10);
  assert.throws(
    () => step(state, { type: "start_diagnostic" }),
    /уже пройдена/,
  );
  assert.equal(stateSchema.safeParse(state).success, true);
});
test("Teaching Policy advances one level at a time; full solution earns no independent mastery", () => {
  let state = step(diagnosed(false), { type: "start_session", mode: "learn" });
  const question = questionById(activeSession(state).questions[0]);
  for (let i = 1; i <= 5; i++) {
    state = step(state, { type: "hint" });
    assert.equal(activeSession(state).stage, i);
    assert.ok(learningView(state).help);
  }
  state = step(state, { type: "answer", answer: question.answers[0] });
  assert.equal(state.evidence.at(-1).independence, 0);
  assert.equal(skillProgress(state, "python").mastery, 0);
  assert.throws(() => step(state, { type: "hint" }), /уже проверен/);
  const independent = step(diagnosed(false), {
    type: "start_session",
    mode: "help",
  });
  assert.equal(activeSession(step(independent, { type: "hint" })).stage, 5);
});
test("same request and duplicate answer do not create evidence twice", () => {
  let state = step(diagnosed(), { type: "start_session", mode: "learn" });
  const id = randomUUID();
  const answer = questionById(activeSession(state).questions[0]).answers[0];
  state = applyAction(state, { type: "answer", answer }, profile, id, now);
  const duplicate = applyAction(
    state,
    { type: "answer", answer },
    profile,
    id,
    now,
  );
  assert.deepEqual(duplicate, state);
  assert.throws(() => step(state, { type: "answer", answer }), /уже сохранён/);
});
test("viewing a resource and rating difficulty never award mastery", () => {
  let state = diagnosed();
  const before = state.evidence;
  state = step(state, { type: "resource_open", skill: "python" });
  state = step(state, {
    type: "feedback",
    target: "resource:python",
    rating: "hard",
    note: "Хочу пример",
  });
  assert.deepEqual(state.evidence, before);
  assert.equal(state.focus, null);
  assert.throws(
    () =>
      step(state, {
        type: "feedback",
        target: "unknown-session",
        rating: "easy",
        note: "",
      }),
    /не найдены/,
  );
  assert.equal(state.events.at(-1).name, "feedback_saved");
  assert.equal(JSON.stringify(state.events).includes("Хочу пример"), false);
  assert.equal(
    actionSchema.safeParse({ type: "set_mastery", score: 100 }).success,
    false,
  );
});
test("daily mission honors prerequisites, available time, resume and overdue reviews", () => {
  let state = diagnosed();
  state = step(state, { type: "set_focus", skill: "docker" });
  assert.match(dailyMission(state, profile, now).title, /Python/);
  state = applyAction(
    state,
    { type: "start_session", mode: "learn" },
    { ...profile, dailyMinutes: 10 },
    randomUUID(),
    now,
  );
  assert.equal(activeSession(state).questions.length, 1);
  assert.equal(
    dailyMission(state, profile, now).title,
    "Продолжим с того же места",
  );
  state = finishSession(state);
  const tomorrow = new Date(now.getTime() + 86400000);
  assert.ok(dueReviews(state, tomorrow).length >= 8);
  state = step(state, { type: "start_session", mode: "learn" }, tomorrow);
  assert.equal(activeSession(state).kind, "review");
});
test("reopening practice before due date does not increase mastery; spaced review does", () => {
  let state = finishSession(
    step(diagnosed(false), { type: "start_session", mode: "learn" }),
  );
  const count = state.evidence.length;
  state = finishSession(
    step(state, { type: "start_session", mode: "learn", skill: "python" }),
  );
  assert.equal(state.evidence.length, count);
  const tomorrow = new Date(now.getTime() + 86400000);
  state = finishSession(
    step(state, { type: "start_session", mode: "learn" }, tomorrow),
    tomorrow,
  );
  assert.ok(state.evidence.length > count);
  assert.equal(state.reviews["python.d"].interval, 1);
});
test("one active project; artifact drafts and AI reviews never certify executable code", () => {
  let state = step(diagnosed(), { type: "choose_project", projectId: "music" });
  assert.throws(
    () => step(state, { type: "choose_project", projectId: "books" }),
    /активный проект/,
  );
  assert.throws(
    () => step(state, { type: "project_answer", skill: "python", answer: "x" }),
    /сохрани код/,
  );
  const artifact = "def find_record(records, record_id):\n    return None";
  state = step(state, { type: "save_artifact", skill: "python", artifact });
  const before = state.evidence.length;
  state = addProjectReview(
    state,
    "python",
    artifact,
    "Добавь поиск перед return None.",
    now.toISOString(),
  );
  assert.equal(state.evidence.length, before);
  assert.throws(
    () => addProjectReview(state, "python", "changed", "review"),
    /Код изменился/,
  );
  state = step(state, {
    type: "project_answer",
    skill: "python",
    answer: questionById("python.project").answers[0],
  });
  assert.equal(state.project.checkpoints.length, 1);
  assert.equal(state.evidence.at(-1).kind, "project");
  const repeated = step(state, {
    type: "project_answer",
    skill: "python",
    answer: questionById("python.project").answers[0],
  });
  assert.equal(repeated.evidence.length, state.evidence.length);
});
test("weekly review uses a real seven-day window and requires explicit focus confirmation", () => {
  const state = diagnosed();
  assert.equal(weeklySummary(state, now).evidence, 8);
  assert.equal(
    weeklySummary(state, new Date("2026-09-16T10:00:00Z")).evidence,
    0,
  );
  assert.equal(state.focus, null);
  assert.equal(step(state, { type: "set_focus", skill: "sql" }).focus, "sql");
});
test("weekly focus uses recent resource feedback without silently applying it", () => {
  const state = step(diagnosed(), {
    type: "feedback",
    target: "resource:sql",
    rating: "hard",
    note: "Нужна практика JOIN",
  });
  assert.deepEqual(weeklyFocus(state, now), {
    skill: "sql",
    fromFeedback: true,
  });
  assert.equal(state.focus, null);
  assert.equal(
    weeklyFocus(state, new Date("2026-09-16T10:00:00Z")).fromFeedback,
    false,
  );
});
test("question bank has unique IDs, valid choices, correct keys, and rejects wrong values", () => {
  assert.equal(questions.length, 40);
  assert.equal(new Set(questions.map((q) => q.id)).size, 40);
  for (const q of questions) {
    assert.equal(grade(q, q.answers[0]), true, q.id);
    assert.equal(grade(q, "definitely incorrect"), false, q.id);
    if (q.choices) assert.ok(q.choices.includes(q.answers[0]), q.id);
  }
  assert.equal(grade(questionById("sql.1"), "select name from users;"), true);
  assert.equal(grade(questionById("python.d"), "[2,4]"), true);
});
