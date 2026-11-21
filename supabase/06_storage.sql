-- ClubLounge: image bucket
--
-- Pictures used to be stored as data URLs inside cl_records.data /
-- cl_branding.logo_url, so their bytes were re-sent on every list fetch.
-- That is what pushed the previous project past its db-size, storage and
-- cached-egress quotas. Rows now hold only a public CDN URL.
--
-- Deliberately upload-only: the browser carries just the publishable key,
-- so granting update/remove would let anyone holding that key overwrite or
-- wipe the bucket. A replaced photo leaves its old object behind; at ~20 KB
-- an image that is a cheap trade against the 1 GB free tier.
--
-- No `drop policy` here on purpose: the MCP SQL bridge used to apply these
-- stalls waiting on confirmation for destructive statements.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cl-images', 'cl-images', true, 307200,
        array['image/webp','image/jpeg','image/png'])
on conflict (id) do update
  set public             = true,
      file_size_limit    = 307200,
      allowed_mime_types = array['image/webp','image/jpeg','image/png'];

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'cl_images_insert'
  ) then
    create policy "cl_images_insert" on storage.objects
      for insert to anon, authenticated
      with check (bucket_id = 'cl-images');
  end if;
end $$;
