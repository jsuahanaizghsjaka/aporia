-- Read-only. Counts may be nonzero; anomaly counts must be zero.
select
 (select count(*) from public.exercises) as exercises,
 (select count(*) from public.exercise_attempts) as attempts,
 (select count(*) from public.projects) as projects,
 (select count(*) from public.project_messages) as project_messages,
 (select count(*) from public.project_decisions) as confirmed_decisions,
 (select count(*) from public.projects p where (select count(*) from public.project_tasks t where t.user_id=p.user_id)<>8) as malformed_projects,
 (select count(*) from public.project_tasks where status='submitted' and (not understanding_confirmed or submission is null or submission->>'artifact' is distinct from artifact)) as invalid_submissions,
 (select count(*) from public.exercise_attempts where time_spent<0 or time_spent>7200 or hints_used not between 0 and 5) as invalid_attempts,
 (select count(*) from public.learning_sessions where mode is distinct from data->>'mode') as invalid_session_modes,
 (select count(*) from pg_tables where schemaname='public' and tablename in ('exercises','exercise_attempts','projects','project_tasks','project_messages','project_decisions') and not rowsecurity) as unprotected_tables;
