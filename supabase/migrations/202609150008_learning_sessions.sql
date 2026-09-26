begin;
-- Session rows and evidence are committed atomically from the server-owned state.
create table if not exists public.learning_sessions (
 user_id uuid not null references auth.users(id) on delete cascade, id uuid not null,
 kind text not null check(kind in ('diagnostic','practice','review')), skill_id text references public.skills(id),
 status text not null check(status in ('active','completed')), phase text not null check(phase in ('theory','exercise','project','completed')),
 estimated_time integer not null check(estimated_time between 5 and 120), hints_used integer not null check(hints_used>=0),
 started_at timestamptz not null, completed_at timestamptz, data jsonb not null, primary key(user_id,id)
);
create unique index if not exists one_active_learning_session on public.learning_sessions(user_id) where status='active';
alter table public.learning_sessions enable row level security;
revoke all on public.learning_sessions from public,anon,authenticated,service_role;
grant select on public.learning_sessions to authenticated;
drop policy if exists "Read own learning sessions" on public.learning_sessions;
create policy "Read own learning sessions" on public.learning_sessions for select to authenticated using((select auth.uid())=user_id);
create or replace function public.aporia_sync_learning_sessions(_owner uuid,_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.learning_sessions(user_id,id,kind,skill_id,status,phase,estimated_time,hints_used,started_at,completed_at,data)
 select _owner,(s->>'id')::uuid,s->>'kind',nullif(coalesce(s#>>'{lesson,plan,today_skill}',split_part(s#>>'{questions,0}','.',1)),''),
 case when s->>'completedAt' is null then 'active' else 'completed' end,
 case when s->>'completedAt' is not null then 'completed' else coalesce(s#>>'{lesson,phase}','exercise') end,
 (s->>'minutes')::int,
 coalesce((select sum(coalesce((r->>'hints_used')::int,(r->>'stage')::int,0)) from jsonb_array_elements(coalesce(s->'results','[]'::jsonb)) r),0)::int
 + case when jsonb_array_length(coalesce(s->'results','[]'::jsonb)) <= (s->>'index')::int then coalesce((s->>'stage')::int,0) else 0 end,
 (s->>'startedAt')::timestamptz,(s->>'completedAt')::timestamptz,s
 from jsonb_array_elements(coalesce(_data->'sessions','[]'::jsonb)) s order by (s->>'completedAt') is null
 on conflict(user_id,id) do update set kind=excluded.kind,skill_id=excluded.skill_id,status=excluded.status,phase=excluded.phase,
 estimated_time=excluded.estimated_time,hints_used=excluded.hints_used,completed_at=excluded.completed_at,data=excluded.data;
end; $$;
revoke all on function public.aporia_sync_learning_sessions(uuid,jsonb) from public,anon,authenticated,service_role;
create or replace function public.aporia_learning_sessions_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.aporia_sync_learning_sessions(new.user_id,new.data); return new; end; $$;
revoke all on function public.aporia_learning_sessions_trigger() from public,anon,authenticated,service_role;
drop trigger if exists aporia_learning_sessions on public.learning_states;
create trigger aporia_learning_sessions after insert or update of data on public.learning_states for each row execute function public.aporia_learning_sessions_trigger();
select public.aporia_sync_learning_sessions(user_id,data) from public.learning_states;
commit;
