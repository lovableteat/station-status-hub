begin;
set local lock_timeout = '5s';

-- The render cache uses the workspace revision. A Note-only write must advance
-- it too, so another account/reload cannot reuse an older record snapshot.
create function workspace.touch_material_bom_note_workspace() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update workspace.material_bom_workspaces set updated_at = now()
    where id = new.workspace_id;
  return new;
end;
$$;
revoke all on function workspace.touch_material_bom_note_workspace() from public, anon;
grant execute on function workspace.touch_material_bom_note_workspace() to authenticated, service_role;
create trigger refresh_material_bom_note_workspace
after update of data on workspace.material_bom_records
for each row when (old.data -> 'note' is distinct from new.data -> 'note')
execute function workspace.touch_material_bom_note_workspace();
commit;
