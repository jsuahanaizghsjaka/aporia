-- Read-only, run by the project operator. Counts only, no learner text or IDs.
-- Stage 34: durable allowlisted events, collected since migration 012.
-- Opened review = first visible opening per learner/review; signup = profile creation.
select name, date_trunc('day',occurred_at) as day_utc, count(*) as events,
       count(distinct user_id) as learners
from public.product_events
where occurred_at >= now() - interval '7 days'
group by 1,2 order by 2 desc,1;

-- Operational legacy detail (different population/window, do not add to above).
-- Rolling event window: the latest 300 events per learner (not a billing ledger).
select event->>'name' as event_name,
       date_trunc('day', (event->>'at')::timestamptz) as day_utc,
       count(*) as events
from public.learning_states,
     lateral jsonb_array_elements(data->'events') as event
where (event->>'at')::timestamptz >= now() - interval '7 days'
group by 1, 2
order by 2 desc, 1;

-- Completed learning sessions and diagnostics, retained independently of events.
select session->>'kind' as kind,
       count(*) filter (where session->>'completedAt' is not null) as completed,
       count(*) filter (where session->>'completedAt' is null) as in_progress
from public.learning_states,
     lateral jsonb_array_elements(data->'sessions') as session
group by 1;
