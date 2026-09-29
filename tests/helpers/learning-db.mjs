import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
export async function learningDatabase() {
  const db = await PGlite.create();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
  );
  for (const file of (
    await readdir(new URL("../../supabase/migrations/", import.meta.url))
  )
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  const asUser = (id, fn, service = false) =>
    db.transaction(async (tx) => {
      await tx.exec(
        service
          ? "set local role service_role"
          : "set local role authenticated",
      );
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id ?? "",
      ]);
      return fn(tx);
    });
  const seed = (id) =>
    db.query("insert into auth.users values($1) on conflict do nothing", [id]);
  const profile = (id, data, version) =>
    db.query("update public.profiles set data=$2,version=$3 where id=$1", [
      id,
      JSON.stringify(data),
      version,
    ]);
  const tables = {
    roadmaps: ["id", "user_id", "goal_id", "active", "version", "updated_at"],
    roadmap_items: ["roadmap_id", "user_id", "skill_id", "position", "reason"],
    learning_sessions: [
      "user_id",
      "id",
      "kind",
      "skill_id",
      "status",
      "phase",
      "estimated_time",
      "hints_used",
      "started_at",
      "completed_at",
      "data",
    ],
    goals: [
      "id",
      "user_id",
      "summary",
      "success_criteria",
      "target_date",
      "active",
      "version",
      "updated_at",
    ],
    skills: [
      "id",
      "title",
      "parent_skill_id",
      "prerequisite_skill_id",
      "position",
    ],
    user_skills: [
      "user_id",
      "skill_id",
      "mastery_score",
      "confidence",
      "evidence_count",
      "last_practiced",
    ],
    learning_states: ["user_id", "data", "version"],
  };
  async function route(url, body, current, service, send, req) {
    const name = url.pathname.replace("/rest/v1/", "");
    if (
      !tables[name] &&
      ![
        "rpc/commit_goal",
        "rpc/commit_learning_state",
        "rpc/commit_roadmap",
        "rpc/observe_product_event",
      ].includes(name)
    )
      return false;
    if (!current && !service) {
      send(401, {});
      return true;
    }
    try {
      let data = await asUser(
        current?.id,
        async (tx) => {
          if (name === "rpc/observe_product_event") {
            await tx.query("select public.observe_product_event($1,$2)", [body._name, body._review_id]);
            return null;
          }
          if (name === "rpc/commit_roadmap")
            return Number(
              (
                await tx.query(
                  "select public.commit_roadmap($1,$2,$3,$4::jsonb) v",
                  [
                    body._expected_version,
                    body._request_id,
                    body._goal_id,
                    JSON.stringify(body._data),
                  ],
                )
              ).rows[0].v,
            );
          if (name === "rpc/commit_goal")
            return Number(
              (
                await tx.query("select public.commit_goal($1,$2,$3::jsonb) v", [
                  body._expected_version,
                  body._request_id,
                  JSON.stringify(body._data),
                ])
              ).rows[0].v,
            );
          if (name === "rpc/commit_learning_state")
            return Number(
              (
                await tx.query(
                  "select public.commit_learning_state($1,$2,$3::jsonb) v",
                  [
                    body._user_id,
                    body._expected_version,
                    JSON.stringify(body._data),
                  ],
                )
              ).rows[0].v,
            );
          if (req.method !== "GET") throw new Error("read-only");
          const fields = (
            url.searchParams.get("select") ?? tables[name].join(",")
          ).split(",");
          if (fields.some((f) => !tables[name].includes(f)))
            throw new Error("invalid select");
          const params = [],
            where = [];
          for (const field of tables[name]) {
            const value = url.searchParams.get(field);
            if (value?.startsWith("eq.")) {
              params.push(value.slice(3));
              where.push(`${field}=$${params.length}`);
            }
          }
          const rows = (
            await tx.query(
              `select ${fields.join(",")} from public.${name}${where.length ? " where " + where.join(" and ") : ""}${["skills", "roadmap_items"].includes(name) ? " order by position" : ""}`,
              params,
            )
          ).rows;
          // Match PostgREST's date and integer wire representation.
          const wire = rows.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [
                k,
                v instanceof Date
                  ? k === "target_date"
                    ? v.toISOString().slice(0, 10)
                    : v.toISOString()
                  : typeof v === "bigint"
                    ? Number(v)
                    : v,
              ]),
            ),
          );
          return req.headers.accept?.includes("vnd.pgrst.object")
            ? (wire[0] ?? null)
            : wire;
        },
        service,
      );
      send(200, data);
    } catch {
      send(503, { message: "Fixture database rejected request" });
    }
    return true;
  }
  return { db, seed, profile, asUser, route, close: () => db.close() };
}
