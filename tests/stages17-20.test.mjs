import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { generatedExercise } from "../src/lib/learning/exercises.ts";
import { applyAction, learningView } from "../src/lib/learning/engine.ts";
import {
  activeSession,
  initialLearningState,
} from "../src/lib/learning/selectors.ts";
import { questionById, grade } from "../src/lib/learning/question-bank.ts";
import {
  generateProjectPlan,
  suggestedProject,
} from "../src/lib/learning/projects.ts";
import {
  appendProjectMessage,
  projectLearnReplySchema,
  learnProjectReply,
} from "../src/lib/learning/project-mentor.ts";
import {
  skillIds,
  stateSchema,
  actionSchema,
} from "../src/lib/learning/types.ts";
import { learningDatabase } from "./helpers/learning-db.mjs";
const profile = {
  onboardingComplete: true,
  dailyMinutes: 30,
  interests: "музыка",
  goal: "Создать backend API треков",
};
const now = new Date("2026-09-21T10:00:00Z");
const fresh = () => ({ ...initialLearningState(), diagnosticComplete: true });
const run = (s, a, at = now, id = randomUUID()) =>
  applyAction(s, a, profile, id, at);
const lesson = {
  type: "start_lesson",
  mode: "learn",
  teacher: "prepared",
  minutes: 5,
};
const artifact =
  'def find_record(records, record_id):\n    return next((r for r in records if r["id"] == record_id), None)';
test("480 variants have stable validated answers and public view contains no answer keys", () => {
  for (const skill of skillIds)
    for (let level = 1; level <= 3; level++)
      for (let n = 0; n < 20; n++) {
        const id = `${skill}.v1.${level}.${n}`,
          q = generatedExercise(id);
        assert.ok(q);
        assert.deepEqual(questionById(id), q);
        assert.ok(q.prompt);
        assert.ok(grade(q, q.answers[0]));
        assert.equal(grade(q, "WRONG_ANSWER"), false);
        if (q.choices) {
          assert.equal(new Set(q.choices).size, q.choices.length);
          assert.ok(q.choices.includes(q.answers[0]));
        }
      }
  for (const id of [
    "python.v1.4.0",
    "python.v1.1.20",
    "js.v1.1.0",
    "python.v2.1.0",
  ])
    assert.equal(generatedExercise(id), null);
  const s = run(run(fresh(), lesson), { type: "finish_theory" }),
    v = learningView(s);
  assert.match(v.question.id, /python\.v1\.1\./);
  assert.equal(v.question.level, "foundation");
  for (const key of ["answers", "solution", "hints", "explanation"])
    assert.equal(v.question[key], undefined);
});
test("mode and hints persist; elapsed time is server-owned and retries cannot duplicate credit", () => {
  let s = run(run(fresh(), lesson), { type: "finish_theory" });
  s = run(s, { type: "set_mode", mode: "help" });
  s = run(s, { type: "hint" });
  s = run(s, { type: "set_mode", mode: "learn" });
  assert.equal(activeSession(s).stage, 5);
  const id = randomUUID(),
    action = {
      type: "answer",
      answer: questionById(activeSession(s).questions[0]).answers[0],
    };
  s = run(s, action, new Date(now.getTime() + 27000), id);
  assert.equal(s.evidence[0].independence, 0);
  assert.equal(activeSession(s).attempts[0].time_spent, 27);
  assert.equal(activeSession(s).attempts[0].skill_id, "python");
  assert.equal(run(s, action, now, id), s);
  assert.equal(
    stateSchema.parse(JSON.parse(JSON.stringify(s))).sessions[0].mode,
    "learn",
  );
  assert.equal(
    actionSchema.safeParse({ ...action, time_spent: 1, correct: true }).success,
    false,
  );
  assert.throws(() =>
    run(run(initialLearningState(), { type: "start_diagnostic" }), {
      type: "set_mode",
      mode: "help",
    }),
  );
});
test("project plan reflects goal, interests and evidence-based per-skill difficulty", () => {
  const s = fresh();
  for (let i = 0; i < 12; i++)
    s.evidence.push({
      id: `e${i}`,
      questionId: `python.${i}`,
      skill: "python",
      kind: "exercise",
      correct: true,
      independence: 1,
      at: now.toISOString(),
      sessionId: `s${i}`,
    });
  const p = generateProjectPlan(
    s,
    profile,
    "Создать API музыкальной коллекции",
  );
  assert.equal(p.tasks.length, 8);
  assert.match(p.title, /Музыкальная/);
  assert.equal(p.tasks[0].level, "challenge");
  assert.equal(p.tasks[2].level, "foundation");
  assert.match(p.reason, /API музыкальной коллекции/);
  assert.equal(p.interests, profile.interests);
  assert.equal(suggestedProject("API музыки").id, "music");
});
test("submission needs saved work, understanding and report; edits reopen without adding evidence", () => {
  let s = run(fresh(), { type: "choose_project", projectId: "music" });
  assert.throws(() =>
    run(s, {
      type: "submit_task",
      skill: "python",
      report: "Я проверил свой результат, все хорошо.",
    }),
  );
  s = run(s, { type: "save_artifact", skill: "python", artifact });
  s = run(s, {
    type: "project_answer",
    skill: "python",
    answer: questionById("python.project").answers[0],
  });
  assert.deepEqual(s.project.submissions, {});
  const evidence = structuredClone(s.evidence);
  s = run(s, {
    type: "submit_task",
    skill: "python",
    report:
      "Вызвал find_record([], 1), получен None. Найденная запись возвращается по id.",
  });
  assert.ok(s.project.submissions.python);
  assert.deepEqual(s.evidence, evidence);
  s = run(s, { type: "project_answer", skill: "python", answer: "WRONG" });
  assert.ok(s.project.submissions.python);
  s = run(s, {
    type: "save_artifact",
    skill: "python",
    artifact: artifact + "\n# новая версия",
  });
  assert.equal(s.project.submissions.python, undefined);
  assert.deepEqual(s.evidence, evidence);
});
test("mentor cannot submit tasks or confirm decisions; Learn replies are bounded and help is remembered", () => {
  let s = run(fresh(), { type: "choose_project", projectId: "music" });
  assert.equal(
    projectLearnReplySchema.safeParse({
      focus: "inputs",
      criterion: 0,
      code: "whole project",
    }).success,
    false,
  );
  const input = {
    id: randomUUID(),
    skill: "python",
    question: "Помоги с тестом",
    reply: learnProjectReply("python", { focus: "test", criterion: 2 }),
    decision: "Проверять None при отсутствии",
  };
  s = appendProjectMessage(s, input, now.toISOString());
  assert.equal(s.project.messages.length, 1);
  assert.equal(s.project.decisions.length, 0);
  s.requestIds = [];
  assert.equal(appendProjectMessage(s, input), s);
  assert.deepEqual(s.project.submissions, {});
  assert.equal(s.evidence.length, 0);
  s = run(s, {
    type: "save_decision",
    skill: "python",
    text: "При отсутствии записи возвращаем None",
  });
  assert.equal(s.project.decisions.length, 1);
  s = run(s, { type: "save_artifact", skill: "python", artifact });
  s = run(s, {
    type: "project_answer",
    skill: "python",
    answer: questionById("python.project").answers[0],
  });
  assert.equal(s.evidence.at(-1).independence, 0);
  assert.equal(stateSchema.safeParse(s).success, true);
});
test("SQL projections are atomic, private, read-only and safe across migration reapply", async () => {
  const store = await learningDatabase(),
    a = randomUUID(),
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
    let s = run(run(fresh(), lesson), { type: "finish_theory" });
    s = run(
      s,
      { type: "answer", answer: "WRONG" },
      new Date(now.getTime() + 15000),
    );
    s = run(s, { type: "choose_project", projectId: "music" });
    s = run(s, { type: "save_artifact", skill: "python", artifact });
    s = run(s, {
      type: "project_answer",
      skill: "python",
      answer: questionById("python.project").answers[0],
    });
    s = run(s, {
      type: "submit_task",
      skill: "python",
      report: "Проверил поиск по существующему id и отсутствие: вернулся None.",
    });
    s = appendProjectMessage(
      s,
      {
        id: randomUUID(),
        skill: "python",
        question: "Как проверить?",
        reply: "Проверь пустой массив",
        decision: null,
      },
      now.toISOString(),
    );
    s = run(s, {
      type: "save_decision",
      skill: "python",
      text: "Поиск возвращает None при отсутствии",
    });
    assert.equal((await commit(s, 0)).rows[0].v, 1);
    for (const table of [
      "exercises",
      "exercise_attempts",
      "projects",
      "project_tasks",
      "project_messages",
      "project_decisions",
    ]) {
      assert.ok(
        (
          await store.asUser(a, (tx) =>
            tx.query(`select * from public.${table}`),
          )
        ).rows.length > 0,
        table,
      );
      assert.equal(
        (
          await store.asUser(b, (tx) =>
            tx.query(`select * from public.${table}`),
          )
        ).rows.length,
        0,
        table,
      );
      await assert.rejects(
        store.asUser(a, (tx) => tx.exec(`delete from public.${table}`)),
        /permission denied/,
      );
    }
    assert.equal(
      (await store.db.query("select time_spent from public.exercise_attempts"))
        .rows[0].time_spent,
      15,
    );
    const broken = structuredClone(s);
    broken.project.submissions.python.artifact = "FORGED";
    await assert.rejects(commit(broken, 1), /check constraint/);
    assert.equal(
      (await store.db.query("select version from public.learning_states"))
        .rows[0].version,
      1,
    );
    await store.db.exec(
      await readFile(
        "supabase/migrations/202609210009_exercises_projects.sql",
        "utf8",
      ),
    );
    const checks = (
      await store.db.query(
        await readFile("supabase/checks/stages17-20.sql", "utf8"),
      )
    ).rows[0];
    for (const key of [
      "malformed_projects",
      "invalid_submissions",
      "invalid_attempts",
      "invalid_session_modes",
      "unprotected_tables",
    ])
      assert.equal(checks[key], 0, key);
    assert.equal(checks.projects, 1);
    assert.equal(checks.confirmed_decisions, 1);
    assert.equal((await commit(s, 0)).rows[0].v, -1);
  } finally {
    await store.close();
  }
});
