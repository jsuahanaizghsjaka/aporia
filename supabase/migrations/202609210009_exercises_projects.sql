begin;
-- Projections of authoritative server-validated learning state. No client writes.
alter table public.learning_sessions add column if not exists mode text not null default 'learn' check(mode in ('learn','help'));
create table if not exists public.exercises (
 user_id uuid not null, session_id uuid not null, question_id text not null,
 skill_id text not null references public.skills(id), position integer not null check(position between 0 and 9),
 level text not null check(level in ('foundation','practice','challenge','legacy')),
 primary key(user_id,session_id,question_id),
 foreign key(user_id,session_id) references public.learning_sessions(user_id,id) on delete cascade
);
create table if not exists public.exercise_attempts (
 user_id uuid not null, session_id uuid not null, ordinal integer not null check(ordinal between 1 and 100),
 question_id text not null, skill_id text not null references public.skills(id),
 answer text not null, correct boolean not null, hints_used integer not null check(hints_used between 0 and 5),
 time_spent integer check(time_spent between 0 and 7200), attempted_at timestamptz not null,
 primary key(user_id,session_id,ordinal),
 foreign key(user_id,session_id,question_id) references public.exercises(user_id,session_id,question_id) on delete cascade
);
create table if not exists public.projects (
 user_id uuid primary key references auth.users(id) on delete cascade, template_id text not null,
 mode text not null check(mode in ('learn','help')), started_at timestamptz not null, plan jsonb,
 check(template_id in ('tasks','music','sport','books'))
);
create table if not exists public.project_tasks (
 user_id uuid not null references public.projects(user_id) on delete cascade,
 skill_id text not null references public.skills(id), position integer not null check(position between 0 and 7),
 status text not null check(status in ('open','submitted')), artifact text not null,
 understanding_confirmed boolean not null, submission jsonb, task jsonb,
 primary key(user_id,skill_id), unique(user_id,position),
 check(status <> 'submitted' or (understanding_confirmed and submission is not null and submission->>'artifact'=artifact and length(trim(artifact))>=20 and coalesce(length(trim(submission->>'report')),0)>=30))
);
create table if not exists public.project_messages (
 user_id uuid not null references public.projects(user_id) on delete cascade, id uuid not null,
 skill_id text not null references public.skills(id), mode text not null check(mode in ('learn','help')),
 question text not null, reply text not null, decision_proposal text, created_at timestamptz not null,
 primary key(user_id,id)
);
create table if not exists public.project_decisions (
 user_id uuid not null references public.projects(user_id) on delete cascade, id uuid not null,
 skill_id text not null references public.skills(id), text text not null, created_at timestamptz not null,
 primary key(user_id,id)
);
do $$ declare t text; begin
 foreach t in array array['exercises','exercise_attempts','projects','project_tasks','project_messages','project_decisions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists "Read own records" on public.%I',t);
  execute format('create policy "Read own records" on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 end loop;
end $$;
create or replace function public.aporia_sync_practice_projects(_owner uuid,_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare s jsonb; p jsonb; q jsonb; sk text; pos integer;
begin
 for s in select value from jsonb_array_elements(coalesce(_data->'sessions','[]'::jsonb)) loop
  update public.learning_sessions set mode=coalesce(s->>'mode','learn') where user_id=_owner and id=(s->>'id')::uuid;
  insert into public.exercises(user_id,session_id,question_id,skill_id,position,level)
  select _owner,(s->>'id')::uuid,v,split_part(v,'.',1),n-1,
    case when v like '%.v1.1.%' then 'foundation' when v like '%.v1.2.%' then 'practice' when v like '%.v1.3.%' then 'challenge' else 'legacy' end
  from jsonb_array_elements_text(s->'questions') with ordinality a(v,n)
  on conflict(user_id,session_id,question_id) do nothing;
  insert into public.exercise_attempts(user_id,session_id,ordinal,question_id,skill_id,answer,correct,hints_used,time_spent,attempted_at)
  select _owner,(s->>'id')::uuid,n,v->>'questionId',split_part(v->>'questionId','.',1),v->>'answer',(v->>'correct')::boolean,
   coalesce((v->>'hints_used')::int,(v->>'stage')::int,0),(v->>'time_spent')::int,(v->>'at')::timestamptz
  from jsonb_array_elements(coalesce(s->'attempts',s->'results','[]'::jsonb)) with ordinality a(v,n)
  on conflict(user_id,session_id,ordinal) do nothing;
 end loop;
 p := _data->'project';
 if p is null or p='null'::jsonb then return; end if;
 insert into public.projects(user_id,template_id,mode,started_at,plan)
 values(_owner,p->>'id',coalesce(p->>'mode','learn'),(p->>'startedAt')::timestamptz,p->'plan')
 on conflict(user_id) do update set mode=excluded.mode,plan=excluded.plan;
 pos:=0;
 foreach sk in array array['python','git','sql','http','fastapi','auth','testing','docker'] loop
  q:=p#>array['submissions',sk];
  insert into public.project_tasks(user_id,skill_id,position,status,artifact,understanding_confirmed,submission,task)
  values(_owner,sk,pos,case when q is null then 'open' else 'submitted' end,coalesce(p#>>array['artifacts',sk],''),
   coalesce((p#>>array['checks',sk,'correct'])::boolean,false),q,
   (select v from jsonb_array_elements(coalesce(p#>'{plan,tasks}','[]'::jsonb)) v where v->>'skill'=sk))
  on conflict(user_id,skill_id) do update set status=excluded.status,artifact=excluded.artifact,understanding_confirmed=excluded.understanding_confirmed,submission=excluded.submission,task=excluded.task;
  pos:=pos+1;
 end loop;
 insert into public.project_messages(user_id,id,skill_id,mode,question,reply,decision_proposal,created_at)
 select _owner,(v->>'id')::uuid,v->>'skill',v->>'mode',v->>'question',v->>'reply',v->>'decision',(v->>'at')::timestamptz
 from jsonb_array_elements(coalesce(p->'messages','[]'::jsonb)) v on conflict(user_id,id) do nothing;
 insert into public.project_decisions(user_id,id,skill_id,text,created_at)
 select _owner,(v->>'id')::uuid,v->>'skill',v->>'text',(v->>'at')::timestamptz
 from jsonb_array_elements(coalesce(p->'decisions','[]'::jsonb)) v on conflict(user_id,id) do nothing;
end; $$;
revoke all on function public.aporia_sync_practice_projects(uuid,jsonb) from public,anon,authenticated,service_role;
create or replace function public.aporia_practice_projects_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.aporia_sync_practice_projects(new.user_id,new.data); return new; end; $$;
revoke all on function public.aporia_practice_projects_trigger() from public,anon,authenticated,service_role;
drop trigger if exists aporia_practice_projects on public.learning_states;
create trigger aporia_practice_projects after insert or update of data on public.learning_states for each row execute function public.aporia_practice_projects_trigger();
select public.aporia_sync_practice_projects(user_id,data) from public.learning_states;
commit;
