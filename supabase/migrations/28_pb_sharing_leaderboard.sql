-- Opt-in PB sharing: a member chooses whether others at their station may see
-- their personal bests. Default false → PBs stay private exactly as before.
alter table public.profiles
  add column if not exists share_pbs boolean not null default false;

-- Members may toggle only their own share_pbs (column-level grant; role/status/
-- station stay locked from self-update).
grant update (share_pbs) on public.profiles to authenticated;

-- Station PB leaderboard for a benchmark. SECURITY DEFINER so members can see
-- the aggregate best of those who opted in (plus always themselves), station-
-- scoped, without reading others' raw personal_bests rows.
create or replace function public.pb_leaderboard(
  p_benchmark uuid,
  p_station uuid default null
)
returns table (user_id uuid, full_name text, value numeric)
language plpgsql
security definer
set search_path = public
as $$
declare hib boolean;
begin
  select higher_is_better into hib from public.benchmarks where id = p_benchmark;
  return query
  select pb.user_id, p.full_name,
         (case when hib then max(pb.value) else min(pb.value) end)::numeric
  from public.personal_bests pb
  join public.profiles p on p.id = pb.user_id
  where pb.benchmark_id = p_benchmark
    and (is_admin() or p.station_id in (select my_station_ids()))
    and (p_station is null or p.station_id = p_station)
    and (p.share_pbs or p.id = auth.uid())
  group by pb.user_id, p.full_name
  order by (case when hib then max(pb.value) else min(pb.value) end)
           * (case when hib then -1 else 1 end);
end;
$$;

revoke all on function public.pb_leaderboard(uuid, uuid) from public;
grant execute on function public.pb_leaderboard(uuid, uuid) to authenticated;
