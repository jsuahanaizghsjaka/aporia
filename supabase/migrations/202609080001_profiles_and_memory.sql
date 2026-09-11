begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  avatar_path text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint avatar_owned_path check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text)
);
alter table public.profiles enable row level security;
create policy "Read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Create own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to service_role;
revoke all on public.profiles from anon;

create table public.mentor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation text not null check (conversation in ('onboarding', 'learn', 'help')),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 16000),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id, role)
);
create index mentor_messages_history on public.mentor_messages(user_id, conversation, created_at desc);
alter table public.mentor_messages enable row level security;
create policy "Read own conversations" on public.mentor_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "Write own conversations" on public.mentor_messages for insert to authenticated with check ((select auth.uid()) = user_id);
grant select, insert on public.mentor_messages to authenticated;
revoke all on public.mentor_messages from anon;

-- A durable per-user rate limit: all app instances share the same bucket.
create table public.ai_usage_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  used integer not null default 1,
  primary key (user_id, window_start)
);
alter table public.ai_usage_windows enable row level security;
revoke all on public.ai_usage_windows from anon, authenticated;
create or replace function public.consume_ai_request() returns boolean
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); calls integer;
begin
  if caller is null then return false; end if;
  insert into public.ai_usage_windows as usage (user_id, window_start, used)
    values (caller, date_trunc('hour', now()), 1)
    on conflict (user_id, window_start) do update set used = usage.used + 1
    returning used into calls;
  return calls <= 30;
end;
$$;
revoke all on function public.consume_ai_request() from public, anon;
grant execute on function public.consume_ai_request() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/webp'])
on conflict (id) do nothing;
create policy "Read own avatar" on storage.objects for select to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own avatar" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own avatar" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
