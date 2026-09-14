begin;
create table if not exists public.goals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 summary text not null check(length(trim(summary)) between 8 and 500),
 success_criteria jsonb not null check(jsonb_array_length(success_criteria) between 1 and 5),
 target_date date, active boolean not null default true,
 version bigint not null default 1 check(version>0),last_request_id uuid not null,updated_at timestamptz not null default now()
);
create unique index if not exists one_active_goal_per_user on public.goals(user_id) where active;
alter table public.goals enable row level security;
revoke all on public.goals from public,anon,authenticated,service_role;
grant select on public.goals to authenticated;
drop policy if exists "Read own goal" on public.goals;
create policy "Read own goal" on public.goals for select to authenticated using ((select auth.uid())=user_id);
create or replace function public.commit_goal(_expected_version bigint,_request_id uuid,_data jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare owner_id uuid=auth.uid(); current_goal public.goals; confirmed boolean; deadline date;
begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 if _expected_version is null or _expected_version<0 or _request_id is null or _data is null
 or jsonb_typeof(_data)<>'object' or jsonb_typeof(_data->'summary') is distinct from 'string'
 or length(trim(_data->>'summary')) not between 8 and 500
 or jsonb_typeof(_data->'success_criteria') is distinct from 'array'
 then raise exception 'Invalid goal'; end if;
 if jsonb_array_length(_data->'success_criteria') not between 1 and 5
 or exists(select 1 from jsonb_array_elements(_data->'success_criteria') x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}')) not between 5 and 300)
 or (select count(distinct lower(trim(x))) from jsonb_array_elements_text(_data->'success_criteria') x) <> jsonb_array_length(_data->'success_criteria')
 then raise exception 'Invalid criteria'; end if;
 if _data->>'target_date' is not null and (_data->>'target_date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
 deadline=(_data->>'target_date')::date;
 -- Lock the owner profile even before the first goal exists: concurrent creates serialize.
 select coalesce(data->>'onboardingComplete','false')='true' into confirmed from public.profiles where id=owner_id for update;
 if confirmed is distinct from true then raise exception 'Confirm profile first'; end if;
 select * into current_goal from public.goals where user_id=owner_id and active for update;
 if found then
  if current_goal.last_request_id=_request_id then
   if current_goal.summary=trim(_data->>'summary') and current_goal.success_criteria=_data->'success_criteria' and current_goal.target_date is not distinct from deadline then return current_goal.version; end if;
   return -1;
  end if;
  if current_goal.version<>_expected_version then return -1; end if;
  update public.goals set summary=trim(_data->>'summary'),success_criteria=_data->'success_criteria',target_date=deadline,version=version+1,last_request_id=_request_id,updated_at=now() where id=current_goal.id returning version into _expected_version;
  return _expected_version;
 end if;
 if _expected_version<>0 then return -1; end if;
 insert into public.goals(user_id,summary,success_criteria,target_date,last_request_id) values(owner_id,trim(_data->>'summary'),_data->'success_criteria',deadline,_request_id);
 return 1;
end;
$$;
revoke all on function public.commit_goal(bigint,uuid,jsonb) from public,anon,service_role;
grant execute on function public.commit_goal(bigint,uuid,jsonb) to authenticated;
create table if not exists public.skills (
 id text primary key check(id in ('backend','python','git','sql','http','fastapi','auth','testing','docker')),
 title text not null,parent_skill_id text references public.skills(id),prerequisite_skill_id text references public.skills(id),position integer not null
);
insert into public.skills values ('backend','Python backend',null,null,0) on conflict(id) do nothing;
insert into public.skills values
 ('python','Python','backend',null,1),('git','Git','backend','python',2),('sql','SQL','backend','python',3),('http','HTTP / REST','backend','python',4),
 ('fastapi','FastAPI','backend','http',5),('auth','Authentication','backend','fastapi',6),('testing','Testing','backend','fastapi',7),('docker','Docker','backend','testing',8)
 on conflict(id) do nothing;
alter table public.skills enable row level security;
revoke all on public.skills from public,anon,authenticated,service_role;
grant select on public.skills to authenticated;
drop policy if exists "Read fixed curriculum" on public.skills;
create policy "Read fixed curriculum" on public.skills for select to authenticated using(true);
create table if not exists public.user_skills (
 user_id uuid not null references auth.users(id) on delete cascade,skill_id text not null references public.skills(id) check(skill_id<>'backend'),
 mastery_score integer not null default 0 check(mastery_score between 0 and 100),confidence integer not null default 0 check(confidence between 0 and 100),
 evidence_count integer not null default 0 check(evidence_count>=0),last_practiced timestamptz,primary key(user_id,skill_id)
);
alter table public.user_skills enable row level security;
revoke all on public.user_skills from public,anon,authenticated,service_role;
grant select on public.user_skills to authenticated;
drop policy if exists "Read own skills" on public.user_skills;
create policy "Read own skills" on public.user_skills for select to authenticated using((select auth.uid())=user_id);
create or replace function public.aporia_sync_user_skills(_owner uuid,_data jsonb)
returns void language sql security definer set search_path='' as $$
 with entries as (
  select value,ordinality, row_number() over(partition by value->>'skill',value->>'questionId' order by ordinality desc) as rank
  from jsonb_array_elements(coalesce(_data->'evidence','[]'::jsonb)) with ordinality
 ), scored as (
  select value->>'skill' as skill,count(*) as evidence_count,
   (array_agg((value->>'at')::timestamptz order by ordinality desc))[1] as last_practiced,
   sum(case when rank<=3 then case when value->>'kind'='diagnostic' then 0.6 else 1 end else 0 end) as mass,
   sum(case when rank<=3 and (value->>'correct')::boolean then (value->>'independence')::numeric * case when value->>'kind'='diagnostic' then 0.6 else 1 end else 0 end) as earned,
   count(distinct case when rank<=3 then value->>'questionId' end) as diversity
  from entries group by value->>'skill'
 )
 insert into public.user_skills(user_id,skill_id,mastery_score,confidence,evidence_count,last_practiced)
 select _owner,s.id,
 case when mass>0 then least(95,round(100*earned/mass*(1-exp(-mass/4))))::integer else 0 end,
 case when mass>0 then least(95,round((1-exp(-mass/5))*least(1,diversity::numeric/3)*100))::integer else 0 end,
 coalesce(evidence_count,0),last_practiced
 from public.skills s left join scored on scored.skill=s.id where s.parent_skill_id='backend'
 on conflict(user_id,skill_id) do update set mastery_score=excluded.mastery_score,confidence=excluded.confidence,evidence_count=excluded.evidence_count,last_practiced=excluded.last_practiced;
$$;
revoke all on function public.aporia_sync_user_skills(uuid,jsonb) from public,anon,authenticated,service_role;
create or replace function public.aporia_learning_skills_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.aporia_sync_user_skills(new.user_id,new.data);return new;end;$$;
revoke all on function public.aporia_learning_skills_trigger() from public,anon,authenticated,service_role;
drop trigger if exists aporia_learning_skills on public.learning_states;
create trigger aporia_learning_skills after insert or update of data on public.learning_states for each row execute function public.aporia_learning_skills_trigger();
create or replace function public.aporia_seed_skills_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.aporia_sync_user_skills(new.id,'{}'::jsonb);return new;end;$$;
revoke all on function public.aporia_seed_skills_trigger() from public,anon,authenticated,service_role;
drop trigger if exists aporia_seed_skills on auth.users;
create trigger aporia_seed_skills after insert on auth.users for each row execute function public.aporia_seed_skills_trigger();
-- Rebuild derived rows only. Preserve original profiles, goals, answers and learning versions.
select public.aporia_sync_user_skills(u.id,coalesce(l.data,'{}'::jsonb)) from auth.users u left join public.learning_states l on l.user_id=u.id;
commit;
