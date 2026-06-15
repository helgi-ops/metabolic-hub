-- AI weekly recap ("Vika í baksýn"): a short, encouraging Icelandic summary of
-- how a member's past week went. Generated server-side via Claude and cached
-- here so each week is generated at most once per member (controls API cost).

create table if not exists public.weekly_recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null, -- Monday of the week the recap covers
  content text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_recaps enable row level security;

-- Members read and create only their own recaps. The recap is generated inside a
-- server action running as the member, so auth.uid() = user_id holds.
create policy "weekly_recaps_select_own"
  on public.weekly_recaps for select
  using (auth.uid() = user_id);

create policy "weekly_recaps_insert_own"
  on public.weekly_recaps for insert
  with check (auth.uid() = user_id);
