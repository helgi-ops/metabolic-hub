-- Migration 22: per-station public pages (/stod/[slug]) with location + weekly
-- timetable. Applied 2026-06-12.
alter table public.stations add column intro text;
alter table public.stations add column address text;
alter table public.stations add column maps_url text;

create table public.station_classes (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7), -- 1 = Mánudagur
  start_time text not null,                              -- "06:00"
  level text,                                            -- MB1 / MB2 / MB3
  note text,
  created_at timestamptz not null default now()
);
create index station_classes_idx on public.station_classes (station_id, weekday, start_time);

alter table public.station_classes enable row level security;
-- Public-readable for the marketing page; coaches/admins manage their own station's.
create policy station_classes_read on public.station_classes for select using (true);
create policy station_classes_write on public.station_classes
  for all to authenticated
  using (public.is_admin() or (public.current_user_role()::text = 'coach' and station_id = public.my_station_id()))
  with check (public.is_admin() or (public.current_user_role()::text = 'coach' and station_id = public.my_station_id()));

-- Example content for Reykjanesbær (editable later).
update public.stations set
  intro = 'Metabolic Reykjanesbær — hópþjálfun á þremur stigum í hjarta Reykjanesbæjar. Komdu og prófaðu kerfið sem hefur skilað árangri síðan 2011.',
  address = 'Hafnargata 12, 230 Reykjanesbær'
where slug = 'reykjanesbaer';

insert into public.station_classes (station_id, weekday, start_time, level)
select s.id, d.wd, c.t, c.lvl
from public.stations s
cross join (values (1),(2),(3),(4),(5)) d(wd)
cross join (values ('06:00','MB2'),('07:00','MB1'),('16:30','MB1'),('17:30','MB2'),('18:30','MB3')) c(t, lvl)
where s.slug = 'reykjanesbaer';

insert into public.station_classes (station_id, weekday, start_time, level)
select s.id, 6, v.t, v.lvl
from public.stations s, (values ('10:00','MB1'),('11:00','MB2')) v(t, lvl)
where s.slug = 'reykjanesbaer';
