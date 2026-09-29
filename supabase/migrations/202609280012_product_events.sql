begin;
-- No free-form metadata, email, prompts, answers or browser identifiers.
create table public.product_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name in ('signup','onboarding_started','onboarding_completed','diagnostic_started','diagnostic_completed','roadmap_created','lesson_started','lesson_completed','hint_requested','project_started','project_task_completed','weekly_review_opened')),
  event_key text not null check (length(event_key) between 1 and 100),
  occurred_at timestamptz not null default now(),
  primary key(user_id,name,event_key)
);
create index product_events_time on public.product_events(occurred_at,name);
alter table public.product_events enable row level security;
create policy "Read own product events" on public.product_events for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.product_events from public,anon,authenticated;
grant select on public.product_events to authenticated,service_role;

create function public.capture_product_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare ev jsonb; event_name text;
begin
  if tg_table_name='profiles' then
    if tg_op='INSERT' then
      insert into public.product_events values(new.id,'signup','once',new.created_at) on conflict do nothing;
    end if;
    if new.data->>'onboardingComplete'='true' and (tg_op='INSERT' or coalesce(old.data->>'onboardingComplete','false')<>'true') then
      insert into public.product_events values(new.id,'onboarding_completed','once',now()) on conflict do nothing;
    end if;
  elsif tg_table_name='mentor_messages' then
    if new.conversation='onboarding' and new.role='user' then
      insert into public.product_events values(new.user_id,'onboarding_started','once',new.created_at) on conflict do nothing;
    end if;
  elsif tg_table_name='roadmaps' then
    insert into public.product_events values(new.user_id,'roadmap_created',new.id::text,now()) on conflict do nothing;
  elsif tg_table_name='learning_states' then
    for ev in select value from jsonb_array_elements(coalesce(new.data->'events','[]'::jsonb)) loop
      -- Legacy names are normalized, not counted a second time.
      event_name := case ev->>'name' when 'session_started' then 'lesson_started' when 'session_completed' then 'lesson_completed' else ev->>'name' end;
      if event_name in ('diagnostic_started','diagnostic_completed','lesson_started','lesson_completed','hint_requested','project_started','project_task_completed')
        and (tg_op='INSERT' or not coalesce(old.data->'events','[]'::jsonb) @> jsonb_build_array(ev)) then
        insert into public.product_events values(new.user_id,event_name,ev->>'at',(ev->>'at')::timestamptz) on conflict do nothing;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_product_event() from public,anon,authenticated;
create trigger product_profile after insert or update on public.profiles for each row execute function public.capture_product_event();
create trigger product_onboarding after insert on public.mentor_messages for each row execute function public.capture_product_event();
create trigger product_roadmap after insert on public.roadmaps for each row execute function public.capture_product_event();
create trigger product_learning after insert or update on public.learning_states for each row execute function public.capture_product_event();

-- Only observational UI events are accepted; completions come from committed data.
create function public.observe_product_event(_name text, _review_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if _name='onboarding_started' and _review_id is null then
    insert into public.product_events values(caller,_name,'once',now()) on conflict do nothing;
  elsif _name='weekly_review_opened' and exists (
    select 1 from public.learning_states s, lateral jsonb_array_elements(coalesce(s.data->'weeklyReviews','[]'::jsonb)) r
    where s.user_id=caller and r->>'id'=_review_id::text
  ) then
    insert into public.product_events values(caller,_name,_review_id::text,now()) on conflict do nothing;
  else raise exception 'Invalid event'; end if;
end;
$$;
revoke all on function public.observe_product_event(text,uuid) from public,anon;
grant execute on function public.observe_product_event(text,uuid) to authenticated;
comment on table public.product_events is 'Minimal first-party product telemetry. No backfill of inferred timestamps. Operator retention: 90 days.';
commit;
