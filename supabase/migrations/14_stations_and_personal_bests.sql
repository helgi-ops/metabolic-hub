-- Migration 14: Multi-station (multi-tenant) + member Personal Bests
-- Applied to project wphmeryxmfdxovvnichm on 2026-06-12.
-- Adds the 4 Metabolic stations as tenants, ties members to a station, and lets
-- members log Personal Bests against a curated benchmark list. RLS isolates
-- stations: a member sees only their own PBs; a coach sees their station; admin all.

-- ── Stations (tenants) ───────────────────────────────────────────────
create table public.stations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text,
  created_at timestamptz not null default now()
);

insert into public.stations (slug, name, city) values
  ('reykjanesbaer',  'Metabolic Reykjanesbær',   'Reykjanesbær'),
  ('reykjavik',      'Metabolic Reykjavík',       'Reykjavík'),
  ('vestmannaeyjar', 'Metabolic Vestmannaeyjar',  'Vestmannaeyjar'),
  ('borgarnes',      'Metabolic Borgarnes',       'Borgarnes');

alter table public.stations enable row level security;
-- Public-readable: the signup form (anon) needs the station list.
create policy stations_read on public.stations for select using (true);
create policy stations_write on public.stations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.profiles add column station_id uuid references public.stations(id);

-- ── Benchmarks (curated measurable exercises) ────────────────────────
create table public.benchmarks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null,             -- 'lyfta' | 'thol' | 'likamsthyngd'
  unit text not null,                 -- 'kg' | 'reps' | 'sek' | 'kcal' | 'm'
  higher_is_better boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.benchmarks (slug, name, category, unit, higher_is_better, position) values
  ('back-squat',       'Hnébeygja (1RM)',            'lyfta',        'kg',   true,  10),
  ('front-squat',      'Framhnébeygja (1RM)',        'lyfta',        'kg',   true,  20),
  ('deadlift',         'Réttstöðulyfta (1RM)',       'lyfta',        'kg',   true,  30),
  ('bench-press',      'Bekkpressa (1RM)',           'lyfta',        'kg',   true,  40),
  ('shoulder-press',   'Axlapressa (1RM)',           'lyfta',        'kg',   true,  50),
  ('kb-swing',         'Ketilbjöllu sveifla (þyngd)','lyfta',        'kg',   true,  60),
  ('pullups',          'Upphífingar (mest reps)',    'likamsthyngd', 'reps', true,  70),
  ('pushups',          'Armbeygjur (mest reps)',     'likamsthyngd', 'reps', true,  80),
  ('burpees-1min',     'Burpees á 1 mín',            'likamsthyngd', 'reps', true,  90),
  ('assault-bike-1min','Assault Bike (kcal á 1 mín)','thol',         'kcal', true, 100),
  ('row-500m',         'Róðravél 500m (tími)',       'thol',         'sek',  false,110),
  ('run-1km',          '1 km hlaup (tími)',          'thol',         'sek',  false,120);

alter table public.benchmarks enable row level security;
create policy benchmarks_read on public.benchmarks for select to authenticated using (true);
create policy benchmarks_write on public.benchmarks
  for all to authenticated using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());

-- ── Personal bests ───────────────────────────────────────────────────
create table public.personal_bests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  benchmark_id uuid not null references public.benchmarks(id),
  value numeric not null,
  unit text not null,
  achieved_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index personal_bests_user_idx on public.personal_bests (user_id);
create index personal_bests_benchmark_idx on public.personal_bests (benchmark_id);

-- SECURITY DEFINER so it reads profiles without tripping profiles' RLS (no recursion).
create or replace function public.shares_my_station(target uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.profiles me
    join public.profiles them on them.station_id = me.station_id
    where me.id = auth.uid() and them.id = target and me.station_id is not null
  );
$$;
revoke execute on function public.shares_my_station(uuid) from anon, public;
grant execute on function public.shares_my_station(uuid) to authenticated;

alter table public.personal_bests enable row level security;
create policy pb_select_own_or_station on public.personal_bests
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (public.current_user_role()::text = 'coach' and public.shares_my_station(user_id))
  );
create policy pb_insert_own on public.personal_bests
  for insert to authenticated with check (user_id = auth.uid());
create policy pb_update_own on public.personal_bests
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pb_delete_own on public.personal_bests
  for delete to authenticated using (user_id = auth.uid());

-- handle_new_user: also copy station_id from signup metadata (options.data.station_id).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, station_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    nullif(new.raw_user_meta_data->>'station_id', '')::uuid
  );
  return new;
end;
$$;

-- Tighten RLS helper functions: they must stay callable by `authenticated` (used
-- inside policies) but not exposed to anon as RPC endpoints.
revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.is_coach_or_admin() from anon, public;
revoke execute on function public.is_enrolled_in(uuid) from anon, public;
revoke execute on function public.current_user_role() from anon, public;
