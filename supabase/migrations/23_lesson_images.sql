-- Per-lesson infographic images, stored separately from body_markdown so
-- re-running the course text ingestion never clobbers images.
alter table public.lessons
  add column if not exists image_urls text[] not null default '{}';

-- Public bucket for course lesson images.
insert into storage.buckets (id, name, public)
values ('course-media', 'course-media', true)
on conflict (id) do update set public = true;
