-- 3D models people upload to their sets, under `<user id>/`, named by content
-- hash. The `comics` bucket only takes images. Private, because a VRoid model
-- often has a licence that forbids redistributing it: only its owner can read it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comic-models',
  'comic-models',
  false,
  209715200,
  array['application/octet-stream', 'model/gltf-binary']
)
on conflict (id) do nothing;

create policy "Owners read their models"
  on storage.objects for select to authenticated
  using (bucket_id = 'comic-models' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners upload models"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'comic-models' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners delete their models"
  on storage.objects for delete to authenticated
  using (bucket_id = 'comic-models' and (storage.foldername(name))[1] = (select auth.uid())::text);
