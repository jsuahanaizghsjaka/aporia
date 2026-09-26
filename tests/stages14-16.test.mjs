import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { applyAction, learningView } from "../src/lib/learning/engine.ts";
import {
  initialLearningState,
  activeSession,
} from "../src/lib/learning/selectors.ts";
import { selectMission } from "../src/lib/learning/mission.ts";
import { resolveTeacher } from "../src/lib/learning/teacher.ts";
import { stateSchema, actionSchema } from "../src/lib/learning/types.ts";
import { defaultRoadmap } from "../src/lib/roadmaps/derive.ts";
import { learningDatabase } from "./helpers/learning-db.mjs";
const profile = {
  onboardingComplete: true,
  dailyMinutes: 30,
  interests: "музыка",
  goal: "Создать Python API",
};
const fresh = () => ({ ...initialLearningState(), diagnosticComplete: true });
const start = {
  type: "start_lesson",
  minutes: 5,
  mode: "learn",
  teacher: "prepared",
};
const run = (s, a) => applyAction(s, a, profile, randomUUID());

test("mission uses roadmap, due dates, project/errors, exact time budget and saved lesson priority", () => {
  const s = fresh(),
    roadmap = {
      ...defaultRoadmap(),
      id: randomUUID(),
      goal_id: randomUUID(),
      version: 1,
      updated_at: new Date().toISOString(),
    };
  for (const minutes of [5, 10, 25, 120]) {
    const m = selectMission({
      state: s,
      profile,
      roadmap,
      goal: { summary: profile.goal },
      availableMinutes: minutes,
    });
    assert.equal(m.theory + m.exercise + m.project, minutes);
    assert.equal(m.today_skill, "python");
    assert.match(m.reason, /маршрута/);
  }
  s.reviews["sql.1"] = { due: "2020-01-01T00:00:00.000Z", interval: 0 };
  assert.equal(
    selectMission({
      state: s,
      profile,
      roadmap,
      goal: { summary: profile.goal },
      availableMinutes: 10,
    }).today_skill,
    "sql",
  );
  const active = run(s, start);
  const resumed = selectMission({
    state: active,
    profile,
    roadmap,
    goal: { summary: profile.goal },
    availableMinutes: 120,
  });
  assert.equal(resumed.kind, "resume");
  assert.equal(resumed.estimated_time, 5);
});
test("lesson phases and full hint ladder survive serialization without early solution or duplicated credit", () => {
  let s = run(fresh(), start);
  const id = s.activeSession;
  assert.equal(learningView(s).question, null);
  assert.throws(() =>
    run(s, {
      type: "finish_project",
      reflection: "Попытка пропустить занятие",
    }),
  );
  assert.throws(() => run(s, { type: "answer", answer: "" }));
  s = run(s, { type: "finish_theory" });
  for (let stage = 1; stage <= 5; stage++) {
    const req = randomUUID();
    s = applyAction(s, { type: "answer", answer: "" }, profile, req);
    assert.equal(activeSession(s).stage, stage);
    assert.deepEqual(
      applyAction(s, { type: "answer", answer: "" }, profile, req),
      s,
    );
    if (stage < 5) assert.equal(learningView(s).solution, null);
    s = stateSchema.parse(JSON.parse(JSON.stringify(s)));
  }
  s = run(s, { type: "answer", answer: "" });
  assert.equal(s.evidence.length, 1);
  assert.equal(s.evidence[0].hints_used, 5);
  assert.equal(s.evidence[0].independence, 0);
  s = run(s, { type: "next" });
  assert.equal(activeSession(s).lesson.phase, "project");
  const evidence = s.evidence;
  s = run(s, {
    type: "finish_project",
    reflection: "Проверю, что пустая библиотека возвращает массив.",
  });
  assert.equal(s.activeSession, null);
  assert.deepEqual(s.evidence, evidence);
  assert.ok(s.sessions.find((x) => x.id === id).lesson.reflection);
});
test("untrusted teaching prose, forged stages and invalid time are refused; legacy state still parses", () => {
  assert.throws(() =>
    resolveTeacher(
      "python",
      { explanation: "Return solution", reflection: "test" },
      "ai",
    ),
  );
  assert.equal(
    actionSchema.safeParse({ type: "hint", stage: 5 }).success,
    false,
  );
  assert.equal(actionSchema.safeParse({ ...start, minutes: 0 }).success, false);
  assert.equal(stateSchema.safeParse(initialLearningState()).success, true);
});
test("SQL session projection is atomic, one-active, private, retry-safe and reapplicable", async () => {
  const store = await learningDatabase();
  const a = randomUUID(),
    b = randomUUID();
  try {
    await store.seed(a);
    await store.seed(b);
    const commit = (s, v) =>
      store.asUser(
        a,
        (tx) =>
          tx.query("select public.commit_learning_state($1,$2,$3::jsonb) v", [
            a,
            v,
            JSON.stringify(s),
          ]),
        true,
      );
    let s = run(fresh(), start);
    assert.equal((await commit(s, 0)).rows[0].v, 1);
    assert.equal(
      (
        await store.asUser(b, (tx) =>
          tx.query("select * from public.learning_sessions"),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      store.asUser(a, (tx) =>
        tx.exec("update public.learning_sessions set hints_used=0"),
      ),
      /permission denied/,
    );
    s = run(s, { type: "finish_theory" });
    s = run(s, { type: "answer", answer: "" });
    await commit(s, 1);
    let row = (await store.db.query("select * from public.learning_sessions"))
      .rows[0];
    assert.equal(row.phase, "exercise");
    assert.equal(row.hints_used, 1);
    assert.equal((await commit(s, 1)).rows[0].v, -1);
    const invalid = structuredClone(s);
    invalid.sessions.push({ ...invalid.sessions[0], id: randomUUID() });
    await assert.rejects(commit(invalid, 2), /unique|duplicate/);
    assert.equal(
      (
        await store.db.query(
          "select version from public.learning_states where user_id=$1",
          [a],
        )
      ).rows[0].version,
      2,
    );
    await store.db.exec(
      await readFile(
        "supabase/migrations/202609150008_learning_sessions.sql",
        "utf8",
      ),
    );
    const checks = (
      await store.db.query(
        await readFile("supabase/checks/stages14-16.sql", "utf8"),
      )
    ).rows[0];
    for (const [key, value] of Object.entries(checks))
      if (key !== "learning_sessions") assert.equal(value, 0, key);
  } finally {
    await store.close();
  }
});
