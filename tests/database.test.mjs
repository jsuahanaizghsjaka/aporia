import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Postgres migrations enforce owner isolation, server-only evidence and atomic versions", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
      grant usage on schema storage to authenticated; grant select, insert, delete on storage.objects to authenticated;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
    `);
    for (const file of [
      "202609080001_profiles_and_memory.sql",
      "202609080002_learning_loop.sql",
      "202609080003_profile_versions.sql",
      "202609110004_auth_profiles.sql",
      "202609120005_onboarding.sql",
      "202609130006_goals_and_skills.sql",
    ])
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    const A = "11111111-1111-4111-8111-111111111111",
      B = "22222222-2222-4222-8222-222222222222";
    await db.exec("set role service_role");
    const commit = async (id, version, data = { schema: 1 }) =>
      (
        await db.query(
          "select public.commit_learning_state($1, $2, $3::jsonb) as version",
          [id, version, JSON.stringify(data)],
        )
      ).rows[0].version;
    assert.equal(Number(await commit(A, 0)), 1);
    assert.equal(Number(await commit(B, 0)), 1);
    assert.equal(Number(await commit(A, 0)), -1);
    const writes = await Promise.all([
      commit(A, 1, { schema: 1, marker: "first" }),
      commit(A, 1, { schema: 1, marker: "stale" }),
    ]);
    assert.deepEqual(writes.map(Number), [2, -1]);
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      A,
    ]);
    const own = await db.query("select * from public.learning_states");
    assert.equal(own.rows.length, 1);
    assert.equal(own.rows[0].user_id, A);
    assert.equal(own.rows[0].data.marker, "first");
    assert.equal(
      (
        await db.query(
          "select * from public.learning_states where user_id = $1",
          [B],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query(
          "update public.learning_states set data = '{}'::jsonb where user_id = $1",
          [A],
        ),
      /permission denied/,
    );
    await assert.rejects(() => commit(A, 2), /permission denied/);
    const profileCommit = async (version, data, path = null) =>
      Number(
        (
          await db.query(
            "select public.commit_profile($1, $2::jsonb, $3) as version",
            [version, JSON.stringify(data), path],
          )
        ).rows[0].version,
      );
    assert.equal(await profileCommit(0, { displayName: "Learner A" }), 1);
    assert.equal(await profileCommit(0, { displayName: "Stale" }), -1);
    await assert.rejects(
      () =>
        db.query("update public.profiles set data = '{}' where id = $1", [A]),
      /permission denied/,
    );
    await assert.rejects(
      () => profileCommit(1, {}, `${B}/photo.webp`),
      /avatar_owned_path/,
    );
    assert.deepEqual(
      await Promise.all([
        profileCommit(1, { displayName: "New A" }, `${A}/new.webp`),
        profileCommit(1, { displayName: "Stale A" }, null),
      ]),
      [2, -1],
    );
    assert.equal(
      (await db.query("select avatar_path from public.profiles")).rows[0]
        .avatar_path,
      `${A}/new.webp`,
    );
    await db.query(
      "insert into storage.objects(bucket_id, name) values ('avatars', $1)",
      [`${A}/photo.webp`],
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into storage.objects(bucket_id, name) values ('avatars', $1)",
          [`${B}/photo.webp`],
        ),
      /row-level security/,
    );
    for (let i = 0; i < 30; i++)
      assert.equal(
        (await db.query("select public.consume_ai_request() as allowed"))
          .rows[0].allowed,
        true,
      );
    assert.equal(
      (await db.query("select public.consume_ai_request() as allowed")).rows[0]
        .allowed,
      false,
    );
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      B,
    ]);
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select public.consume_ai_request() as allowed")).rows[0]
        .allowed,
      true,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      () => db.query("select * from public.learning_states"),
      /permission denied/,
    );
    await assert.rejects(() => commit(A, 2), /permission denied/);
    await assert.rejects(() => profileCommit(0, {}), /permission denied/);
  } finally {
    await db.close();
  }
});
