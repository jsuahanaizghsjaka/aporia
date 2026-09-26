-- Read-only after 010. Normal counts may be nonzero; anomaly counts must be zero.
select
 (select count(*) from public.mastery_evidence) as evidence_rows,
 (select count(*) from public.mastery_evidence where not history_complete) as legacy_evidence_rows,
 (select count(*) from public.learning_states l where (select count(*) from public.mastery_evidence e where e.user_id=l.user_id) <> jsonb_array_length(coalesce(l.data->'evidence','[]'::jsonb))) as mismatched_evidence_counts,
 (select count(*) from public.mastery_evidence where source_id='' or observed_at is null or updated_at is null) as missing_source_or_time,
 (select count(*) from public.user_skills s where s.evidence_count <> (select count(*) from public.mastery_evidence e where e.user_id=s.user_id and e.skill_id=s.skill_id) or (s.mastery_score>0 and s.evidence_count=0) or s.mastery_score>95) as unsupported_skill_scores,
 (select count(*) from public.mastery_evidence where history_complete and jsonb_array_length(mastery_changes)=0) as missing_change_history,
 (select count(*) from pg_tables where schemaname='public' and tablename='mastery_evidence' and not rowsecurity) as unprotected_tables;
