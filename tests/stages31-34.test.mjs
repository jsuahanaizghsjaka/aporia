import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { learningDatabase } from "./helpers/learning-db.mjs";
import { applyAction } from "../src/lib/learning/engine.ts";
import {
  initialLearningState,
  skillProgress,
  activeSession,
} from "../src/lib/learning/selectors.ts";
import { questionById } from "../src/lib/learning/question-bank.ts";
import { defaultRoadmap } from "../src/lib/roadmaps/derive.ts";
import { actionSchema } from "../src/lib/learning/types.ts";
import { profileSchema } from "../src/lib/profile/schema.ts";
import { taskPrompt } from "../src/prompts/tasks.ts";
import { uiError } from "../src/lib/ui-error.ts";
import { recoverySchema } from "../src/lib/auth/recovery.ts";
const profile = profileSchema.parse({
  displayName: "Тест",
  onboardingComplete: true,
  goal: "Python API",
  dailyMinutes: 20,
});
test("31: only explicit actions; no AI delete/mastery/profile commands; hints don't grant mastery", () => {
  for (const type of [
    "delete_data",
    "update_mastery",
    "save_profile",
    "replace_roadmap",
  ])
    assert.equal(actionSchema.safeParse({ type }).success, false);
  let state = initialLearningState();
  const run = (action) =>
    (state = applyAction(state, action, profile, randomUUID()));
  run({ type: "start_diagnostic" });
  for (let i = 0; i < 9; i++) run({ type: "answer", answer: "" });
  const before = skillProgress(state, "python").mastery;
  run({ type: "start_session", mode: "learn", skill: "python" });
  run({ type: "hint" });
  assert.equal(skillProgress(state, "python").mastery, before);
  assert.match(taskPrompt("help"), /не врач, не психотерапевт/);
  assert.match(taskPrompt("roadmap"), /нет инструментов удаления/);
});
test("32: raw provider/browser errors are never displayed; password validation is strict", () => {
  for (const text of [
    "Failed to fetch",
    "SQL error: secret",
    '{"access_token":"secret"}',
    "Ошибка SQL secret",
  ])
    assert.doesNotMatch(uiError(new Error(text)), /secret|SQL|fetch/);
  assert.equal(
    uiError(new Error("Сначала подтверди цель.")),
    "Сначала подтверди цель.",
  );
  assert.equal(
    recoverySchema.safeParse({
      action: "update",
      password: "12345678",
      confirmation: "87654321",
    }).success,
    false,
  );
  assert.equal(
    recoverySchema.safeParse({
      action: "request",
      email: "a@example.test",
      user_id: randomUUID(),
    }).success,
    false,
  );
});
test("34: SQL triggers, event dedupe and RLS; no arbitrary events or cross-user review reads", async () => {
  const db = await learningDatabase();
  const a = randomUUID(),
    b = randomUUID();
  try {
    await db.seed(a);
    await db.seed(b);
    await db.profile(a, profile, 1);
    await db.profile(a, profile, 2);
    await db.asUser(a, (tx) =>
      tx.query(
        "select public.observe_product_event('onboarding_started',null)",
      ),
    );
    let state = initialLearningState(),
      version = 0,
      tick = 0;
    const run = async (action) => {
      state = applyAction(
        state,
        action,
        profile,
        randomUUID(),
        new Date(Date.UTC(2026, 8, 28, 12, 0, tick++)),
      );
      await db.asUser(
        a,
        (tx) =>
          tx.query("select public.commit_learning_state($1,$2,$3::jsonb)", [
            a,
            version++,
            JSON.stringify(state),
          ]),
        true,
      );
    };
    await run({ type: "start_diagnostic" });
    for (let i = 0; i < 9; i++) await run({ type: "answer", answer: "" });
    await run({ type: "choose_project", projectId: "music" });
    await run({ type: "start_session", mode: "learn", skill: "python" });
    await run({ type: "hint" });
    while (activeSession(state)) {
      const session = activeSession(state);
      await run({
        type: "answer",
        answer: questionById(session.questions[session.index]).answers[0],
      });
      await run({ type: "next" });
    }
    await run({
      type: "save_artifact",
      skill: "python",
      artifact:
        "def find_record(records, key): return next((r for r in records if r['id'] == key), None)",
    });
    await run({
      type: "project_answer",
      skill: "python",
      answer: questionById("python.project").answers[0],
    });
    for (let i = 0; i < 2; i++)
      await run({
        type: "submit_task",
        skill: "python",
        report:
          "Запустил find_record([], 1), получил None. Проверил найденную запись по id.",
      });
    await db.asUser(a, (tx) =>
      tx.query("select public.commit_goal(0,$1,$2::jsonb)", [
        randomUUID(),
        JSON.stringify({
          summary: "Создать Python API",
          success_criteria: ["Запускается с тестами"],
          target_date: null,
        }),
      ]),
    );
    const goal = (
      await db.asUser(a, (tx) => tx.query("select id from public.goals"))
    ).rows[0].id;
    const roadmapRequest = randomUUID();
    for (let i = 0; i < 2; i++)
      await db.asUser(a, (tx) =>
        tx.query("select public.commit_roadmap(0,$1,$2,$3::jsonb)", [
          roadmapRequest,
          goal,
          JSON.stringify(defaultRoadmap()),
        ]),
      );
    await run({ type: "generate_weekly_review", source: "prepared" });
    const review = state.weeklyReviews[0].id;
    for (let i = 0; i < 2; i++)
      await db.asUser(a, (tx) =>
        tx.query(
          "select public.observe_product_event('weekly_review_opened',$1)",
          [review],
        ),
      );
    await assert.rejects(
      db.asUser(b, (tx) =>
        tx.query(
          "select public.observe_product_event('weekly_review_opened',$1)",
          [review],
        ),
      ),
    );
    await assert.rejects(
      db.asUser(a, (tx) =>
        tx.query(
          "select public.observe_product_event('lesson_completed',null)",
        ),
      ),
    );
    const rows = (
      await db.asUser(a, (tx) =>
        tx.query(
          "select name,count(*)::int n from public.product_events group by name",
        ),
      )
    ).rows;
    assert.equal(rows.length, 12);
    for (const name of [
      "signup",
      "onboarding_started",
      "onboarding_completed",
      "diagnostic_started",
      "diagnostic_completed",
      "project_started",
      "lesson_started",
      "lesson_completed",
      "project_task_completed",
      "roadmap_created",
      "hint_requested",
      "weekly_review_opened",
    ])
      assert.equal(rows.find((r) => r.name === name)?.n, 1, name);
    assert.equal(
      (
        await db.asUser(b, (tx) =>
          tx.query("select * from public.product_events where user_id=$1", [a]),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.asUser(a, (tx) => tx.query("delete from public.product_events")),
    );
  } finally {
    await db.close();
  }
});
