-- Migration 20: membership lifecycle. A new member is 'pending' until a coach
-- approves them; coaches can 'suspend' members who quit. Suspending does NOT delete
-- data — it only blocks access. Applied 2026-06-12.
alter table public.profiles
  add column status text not null default 'pending'
  check (status in ('pending', 'active', 'suspended'));

-- Existing accounts are already in use → keep active. New signups default to
-- 'pending' (handle_new_user doesn't set status, so the column default applies).
update public.profiles set status = 'active';

-- Security fix: profiles_update_own let a member update their OWN row including
-- role/status/station_id — i.e. self-approve or self-promote to admin. Restrict
-- client updates to harmless self-service columns; role/status/station_id change
-- only via SECURITY DEFINER functions or SQL (admin).
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, bio, updated_at) on public.profiles to authenticated;

create or replace function public.is_active_member()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select status = 'active' from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.is_active_member() from anon, public;
grant execute on function public.is_active_member() to authenticated;

-- Approve / suspend a student. Only an admin, or a coach at the member's station.
create or replace function public.set_member_status(member uuid, new_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if new_status not in ('pending', 'active', 'suspended') then
    raise exception 'invalid status %', new_status;
  end if;
  if not (public.is_admin()
          or (public.current_user_role()::text = 'coach' and public.shares_my_station(member))) then
    raise exception 'not authorized';
  end if;
  update public.profiles set status = new_status, updated_at = now()
  where id = member and role = 'student';
end;
$$;
revoke execute on function public.set_member_status(uuid, text) from anon, public;
grant execute on function public.set_member_status(uuid, text) to authenticated;

-- Defense in depth: only active members can write their own data.
drop policy pb_insert_own on public.personal_bests;
create policy pb_insert_own on public.personal_bests
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_member());

drop policy workout_logs_insert on public.workout_logs;
create policy workout_logs_insert on public.workout_logs
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_member());
