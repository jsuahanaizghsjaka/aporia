begin;

-- Applied databases do not replay migration 001 when its file changes.
grant select on public.profiles to service_role;

-- Create the profile in the same transaction as the Auth user, including
-- registrations awaiting email confirmation. Never trust signup metadata.
create function public.aporia_create_auth_profile()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.aporia_create_auth_profile() from public, anon, authenticated;

create trigger aporia_on_auth_user_created
  after insert on auth.users
  for each row execute function public.aporia_create_auth_profile();

-- Upgrade existing accounts without replacing their data, avatar or version.
insert into public.profiles (id)
  select id from auth.users
  on conflict (id) do nothing;

commit;
