-- Migration 17: Member workout journal (æfingadagbók).
-- After a session a member logs how hard it was (RPE 1-10), the weights they used,
-- and calories on a cardio machine (Assault Airbike / Concept2). No link to the
-- programming — members never see the workout. RLS mirrors personal_bests:
-- member owns their entries, a coach sees their station's, admin sees all.
-- Applied 2026-06-12.
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  rpe int check (rpe between 1 and 10),
  weights text,
  calories numeric,
  machine text,           -- 'assault_airbike' | 'concept2_row' | 'concept2_bike' | 'concept2_ski' | 'other'
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workout_logs_user_idx on public.workout_logs (user_id, logged_on desc);

alter table public.workout_logs enable row level security;

create policy workout_logs_select on public.workout_logs
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (public.current_user_role()::text = 'coach' and public.shares_my_station(user_id))
  );
create policy workout_logs_insert on public.workout_logs
  for insert to authenticated with check (user_id = auth.uid());
create policy workout_logs_update on public.workout_logs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy workout_logs_delete on public.workout_logs
  for delete to authenticated using (user_id = auth.uid());
