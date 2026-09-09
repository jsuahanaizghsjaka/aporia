-- Evidence is written only by the authenticated Next.js action boundary.
-- Browser clients may read their own state, but cannot assign themselves scores.
create table public.learning_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'schema' = '1'),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.learning_states enable row level security;
revoke all on public.learning_states from anon, authenticated;
grant select on public.learning_states to authenticated;
grant select, insert, update on public.learning_states to service_role;
create policy "Read own learning memory" on public.learning_states for select to authenticated using ((select auth.uid()) = user_id);

create function public.commit_learning_state(_user_id uuid, _expected_version bigint, _data jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare result bigint;
begin
  if _expected_version = 0 then
    insert into public.learning_states(user_id, data, version) values (_user_id, _data, 1)
      on conflict (user_id) do nothing returning version into result;
  else
    update public.learning_states set data = _data, version = version + 1, updated_at = now()
      where user_id = _user_id and version = _expected_version returning version into result;
  end if;
  return coalesce(result, -1);
end;
$$;
revoke all on function public.commit_learning_state(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.commit_learning_state(uuid, bigint, jsonb) to service_role;
