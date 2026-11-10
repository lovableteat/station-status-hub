create or replace function maintenance_private.audit_fault()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_actor uuid := workspace.current_system_user_id(); v_name text;
begin
  if new.maintenance_status is null then return new; end if;
  if tg_op='INSERT' then v_kind:='created';
  elsif new.maintenance_status is distinct from coalesce(old.maintenance_status,case when old.status in ('closed','resolved') then 'resolved' when old.status='in_progress' then 'repairing' else 'pending' end) then v_kind:='status';
  elsif new.assignee_user_ids is distinct from old.assignee_user_ids or new.assigned_to is distinct from old.assigned_to then v_kind:='assignees';
  elsif new.handover_message_id is distinct from old.handover_message_id then v_kind:='handover';
  elsif new.title is distinct from old.title or new.asset_identifier is distinct from old.asset_identifier or new.category is distinct from old.category or new.system_id is distinct from old.system_id then v_kind:='edited';
  else return new; end if;
  select coalesce(nullif(display_name,''),username) into v_name from workspace.system_users where id=v_actor;
  insert into workspace.maintenance_messages(issue_id,project_id,actor_id,actor_name,kind,body,metadata)
  values (new.id,new.project_id,v_actor,coalesce(v_name,'帳號已停用'),v_kind,
    case when v_kind='created' then new.title else '' end,
    jsonb_build_object('status',new.maintenance_status,'previous_status',case when tg_op='INSERT' then null else coalesce(old.maintenance_status,case when old.status in ('closed','resolved') then 'resolved' when old.status='in_progress' then 'repairing' else 'pending' end) end, 'previous_legacy_status',case when tg_op='INSERT' then null else old.status end,
      'assignees',new.assigned_to,'previous_assignees',case when tg_op='INSERT' then null else old.assigned_to end,
      'category',new.category,'previous_category',case when tg_op='INSERT' then null else old.category end,
      'title',new.title,'previous_title',case when tg_op='INSERT' then null else old.title end,
      'asset',new.asset_identifier,'handover_message_id',new.handover_message_id));
  return new;
end;
$$;
