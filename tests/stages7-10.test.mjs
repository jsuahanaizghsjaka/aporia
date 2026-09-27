import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { learningDatabase } from "./helpers/learning-db.mjs";
import {
  memoryFromProfile,
  profileFromMemory,
  memoryCandidateSchema,
} from "../src/lib/profile/memory.ts";
import { emptyProfile } from "../src/lib/profile/schema.ts";
import { checkDouble } from "../src/lib/learning/code-check.ts";
import { questions, questionKind } from "../src/lib/learning/question-bank.ts";
import {
  skillProgress,
  initialLearningState,
} from "../src/lib/learning/selectors.ts";
import { goalDraftSchema, saveGoalSchema } from "../src/lib/goals/schema.ts";
test("memory validates proposals, preserves identity and clears deleted fields", () => {
  const p = {
    ...emptyProfile,
    displayName: "Sinon",
    goal: "Python backend API",
    onboardingComplete: true,
    version: 4,
    occupation: "Student",
    education: "College",
    interests: "music, code",
  };
  const { onboarding_completed, personal_schedule, ...candidate } =
    memoryFromProfile(p);
  assert.equal(personal_schedule, null);
  assert.equal(
    memoryCandidateSchema.safeParse({ ...candidate, personal_schedule })
      .success,
    false,
  );
  assert.equal(onboarding_completed, true);
  candidate.education = "";
  candidate.notes = "Short lessons";
  const saved = profileFromMemory(p, candidate);
  assert.equal(saved.education, "");
  assert.equal(saved.version, 4);
  assert.equal(saved.onboardingComplete, true);
  assert.deepEqual(memoryFromProfile(saved).interests, ["music", "code"]);
  assert.equal(
    memoryCandidateSchema.safeParse({ ...candidate, mastery: 99 }).success,
    false,
  );
  assert.equal(
    memoryCandidateSchema.safeParse({
      ...candidate,
      weekly_available_hours: -1,
    }).success,
    false,
  );
  assert.equal(
    memoryCandidateSchema.safeParse({ ...candidate, hobbies: ["Code", "code"] })
      .success,
    false,
  );
});
test("coding accepts equivalent arithmetic and rejects unsupported code without executing it", () => {
  for (const answer of [
    "n*2",
    "def double(n): return n * 2",
    "n + n",
    "return 2*n",
    "def double(n):\n    return n * 2",
    "(n//1)*2",
    "-(-n-n)",
  ])
    assert.equal(checkDouble(answer), true, answer);
  for (const answer of [
    "n",
    "n*3",
    "print(n*2)",
    '__import__("os").system("id")',
    "n/0",
    "n//0",
    "n; return n*2",
    "(".repeat(100) + "n*2" + ")".repeat(100),
    "9".repeat(1500),
  ])
    assert.equal(checkDouble(answer), false, answer);
});
test("diagnostic covers four question formats; goal input rejects forged identity", () => {
  assert.equal(questions.filter((q) => q.id.endsWith(".d")).length, 9);
  assert.deepEqual(
    new Set(questions.filter((q) => q.id.endsWith(".d")).map(questionKind)),
    new Set(["multiple_choice", "short_answer", "code_reasoning", "coding"]),
  );
  assert.equal(
    saveGoalSchema.safeParse({
      summary: "Build Python API",
      success_criteria: ["Five routes work"],
      target_date: null,
      version: 0,
      requestId: randomUUID(),
      user_id: randomUUID(),
    }).success,
    false,
  );
  assert.equal(
    goalDraftSchema.safeParse({
      summary: "Build Python API",
      success_criteria: ["repeat", "Repeat"],
      target_date: "2026-02-30",
    }).success,
    false,
  );
});
test("PostgreSQL persists one goal and atomic evidence-derived skills, isolates accounts and survives migration reapply", async () => {
  const env = await learningDatabase(),
    db = env.db,
    A = randomUUID(),
    B = randomUUID();
  try {
    await env.seed(A);
    await env.seed(B);
    assert.equal(
      (
        await env.asUser(A, (tx) =>
          tx.query("select * from public.user_skills"),
        )
      ).rows.length,
      8,
    );
    assert.equal(
      (await db.query("select count(*) n from public.skills")).rows[0].n,
      9,
    );
    const goal = {
      summary: "Build a Python task API",
      success_criteria: ["Create and read tasks", "Tests verify access"],
      target_date: "2026-10-30",
    };
    const id = randomUUID();
    const commit = (owner, version, request = id, data = goal) =>
      env.asUser(owner, async (tx) =>
        Number(
          (
            await tx.query("select public.commit_goal($1,$2,$3::jsonb) v", [
              version,
              request,
              JSON.stringify(data),
            ])
          ).rows[0].v,
        ),
      );
    await assert.rejects(() => commit(A, 0), /Confirm profile/);
    await env.profile(A, { onboardingComplete: true }, 1);
    await env.profile(B, { onboardingComplete: true }, 1);
    assert.deepEqual(await Promise.all([commit(A, 0), commit(A, 0)]), [1, 1]);
    assert.equal(await commit(A, 0, randomUUID()), -1);
    assert.equal(
      await commit(A, 1, id, { ...goal, summary: "A different valid goal" }),
      -1,
    );
    assert.equal(
      await commit(A, 1, randomUUID(), { ...goal, target_date: null }),
      2,
    );
    await assert.rejects(
      () =>
        commit(A, 2, randomUUID(), {
          ...goal,
          success_criteria: ["duplicate", "Duplicate"],
        }),
      /criteria/,
    );
    assert.equal(
      (await env.asUser(B, (tx) => tx.query("select * from public.goals"))).rows
        .length,
      0,
    );
    await assert.rejects(
      () =>
        env.asUser(A, (tx) =>
          tx.query("update public.user_skills set mastery_score=100"),
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        env.asUser(A, (tx) =>
          tx.query(
            "insert into public.skills values('other','Other',null,null,9)",
          ),
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        env.asUser(
          A,
          (tx) =>
            tx.query("select public.aporia_sync_user_skills($1,$2)", [A, "{}"]),
          true,
        ),
      /permission denied/,
    );
    const state = initialLearningState();
    for (let i = 0; i < 15; i++)
      state.evidence.push({
        id: String(i),
        questionId: `python.${i % 4}`,
        skill: "python",
        kind: i < 4 ? "diagnostic" : "exercise",
        correct: i % 5 !== 0,
        independence: i % 3 === 0 ? 0.5 : 1,
        at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
        sessionId: randomUUID(),
      });
    const write = (version) =>
      env.asUser(
        A,
        async (tx) =>
          Number(
            (
              await tx.query(
                "select public.commit_learning_state($1,$2,$3::jsonb) v",
                [A, version, JSON.stringify(state)],
              )
            ).rows[0].v,
          ),
        true,
      );
    assert.equal(await write(0), 1);
    const actual = (
        await env.asUser(A, (tx) =>
          tx.query("select * from public.user_skills where skill_id='python'"),
        )
      ).rows[0],
      expected = skillProgress(state, "python");
    assert.equal(actual.mastery_score, expected.mastery);
    assert.equal(actual.confidence, expected.confidence);
    assert.equal(actual.evidence_count, 15);
    assert.equal(actual.last_practiced.toISOString(), state.evidence.at(-1).at);
    assert.equal(await write(0), -1);
    assert.equal(
      (
        await env.asUser(B, (tx) =>
          tx.query("select sum(mastery_score) m from public.user_skills"),
        )
      ).rows[0].m,
      0,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609130006_goals_and_skills.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal(
      (await db.query("select count(*) n from public.goals")).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select data from public.learning_states where user_id=$1",
          [A],
        )
      ).rows[0].data.evidence.length,
      15,
    );
  } finally {
    await env.close();
  }
});
