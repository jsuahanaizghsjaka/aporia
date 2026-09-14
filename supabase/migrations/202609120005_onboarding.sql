begin;
-- Reinstall only Aporia's trigger; preserve other triggers and all learner data.
create or replace function public.aporia_create_auth_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, data) values (new.id, '{}')
    on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.aporia_create_auth_profile() from public, anon, authenticated;
drop trigger if exists aporia_on_auth_user_created on auth.users;
create trigger aporia_on_auth_user_created after insert on auth.users
  for each row execute function public.aporia_create_auth_profile();
insert into public.profiles (id, data) select id, '{}'::jsonb from auth.users on conflict (id) do nothing;
-- Draft and reply are one atomic row, never an automatically confirmed profile.
alter table public.mentor_messages add column if not exists onboarding jsonb;
comment on column public.mentor_messages.onboarding is 'Versioned Lesson 0 draft. Owner RLS inherited from the message. Not a confirmed profile.';
commit;

