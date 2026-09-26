select
 (select count(*) from public.learning_sessions) as learning_sessions,
 (select count(*) from (select user_id from public.learning_sessions where status='active' group by user_id having count(*)>1) invalid) as duplicate_active_sessions,
 (select count(*) from public.learning_sessions s join public.learning_states l on s.user_id=l.user_id where not exists(select 1 from jsonb_array_elements(l.data->'sessions') x where x=s.data)) as inconsistent_sessions,
 (select count(*) from public.learning_sessions where data->'lesson' is not null and ((data#>>'{lesson,plan,theory}')::int+(data#>>'{lesson,plan,exercise}')::int+(data#>>'{lesson,plan,project}')::int)>estimated_time) as over_budget_sessions,
 (select count(*) from public.learning_states l cross join lateral jsonb_array_elements(l.data->'evidence') e where e->>'hints_used' is not null and (e->>'hints_used')::int>0 and (e->>'independence')::numeric=1) as assisted_independent_evidence;
