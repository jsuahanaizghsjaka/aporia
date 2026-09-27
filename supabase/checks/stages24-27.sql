-- Read-only. No personal content or keys are returned.
select count(*) as unprotected_tables from pg_class
where oid in ('public.learning_resources'::regclass,'public.weekly_reviews'::regclass) and not relrowsecurity;
select count(*) as missing_resource_projections from public.learning_states s,
lateral jsonb_array_elements(coalesce(s.data->'resourceSelections','[]')) r
where not exists(select 1 from public.learning_resources p where p.user_id=s.user_id and p.id=(r->>'id')::uuid and p.items=r->'items');
select count(*) as missing_review_projections from public.learning_states s,
lateral jsonb_array_elements(coalesce(s.data->'weeklyReviews','[]')) r
where not exists(select 1 from public.weekly_reviews p where p.user_id=s.user_id and p.id=(r->>'id')::uuid and p.data=r);
select count(*) as unsafe_write_grants from information_schema.role_table_grants
where table_schema='public' and table_name in ('learning_resources','weekly_reviews')
and grantee in ('anon','authenticated','service_role') and privilege_type <> 'SELECT';
select count(*) as enabled_projection_triggers from pg_trigger
where tgname='aporia_personal_learning' and tgenabled='O';
