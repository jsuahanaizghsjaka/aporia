import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("40–43 cohort report excludes outsiders, immature windows, late and duplicate activity", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`create table product_events (
      user_id uuid, name text, event_key text, occurred_at timestamptz,
      primary key(user_id,name,event_key)
    )`);
    const a = "00000000-0000-4000-8000-000000000001";
    const b = "00000000-0000-4000-8000-000000000002";
    const fresh = "00000000-0000-4000-8000-000000000003";
    const outsider = "00000000-0000-4000-8000-000000000004";
    const absent = "00000000-0000-4000-8000-000000000005";
    const signup = Date.parse("2026-10-01T00:00:00Z");
    const insert = (id, name, day, key = name) =>
      db.query(
        "insert into product_events values($1,$2,$3,$4) on conflict do nothing",
        [id, name, key, new Date(signup + day * 86400000).toISOString()],
      );
    for (const id of [a, b, outsider]) await insert(id, "signup", 0);
    await insert(fresh, "signup", 9.5);
    for (const name of [
      "onboarding_completed",
      "diagnostic_completed",
      "lesson_started",
      "lesson_completed",
    ])
      await insert(a, name, 0.1);
    await insert(a, "lesson_started", 2, "second");
    await insert(a, "lesson_completed", 2, "second");
    await insert(a, "lesson_completed", 3, "third");
    await insert(a, "lesson_completed", 3, "third");
    await insert(a, "project_started", 4);
    await insert(a, "weekly_review_opened", 7);
    await insert(b, "onboarding_completed", -1, "before-signup");
    await insert(b, "onboarding_completed", 1); // Day 0 upper boundary excluded.
    await insert(b, "lesson_started", 2); // Not a second session by itself.
    await insert(b, "project_started", 7); // Outside first seven days.
    await insert(b, "weekly_review_opened", 8); // Outside Day 7.
    await insert(b, "lesson_completed", 11); // After report cutoff.
    await insert(fresh, "lesson_completed", 9.6);
    await insert(outsider, "onboarding_completed", 0.1);
    const sql = (
      await readFile(
        new URL("../supabase/checks/stages40-43-cohort.sql", import.meta.url),
        "utf8",
      )
    ).replace("now() as as_of", "timestamptz '2026-10-11T00:00:00Z' as as_of");
    const report = async (ids) =>
      (
        await db.query(
          sql.replace(
            "array[]::uuid[]",
            `array[${ids.map((id) => `'${id}'`).join(",")}]::uuid[]`,
          ),
        )
      ).rows;
    const empty = await report([]);
    assert.equal(empty.length, 10);
    assert.ok(
      empty.every((r) => r.status === "NO_COHORT" && r.percent === null),
    );
    const waiting = await report([fresh]);
    assert.ok(
      waiting.every(
        (r) => r.status === "WAITING_FOR_WINDOW" && r.percent === null,
      ),
    );
    const rows = await report([a, b, fresh, a]);
    const metric = (name) => rows.find((r) => r.metric === name);
    assert.ok(
      rows.every(
        (r) => Number(r.selected_users) === 3 && Number(r.cohort_size) === 3,
      ),
    );
    assert.ok(
      rows.every(
        (r) => Number(r.eligible_users) === 2 && r.status === "OBSERVED",
      ),
    );
    for (const name of [
      "onboarding_completed_d0",
      "diagnostic_completed_d0",
      "lesson_started_d0",
      "lesson_completed_d0",
      "three_completed_lessons_d0_6",
      "second_session_d1_3",
      "project_started_d0_6",
      "weekly_review_opened_d7",
    ])
      assert.equal(Number(metric(name).percent), 50, name);
    assert.equal(Number(metric("project_activity_d3_7").percent), 100);
    // Starting a project exactly at D7 is a return, even without a review.
    assert.equal(Number(metric("meaningful_return_d7").percent), 100);
    assert.ok(
      rows.every(
        (r) => !Object.hasOwn(r, "user_id") && !Object.hasOwn(r, "email"),
      ),
    );
    const incomplete = await report([a, absent]);
    assert.ok(
      incomplete.every(
        (r) =>
          r.status === "INCOMPLETE_HISTORY" &&
          Number(r.missing_signup_events) === 1,
      ),
    );
  } finally {
    await db.close();
  }
});
