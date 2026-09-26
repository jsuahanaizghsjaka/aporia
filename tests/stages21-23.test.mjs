import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { applyAction } from "../src/lib/learning/engine.ts";
import {
  initialLearningState,
  skillProgress,
  activeSession,
} from "../src/lib/learning/selectors.ts";
import { stateSchema } from "../src/lib/learning/types.ts";
import { questionById } from "../src/lib/learning/question-bank.ts";
import {
  sessionHistory,
  progressGroup,
  evidenceDelta,
  durationLabel,
} from "../src/lib/learning/history.ts";
import { learningDatabase } from "./helpers/learning-db.mjs";
const now = new Date("2026-09-22T10:00:00Z");
const profile = {
  onboardingComplete: true,
  dailyMinutes: 30,
  interests: "музыка",
  goal: "Python backend",
};
const run = (s, a, time = now, id = randomUUID()) =>
  applyAction(s, a, profile, id, time);
const lesson = () =>
  run(
    run(
      { ...initialLearningState(), diagnosticComplete: true },
      { type: "start_lesson", mode: "learn", teacher: "prepared", minutes: 5 },
    ),
    { type: "finish_theory" },
  );
test("mastery changes have source, time and exact deltas; retries and passive actions cannot add credit", () => {
  let s = lesson();
  const q = questionById(activeSession(s).questions[0]);
  s = run(s, { type: "answer", answer: "WRONG" }, new Date(+now + 10000));
  const id = randomUUID(),
    action = { type: "answer", answer: q.answers[0] };
  s = run(s, action, new Date(+now + 20000), id);
  const e = s.evidence[0];
  assert.equal(e.source_id, e.id);
  assert.equal(e.answer, q.answers[0]);
  assert.equal(e.mastery_changes.length, 2);
  assert.equal(e.history_complete, true);
  assert.equal(evidenceDelta(e), skillProgress(s, q.skill).mastery);
  assert.equal(
    skillProgress(s, q.skill).last.at,
    new Date(+now + 20000).toISOString(),
  );
  assert.deepEqual(run(s, action, now, id), s);
  const before = structuredClone(s.evidence);
  s = run(s, { type: "resource_open", skill: "python" });
  s = run(s, {
    type: "feedback",
    target: "resource:python",
    rating: "hard",
    note: "",
  });
  assert.deepEqual(s.evidence, before);
  s = run(s, { type: "next" });
  s = run(
    s,
    {
      type: "finish_project",
      reflection: "Проверю пустой список и отсутствующий id отдельно.",
    },
    new Date(+now + 90000),
  );
  const h = sessionHistory(s, s.sessions[0]);
  assert.equal(h.seconds, 90);
  assert.equal(h.complete, true);
  assert.equal(h.changes[0].delta, skillProgress(s, "python").mastery);
  assert.equal(stateSchema.safeParse(s).success, true);
});
test("progress groups distinguish no evidence from weak and require confidence for strong", () => {
  const p = (mastery, confidence, count = 1) =>
    progressGroup({ mastery, confidence, count });
  assert.equal(p(0, 0, 0), "not_started");
  assert.equal(p(0, 0), "weak");
  assert.equal(p(34, 80), "weak");
  assert.equal(p(35, 0), "learning");
  assert.equal(p(70, 44), "learning");
  assert.equal(p(70, 45), "strong");
});
test("history reports negative changes, legacy gaps, real elapsed duration and unfinished sessions honestly", () => {
  const s = lesson(),
    session = s.sessions[0];
  const entry = {
    id: "older",
    questionId: session.questions[0],
    skill: "python",
    kind: "quiz",
    correct: false,
    independence: 1,
    at: now.toISOString(),
    sessionId: session.id,
  };
  s.evidence = [entry];
  assert.equal(sessionHistory(s, session).complete, false);
  assert.equal(sessionHistory(s, session).seconds, null);
  entry.history_complete = true;
  entry.mastery_changes = [{ before: 42, after: 31, at: now.toISOString() }];
  assert.equal(sessionHistory(s, session).changes[0].delta, -11);
  assert.equal(stateSchema.safeParse(s).success, true);
  assert.equal(durationLabel(3661), "1 ч 1 мин");
  assert.equal(durationLabel(0), "0 с");
  assert.equal(durationLabel(null), "Ещё не завершено");
});
test("010 persists proof atomically, derives SQL scores from it, isolates owners, backfills without invented history and replays safely", async () => {
  const store = await learningDatabase();
  const a = randomUUID(),
    b = randomUUID();
  try {
    await store.seed(a);
    await store.seed(b);
    let s = lesson();
    s = run(s, {
      type: "answer",
      answer: questionById(activeSession(s).questions[0]).answers[0],
    });
    const commit = (data, version) =>
      store.asUser(
        a,
        (tx) =>
          tx.query("select public.commit_learning_state($1,$2,$3::jsonb) v", [
            a,
            version,
            JSON.stringify(data),
          ]),
        true,
      );
    await commit(s, 0);
    const rows = (
      await store.asUser(a, (tx) =>
        tx.query("select * from public.mastery_evidence"),
      )
    ).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source_id, s.evidence[0].id);
    assert.equal(rows[0].answer, s.evidence[0].answer);
    assert.equal(rows[0].session_id, s.sessions[0].id);
    const skills = (
      await store.asUser(a, (tx) =>
        tx.query("select * from public.user_skills where skill_id='python'"),
      )
    ).rows[0];
    assert.equal(skills.mastery_score, skillProgress(s, "python").mastery);
    assert.equal(
      (
        await store.asUser(b, (tx) =>
          tx.query("select * from public.mastery_evidence"),
        )
      ).rows.length,
      0,
    );
    for (const sql of [
      "delete from public.mastery_evidence",
      "update public.user_skills set mastery_score=95",
      "select public.aporia_sync_mastery_evidence('" + a + "','{}')",
    ]) {
      await assert.rejects(
        store.asUser(a, (tx) => tx.exec(sql)),
        /permission denied/,
      );
    }
    const invalid = structuredClone(s);
    invalid.evidence[0].mastery_changes[0].after = 100;
    await assert.rejects(commit(invalid, 1), /Invalid evidence change/);
    assert.equal(
      (
        await store.db.query(
          "select version from public.learning_states where user_id=$1",
          [a],
        )
      ).rows[0].version,
      1,
    );
    // An old state has real answers but no score timeline. Preserve the fact, not a fabricated delta.
    const legacy = structuredClone(s);
    delete legacy.evidence[0].source_id;
    delete legacy.evidence[0].mastery_changes;
    delete legacy.evidence[0].history_complete;
    delete legacy.evidence[0].answer;
    await commit(legacy, 1);
    await store.db.exec(
      await readFile(
        "supabase/migrations/202609220010_mastery_evidence.sql",
        "utf8",
      ),
    );
    const old = (
      await store.db.query(
        "select * from public.mastery_evidence where user_id=$1",
        [a],
      )
    ).rows[0];
    assert.equal(old.history_complete, false);
    assert.deepEqual(old.mastery_changes, []);
    assert.equal(old.source_id, legacy.evidence[0].id);
    assert.equal(old.answer, null);
    const checks = (
      await store.db.query(
        await readFile("supabase/checks/stages21-23.sql", "utf8"),
      )
    ).rows[0];
    for (const [k, v] of Object.entries(checks))
      if (!["evidence_rows", "legacy_evidence_rows"].includes(k))
        assert.equal(v, 0, k);
  } finally {
    await store.close();
  }
});
