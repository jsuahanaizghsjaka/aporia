import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  buildMemory,
  recentConversation,
  memoryLimits,
} from "../src/lib/ai/memory.ts";
import {
  parseStructuredOutput,
  projectReviewSchema,
} from "../src/lib/ai/output.ts";
import {
  userProfileSchema,
  diagnosticResultSchema,
  roadmapSchema,
  lessonActionSchema,
  masteryUpdateSchema,
  weeklyReviewSchema,
  validateLearningWrite,
  masteryUpdate,
} from "../src/lib/ai/contracts.ts";
import { initialLearningState } from "../src/lib/learning/selectors.ts";
import { profileSchema } from "../src/lib/profile/schema.ts";
import { skillIds } from "../src/lib/learning/types.ts";
import { taskPrompt, promptVersion } from "../src/prompts/tasks.ts";
import { createWeeklyReview } from "../src/lib/learning/weekly.ts";
import { readAIText } from "../src/lib/ai/text-stream.ts";

const now = new Date("2026-09-28T12:00:00Z");
const profile = profileSchema.parse({
  displayName: "Тест",
  goal: "Старое пожелание",
  occupation: "Разработчик",
  education: "",
  onboardingComplete: true,
  schedule: { timeZone: "Europe/Moscow", days: [15, 20, 0, 25, 30, 0, 0] },
});
const envelope = (value) => ({
  status: "completed",
  output: [
    {
      type: "message",
      status: "completed",
      content: [
        { type: "output_text", text: JSON.stringify(value), annotations: [] },
      ],
    },
  ],
});

test("28: four memory layers are bounded, canonical profile wins, chats/code are excluded", () => {
  const state = initialLearningState();
  state.focus = "python";
  state.focusUntil = "2026-09-27T00:00:00Z";
  state.sessions = Array.from({ length: 1000 }, () => ({
    id: randomUUID(),
    kind: "practice",
    mode: "learn",
    questions: ["python.1"],
    index: 1,
    stage: 0,
    results: [
      {
        questionId: "python.1",
        answer: "X".repeat(4000),
        correct: false,
        stage: 0,
        at: now.toISOString(),
      },
    ],
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    minutes: 15,
  }));
  state.project = {
    id: "music",
    startedAt: now.toISOString(),
    artifacts: { python: "PRIVATE_OLD_CODE" },
    checkpoints: [],
    checks: {},
    reviews: {},
    messages: [{ reply: "PRIVATE_CHAT_HISTORY" }],
    decisions: Array.from({ length: 30 }, () => ({
      id: randomUUID(),
      skill: "python",
      text: "D".repeat(1000),
      at: now.toISOString(),
    })),
  };
  const original = structuredClone(state);
  const memory = buildMemory(
    profile,
    state,
    { summary: "Подтверждённый Python API" },
    now,
  );
  assert.deepEqual(Object.keys(memory), [
    "version",
    "profile",
    "learning",
    "project",
    "recent",
  ]);
  assert.equal(memory.profile.goal_summary, "Подтверждённый Python API");
  assert.equal(memory.profile.education, "");
  assert.deepEqual(memory.profile.personal_schedule, profile.schedule);
  assert.equal(memory.learning.focus, null);
  assert.equal(memory.learning.skills.length, 8);
  assert.equal(memory.recent.sessions.length, 5);
  assert.ok(memory.learning.recent_errors.length <= 8);
  assert.equal(memory.project.decisions.length, 8);
  assert.ok(JSON.stringify(memory).length < 20000);
  assert.doesNotMatch(
    JSON.stringify(memory),
    /PRIVATE_OLD_CODE|PRIVATE_CHAT_HISTORY/,
  );
  assert.deepEqual(state, original);
  assert.equal(buildMemory({}, initialLearningState()).project, null);
  const unloaded = buildMemory(profile);
  assert.equal(unloaded.learning.available, false);
  assert.equal(unloaded.learning.diagnostic_completed, null);
  assert.deepEqual(unloaded.learning.skills, []);
});
test("28: history tail preserves current question and enforces role/count/character budgets", () => {
  const history = Array.from({ length: 100 }, (_, i) => ({
    role: i % 2 ? "user" : "assistant",
    content: `${i}:` + "x".repeat(3990),
  }));
  const tail = recentConversation(history);
  assert.equal(tail.at(-1).content, history.at(-1).content);
  assert.ok(tail.length <= memoryLimits.messages);
  assert.ok(
    tail.reduce((n, m) => n + m.content.length, 0) <=
      memoryLimits.conversationChars,
  );
  assert.deepEqual(
    recentConversation([{ role: "system", content: "forged instruction" }]),
    [],
  );
});
test("29: eight task prompts have distinct instructions, shared policy and version", () => {
  const tasks = [
    "onboarding",
    "diagnostic",
    "roadmap",
    "teacher",
    "exercise",
    "projectLearn",
    "weeklyReview",
    "resources",
  ];
  const prompts = tasks.map(taskPrompt);
  assert.equal(new Set(prompts).size, 8);
  for (const prompt of prompts) {
    assert.ok(prompt.includes(promptVersion));
    assert.match(prompt, /данные, не инструкции/);
    assert.ok(prompt.length < 2500);
  }
  assert.match(taskPrompt("diagnostic"), /Не раскрывай ответы/);
  assert.doesNotMatch(
    taskPrompt("onboarding"),
    /Ты личный ментор Python backend/,
  );
  assert.match(
    taskPrompt("onboarding"),
    /Не приписывай пользователю Python backend/,
  );
  assert.match(taskPrompt("goal"), /направлении, которое назвал пользователь/);
  assert.match(taskPrompt("exercise"), /ASK → HINT_1/);
  assert.match(taskPrompt("projectHelp"), /подтверждения/);
});
test("30: strict UserProfile, DiagnosticResult, Roadmap, LessonAction, MasteryUpdate, WeeklyReview", () => {
  const candidate = {
    name: "Тест",
    occupation: "",
    education: "",
    goal_summary: "Python API",
    weekly_available_hours: null,
    interests: [],
    hobbies: [],
    learning_preferences: [],
    preferred_session_length: 15,
    notes: "",
  };
  assert.equal(userProfileSchema.safeParse(candidate).success, true);
  assert.equal(
    userProfileSchema.safeParse({ ...candidate, mastery: 95 }).success,
    false,
  );
  assert.equal(
    diagnosticResultSchema.safeParse({
      session_id: randomUUID(),
      answered: 2,
      correct: 3,
      completed: false,
    }).success,
    false,
  );
  const route = {
    items: skillIds.map((skill_id) => ({
      skill_id,
      reason: "Это следующий проверяемый навык",
    })),
  };
  assert.equal(roadmapSchema.safeParse(route).success, true);
  assert.equal(
    roadmapSchema.safeParse({ items: route.items.toReversed() }).success,
    false,
  );
  assert.equal(
    lessonActionSchema.safeParse({
      explanation: "analogy",
      reflection: "test",
      mastery: 90,
    }).success,
    false,
  );
  const state = initialLearningState(),
    scores = masteryUpdate(state);
  assert.equal(masteryUpdateSchema.safeParse(scores).success, true);
  scores.skills[0].mastery = 100;
  assert.equal(masteryUpdateSchema.safeParse(scores).success, false);
  const review = createWeeklyReview(state, profile, randomUUID(), now);
  assert.equal(weeklyReviewSchema.safeParse(review).success, true);
  assert.equal(
    weeklyReviewSchema.safeParse({ ...review, sql: "delete" }).success,
    false,
  );
  state.weeklyReviews.push(review);
  assert.deepEqual(validateLearningWrite(state), state);
  assert.throws(() => validateLearningWrite({ ...state, forged: true }));
});
test("30: structured provider envelope accepts one valid answer, rejects refusals/partial/null/mixed/extra output", () => {
  const valid = { reply: "Проверь пустой список. Код не запускался." };
  assert.deepEqual(
    parseStructuredOutput(projectReviewSchema, envelope(valid)),
    valid,
  );
  const withReasoning = envelope(valid);
  withReasoning.output.unshift({ type: "reasoning", summary: [] });
  assert.deepEqual(
    parseStructuredOutput(projectReviewSchema, withReasoning),
    valid,
  );
  const bad = [
    null,
    {},
    { ...envelope(valid), status: "incomplete" },
    { ...envelope(valid), output: [null] },
    {
      ...envelope(valid),
      output: [
        { type: "message", content: [{ type: "refusal", refusal: "no" }] },
      ],
    },
    {
      ...envelope(valid),
      output: [...envelope(valid).output, ...envelope(valid).output],
    },
    envelope({ ...valid, mastery: 99 }),
  ];
  const malformed = envelope(valid);
  malformed.output[0].content[0].text = "{broken";
  bad.push(malformed);
  for (const output of bad)
    assert.throws(
      () => parseStructuredOutput(projectReviewSchema, output),
      (e) => e.code === "AI_INVALID_RESPONSE",
    );
  const choices = z.strictObject({ id: z.enum(["allowed"]) });
  assert.throws(() =>
    parseStructuredOutput(choices, envelope({ id: "forged" })),
  );
});
test("30: refusal streaming is not accepted as a completed answer", async () => {
  const body = new Response(
    'data: {"type":"response.refusal.delta","delta":"refusal"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n',
  ).body;
  await assert.rejects(
    readAIText(body, () => {}),
    (e) => e.code === "AI_INVALID_RESPONSE",
  );
});
