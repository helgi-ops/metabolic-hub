-- Migration 18: tie a member's workout log to the workout they did, so they can
-- compare next time the same workout comes up — WITHOUT ever seeing the prescription.
-- Applied 2026-06-12.

-- (1) Close a leak: station-scoped weekly_plans RLS let *students* read (and write)
-- their station's plans. Members must never see the programming. Gate the station
-- clause behind the coach role; admins still see everything.
drop policy weekly_plans_select on public.weekly_plans;
drop policy weekly_plans_insert on public.weekly_plans;
drop policy weekly_plans_update on public.weekly_plans;
drop policy weekly_plans_delete on public.weekly_plans;

create policy weekly_plans_select on public.weekly_plans
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_coach_or_admin()
        and (owner_id = auth.uid()
             or (station_id is not null and station_id = public.my_station_id())))
  );
create policy weekly_plans_insert on public.weekly_plans
  for insert to authenticated
  with check (public.is_coach_or_admin() and owner_id = auth.uid());
create policy weekly_plans_update on public.weekly_plans
  for update to authenticated
  using (
    public.is_admin()
    or (public.is_coach_or_admin()
        and (owner_id = auth.uid()
             or (station_id is not null and station_id = public.my_station_id())))
  )
  with check (
    public.is_admin()
    or (public.is_coach_or_admin()
        and (owner_id = auth.uid()
             or (station_id is not null and station_id = public.my_station_id())))
  );
create policy weekly_plans_delete on public.weekly_plans
  for delete to authenticated
  using (
    public.is_admin()
    or (public.is_coach_or_admin()
        and (owner_id = auth.uid()
             or (station_id is not null and station_id = public.my_station_id())))
  );

-- (2) The workout a log belongs to — identity only (no prescription), denormalized
-- at log time so history/comparison needs no access to structures/weekly_plans.
alter table public.workout_logs add column structure_source_id text;
alter table public.workout_logs add column scheduled_day text;
alter table public.workout_logs add column scheduled_category text;
create index workout_logs_user_structure_idx
  on public.workout_logs (user_id, structure_source_id);

-- (3) Resolve the caller's station's scheduled workout for a date, returning ONLY
-- the identity (source_id + day + category). SECURITY DEFINER so a member can call
-- it without read access to weekly_plans/structures.
create or replace function public.scheduled_structure_for(d date)
returns table(source_id text, scheduled_day text, category text)
language sql security definer stable set search_path = public as $$
  with plan as (
    select wp.programs_json
    from public.weekly_plans wp
    where wp.station_id = public.my_station_id()
      and wp.week_starting <= d
      and d < wp.week_starting + interval '7 days'
    order by wp.week_starting desc, wp.created_at desc
    limit 1
  ),
  dayname as (
    select (array['Mánudagur','Þriðjudagur','Miðvikudagur','Fimmtudagur',
                  'Föstudagur','Laugardagur','Sunnudagur'])[extract(isodow from d)::int] as dn
  )
  select s->>'structure_source_id', s->>'day', s->>'category'
  from plan, dayname, jsonb_array_elements(plan.programs_json) s
  where s->>'day' = dayname.dn
  limit 1;
$$;
revoke execute on function public.scheduled_structure_for(date) from anon, public;
grant execute on function public.scheduled_structure_for(date) to authenticated;
