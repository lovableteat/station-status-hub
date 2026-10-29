begin;
set local lock_timeout = '5s';

-- Some installations predate the optional BOM audit tables. Note must save
-- against the core BOM record table without depending on those extensions.
create or replace function workspace.save_material_bom_note(
  p_workspace_id text,
  p_record_id text,
  p_note text,
  p_expected_note text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  saved workspace.material_bom_records%rowtype;
  version_metadata jsonb;
begin
  if auth.uid() is null or not rlc_priority_private.has_access(false) then
    raise exception '沒有料號工作區權限' using errcode = '42501';
  end if;
  if p_note is null or p_expected_note is null or char_length(p_note) > 4000 then
    raise exception 'Note 最多 4000 字' using errcode = '22023';
  end if;
  select column_order into version_metadata from workspace.ui_table_preferences
    where table_key = 'material-bom-version:' || p_workspace_id for share;
  if version_metadata ->> 'isCurrent' = 'false' then
    raise exception '歷史版本僅供檢視，請切換目前版本' using errcode = '42501';
  end if;
  select * into saved from workspace.material_bom_records
    where workspace_id = p_workspace_id and record_id = p_record_id for update;
  if not found then
    raise exception '找不到這筆料件' using errcode = 'P0002';
  end if;
  if coalesce(saved.data ->> 'note', '') is distinct from p_expected_note then
    raise exception 'Note 已由其他使用者更新' using errcode = '40001';
  end if;
  if coalesce(saved.data ->> 'note', '') = p_note then
    return jsonb_build_object('data', saved.data, 'updated_at', saved.updated_at);
  end if;
  update workspace.material_bom_records
    set data = jsonb_set(coalesce(data, '{}'::jsonb), '{note}', to_jsonb(p_note), true)
    where workspace_id = p_workspace_id and record_id = p_record_id
    returning * into saved;
  return jsonb_build_object('data', saved.data, 'updated_at', saved.updated_at);
end;
$$;
revoke all on function workspace.save_material_bom_note(text, text, text, text) from public, anon;
grant execute on function workspace.save_material_bom_note(text, text, text, text) to authenticated;
commit;
