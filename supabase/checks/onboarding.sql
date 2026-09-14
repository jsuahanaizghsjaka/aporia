-- Read-only checks for the project's Supabase SQL Editor. No user contents.
select t.tgname as trigger_name,
       t.tgenabled in ('O', 'A') as enabled_for_signup,
       p.prosecdef as security_definer
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass
  and t.tgname = 'aporia_on_auth_user_created';

select count(*) as accounts_without_profile
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

select exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'mentor_messages'
    and column_name = 'onboarding' and data_type = 'jsonb'
) as onboarding_draft_column_exists;
