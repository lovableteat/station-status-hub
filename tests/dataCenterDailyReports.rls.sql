-- Run with a database owner connection. All synthetic rows are rolled back.
-- Requires an active Test project and at least one active Data Center editor.
begin;
select set_config('dc.qa.author', id::text, true),
       set_config('request.jwt.claims', jsonb_build_object('sub',auth_user_id,'role','authenticated')::text, true)
from workspace.system_users
where status='active' and auth_user_id is not null and role not in ('admin','super_admin')
  and permissions #>> '{workspaceAccess,data-center}' = 'edit'
order by username limit 1;
select set_config('dc.qa.project', id::text, true),
       set_config('dc.qa.site', document->'sites'->0->>'id', true)
from workspace.data_center_projects where name='Test' and archived_at is null limit 1;
insert into workspace.data_center_work_reports(project_id,author_id,site_id,report_date,summary)
select current_setting('dc.qa.project')::uuid,id,current_setting('dc.qa.site'),date '2000-01-01','QA foreign author rollback'
from workspace.system_users where id <> current_setting('dc.qa.author')::uuid limit 1;
set local role authenticated;
do $$
declare p uuid := current_setting('dc.qa.project')::uuid;
        a uuid := current_setting('dc.qa.author')::uuid;
        s text := current_setting('dc.qa.site');
        r uuid; changed integer;
begin
  insert into workspace.data_center_work_reports(project_id,author_id,site_id,report_date,summary)
    values(p,a,s,date '2000-01-02','QA own report rollback') returning id into r;
  update workspace.data_center_work_reports set summary='QA edited rollback' where id=r;
  get diagnostics changed = row_count;
  assert changed=1, 'editor must update own content';
  update workspace.data_center_work_reports set summary='must not change foreign row' where author_id<>a;
  get diagnostics changed = row_count;
  assert changed=0, 'editor must not update another author';
  update workspace.data_center_work_reports set summary='stale version' where id=r and updated_at='1900-01-01';
  get diagnostics changed = row_count;
  assert changed=0, 'stale version must update zero rows';
  begin
    insert into workspace.data_center_work_reports(project_id,author_id,site_id,report_date,summary) values(p,a,s,date '2000-01-02','duplicate');
    raise exception 'duplicate report was accepted';
  exception when unique_violation then null; end;
  begin
    insert into workspace.data_center_work_reports(project_id,author_id,site_id,report_date,summary) values(p,'00000000-0000-0000-0000-000000000000',s,date '2000-01-03','spoof');
    raise exception 'spoofed author was accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into workspace.data_center_work_reports(project_id,author_id,site_id,report_date,summary) values(p,a,'missing-site',date '2000-01-03','invalid site');
    raise exception 'missing site was accepted';
  exception when insufficient_privilege then null; end;
  begin
    update workspace.data_center_work_reports set author_id=a where id=r;
    raise exception 'client could rewrite identity';
  exception when insufficient_privilege then null; end;
  begin
    insert into workspace.data_center_work_reports(project_id,author_id,site_id,report_date,summary) values(p,a,s,date '2000-01-03',' ');
    raise exception 'blank report was accepted';
  exception when check_violation then null; end;
  begin
    insert into workspace.data_center_work_reports(project_id,author_id,site_id,report_date,summary) values(p,a,s,current_date+2,'future');
    raise exception 'future report was accepted';
  exception when check_violation then null; end;
  assert not has_table_privilege('anon','workspace.data_center_work_reports','SELECT'), 'anonymous access must be denied';
  assert not has_table_privilege('authenticated','workspace.data_center_work_reports','DELETE'), 'client deletion must be denied';
end $$;
reset role;
-- Changes below are uncommitted, invisible to other sessions and restored by rollback.
update workspace.system_users set permissions=jsonb_set(permissions,'{workspaceAccess,data-center}','"view"')
where id=current_setting('dc.qa.author')::uuid;
set local role authenticated;
do $$
declare changed integer;
begin
  assert (select count(*)>0 from workspace.data_center_work_reports), 'view-only member must retain read access';
  update workspace.data_center_work_reports set summary='view-only must not edit';
  get diagnostics changed = row_count;
  assert changed=0, 'view-only member must not edit';
  begin
    insert into workspace.data_center_work_reports(project_id,author_id,site_id,report_date,summary)
      values(current_setting('dc.qa.project')::uuid,current_setting('dc.qa.author')::uuid,current_setting('dc.qa.site'),date '2000-01-04','view-only must not create');
    raise exception 'view-only member could create';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update workspace.system_users set permissions=jsonb_set(permissions,'{workspaceAccess,data-center}','"none"')
where id=current_setting('dc.qa.author')::uuid;
set local role authenticated;
do $$ begin
  assert (select count(*)=0 from workspace.data_center_work_reports), 'revoked member must not read reports';
end $$;
rollback;
