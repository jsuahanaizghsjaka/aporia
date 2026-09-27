begin;
create table public.learning_resources (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null, skill_id text not null references public.skills(id),
 created_at timestamptz not null, source text not null check(source in ('ai','prepared')),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 3),
 primary key(user_id,id)
);
create table public.weekly_reviews (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null, week_start date not null, created_at timestamptz not null,
 data jsonb not null check(jsonb_typeof(data)='object'),
 primary key(user_id,id), unique(user_id,week_start)
);
alter table public.learning_resources enable row level security;
alter table public.weekly_reviews enable row level security;
revoke all on public.learning_resources,public.weekly_reviews from public,anon,authenticated,service_role;
grant select on public.learning_resources,public.weekly_reviews to authenticated;
create policy "Read own learning resources" on public.learning_resources for select to authenticated using((select auth.uid())=user_id);
create policy "Read own weekly reviews" on public.weekly_reviews for select to authenticated using((select auth.uid())=user_id);
create function public.aporia_sync_personal_learning(_owner uuid,_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.learning_resources(user_id,id,skill_id,created_at,source,items)
 select _owner,(r->>'id')::uuid,r->>'skill',(r->>'at')::timestamptz,r->>'source',r->'items'
 from jsonb_array_elements(coalesce(_data->'resourceSelections','[]'::jsonb)) r
 on conflict(user_id,id) do update set items=excluded.items;
 insert into public.weekly_reviews(user_id,id,week_start,created_at,data)
 select _owner,(r->>'id')::uuid,(r->>'week')::date,(r->>'at')::timestamptz,r
 from jsonb_array_elements(coalesce(_data->'weeklyReviews','[]'::jsonb)) r
 on conflict(user_id,id) do update set data=excluded.data;
end; $$;
revoke all on function public.aporia_sync_personal_learning(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.aporia_personal_learning_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform public.aporia_sync_personal_learning(new.user_id,new.data); return new; end; $$;
revoke all on function public.aporia_personal_learning_trigger() from public,anon,authenticated,service_role;
create trigger aporia_personal_learning after insert or update of data on public.learning_states
 for each row execute function public.aporia_personal_learning_trigger();
select public.aporia_sync_personal_learning(user_id,data) from public.learning_states;
commit;
