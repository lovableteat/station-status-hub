begin;
set local lock_timeout = '5s';

alter table workspace.circuit_change_items
  add column removed_at timestamptz,
  add column removed_by uuid,
  add constraint circuit_change_items_removed_actor check ((removed_at is null) = (removed_by is null));

alter table workspace.circuit_change_events drop constraint circuit_change_events_type_check;
alter table workspace.circuit_change_events add constraint circuit_change_events_type_check
  check (type in ('created','edited','submit','approve','request_changes','comment','removed','restored'));

-- Removed items retain their immutable history and image paths, but cannot accept ordinary edits or Review actions.
create function circuit_change_private.guard_removed_item() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.removed_at is not null and new.removed_at is not null then
    raise exception '此修改已移除，請先還原後再操作' using errcode='PT409';
  end if;
  return new;
end;
$$;
revoke all on function circuit_change_private.guard_removed_item() from public, anon, authenticated;
create trigger circuit_change_items_guard_removed before update on workspace.circuit_change_items
for each row execute function circuit_change_private.guard_removed_item();

create function workspace.circuit_change_set_removed(p_item_id uuid,p_expected_revision integer,p_removed boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid; saved workspace.circuit_change_items; item_set_id uuid;
begin
  actor := circuit_change_private.actor_id();
  if p_removed is null or p_expected_revision is null or p_expected_revision<1 then
    raise exception '移除或還原的修改版本不正確' using errcode='22023';
  end if;
  select set_id into item_set_id from workspace.circuit_change_items where id=p_item_id;
  if not found then raise exception '找不到修改項目' using errcode='P0002'; end if;
  -- Match the parent/item lock order of existing save and Review writers.
  perform 1 from workspace.circuit_change_sets where id=item_set_id for update;
  select * into saved from workspace.circuit_change_items where id=p_item_id for update;
  if saved.revision<>p_expected_revision then
    raise exception '其他人已更新此項目，請保留草稿並核對最新版本' using errcode='PT409';
  end if;
  if (saved.removed_at is not null)=p_removed then return to_jsonb(saved); end if;
  update workspace.circuit_change_items set
    removed_at=case when p_removed then clock_timestamp() else null end,
    removed_by=case when p_removed then actor else null end,
    revision=revision+1,updated_by=actor,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
  where id=p_item_id returning * into saved;
  perform circuit_change_private.record_event(saved,case when p_removed then 'removed' else 'restored' end,'',actor);
  return to_jsonb(saved);
end;
$$;
revoke all on function workspace.circuit_change_set_removed(uuid,integer,boolean) from public, anon;
grant execute on function workspace.circuit_change_set_removed(uuid,integer,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
