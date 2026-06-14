-- A coach can work at more than one station. Their primary station stays in
-- profiles.station_id; any additional stations go in coach_station_ids.
alter table public.profiles
  add column if not exists coach_station_ids uuid[] not null default '{}';

-- All stations the current user belongs to (primary + extras).
create or replace function public.my_station_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct x from (
    select unnest(coalesce(coach_station_ids, '{}') || coalesce(array[station_id], '{}')) as x
    from public.profiles where id = auth.uid()
  ) t where x is not null;
$$;
grant execute on function public.my_station_ids() to authenticated;

-- shares_my_station is now true if the target is at ANY of my stations.
create or replace function public.shares_my_station(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles them
    where them.id = target
      and them.station_id in (select public.my_station_ids())
  );
$$;

-- Leaderboard scope: admins see all (or a chosen station); everyone else sees
-- the stations they belong to (optionally narrowed to one).
create or replace function public.kcal_leaderboard(
  p_station uuid default null,
  p_machine text default null,
  p_since date default null
)
returns table (
  user_id uuid, full_name text, station_id uuid, station_name text,
  total_kcal numeric, entries bigint
)
language sql security definer set search_path = public
as $$
  select p.id, p.full_name, p.station_id, st.name,
         round(sum(w.calories))::numeric as total_kcal, count(*) as entries
  from workout_logs w
  join profiles p on p.id = w.user_id
  left join stations st on st.id = p.station_id
  where w.calories is not null
    and w.machine in ('assault_airbike','concept2_row','concept2_bike','concept2_ski')
    and (is_admin() or p.station_id in (select my_station_ids()))
    and (p_station is null or p.station_id = p_station)
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