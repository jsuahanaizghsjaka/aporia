-- Read-only counts only. No user IDs, emails, comments or answers.
with feedback as (
  select s.data, f.item
  from public.learning_states s
  cross join lateral jsonb_array_elements(coalesce(s.data->'sessionFeedback', '[]'::jsonb)) f(item)
), duplicates as (
  select s.user_id, f.item->>'session_id'
  from public.learning_states s
  cross join lateral jsonb_array_elements(coalesce(s.data->'sessionFeedback', '[]'::jsonb)) f(item)
  group by s.user_id, f.item->>'session_id' having count(*) > 1
)
select count(*) as feedback_count,
  count(*) filter (where jsonb_typeof(item->'helpful') is distinct from 'boolean') as invalid_ratings,
  count(*) filter (where length(item->>'note') > 500 or item->>'at' is null) as invalid_metadata,
  count(*) filter (where not exists (
    select 1 from jsonb_array_elements(coalesce(data->'sessions', '[]'::jsonb)) s
    where s->>'id' = item->>'session_id'
      and s->>'completedAt' is not null and s->>'kind' <> 'diagnostic'
  )) as missing_completed_sessions,
  (select count(*) from duplicates) as duplicate_session_feedback
from feedback;
