-- Migration 16: Station-scoped weekly plans.
-- Coaches see their own station's weekly plans (the studio's content); admins see
-- everything (oversight). Structures stay GLOBAL (shared Metabolic library — the
-- methodology, not studio property). Applied 2026-06-12.

alter table public.weekly_plans add column station_id uuid references public.stations(id);

-- Helper: the caller's own station. SECURITY DEFINER so it reads profiles without
-- tripping profiles' RLS (no recursion).
create or replace function public.my_station_id()
returns uuid language sql security definer stable set search_path = public as $$
  select station_id from public.profiles where id = auth.uid();
$$;
revoke execute on function public.my_station_id() from anon, public;
grant execute on function public.my_station_id() to authenticated;

-- Replace the owner-only policy with station-scoped policies.
drop policy weekly_plans_own_all on public.weekly_plans;

create policy weekly_plans_select on public.weekly_plans
  for select to authenticated
  using (
    public.is_admin()
    or owner_id = auth.uid()
    or (station_id is not null and station_id = public.my_station_id())
  );

create policy weekly_plans_insert on public.weekly_plans
  for insert to authenticated with check (owner_id = auth.uid());

create policy weekly_plans_update on public.weekly_plans
  for update to authenticated
  using (
    public.is_admin() or owner_id = auth.uid()
    or (station_id is not null and station_id = public.my_station_id())
  )
  with check (
    public.is_admin() or owner_id = auth.uid()
    or (station_id is not null and station_id = public.my_station_id())
  );

create policy weekly_plans_delete on public.weekly_plans
  for delete to authenticated
  using (
    public.is_admin() or owner_id = auth.uid()
    or (station_id is not null and station_id = public.my_station_id())
  );

-- Helgi is admin AND a coach at Metabolic Reykjanesbær; backfill his weeks.
update public.profiles
set station_id = (select id from public.stations where slug = 'reykjanesbaer')
where id = '9df0eb79-aef5-4027-9311-663dfeb58cfe';

update public.weekly_plans
set station_id = (select id from public.stations where slug = 'reykjanesbaer')
where owner_id = '9df0eb79-aef5-4027-9311-663dfeb58cfe' and station_id is null;