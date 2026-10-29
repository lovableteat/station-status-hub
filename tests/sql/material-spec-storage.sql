-- Run against a database with an existing active material editor.
-- Every Storage metadata probe is rolled back; no real attachment is changed.
begin;
do $$
declare actor uuid;
begin
  select auth_user_id into actor from workspace.system_users
  where status = 'active' and auth_user_id is not null
    and role not in ('admin', 'super_admin')
    and permissions #>> '{workspaceAccess,material-requests}' = 'edit'
  limit 1;
  if actor is null then raise exception 'QA requires an existing material editor'; end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;

set local role authenticated;
do $$
begin
  if not workspace.current_user_can_workspace('material-requests', 'edit') then
    raise exception 'Editor permission failed';
  end if;
  insert into storage.objects (bucket_id, name)
  values ('material-spec-documents', 'qa-spec-rollback/permission-test/spec.pdf');
  if (select count(*) from storage.objects where bucket_id = 'material-spec-documents'
      and name = 'qa-spec-rollback/permission-test/spec.pdf') <> 1 then
    raise exception 'Editor read failed';
  end if;
  update storage.objects set name = 'qa-spec-rollback/permission-test/spec-updated.pdf'
  where bucket_id = 'material-spec-documents' and name = 'qa-spec-rollback/permission-test/spec.pdf';
  if (select count(*) from storage.objects where bucket_id = 'material-spec-documents'
      and name = 'qa-spec-rollback/permission-test/spec-updated.pdf') <> 1 then
    raise exception 'Editor update failed';
  end if;
  insert into storage.objects (bucket_id, name) values
    ('material-spec-documents', 'qa-spec-rollback/permission-test/model.glb'),
    ('material-spec-documents', 'qa-spec-rollback/permission-test/model.STP'),
    ('material-spec-documents', 'qa-spec-rollback/permission-test/board.kicad_pcb');
  begin
    insert into storage.objects (bucket_id, name)
    values ('material-spec-documents', 'qa-spec-rollback/permission-test/unsafe.exe');
    raise exception 'Unsupported extension unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
end $$;
set local role authenticated;
do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'material-spec-documents') then
    raise exception 'Unauthorized read unexpectedly allowed';
  end if;
  begin
    insert into storage.objects (bucket_id, name)
    values ('material-spec-documents', 'qa-spec-rollback/permission-test/denied.pdf');
    raise exception 'Unauthorized upload unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
