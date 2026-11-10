begin;
-- New maintenance actions must not reset the read-only test archive.
drop trigger sync_reopened_issue_to_test_progress on workspace.issues;
create trigger sync_reopened_issue_to_test_progress
  after insert or update of status,project_id,system_id,station_id,test_item_id on workspace.issues
  for each row when (new.maintenance_status is null)
  execute function workspace.sync_reopened_issue_to_test_progress();

create function maintenance_private.touch_fault()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.maintenance_status is not null or exists(select 1 from workspace.maintenance_messages where issue_id=new.id) then
    new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  end if;
  return new;
end;
$$;
revoke all on function maintenance_private.touch_fault() from public,anon,authenticated;
create trigger zz_maintenance_timestamp before update on workspace.issues for each row execute function maintenance_private.touch_fault();
commit;
