-- Let admins upload/replace/remove course media (lesson videos + images) from
-- the in-app lesson editor. Public read is already granted by the public bucket.
create policy course_media_admin_write on storage.objects
  for insert to public with check (bucket_id = 'course-media' and is_admin());
create policy course_media_admin_update on storage.objects
  for update to public using (bucket_id = 'course-media' and is_admin());
create policy course_media_admin_delete on storage.objects
  for delete to public using (bucket_id = 'course-media' and is_admin());
