-- Only one weekly plan per station (or per owner when station is null),
-- week and level. Copying MB1 → MB2/MB3 twice used to create a second copy;
-- the app shows the newest one, so edits made to the first copy vanished.
--
-- A trigger (not a unique index) so older harmless duplicates in past weeks
-- don't block the migration. The error carries the existing plan's id so the
-- app can link to it: `weekly_plan_exists:<uuid>` (SQLSTATE 23505).

create or replace function public.weekly_plans_prevent_duplicate()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_scope text := coalesce(new.station_id::text, 'owner:' || new.owner_id::text);
  v_existing uuid;
begin
  -- Serialise concurrent inserts for the same scope/week/level (double click).
  perform pg_advisory_xact_lock(hashtext('weekly_plans:' || v_scope || ':' || new.week_starting::text || ':' || new.level::text));
  select id into v_existing from weekly_plans
  where week_starting = new.week_starting and level = new.level and id <> new.id
    and (case when new.station_id is not null then station_id = new.station_id
              else station_id is null and owner_id = new.owner_id end)
  limit 1;
  if v_existing is not null then
    raise exception 'weekly_plan_exists:%', v_existing
      using errcode = 'unique_violation',
            hint = 'Það er þegar til ' || new.level || ' vika fyrir þessa viku.';
  end if;
  return new;
end; $$;

revoke execute on function public.weekly_plans_prevent_duplicate() from public, anon, authenticated;

drop trigger if exists weekly_plans_prevent_duplicate on public.weekly_plans;
create trigger weekly_plans_prevent_duplicate
  before insert or update of week_starting, level, station_id on public.weekly_plans
  for each row execute function public.weekly_plans_prevent_duplicate();
