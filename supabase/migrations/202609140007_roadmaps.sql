begin;

create table if not exists public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  active boolean not null default true,
  version bigint not null default 1 check(version > 0),
  last_request_id uuid not null,
  updated_at timestamptz not null default now()
);
create unique index if not exists one_active_roadmap_per_user on public.roadmaps(user_id) where active;

create table if not exists public.roadmap_items (
  roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
  skill_id text not null references public.skills(id) check(skill_id <> 'backend'),
  position integer not null check(position between 1 and 8),
  reason text not null check(length(trim(reason)) between 8 and 320),
  primary key(roadmap_id, skill_id), unique(roadmap_id, position)
);

alter table public.roadmaps enable row level security;
alter table public.roadmap_items enable row level security;
revoke all on public.roadmaps, public.roadmap_items from public, anon, authenticated, service_role;
grant select on public.roadmaps, public.roadmap_items to authenticated;
drop policy if exists "Read own roadmap" on public.roadmaps;
create policy "Read own roadmap" on public.roadmaps for select to authenticated using((select auth.uid()) = user_id);
drop policy if exists "Read own roadmap items" on public.roadmap_items;
create policy "Read own roadmap items" on public.roadmap_items for select to authenticated using(exists(select 1 from public.roadmaps r where r.id = roadmap_id and r.user_id = (select auth.uid())));

create or replace function public.commit_roadmap(_expected_version bigint, _request_id uuid, _goal_id uuid, _data jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare owner_id uuid = auth.uid(); current_roadmap public.roadmaps; confirmed boolean; target_goal public.goals; new_id uuid;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if _expected_version is null or _expected_version < 0 or _request_id is null or _goal_id is null
    or _data is null or jsonb_typeof(_data) <> 'object' or jsonb_typeof(_data->'items') <> 'array'
    or jsonb_array_length(_data->'items') <> 8 then raise exception 'Invalid roadmap'; end if;
  if exists(select 1 from jsonb_array_elements(_data->'items') x where jsonb_typeof(x) <> 'object'
      or jsonb_typeof(x->'skill_id') <> 'string' or jsonb_typeof(x->'reason') <> 'string'
      or length(trim(x->>'reason')) not between 8 and 320
      or not exists(select 1 from public.skills s where s.id=x->>'skill_id' and s.parent_skill_id='backend'))
    or (select count(distinct x->>'skill_id') from jsonb_array_elements(_data->'items') x) <> 8
  then raise exception 'Invalid roadmap items'; end if;
  if not ((select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='python') < (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='git')
      and (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='python') < (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='sql')
      and (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='python') < (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='http')
      and (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='http') < (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='fastapi')
      and (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='fastapi') < (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='auth')
      and (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='fastapi') < (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='testing')
      and (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='testing') < (select min(ord) from jsonb_array_elements(_data->'items') with ordinality e(x,ord) where x->>'skill_id'='docker')) then raise exception 'Invalid roadmap order'; end if;
  select coalesce(data->>'onboardingComplete','false')='true' into confirmed from public.profiles where id=owner_id for update;
  if confirmed is distinct from true then raise exception 'Confirm profile first'; end if;
  select * into target_goal from public.goals where id=_goal_id and user_id=owner_id and active for update;
  if not found then raise exception 'Active goal required'; end if;
  select * into current_roadmap from public.roadmaps where user_id=owner_id and active for update;
  if found and current_roadmap.last_request_id=_request_id then return current_roadmap.version; end if;
  if found and current_roadmap.version<>_expected_version then return -1; end if;
  if not found and _expected_version<>0 then return -1; end if;
  if found then update public.roadmaps set goal_id=_goal_id, version=version+1,last_request_id=_request_id,updated_at=now() where id=current_roadmap.id returning id,version into new_id,_expected_version; delete from public.roadmap_items where roadmap_id=new_id;
  else insert into public.roadmaps(user_id,goal_id,last_request_id) values(owner_id,_goal_id,_request_id) returning id,version into new_id,_expected_version; end if;
  insert into public.roadmap_items(roadmap_id,skill_id,position,reason)
    select new_id, x->>'skill_id', ord::integer, trim(x->>'reason') from jsonb_array_elements(_data->'items') with ordinality e(x,ord);
  return _expected_version;
end; $$;
revoke all on function public.commit_roadmap(bigint,uuid,uuid,jsonb) from public, anon, service_role;
grant execute on function public.commit_roadmap(bigint,uuid,uuid,jsonb) to authenticated;
commit;
