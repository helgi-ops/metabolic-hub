-- Public sign-ups for paid online courses (greiðsluseðill flow), applied via MCP
-- as "course_registrations". Kennitala is sensitive: admin-only RLS; inserts
-- happen only through the service-role server action (src/app/akademia/actions.ts).
create table if not exists public.course_registrations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  kennitala text not null check (kennitala ~ '^[0-9]{10}$'),
  status text not null default 'new' check (status in ('new','invoiced','enrolled','cancelled')),
  user_id uuid references auth.users(id) on delete set null,
  enrolled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists course_registrations_course_idx
  on public.course_registrations (course_id, created_at desc);

alter table public.course_registrations enable row level security;
revoke all on public.course_registrations from anon, authenticated;
grant select, update, delete on public.course_registrations to authenticated;

create policy course_registrations_admin_select on public.course_registrations
  for select to authenticated using (public.is_admin());
create policy course_registrations_admin_update on public.course_registrations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy course_registrations_admin_delete on public.course_registrations
  for delete to authenticated using (public.is_admin());

-- Enrolled learners can see their course (and its modules) even while the
-- course is unpublished, so paid access works without a public listing.
drop policy if exists courses_select_published on public.courses;
create policy courses_select_published on public.courses
  for select using (
    is_published or public.is_admin()
    or exists (select 1 from public.enrollments e
               where e.course_id = courses.id and e.user_id = auth.uid())
  );

drop policy if exists modules_select on public.modules;
create policy modules_select on public.modules
  for select using (
    exists (select 1 from public.courses c
            where c.id = modules.course_id
              and (c.is_published or public.is_admin()
                   or exists (select 1 from public.enrollments e
                              where e.course_id = c.id and e.user_id = auth.uid())))
  );
