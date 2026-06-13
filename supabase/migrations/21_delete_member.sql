-- Migration 21: permanently delete a member (true erasure, e.g. GDPR).
-- Admin only, students only. Deletes the auth.users row; every public table
-- referencing it cascades (profiles, personal_bests, workout_logs, …), so the
-- member and all their data are removed. Applied 2026-06-12.
create or replace function public.delete_member(member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.profiles where id = member and role = 'student') then
    raise exception 'can only delete student members';
  end if;
  delete from auth.users where id = member;
end;
$$;
revoke execute on function public.delete_member(uuid) from anon, public;
grant execute on function public.delete_member(uuid) to authenticated;
