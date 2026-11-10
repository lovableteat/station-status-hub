begin;

-- The new workspace extends the original records; it never replaces them.
lock table workspace.issues, workspace.issue_attachments in access exclusive mode;
create temporary table maintenance_original_rows on commit drop as
select 'issues'::text as kind, coalesce(jsonb_object_agg(id::text, to_jsonb(t)), '{}'::jsonb) as records from workspace.issues t
union all select 'attachments', coalesce(jsonb_object_agg(id::text, to_jsonb(t)), '{}'::jsonb) from workspace.issue_attachments t;

create schema if not exists maintenance_private;
revoke all on schema maintenance_private from public, anon;
grant usage on schema maintenance_private to authenticated;

create or replace function maintenance_private.account_access(p_id uuid, p_edit boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from workspace.system_users u where u.id = p_id and u.status = 'active'
    and (u.role in ('admin', 'super_admin') or (
      case when coalesce(u.permissions->'workspaceAccess', '{}'::jsonb) ? 'station-status'
        then case when p_edit then u.permissions#>>'{workspaceAccess,station-status}' = 'edit'
          else u.permissions#>>'{workspaceAccess,station-status}' in ('view', 'edit') end
        else true end
      and case when coalesce(u.permissions, '{}'::jsonb) ? 'pagePermissions'
        then coalesce(u.permissions->'pagePermissions', '[]'::jsonb) @> '["issues_edit"]'::jsonb
          or (not p_edit and coalesce(u.permissions->'pagePermissions', '[]'::jsonb) @> '["issues_view"]'::jsonb)
        else exists (select 1 from workspace.user_page_permissions p where p.user_id=u.id
          and (p.permission::text='issues_edit' or (not p_edit and p.permission::text='issues_view'))) end
    ))
  );
$$;
revoke all on function maintenance_private.account_access(uuid, boolean) from public, anon, authenticated;
create or replace function maintenance_private.has_access(p_edit boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select maintenance_private.account_access(workspace.current_system_user_id(), p_edit);
$$;
revoke all on function maintenance_private.has_access(boolean) from public, anon;
grant execute on function maintenance_private.has_access(boolean) to authenticated;

alter table workspace.issues
  add column if not exists maintenance_status text check (maintenance_status in ('pending','diagnosing','repairing','waiting_parts','resolved')),
  add column if not exists asset_identifier text,
  add column if not exists assignee_user_ids uuid[] not null default '{}',
  add column if not exists handover_message_id uuid;

create table workspace.maintenance_messages (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references workspace.issues(id) on delete cascade,
  project_id uuid not null references workspace.test_projects(id) on delete restrict,
  actor_id uuid references workspace.system_users(id) on delete set null,
  actor_name text not null,
  kind text not null check (kind in ('created','note','status','assignees','handover','edited')),
  body text not null default '' check (length(body) <= 20000),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index maintenance_messages_issue_time on workspace.maintenance_messages(issue_id, created_at, id);
create index maintenance_messages_project on workspace.maintenance_messages(project_id);
alter table workspace.issues add constraint issues_handover_message_fkey foreign key (handover_message_id)
  references workspace.maintenance_messages(id) on delete set null;
alter table workspace.issue_attachments add column if not exists maintenance_message_id uuid
  references workspace.maintenance_messages(id) on delete set null;
alter table workspace.maintenance_messages enable row level security;
create policy maintenance_messages_read on workspace.maintenance_messages for select to authenticated
  using ((select maintenance_private.has_access(false)) and exists (
    select 1 from workspace.issues i where i.id=maintenance_messages.issue_id and i.project_id=maintenance_messages.project_id
  ));
revoke all on workspace.maintenance_messages from public, anon, authenticated;
grant select on workspace.maintenance_messages to authenticated;
grant all on workspace.maintenance_messages to service_role;
alter table workspace.maintenance_messages replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='workspace' and tablename='maintenance_messages') then
    alter publication supabase_realtime add table workspace.maintenance_messages;
  end if;
end $$;

create or replace function maintenance_private.guard_fault()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.maintenance_status is null and (tg_op='INSERT' or old.maintenance_status is null) then return new; end if;
  if not maintenance_private.has_access(true) then raise exception '沒有維修編輯權限' using errcode='42501'; end if;
  if tg_op='UPDATE' then
    if new.project_id is distinct from old.project_id then raise exception '故障不能移至其他專案' using errcode='22023'; end if;
    if new.maintenance_status is null then raise exception '請保留維修狀態' using errcode='22023'; end if;
    if new.status is distinct from old.status and new.maintenance_status is not distinct from old.maintenance_status then
      new.maintenance_status := case when new.status in ('resolved','closed') then 'resolved' when new.status='in_progress' then 'repairing' else 'pending' end;
    end if;
  end if;
  if new.system_id is not null and not exists (select 1 from workspace.test_systems s where s.id=new.system_id and s.project_id=new.project_id) then
    raise exception '機台不屬於目前專案' using errcode='22023';
  end if;
  if new.maintenance_status='resolved' and nullif(trim(new.category),'') is null
    and (tg_op='INSERT' or coalesce(old.maintenance_status,case when old.status in ('closed','resolved') then 'resolved' end,'pending') <> 'resolved') then
    raise exception '結案前請補選故障分類' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function maintenance_private.guard_fault() from public, anon, authenticated;
create trigger maintenance_guard_fault before insert or update on workspace.issues for each row execute function maintenance_private.guard_fault();

create or replace function maintenance_private.audit_fault()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_actor uuid := workspace.current_system_user_id(); v_name text;
begin
  if new.maintenance_status is null then return new; end if;
  if tg_op='INSERT' then v_kind:='created';
  elsif new.maintenance_status is distinct from old.maintenance_status then v_kind:='status';
  elsif new.assignee_user_ids is distinct from old.assignee_user_ids or new.assigned_to is distinct from old.assigned_to then v_kind:='assignees';
  elsif new.handover_message_id is distinct from old.handover_message_id then v_kind:='handover';
  elsif new.title is distinct from old.title or new.asset_identifier is distinct from old.asset_identifier or new.category is distinct from old.category or new.system_id is distinct from old.system_id then v_kind:='edited';
  else return new; end if;
  select coalesce(nullif(display_name,''),username) into v_name from workspace.system_users where id=v_actor;
  insert into workspace.maintenance_messages(issue_id,project_id,actor_id,actor_name,kind,body,metadata)
  values (new.id,new.project_id,v_actor,coalesce(v_name,'帳號已停用'),v_kind,
    case when v_kind='created' then new.title else '' end,
    jsonb_build_object('status',new.maintenance_status,'previous_status',case when tg_op='INSERT' then null else old.maintenance_status end,
      'assignees',new.assigned_to,'previous_assignees',case when tg_op='INSERT' then null else old.assigned_to end,
      'category',new.category,'previous_category',case when tg_op='INSERT' then null else old.category end,
      'title',new.title,'previous_title',case when tg_op='INSERT' then null else old.title end,
      'asset',new.asset_identifier,'handover_message_id',new.handover_message_id));
  return new;
end;
$$;
revoke all on function maintenance_private.audit_fault() from public, anon, authenticated;
create trigger maintenance_audit_fault after insert or update on workspace.issues for each row execute function maintenance_private.audit_fault();

create or replace function workspace.maintenance_workspace(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not maintenance_private.has_access(false) then raise exception '沒有維修檢視權限' using errcode='42501'; end if;
  if not exists(select 1 from workspace.test_projects where id=p_project_id) then raise exception '找不到專案' using errcode='22023'; end if;
  return jsonb_build_object(
    'issues', (select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('system_name',s.system_name,'serial_number',s.serial_number,
      'summary',coalesce(pin.body,(select m.body from workspace.maintenance_messages m where m.issue_id=i.id and m.kind='note' and m.body<>'' order by m.created_at desc,m.id desc limit 1),i.process_notes,'')) order by i.created_at,i.id),'[]'::jsonb)
      from workspace.issues i left join workspace.test_systems s on s.id=i.system_id left join workspace.maintenance_messages pin on pin.id=i.handover_message_id where i.project_id=p_project_id),
    'systems',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'system_name',system_name,'serial_number',serial_number) order by system_name),'[]'::jsonb) from workspace.test_systems where project_id=p_project_id),
    'people',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(display_name,''),username),'username',username) order by coalesce(nullif(display_name,''),username)),'[]'::jsonb) from workspace.system_users where maintenance_private.account_access(id,true)),
    'categories',(select coalesce(jsonb_agg(category order by category),'[]'::jsonb) from (select distinct trim(category) category from workspace.issues where project_id=p_project_id and nullif(trim(category),'') is not null) c)
  );
end;
$$;

create or replace function workspace.maintenance_thread(p_issue_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not maintenance_private.has_access(false) then raise exception '沒有維修檢視權限' using errcode='42501'; end if;
  if not exists(select 1 from workspace.issues where id=p_issue_id) then raise exception '找不到故障紀錄' using errcode='22023'; end if;
  return jsonb_build_object(
    'messages',(select coalesce(jsonb_agg(to_jsonb(m) order by created_at,id),'[]'::jsonb) from workspace.maintenance_messages m where issue_id=p_issue_id),
    'attachments',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at,id),'[]'::jsonb) from workspace.issue_attachments a where issue_id=p_issue_id)
  );
end;
$$;

create or replace function workspace.maintenance_create_fault(p_issue_id uuid,p_project_id uuid,p_asset_identifier text,p_title text,p_system_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_issue workspace.issues; v_asset text:=trim(p_asset_identifier); v_title text:=trim(p_title);
begin
  if not maintenance_private.has_access(true) then raise exception '沒有維修編輯權限' using errcode='42501'; end if;
  if not exists(select 1 from workspace.test_projects where id=p_project_id and not coalesce(is_archived,false)) then raise exception '請選擇可編輯專案' using errcode='22023'; end if;
  if coalesce(length(v_asset),0) not between 1 and 200 or coalesce(length(v_title),0) not between 1 and 300 then raise exception '請填機台識別與一句問題（機台200字、問題300字以內）' using errcode='22023'; end if;
  if p_system_id is not null and not exists(select 1 from workspace.test_systems where id=p_system_id and project_id=p_project_id) then raise exception '機台不屬於目前專案' using errcode='22023'; end if;
  select * into v_issue from workspace.issues where id=p_issue_id;
  if found then
    if v_issue.project_id=p_project_id and v_issue.title=v_title and v_issue.asset_identifier=v_asset and exists(select 1 from workspace.maintenance_messages where issue_id=p_issue_id and kind='created' and actor_id=workspace.current_system_user_id()) then return to_jsonb(v_issue); end if;
    raise exception '這筆識別已使用，請重新建立' using errcode='PT409';
  end if;
  insert into workspace.issues(id,project_id,title,description,asset_identifier,system_id,maintenance_status,status,priority,priority_manual)
    values(p_issue_id,p_project_id,v_title,v_title,v_asset,p_system_id,'pending','open','medium',true) returning * into v_issue;
  return to_jsonb(v_issue);
end;
$$;

create or replace function workspace.maintenance_update_fault(p_issue_id uuid,p_expected_updated_at timestamptz,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_issue workspace.issues; v_status text; v_ids uuid[]; v_names text; v_pin uuid;
begin
  if not maintenance_private.has_access(true) then raise exception '沒有維修編輯權限' using errcode='42501'; end if;
  select * into v_issue from workspace.issues where id=p_issue_id for update;
  if not found then raise exception '找不到故障紀錄' using errcode='22023'; end if;
  if exists(select 1 from workspace.test_projects where id=v_issue.project_id and is_archived) then raise exception '封存專案只能查閱' using errcode='42501'; end if;
  if p_expected_updated_at is null or p_expected_updated_at<>v_issue.updated_at then raise exception '紀錄已由其他人更新，已保留你的修改，請確認最新內容後再儲存' using errcode='PT409',detail=v_issue.updated_at::text; end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'object' or exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('maintenance_status','assignee_user_ids','category','handover_message_id','title','asset_identifier','system_id')) then raise exception '不支援的更新欄位' using errcode='22023'; end if;
  v_status:=coalesce(p_changes->>'maintenance_status',v_issue.maintenance_status,case when v_issue.status in ('resolved','closed') then 'resolved' when v_issue.status='in_progress' then 'repairing' else 'pending' end);
  if v_status not in ('pending','diagnosing','repairing','waiting_parts','resolved') then raise exception '不支援的維修狀態' using errcode='22023'; end if;
  if p_changes ? 'assignee_user_ids' then
    if jsonb_typeof(p_changes->'assignee_user_ids')<>'array' then raise exception '請選擇平台帳號' using errcode='22023'; end if;
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_ids from jsonb_array_elements_text(p_changes->'assignee_user_ids');
    if cardinality(v_ids)>100 or exists(select 1 from unnest(v_ids) x where not maintenance_private.account_access(x,true)) then raise exception '負責人須為可維修的平台帳號' using errcode='22023'; end if;
    select string_agg(coalesce(nullif(display_name,''),username),'、' order by coalesce(nullif(display_name,''),username)) into v_names from workspace.system_users where id=any(v_ids);
  end if;
  if p_changes ? 'handover_message_id' then
    v_pin:=nullif(p_changes->>'handover_message_id','')::uuid;
    if v_pin is not null and not exists(select 1 from workspace.maintenance_messages where id=v_pin and issue_id=p_issue_id and kind='note') then raise exception '只能置頂這筆故障的處理訊息' using errcode='22023'; end if;
  end if;
  if p_changes ? 'title' and coalesce(length(trim(p_changes->>'title')),0) not between 1 and 300 then raise exception '問題名稱須為1至300字' using errcode='22023'; end if;
  if p_changes ? 'asset_identifier' and coalesce(length(trim(p_changes->>'asset_identifier')),0) not between 1 and 200 then raise exception '機台識別須為1至200字' using errcode='22023'; end if;
  if length(coalesce(p_changes->>'category',''))>100 then raise exception '分類須為100字以內' using errcode='22023'; end if;
  update workspace.issues set
    maintenance_status=v_status,
    status=case when p_changes ? 'maintenance_status' then case when v_status='resolved' then 'resolved' when v_status='pending' then 'open' else 'in_progress' end else status end,
    assignee_user_ids=case when p_changes ? 'assignee_user_ids' then v_ids else assignee_user_ids end,
    assigned_to=case when p_changes ? 'assignee_user_ids' then v_names else assigned_to end,
    category=case when p_changes ? 'category' then nullif(trim(p_changes->>'category'),'') else category end,
    handover_message_id=case when p_changes ? 'handover_message_id' then v_pin else handover_message_id end,
    title=case when p_changes ? 'title' then trim(p_changes->>'title') else title end,
    asset_identifier=case when p_changes ? 'asset_identifier' then trim(p_changes->>'asset_identifier') else asset_identifier end,
    system_id=case when p_changes ? 'system_id' then nullif(p_changes->>'system_id','')::uuid else system_id end
  where id=p_issue_id returning * into v_issue;
  return to_jsonb(v_issue);
end;
$$;

create or replace function workspace.maintenance_add_note(p_issue_id uuid,p_message_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_issue workspace.issues; v_note workspace.maintenance_messages; v_actor uuid:=workspace.current_system_user_id(); v_name text;
begin
  if not maintenance_private.has_access(true) then raise exception '沒有維修編輯權限' using errcode='42501'; end if;
  select * into v_issue from workspace.issues where id=p_issue_id for update;
  if not found then raise exception '找不到故障紀錄' using errcode='22023'; end if;
  if exists(select 1 from workspace.test_projects where id=v_issue.project_id and is_archived) then raise exception '封存專案只能查閱' using errcode='42501'; end if;
  if length(coalesce(p_body,''))>20000 then raise exception '訊息須為20000字以內' using errcode='22023'; end if;
  select * into v_note from workspace.maintenance_messages where id=p_message_id;
  if found then
    if v_note.issue_id=p_issue_id and v_note.actor_id=v_actor and v_note.body=trim(coalesce(p_body,'')) then return to_jsonb(v_note); end if;
    raise exception '訊息識別已使用' using errcode='PT409';
  end if;
  select coalesce(nullif(display_name,''),username) into v_name from workspace.system_users where id=v_actor;
  insert into workspace.maintenance_messages(id,issue_id,project_id,actor_id,actor_name,kind,body)
  values(p_message_id,p_issue_id,v_issue.project_id,v_actor,v_name,'note',trim(coalesce(p_body,''))) returning * into v_note;
  update workspace.issues set updated_at=clock_timestamp() where id=p_issue_id;
  return to_jsonb(v_note);
end;
$$;

create or replace function workspace.maintenance_add_attachment(p_issue_id uuid,p_message_id uuid,p_file jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_path text:=p_file->>'file_path'; v_id uuid:=(p_file->>'id')::uuid; v_attachment workspace.issue_attachments;
begin
  if not maintenance_private.has_access(true) then raise exception '沒有維修編輯權限' using errcode='42501'; end if;
  if not exists(select 1 from workspace.maintenance_messages m join workspace.issues i on i.id=m.issue_id join workspace.test_projects p on p.id=i.project_id
    where m.id=p_message_id and m.issue_id=p_issue_id and m.actor_id=workspace.current_system_user_id() and m.kind in ('note','created') and not coalesce(p.is_archived,false)) then raise exception '附件不屬於你的這則訊息' using errcode='42501'; end if;
  if v_path not like p_issue_id::text||'/'||p_message_id::text||'/%' or length(coalesce(p_file->>'file_name','')) not between 1 and 255 or (p_file->>'file_size')::bigint not between 1 and 52428800 then raise exception '附件資料或路徑不正確（每檔50MB以內）' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects where bucket_id='issue-attachments' and name=v_path) then raise exception '附件尚未上傳完成' using errcode='22023'; end if;
  select * into v_attachment from workspace.issue_attachments where id=v_id;
  if found then
    if v_attachment.issue_id=p_issue_id and v_attachment.file_path=v_path then return to_jsonb(v_attachment); end if;
    raise exception '附件識別已使用' using errcode='PT409';
  end if;
  insert into workspace.issue_attachments(id,issue_id,maintenance_message_id,file_name,file_path,file_size,file_type)
  values(v_id,p_issue_id,p_message_id,p_file->>'file_name',v_path,(p_file->>'file_size')::bigint,p_file->>'file_type') returning * into v_attachment;
  update workspace.issues set updated_at=clock_timestamp() where id=p_issue_id;
  return to_jsonb(v_attachment);
end;
$$;

revoke all on function workspace.maintenance_workspace(uuid), workspace.maintenance_thread(uuid),
  workspace.maintenance_create_fault(uuid,uuid,text,text,uuid), workspace.maintenance_update_fault(uuid,timestamptz,jsonb),
  workspace.maintenance_add_note(uuid,uuid,text), workspace.maintenance_add_attachment(uuid,uuid,jsonb) from public, anon;
grant execute on function workspace.maintenance_workspace(uuid), workspace.maintenance_thread(uuid),
  workspace.maintenance_create_fault(uuid,uuid,text,text,uuid), workspace.maintenance_update_fault(uuid,timestamptz,jsonb),
  workspace.maintenance_add_note(uuid,uuid,text), workspace.maintenance_add_attachment(uuid,uuid,jsonb) to authenticated;

-- Fail the entire transaction if any original ID or field was lost or changed.
do $$ declare v_after jsonb; begin
  select coalesce(jsonb_object_agg(id::text,to_jsonb(t)-array['maintenance_status','asset_identifier','assignee_user_ids','handover_message_id']),'{}'::jsonb) into v_after from workspace.issues t;
  if v_after is distinct from (select records from maintenance_original_rows where kind='issues') then raise exception '原故障資料移植核對失敗，全部回復'; end if;
  select coalesce(jsonb_object_agg(id::text,to_jsonb(t)-'maintenance_message_id'),'{}'::jsonb) into v_after from workspace.issue_attachments t;
  if v_after is distinct from (select records from maintenance_original_rows where kind='attachments') then raise exception '原附件資料移植核對失敗，全部回復'; end if;
end $$;
notify pgrst, 'reload schema';
commit;
