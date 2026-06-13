-- Migration 15: Members must never see the workout/programming content.
-- The session is shown on a board / TV at each station, not in the member app.
-- Lock the structure catalog to coaches/admins at the RLS level (defense in depth;
-- the UI also hides /app/programs, /app/library and the builder from students via
-- src/lib/auth/require-staff.ts and role-gated nav).
drop policy structures_read on public.structures;
create policy structures_read on public.structures
  for select to authenticated using (public.is_coach_or_admin());
