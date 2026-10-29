-- Material editor SPEC files use the same view/edit permissions as 料號申請.
-- This also provisions installations where the original SPEC bucket was not deployed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material-spec-documents', 'material-spec-documents', false, 26214400, null)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "material-spec-documents-read" on storage.objects;
create policy "material-spec-documents-read" on storage.objects
for select to authenticated
using (
  bucket_id = 'material-spec-documents'
  and (select workspace.current_user_can_workspace('material-requests', 'view'))
);

drop policy if exists "material-spec-documents-insert" on storage.objects;
create policy "material-spec-documents-insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'material-spec-documents'
  and (select workspace.current_user_can_workspace('material-requests', 'edit'))
  and name ~ '^[^/]+/[^/]+/[^/]+$'
  and name ~* '\.(pdf|doc|docx|xls|xlsx|ppt|pptx|png|jpg|jpeg|zip)$'
);

drop policy if exists "material-spec-documents-update" on storage.objects;
create policy "material-spec-documents-update" on storage.objects
for update to authenticated
using (
  bucket_id = 'material-spec-documents'
  and (select workspace.current_user_can_workspace('material-requests', 'edit'))
)
with check (
  bucket_id = 'material-spec-documents'
  and (select workspace.current_user_can_workspace('material-requests', 'edit'))
  and name ~ '^[^/]+/[^/]+/[^/]+$'
  and name ~* '\.(pdf|doc|docx|xls|xlsx|ppt|pptx|png|jpg|jpeg|zip)$'
);

drop policy if exists "material-spec-documents-delete" on storage.objects;
create policy "material-spec-documents-delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'material-spec-documents'
  and (select workspace.current_user_can_workspace('material-requests', 'edit'))
);
