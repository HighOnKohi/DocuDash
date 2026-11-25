-- =============================================================================
-- DocuDash | 004_storage.sql
-- Private storage bucket "requirements" and path-scoped Storage RLS policies.
-- Path convention: {user_id}/{request_id}/{filename}
-- Staff inspect uploaded IDs exclusively via 60-second signed URLs.
-- Depends on 001_schema.sql and 002_rls_policies.sql.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Create private bucket (5 MB per file, images & PDF only).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'requirements',
  'requirements',
  false,
  5242880, -- 5 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Storage RLS policies on storage.objects
-- Folder layout: (storage.foldername(name))[1] = user_id
--                (storage.foldername(name))[2] = request_id
-- -----------------------------------------------------------------------------

-- Residents can read files inside their own {user_id}/ folder.
drop policy if exists requirements_resident_select on storage.objects;
create policy requirements_resident_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'requirements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Residents can upload files only into {user_id}/{request_id}/{filename} for
-- one of their own pending requests (no extra nested subdirectories).
drop policy if exists requirements_resident_insert on storage.objects;
create policy requirements_resident_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'requirements'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.requests r
      where r.id::text = (storage.foldername(name))[2]
        and r.resident_id = (select auth.uid())
        and r.status = 'pending'
    )
  );

-- Residents can delete files from their own pending requests (e.g. re-uploading
-- a clearer ID photo before staff starts reviewing).
drop policy if exists requirements_resident_delete on storage.objects;
create policy requirements_resident_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'requirements'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.requests r
      where r.id::text = (storage.foldername(name))[2]
        and r.resident_id = (select auth.uid())
        and r.status = 'pending'
    )
  );

-- Staff and administrators can read any file in the private requirements bucket
-- (required to mint 60-second expiring signed URLs via createSignedUrl).
drop policy if exists requirements_staff_select on storage.objects;
create policy requirements_staff_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'requirements'
    and (select public.is_staff())
  );

commit;
