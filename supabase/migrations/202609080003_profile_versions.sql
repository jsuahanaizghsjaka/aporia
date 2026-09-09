begin;
alter table public.profiles add column version bigint not null default 0 check (version >= 0);

-- A stale tab must never replace a newer profile or its avatar.
-- The authenticated caller can only update their own row.
create function public.commit_profile(_expected_version bigint, _data jsonb, _avatar_path text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); saved_version bigint;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if _expected_version is null or _expected_version < 0 then
    raise exception 'Invalid version';
  end if;
  update public.profiles set
    data = _data, avatar_path = _avatar_path,
    version = version + 1, updated_at = now()
    where id = caller and version = _expected_version
    returning version into saved_version;
  if found then return saved_version; end if;
  if _expected_version = 0 then
    insert into public.profiles(id, data, avatar_path, version)
      values (caller, _data, _avatar_path, 1)
      on conflict (id) do nothing
      returning version into saved_version;
    if found then return saved_version; end if;
  end if;
  return -1;
end;
$$;
revoke all on function public.commit_profile(bigint, jsonb, text) from public, anon;
grant execute on function public.commit_profile(bigint, jsonb, text) to authenticated;
-- All app writes use the version check, including initial onboarding.
revoke insert, update on public.profiles from authenticated;
commit;
