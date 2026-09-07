-- Keep the single per-user inbox channel authoritative for conversation-list
-- changes.  Payloads contain identifiers only; clients re-query rows through
-- their existing RLS policies before rendering message content.
create or replace function workspace.broadcast_chat_inbox_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := coalesce(to_jsonb(new), '{}'::jsonb);
  v_old jsonb := coalesce(to_jsonb(old), '{}'::jsonb);
  v_thread_id uuid := coalesce(
    nullif(v_new ->> 'thread_id', '')::uuid,
    nullif(v_old ->> 'thread_id', '')::uuid
  );
  v_record_id text := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_member record;
begin
  if v_thread_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  for v_member in
    select member.user_id
    from workspace.chat_members member
    where member.thread_id = v_thread_id
  loop
    perform realtime.send(
      jsonb_build_object(
        'table', tg_table_name,
        'thread_id', v_thread_id::text,
        'record_id', v_record_id
      ),
      tg_op,
      'chat-inbox:' || v_member.user_id::text,
      true
    );
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function workspace.broadcast_chat_inbox_change() from public, anon;

drop trigger if exists chat_messages_inbox_broadcast
  on workspace.chat_messages;
create trigger chat_messages_inbox_broadcast
after insert or update or delete on workspace.chat_messages
for each row execute function workspace.broadcast_chat_inbox_change();
