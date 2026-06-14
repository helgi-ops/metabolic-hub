-- Re-generating an OptiSigns PDF uses upsert (overwrite). The bucket only had
-- INSERT + SELECT policies, so overwriting an existing file failed RLS. Allow
-- owners to update/delete files in their own folder.
create policy weekly_plan_pdfs_owner_update on storage.objects
  for update to public
  using (bucket_id = 'weekly-plan-pdfs' and (auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'weekly-plan-pdfs' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy weekly_plan_pdfs_owner_delete on storage.objects
  for delete to public
  using (bucket_id = 'weekly-plan-pdfs' and (auth.uid())::text = (storage.foldername(name))[1]);
