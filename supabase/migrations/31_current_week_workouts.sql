-- The workouts in the member's station's current-week plan (identity only) so a
-- member can pick exactly which class they logged. SECURITY DEFINER because
-- students can't read weekly_plans directly (RLS).
create or replace function public.current_week_workouts()
returns table (slot int, structure_source_id text, category text, name text, day text)
language sql stable security definer set search_path = public
as $$
  with plan as (
    select wp.programs_json
    from public.weekly_plans wp
    where wp.station_id = public.my_station_id()
      and wp.week_starting <= current_date
      and current_date < wp.week_starting + interval '7 days'
    order by wp.week_starting desc, wp.created_at desc
    limit 1
  )
  select (s->>'slot')::int, s->>'structure_source_id', s->>'category', s->>'name', s->>'day'
  from plan, jsonb_array_elements(plan.programs_json) s
  order by (s->>'slot')::int;
$$;
grant execute on function public.current_week_workouts() to authenticated;
