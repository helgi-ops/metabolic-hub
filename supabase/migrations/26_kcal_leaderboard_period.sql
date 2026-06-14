-- Add an optional time window (p_since) to the kcal leaderboard so it can be
-- all-time or for a period (e.g. this month). Replaces the 2-arg version.
drop function if exists public.kcal_leaderboard(uuid, text);

create or replace function public.kcal_leaderboard(
  p_station uuid default null,
  p_machine text default null,
  p_since date default null
)
returns table (
  user_id uuid,
  full_name text,
  station_id uuid,
  station_name text,
  total_kcal numeric,
  entries bigint
)
language sql
security definer
set search_path = public
as $$
  with scope as (
    select case when is_admin() then p_station else my_station_id() end as station
  )
  select p.id, p.full_name, p.station_id, st.name,
         round(sum(w.calories))::numeric as total_kcal,
         count(*) as entries
  from workout_logs w
  join profiles p on p.id = w.user_id
  left join stations st on st.id = p.station_id
  cross join scope s
  where w.calories is not null
    and w.machine in ('assault_airbike','concept2_row','concept2_bike','concept2_ski')
    and (s.station is null or p.station_id = s.station)
    and (p_since is null or w.logged_on >= p_since)
    and (
      p_machine is null
      or (p_machine = 'concept2' and w.machine like 'concept2%')
      or w.machine = p_machine
    )
  group by p.id, p.full_name, p.station_id, st.name
  having sum(w.calories) > 0
  order by sum(w.calories) desc;
$$;

revoke all on function public.kcal_leaderboard(uuid, text, date) from public;
grant execute on function public.kcal_leaderboard(uuid, text, date) to authenticated;
