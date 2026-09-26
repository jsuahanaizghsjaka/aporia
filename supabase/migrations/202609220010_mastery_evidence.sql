begin;
create table if not exists public.mastery_evidence (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null, skill_id text not null references public.skills(id),
 kind text not null check(kind in ('diagnostic','exercise','quiz','project','review')),
 source_id text not null check(length(source_id)>0), question_id text not null,
 session_id uuid, answer text check(length(answer)<=4000), correct boolean not null,
 independence numeric not null check(independence between 0 and 1),
 hints_used integer not null check(hints_used between 0 and 5),
 observed_at timestamptz not null, updated_at timestamptz not null,
 position integer not null check(position>0),
 history_complete boolean not null,
 mastery_changes jsonb not null check(jsonb_typeof(mastery_changes)='array'),
 primary key(user_id,id), unique(user_id,source_id),
 foreign key(user_id,session_id) references public.learning_sessions(user_id,id) deferrable initially deferred
);
create index if not exists mastery_evidence_skill_time on public.mastery_evidence(user_id,skill_id,updated_at desc);
alter table public.mastery_evidence enable row level security;
revoke all on public.mastery_evidence from public,anon,authenticated,service_role;
grant select on public.mastery_evidence to authenticated;
drop policy if exists "Read own mastery evidence" on public.mastery_evidence;
create policy "Read own mastery evidence" on public.mastery_evidence for select to authenticated using ((select auth.uid())=user_id);
create or replace function public.aporia_sync_mastery_evidence(_owner uuid,_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if exists (
  select 1 from jsonb_array_elements(coalesce(_data->'evidence','[]'::jsonb)) e,
  lateral jsonb_array_elements(coalesce(e->'mastery_changes','[]'::jsonb)) c
  where c->>'before' is null or c->>'after' is null or c->>'at' is null
    or (c->>'before')::numeric not between 0 and 95 or (c->>'after')::numeric not between 0 and 95
    or (c->>'before')::numeric <> trunc((c->>'before')::numeric)
    or (c->>'after')::numeric <> trunc((c->>'after')::numeric)
 ) then raise exception 'Invalid evidence change'; end if;
 if exists (select 1 from jsonb_array_elements(coalesce(_data->'evidence','[]'::jsonb)) e
  where coalesce((e->>'history_complete')::boolean,false) and jsonb_array_length(coalesce(e->'mastery_changes','[]'::jsonb))=0)
 then raise exception 'Missing evidence change'; end if;
 insert into public.mastery_evidence(user_id,id,skill_id,kind,source_id,question_id,session_id,answer,correct,independence,hints_used,observed_at,updated_at,position,history_complete,mastery_changes)
 select _owner,e->>'id',e->>'skill',e->>'kind',coalesce(e->>'source_id',e->>'id'),e->>'questionId',
 case when exists(select 1 from jsonb_array_elements(coalesce(_data->'sessions','[]'::jsonb)) s where s->>'id'=e->>'sessionId') then (e->>'sessionId')::uuid else null end,
 e->>'answer',(e->>'correct')::boolean,(e->>'independence')::numeric,coalesce((e->>'hints_used')::int,0),
 (e->>'at')::timestamptz,coalesce((e#>>'{mastery_changes,-1,at}')::timestamptz,(e->>'at')::timestamptz),n::int,
 coalesce((e->>'history_complete')::boolean,false),coalesce(e->'mastery_changes','[]'::jsonb)
 from jsonb_array_elements(coalesce(_data->'evidence','[]'::jsonb)) with ordinality as items(e,n)
 on conflict(user_id,id) do update set skill_id=excluded.skill_id,kind=excluded.kind,source_id=excluded.source_id,question_id=excluded.question_id,
 session_id=excluded.session_id,answer=excluded.answer,correct=excluded.correct,independence=excluded.independence,hints_used=excluded.hints_used,
 updated_at=excluded.updated_at,position=excluded.position,history_complete=excluded.history_complete,mastery_changes=excluded.mastery_changes;
 delete from public.mastery_evidence m where m.user_id=_owner and not exists(
  select 1 from jsonb_array_elements(coalesce(_data->'evidence','[]'::jsonb)) e where e->>'id'=m.id);
end; $$;
revoke all on function public.aporia_sync_mastery_evidence(uuid,jsonb) from public,anon,authenticated,service_role;
create or replace function public.aporia_learning_evidence_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.aporia_sync_mastery_evidence(new.user_id,new.data); return new; end; $$;
revoke all on function public.aporia_learning_evidence_trigger() from public,anon,authenticated,service_role;
-- AFTER triggers run alphabetically: evidence is projected before user_skills.
drop trigger if exists aporia_learning_evidence on public.learning_states;
create trigger aporia_learning_evidence after insert or update of data on public.learning_states for each row execute function public.aporia_learning_evidence_trigger();
select public.aporia_sync_mastery_evidence(user_id,data) from public.learning_states;
-- All nonzero scores are now derived from the evidence ledger, in the same transaction.
create or replace function public.aporia_sync_user_skills(_owner uuid,_data jsonb)
returns void language sql security definer set search_path='' as $$
 with entries as (
  select *,row_number() over(partition by skill_id,question_id order by position desc) as rank
  from public.mastery_evidence where user_id=_owner
 ), scored as (
  select skill_id,count(*) evidence_count,max(updated_at) last_practiced,
   sum(case when rank<=3 then case when kind='diagnostic' then 0.6 else 1 end else 0 end) mass,
   sum(case when rank<=3 and correct then independence * case when kind='diagnostic' then 0.6 else 1 end else 0 end) earned,
   count(distinct case when rank<=3 then question_id end) diversity
  from entries group by skill_id
 )
 insert into public.user_skills(user_id,skill_id,mastery_score,confidence,evidence_count,last_practiced)
 select _owner,s.id,
 case when mass>0 then least(95,round(100*earned/mass*(1-exp(-mass/4))))::integer else 0 end,
 case when mass>0 then least(95,round((1-exp(-mass/5))*least(1,diversity::numeric/3)*100))::integer else 0 end,
 coalesce(evidence_count,0),last_practiced
 from public.skills s left join scored on scored.skill_id=s.id where s.parent_skill_id='backend'
 on conflict(user_id,skill_id) do update set mastery_score=excluded.mastery_score,confidence=excluded.confidence,evidence_count=excluded.evidence_count,last_practiced=excluded.last_practiced;
$$;
revoke all on function public.aporia_sync_user_skills(uuid,jsonb) from public,anon,authenticated,service_role;
select public.aporia_sync_user_skills(u.id,coalesce(l.data,'{}'::jsonb)) from auth.users u left join public.learning_states l on l.user_id=u.id;
commit;
