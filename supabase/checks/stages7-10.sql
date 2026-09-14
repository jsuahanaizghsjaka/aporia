-- Read-only acceptance checks; no personal profile, goal or answer text.
select count(*) as skill_count from public.skills;
select count(*) as invalid_active_goal_owners from (select user_id from public.goals where active group by user_id having count(*)>1) x;
select count(*) as users_without_eight_skills from auth.users u where (select count(*) from public.user_skills s where s.user_id=u.id)<>8;
select tgname, tgenabled in ('O','A') as enabled from pg_trigger where tgname in ('aporia_seed_skills','aporia_learning_skills') and not tgisinternal;
