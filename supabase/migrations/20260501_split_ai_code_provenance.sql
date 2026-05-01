alter table public.codes
add column if not exists created_via_ai boolean not null default false;

update public.codes
set created_via_ai = true
where coalesce(created_via_ai, false) = false
  and (
    coalesce(ai_suggested, false) = true
    or origin in ('ai_initial', 'ai_suggested')
  );

update public.codes
set origin = case
  when theory_id is not null then 'a_priori'
  when origin in ('ai_initial', 'ai_suggested') then 'researcher'
  else origin
end
where origin in ('ai_initial', 'ai_suggested');
