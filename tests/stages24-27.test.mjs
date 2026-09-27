import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyAction } from "../src/lib/learning/engine.ts";
import {
  initialLearningState,
  activeSession,
} from "../src/lib/learning/selectors.ts";
import { actionSchema, stateSchema } from "../src/lib/learning/types.ts";
import { profileSchema } from "../src/lib/profile/schema.ts";
import { availableToday, weekKey } from "../src/lib/profile/schedule.ts";
import { selectMission } from "../src/lib/learning/mission.ts";
import {
  resourceCatalog,
  resourceSelection,
} from "../src/lib/learning/resources.ts";
import { createWeeklyReview } from "../src/lib/learning/weekly.ts";
import { learningDatabase } from "./helpers/learning-db.mjs";
const now = new Date("2026-09-28T10:00:00Z");
const profile = profileSchema.parse({
  displayName: "Tester",
  goal: "Python API",
  dailyMinutes: 30,
  onboardingComplete: true,
});
const start = () => ({ ...initialLearningState(), diagnosticComplete: true });
const run = (
  s,
  a,
  time = now,
  id = randomUUID(),
  p = profile,
  context = undefined,
) => applyAction(s, a, p, id, time, context);

test("old profiles/states are compatible; schedule validates each day and timezone", () => {
  const s = start();
  delete s.resourceSelections;
  delete s.weeklyReviews;
  assert.deepEqual(stateSchema.parse(s).resourceSelections, []);
  assert.equal(profile.schedule, null);
  for (const schedule of [
    { timeZone: "not-a-zone", days: Array(7).fill(20) },
    { timeZone: "UTC", days: [20] },
    { timeZone: "UTC", days: Array(7).fill(1) },
  ])
    assert.equal(
      profileSchema.safeParse({ ...profile, schedule }).success,
      false,
    );
  const p = {
    ...profile,
    schedule: { timeZone: "Europe/Moscow", days: [5, 10, 15, 20, 25, 0, 0] },
  };
  assert.equal(availableToday(p, new Date("2026-09-27T21:30:00Z")), 5);
  assert.equal(
    weekKey(new Date("2026-09-27T21:30:00Z"), "Europe/Moscow"),
    "2026-09-28",
  );
  assert.equal(weekKey(new Date("2027-01-01T10:00:00Z")), "2026-12-28");
  const mission = selectMission(
    {
      state: start(),
      profile: p,
      goal: { summary: p.goal },
      roadmap: null,
      availableMinutes: 120,
    },
    now,
  );
  assert.equal(mission.estimated_time, 5);
  assert.equal(mission.theory + mission.exercise + mission.project, 5);
  const lesson = run(
    start(),
    { type: "start_lesson", minutes: 120, mode: "learn", teacher: "prepared" },
    now,
    randomUUID(),
    p,
  );
  assert.equal(activeSession(lesson).minutes, 5);
  assert.throws(
    () =>
      run(
        start(),
        {
          type: "start_lesson",
          minutes: 10,
          mode: "learn",
          teacher: "prepared",
        },
        new Date("2026-10-03T10:00:00Z"),
        randomUUID(),
        p,
      ),
    /выходной/,
  );
});

test("resources: allowed catalogue, cardinality, save/open/rate and idempotency; no mastery", () => {
  for (const r of resourceCatalog)
    assert.equal(new URL(r.url).protocol, "https:");
  let s = run(start(), {
    type: "recommend_resources",
    skill: "python",
    source: "prepared",
  });
  const selection = s.resourceSelections[0];
  const target = {
    selectionId: selection.id,
    resourceId: selection.items[0].resourceId,
  };
  assert.throws(
    () => run(s, { type: "rate_resource", ...target, helpful: true }),
    /Сначала открой/,
  );
  const id = randomUUID();
  s = run(s, { type: "save_resource", ...target }, now, id);
  assert.deepEqual(run(s, { type: "save_resource", ...target }, now, id), s);
  s = run(s, { type: "open_resource", ...target });
  s = run(s, { type: "rate_resource", ...target, helpful: false });
  assert.equal(s.resourceSelections[0].items[0].helpful, false);
  assert.deepEqual(s.evidence, []);
  assert.throws(
    () =>
      run(s, { type: "save_resource", ...target, selectionId: randomUUID() }),
    /не найден/,
  );
  assert.throws(() =>
    resourceSelection(s, profile, "python", randomUUID(), now, [
      "https://evil.example",
    ]),
  );
  assert.throws(() =>
    resourceSelection(s, profile, "python", randomUUID(), now, [
      "python-docs",
      "python-docs",
    ]),
  );
  assert.throws(() =>
    resourceSelection(s, profile, "python", randomUUID(), now, [
      "fastapi-docs",
    ]),
  );
  assert.equal(
    actionSchema.safeParse({
      type: "recommend_resources",
      skill: "python",
      source: "ai",
      url: "https://evil.example",
    }).success,
    false,
  );
  assert.throws(
    () =>
      run(s, { type: "recommend_resources", skill: "python", source: "ai" }),
    /недоступен/,
  );
  assert.equal(stateSchema.safeParse(s).success, true);
});

test("weekly snapshots use measured time, timestamped deltas, preserve history and require confirmation", () => {
  let s = start();
  s.sessions.push({
    id: randomUUID(),
    kind: "practice",
    mode: "learn",
    questions: ["python.1"],
    index: 1,
    stage: 0,
    results: [
      {
        questionId: "python.1",
        answer: "x",
        correct: true,
        stage: 0,
        at: now.toISOString(),
        time_spent: 75,
      },
    ],
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    minutes: 30,
  });
  s.evidence.push({
    id: "test",
    questionId: "python.1",
    skill: "python",
    kind: "exercise",
    correct: true,
    independence: 1,
    at: "2026-09-01T10:00:00Z",
    sessionId: s.sessions[0].id,
    history_complete: true,
    mastery_changes: [
      { before: 0, after: 10, at: "2026-09-01T10:00:00Z" },
      { before: 10, after: 22, at: now.toISOString() },
    ],
  });
  const report = createWeeklyReview(s, profile, randomUUID(), now);
  assert.equal(report.sessions, 1);
  assert.equal(report.seconds, 75);
  assert.equal(report.changes[0].delta, 12);
  assert.equal(report.evidence, 0);
  s.sessions[0].attempts = [
    { ...s.sessions[0].results[0], correct: false, time_spent: 30 },
    { ...s.sessions[0].results[0], correct: true, time_spent: 75 },
  ];
  assert.equal(createWeeklyReview(s, profile, randomUUID(), now).seconds, 75);
  s = run(s, { type: "generate_weekly_review", source: "prepared" });
  const saved = structuredClone(s.weeklyReviews);
  assert.equal(s.focus, null);
  s = run(
    s,
    { type: "generate_weekly_review", source: "prepared" },
    new Date(+now + 3600000),
  );
  assert.deepEqual(s.weeklyReviews, saved);
  assert.throws(
    () =>
      run(s, {
        type: "confirm_weekly_focus",
        reviewId: saved[0].id,
        skill: "docker",
      }),
    /базовые/,
  );
  s = run(s, {
    type: "confirm_weekly_focus",
    reviewId: saved[0].id,
    skill: "python",
  });
  assert.equal(s.focus, "python");
  assert.throws(
    () =>
      run(
        s,
        {
          type: "confirm_weekly_focus",
          reviewId: saved[0].id,
          skill: "python",
        },
        new Date(+now + 7 * 86400000),
      ),
    /текущей недели/,
  );
  s = run(
    s,
    { type: "generate_weekly_review", source: "prepared" },
    new Date(+now + 7 * 86400000),
  );
  assert.equal(s.weeklyReviews.length, 2);
  assert.equal(stateSchema.safeParse(s).success, true);
});

test("migration 011: transactional projection, CAS, RLS and no client writes", async () => {
  const store = await learningDatabase();
  const a = randomUUID(),
    b = randomUUID();
  try {
    await store.seed(a);
    await store.seed(b);
    let s = run(start(), {
      type: "recommend_resources",
      skill: "python",
      source: "prepared",
    });
    s = run(s, { type: "generate_weekly_review", source: "prepared" });
    const commit = (version) =>
      store.asUser(
        a,
        (tx) =>
          tx.query("select public.commit_learning_state($1,$2,$3::jsonb) v", [
            a,
            version,
            JSON.stringify(s),
          ]),
        true,
      );
    assert.equal((await commit(0)).rows[0].v, 1);
    assert.equal((await commit(0)).rows[0].v, -1);
    for (const table of ["learning_resources", "weekly_reviews"]) {
      assert.equal(
        (
          await store.asUser(a, (tx) =>
            tx.query(`select * from public.${table}`),
          )
        ).rows.length,
        1,
      );
      assert.equal(
        (
          await store.asUser(b, (tx) =>
            tx.query(`select * from public.${table}`),
          )
        ).rows.length,
        0,
      );
      for (const service of [false, true])
        await assert.rejects(
          store.asUser(
            a,
            (tx) => tx.exec(`delete from public.${table}`),
            service,
          ),
          /permission denied/,
        );
    }
    await assert.rejects(
      store.asUser(a, (tx) =>
        tx.query("select public.aporia_sync_personal_learning($1,'{}')", [a]),
      ),
      /permission denied/,
    );
    const selection = s.resourceSelections[0];
    s = run(s, {
      type: "save_resource",
      selectionId: selection.id,
      resourceId: selection.items[0].resourceId,
    });
    await commit(1);
    const row = (
      await store.asUser(a, (tx) =>
        tx.query("select items from public.learning_resources"),
      )
    ).rows[0];
    assert.ok(row.items[0].savedAt);
  } finally {
    await store.close();
  }
});
