-- Operator-only, read-only aggregate report. No emails, IDs, text or answers returned.
-- Run in SQL Editor. Put consenting testers' UUIDs in cohort_ids in your PRIVATE copy.
-- Empty array intentionally selects nobody. Do not commit real UUIDs.
-- as_of is a reproducible UTC cutoff. Days are elapsed 24h since the signup event.
-- Missing signup history is reported, never invented from other events.
with params as (
  select array[]::uuid[] as cohort_ids, now() as as_of
), selected as (
  select distinct unnest(cohort_ids) as user_id from params
), signups as (
  select s.user_id, min(e.occurred_at) as signup_at
  from selected s cross join params p
  left join public.product_events e on e.user_id=s.user_id
    and e.name='signup' and e.occurred_at<=p.as_of
  group by s.user_id
), per_user as (
  select s.user_id, p.as_of-s.signup_at as age,
    coalesce(bool_or(e.name='onboarding_completed' and e.occurred_at<s.signup_at+interval '1 day'),false) as onboarding_d0,
    coalesce(bool_or(e.name='diagnostic_completed' and e.occurred_at<s.signup_at+interval '1 day'),false) as diagnostic_d0,
    coalesce(bool_or(e.name='lesson_started' and e.occurred_at<s.signup_at+interval '1 day'),false) as lesson_started_d0,
    coalesce(bool_or(e.name='lesson_completed' and e.occurred_at<s.signup_at+interval '1 day'),false) as lesson_completed_d0,
    count(distinct e.event_key) filter(where e.name='lesson_completed' and e.occurred_at<s.signup_at+interval '7 days')>=3 as three_lessons_d0_6,
    coalesce(bool_or(e.name='lesson_started' and e.occurred_at>=s.signup_at+interval '1 day' and e.occurred_at<s.signup_at+interval '4 days'),false)
      and count(distinct e.event_key) filter(where e.name='lesson_started' and e.occurred_at<s.signup_at+interval '4 days')>=2 as second_session_d1_3,
    coalesce(bool_or(e.name='project_started' and e.occurred_at<s.signup_at+interval '7 days'),false) as project_started_d0_6,
    coalesce(bool_or(e.name in ('project_started','project_task_completed') and e.occurred_at>=s.signup_at+interval '3 days' and e.occurred_at<s.signup_at+interval '8 days'),false) as project_activity_d3_7,
    coalesce(bool_or(e.name in ('lesson_started','lesson_completed','project_started','project_task_completed','weekly_review_opened') and e.occurred_at>=s.signup_at+interval '7 days' and e.occurred_at<s.signup_at+interval '8 days'),false) as meaningful_return_d7,
    coalesce(bool_or(e.name='weekly_review_opened' and e.occurred_at>=s.signup_at+interval '7 days' and e.occurred_at<s.signup_at+interval '8 days'),false) as weekly_review_d7
  from signups s cross join params p
  left join public.product_events e on e.user_id=s.user_id
    and e.occurred_at>=s.signup_at and e.occurred_at<=p.as_of
  where s.signup_at is not null
  group by s.user_id, s.signup_at, p.as_of
), definitions(metric, observation_days) as (
  values ('onboarding_completed_d0',1), ('diagnostic_completed_d0',1),
    ('lesson_started_d0',1), ('lesson_completed_d0',1),
    ('three_completed_lessons_d0_6',7), ('second_session_d1_3',4),
    ('project_started_d0_6',7), ('project_activity_d3_7',8),
    ('meaningful_return_d7',8), ('weekly_review_opened_d7',8)
), measured as (
  select d.metric, d.observation_days,
    count(u.user_id) as eligible_users,
    count(u.user_id) filter(where case d.metric
      when 'onboarding_completed_d0' then u.onboarding_d0
      when 'diagnostic_completed_d0' then u.diagnostic_d0
      when 'lesson_started_d0' then u.lesson_started_d0
      when 'lesson_completed_d0' then u.lesson_completed_d0
      when 'three_completed_lessons_d0_6' then u.three_lessons_d0_6
      when 'second_session_d1_3' then u.second_session_d1_3
      when 'project_started_d0_6' then u.project_started_d0_6
      when 'project_activity_d3_7' then u.project_activity_d3_7
      when 'meaningful_return_d7' then u.meaningful_return_d7
      when 'weekly_review_opened_d7' then u.weekly_review_d7
    end) as reached_users
  from definitions d
  left join per_user u on u.age>=make_interval(days=>d.observation_days)
  group by d.metric, d.observation_days
)
select m.metric, m.observation_days, p.as_of,
  (select count(*) from selected) as selected_users,
  (select count(*) from signups where signup_at is null) as missing_signup_events,
  (select count(*) from per_user) as cohort_size,
  m.eligible_users, m.reached_users,
  round(100.0*m.reached_users/nullif(m.eligible_users,0),1) as percent,
  case when not exists(select 1 from selected) then 'NO_COHORT'
    when exists(select 1 from signups where signup_at is null) then 'INCOMPLETE_HISTORY'
    when m.eligible_users=0 then 'WAITING_FOR_WINDOW'
    else 'OBSERVED' end as status
from measured m cross join params p
order by m.observation_days, m.metric;
