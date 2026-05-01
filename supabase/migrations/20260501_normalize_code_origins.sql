-- Normalize legacy code origins to the current app rules.
-- 1. Any code linked to a theory is a priori.
-- 2. Legacy ai_suggested values become ai_initial.
-- 3. Codes marked a_priori without a theory fall back to researcher.

update public.codes
set origin = 'ai_initial'
where origin = 'ai_suggested';

update public.codes
set origin = 'a_priori'
where theory_id is not null
  and coalesce(origin, 'researcher') in ('researcher', 'a_priori');

update public.codes
set origin = 'researcher'
where theory_id is null
  and origin = 'a_priori';
