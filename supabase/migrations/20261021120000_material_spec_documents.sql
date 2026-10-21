-- SPEC documents attached to material request records (料號申請 → 料件 → SPEC 文件).
-- Files live in a private bucket; the record JSON keeps the path and metadata.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'material-spec-documents',
  'material-spec-documents',
  false,
  26214400,
  null
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "material-spec-documents-read" on storage.objects;
create policy "material-spec-documents-read"
on storage.objects for select
to authenticated
using (bucket_id = 'material-spec-documents');

drop policy if exists "material-spec-documents-insert" on storage.objects;
create policy "material-spec-documents-insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'material-spec-documents');

drop policy if exists "material-spec-documents-update" on storage.objects;
create policy "material-spec-documents-update"
on storage.objects for update
to authenticated
using (bucket_id = 'material-spec-documents')
with check (bucket_id = 'material-spec-documents');

drop policy if exists "material-spec-documents-delete" on storage.objects;
create policy "material-spec-documents-delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'material-spec-documents');
