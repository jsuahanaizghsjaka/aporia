import test from "node:test";
import assert from "node:assert/strict";
import {
  beginLesson,
  answerLesson,
  confirmedLessonProfile,
  questions,
} from "../src/lib/onboarding/lesson-zero.ts";
import { emptyProfile, profileSchema } from "../src/lib/profile/schema.ts";

const answers = {
  displayName: "Актан",
  context: "Начинаю новый проект",
  goal: "Сделать API на Python",
  experience: "Знаю циклы и функции",
  workStudy: "Колледж и работа по выходным",
  weeklyAvailability: "Вт и чт 19:00–20:00",
  interests: "История, музыка",
  hobbies: "Зал по утрам",
  preferences: "Небольшие задачи с примерами",
  dailyMinutes: "30 минут",
  currentProjects: "Приложение для учёбы",
};
test("Lesson 0 covers every required topic one at a time and prepares, but never confirms, a profile", () => {
  let state = beginLesson(emptyProfile);
  assert.equal(state.messages.length, 1);
  assert.equal(new Set(questions.map((q) => q.key)).size, questions.length);
  for (const question of questions) {
    const previous = state;
    state = answerLesson(state, answers[question.key]);
    assert.equal(previous.index + 1, state.index);
    assert.equal(previous.profile.onboardingComplete, false);
    assert.equal(state.profile.onboardingComplete, false);
    assert.equal(state.messages.length, 1 + state.index * 2);
    assert.equal(state.messages.at(-2).content, answers[question.key]);
  }
  for (const [key, value] of Object.entries(answers))
    assert.equal(state.profile[key], key === "dailyMinutes" ? 30 : value);
  assert.equal(state.profile.mastery, undefined);
  assert.equal(state.profile.version, 0);
  assert.throws(() => answerLesson(state, "Ещё"), /Все темы/);
});
test("skipping optional topics preserves previously supplied facts and invents no personal details", () => {
  let state = beginLesson({
    ...emptyProfile,
    hobbies: "Плавание",
    dailyMinutes: 45,
  });
  for (const q of questions)
    state = answerLesson(state, q.optional ? "" : answers[q.key], q.optional);
  assert.equal(state.profile.hobbies, "Плавание");
  assert.equal(state.profile.dailyMinutes, 45);
  assert.equal(state.profile.currentProjects, "");
  assert.equal(state.profile.workStudy, "");
});
test("invalid or skipped required answers leave the conversation draft unchanged", () => {
  const state = beginLesson(emptyProfile);
  const before = JSON.stringify(state);
  for (const value of ["", " ", "a".repeat(61)])
    assert.throws(() => answerLesson(state, value));
  assert.throws(() => answerLesson(state, "", true), /Имя и цель/);
  assert.equal(JSON.stringify(state), before);
});
test("session length accepts a clear duration, rejects ambiguous schedules and out-of-range values", () => {
  const state = {
    ...beginLesson(emptyProfile),
    index: questions.findIndex((q) => q.key === "dailyMinutes"),
  };
  for (const value of ["10", "25 мин.", "120 минут", "45 minutes"])
    assert.ok(answerLesson(state, value).profile.dailyMinutes >= 10);
  for (const value of [
    "0",
    "121",
    "2 раза в неделю по 30",
    "30.5",
    "час",
    "-20",
  ])
    assert.throws(() => answerLesson(state, value), /от 10 до 120/);
});
test("profile confirmation retains review corrections, account version and avatar", () => {
  const draft = {
    ...emptyProfile,
    ...answers,
    dailyMinutes: 30,
    goal: "Исправленная цель",
    avatarUrl: "data:image/webp;base64,test",
    avatarPath: "owner/photo.webp",
    version: 7,
  };
  const confirmed = confirmedLessonProfile(draft);
  assert.equal(confirmed.goal, "Исправленная цель");
  assert.equal(confirmed.version, 7);
  assert.equal(confirmed.avatarPath, draft.avatarPath);
  assert.equal(confirmed.avatarUrl, draft.avatarUrl);
  assert.equal(confirmed.onboardingComplete, true);
  assert.equal(draft.onboardingComplete, false);
  assert.throws(() => confirmedLessonProfile({ ...draft, goal: " " }));
});
test("old profiles remain readable and new context fields are validated on save", () => {
  const old = profileSchema.parse({
    displayName: "Test",
    goal: "Python",
    onboardingComplete: true,
  });
  for (const key of [
    "workStudy",
    "weeklyAvailability",
    "hobbies",
    "currentProjects",
  ])
    assert.equal(old[key], "");
  assert.equal(
    profileSchema.safeParse({ hobbies: "a".repeat(501) }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ weeklyAvailability: 7 }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ currentProjects: "a".repeat(1001) }).success,
    false,
  );
});
