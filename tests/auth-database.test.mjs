import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Auth profile migration backfills safely and creates isolated profiles in the signup transaction", async () => {
  const db = await PGlite.create();
  const old = "11111111-1111-4111-8111-111111111111";
  const missing = "22222222-2222-4222-8222-222222222222";
  const fresh = "33333333-3333-4333-8333-333333333333";
  try {
    // This fixture represents an existing stage-2 database before migration 004.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create role supabase_auth_admin;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create table public.profiles(
        id uuid primary key references auth.users(id) on delete cascade,
        data jsonb not null default '{}', avatar_path text,
        version bigint not null default 0
      );
      alter table public.profiles enable row level security;
      create table public.mentor_messages(id uuid primary key);
      grant usage on schema auth to supabase_auth_admin;
      grant insert on auth.users to supabase_auth_admin;
      grant usage on schema public to service_role, authenticated, anon;
      insert into auth.users(id) values ('${old}'), ('${missing}');
      insert into public.profiles values ('${old}', '{"displayName":"Keep me"}', '${old}/photo.webp', 7);
    `);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609110004_auth_profiles.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const row = (id) =>
      db.query("select * from public.profiles where id=$1", [id]);
    assert.deepEqual((await row(old)).rows[0], {
      id: old,
      data: { displayName: "Keep me" },
      avatar_path: `${old}/photo.webp`,
      version: 7,
    });
    assert.deepEqual((await row(missing)).rows[0].data, {});
    await db.exec("set role supabase_auth_admin");
    await db.query("insert into auth.users values ($1, $2)", [
      fresh,
      '{"onboardingComplete":true,"role":"admin"}',
    ]);
    await db.exec("reset role");
    assert.deepEqual((await row(fresh)).rows[0], {
      id: fresh,
      data: {},
      avatar_path: null,
      version: 0,
    });
    // A rolled-back signup must never leave an orphan profile.
    await db.exec(
      "begin; insert into auth.users(id) values ('44444444-4444-4444-8444-444444444444'); rollback;",
    );
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      3,
    );
    for (const role of ["authenticated", "anon"]) {
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1, 'public.aporia_create_auth_profile()', 'EXECUTE') as allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    }
    await db.exec("set role service_role");
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      3,
    );
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [fresh]);
    assert.equal((await row(fresh)).rows.length, 0);
    const repair = "55555555-5555-4555-8555-555555555555";
    await db.exec(
      "alter table auth.users disable trigger aporia_on_auth_user_created",
    );
    await db.query("insert into auth.users(id) values ($1)", [repair]);
    assert.equal((await row(repair)).rows.length, 0);
    const migration = await readFile(
      new URL(
        "../supabase/migrations/202609120005_onboarding.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual((await row(repair)).rows[0].data, {});
    assert.equal((await row(old)).rows[0].version, 7);
    assert.equal((await row(old)).rows[0].data.displayName, "Keep me");
    assert.equal((await row(old)).rows[0].avatar_path, `${old}/photo.webp`);
    await db.exec("set role supabase_auth_admin");
    await db.query(
      "insert into auth.users(id,raw_user_meta_data) values ($1,$2)",
      [fresh, '{"onboardingComplete":true}'],
    );
    await db.exec("reset role");
    assert.deepEqual((await row(fresh)).rows[0].data, {});
  } finally {
    await db.close();
  }
});
