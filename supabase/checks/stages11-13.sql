select
 (select count(*) from public.roadmaps where active) as active_roadmaps,
 (select count(*) from public.roadmap_items) as roadmap_items,
 (select count(*) from (select r.id from public.roadmaps r left join public.roadmap_items i on i.roadmap_id=r.id where r.active group by r.id having count(i.skill_id)<>8) invalid) as malformed_active_roadmaps,
 (select count(*) from public.roadmap_items where position not between 1 and 8) as invalid_item_positions,
 (select count(*) from public.user_skills where mastery_score>95) as mastery_over_95;
