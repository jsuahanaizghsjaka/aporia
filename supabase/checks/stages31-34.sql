-- Read-only, counts/flags only. No IDs, emails or learning text.
select c.relrowsecurity as rls_enabled,
  has_table_privilege('anon','public.product_events','SELECT') as anon_can_read,
  has_table_privilege('authenticated','public.product_events','INSERT') as user_can_insert,
  has_table_privilege('authenticated','public.product_events','UPDATE') as user_can_update,
  has_table_privilege('authenticated','public.product_events','DELETE') as user_can_delete
from pg_class c where c.oid='public.product_events'::regclass;
select count(*) filter(where tgenabled='O') as enabled_triggers
from pg_trigger where tgname in ('product_profile','product_onboarding','product_roadmap','product_learning');
select count(*) as unexpected_policies from pg_policies where schemaname='public' and tablename='product_events'
and not (cmd='SELECT' and policyname='Read own product events');
