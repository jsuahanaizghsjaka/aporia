import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyAction } from "../src/lib/learning/engine.ts";
import {
  initialLearningState,
  activeSession,
  skillProgress,
} from "../src/lib/learning/selectors.ts";
import { stateSchema, actionSchema } from "../src/lib/learning/types.ts";
import { questionById } from "../src/lib/learning/question-bank.ts";
const profile = {
  onboardingComplete: true,
  goal: "Python API",
  dailyMinutes: 15,
  interests: "music",
};
const step = (s, a, id = randomUUID()) =>
  applyAction(s, a, profile, id, new Date("2026-09-30T10:00:00Z"));
function completed() {
  let s = step(
    { ...initialLearningState(), diagnosticComplete: true },
    { type: "start_lesson", mode: "learn", teacher: "prepared", minutes: 5 },
  );
  s = step(s, { type: "finish_theory" });
  s = step(s, {
    type: "answer",
    answer: questionById(activeSession(s).questions[0]).answers[0],
  });
  s = step(s, { type: "next" });
  return step(s, {
    type: "finish_project",
    reflection: "Проверю ответ на пустом списке и на двух элементах.",
  });
}
test("lesson usefulness persists by session_id, is idempotent and editable without changing mastery", () => {
  const original = completed(),
    session_id = original.sessions.at(-1).id;
  const action = {
      type: "session_feedback",
      session_id,
      helpful: false,
      note: "Не хватило примера",
    },
    id = randomUUID();
  const saved = step(original, action, id);
  assert.deepEqual(step(saved, action, id), saved);
  assert.equal(original.sessionFeedback.length, 0);
  assert.equal(saved.sessionFeedback.length, 1);
  const edited = step(saved, { ...action, helpful: true, note: "" });
  assert.equal(edited.sessionFeedback.length, 1);
  assert.equal(edited.sessionFeedback[0].helpful, true);
  assert.deepEqual(edited.evidence, original.evidence);
  assert.deepEqual(
    skillProgress(edited, "python"),
    skillProgress(original, "python"),
  );
  assert.deepEqual(
    stateSchema.parse(JSON.parse(JSON.stringify(edited))).sessionFeedback,
    edited.sessionFeedback,
  );
  assert.ok(!JSON.stringify(saved.events).includes(action.note));
});
test("feedback rejects unfinished, missing and foreign sessions and invalid payloads", () => {
  const s = completed(),
    session_id = s.sessions[0].id;
  const a = { type: "session_feedback", session_id, helpful: true, note: "" };
  assert.throws(() => step(initialLearningState(), a), /завершённом/);
  const active = structuredClone(s);
  active.sessions[0].completedAt = null;
  assert.throws(() => step(active, a), /завершённом/);
  assert.throws(
    () => step(s, { ...a, session_id: randomUUID() }),
    /завершённом/,
  );
  const diagnostic = structuredClone(s);
  diagnostic.sessions[0].kind = "diagnostic";
  assert.throws(() => step(diagnostic, a), /завершённом/);
  for (const invalid of [
    { helpful: "yes" },
    { note: "x".repeat(501) },
    { session_id: "not-a-uuid" },
    { user_id: randomUUID() },
  ])
    assert.equal(actionSchema.safeParse({ ...a, ...invalid }).success, false);
});
test("pre-feedback snapshots load without losing legacy difficulty feedback", () => {
  const old = initialLearningState();
  delete old.sessionFeedback;
  old.feedback.push({
    target: "resource:python",
    rating: "hard",
    note: "пример",
    at: "2026-09-29T10:00:00Z",
  });
  const restored = stateSchema.parse(old);
  assert.deepEqual(restored.sessionFeedback, []);
  assert.deepEqual(restored.feedback, old.feedback);
});
