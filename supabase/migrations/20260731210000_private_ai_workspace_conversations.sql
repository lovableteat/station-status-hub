-- Keep AI workspace conversations private to the authenticated system account.
-- Conversation content is cloud-backed so the same account can continue on
-- another computer without exposing history to other accounts.

create table if not exists public.ai_workspace_conversations (
  owner_id uuid not null references public.system_users(id) on delete cascade,
  conversation_key text not null,
  title text not null,
  saved_at bigint not null,
  draft_message text not null default '',
  messages jsonb not null default '[]'::jsonb,
  provider text not null default '',
  model text not null default '',
  key_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, conversation_key),
  constraint ai_workspace_conversation_key_length
    check (char_length(conversation_key) between 1 and 160),
  constraint ai_workspace_conversation_title_length
    check (char_length(title) between 1 and 160),
  constraint ai_workspace_messages_are_array
    check (jsonb_typeof(messages) = 'array'),
  constraint ai_workspace_conversation_payload_limit
    check (octet_length(messages::text) <= 4194304),
  constraint ai_workspace_draft_limit
    check (char_length(draft_message) <= 100000)
);

create index if not exists ai_workspace_conversations_owner_saved_idx
  on public.ai_workspace_conversations (owner_id, saved_at desc);

alter table public.ai_workspace_conversations enable row level security;

drop policy if exists "Account owners can read private AI conversations"
  on public.ai_workspace_conversations;
create policy "Account owners can read private AI conversations"
  on public.ai_workspace_conversations
  for select
  to authenticated
  using (owner_id = public.current_system_user_id());

revoke all on table public.ai_workspace_conversations from anon;
revoke all on table public.ai_workspace_conversations from authenticated;
grant select on table public.ai_workspace_conversations to authenticated;

create or replace function public.sync_ai_workspace_conversations(
  p_owner_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_owner_id uuid := public.current_system_user_id();
  v_count integer := 0;
begin
  if v_owner_id is null or v_owner_id <> p_owner_id then
    raise exception 'AI workspace account does not match the authenticated user'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'AI workspace conversations must be a JSON array'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 24 then
    raise exception 'AI workspace stores at most 24 conversations'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as entries(item)
    where nullif(btrim(item ->> 'id'), '') is null
      or jsonb_typeof(coalesce(item -> 'messages', '[]'::jsonb)) <> 'array'
      or octet_length(coalesce(item -> 'messages', '[]'::jsonb)::text) > 4194304
      or char_length(coalesce(item ->> 'draftMessage', '')) > 100000
  ) then
    raise exception 'AI workspace conversation payload is invalid or too large'
      using errcode = '22023';
  end if;

  delete from public.ai_workspace_conversations as existing
  where existing.owner_id = v_owner_id
    and not exists (
      select 1
      from jsonb_array_elements(p_items) as entries(item)
      where left(btrim(item ->> 'id'), 160) = existing.conversation_key
    );

  insert into public.ai_workspace_conversations (
    owner_id,
    conversation_key,
    title,
    saved_at,
    draft_message,
    messages,
    provider,
    model,
    key_label,
    updated_at
  )
  select
    v_owner_id,
    left(btrim(item ->> 'id'), 160),
    left(coalesce(nullif(btrim(item ->> 'title'), ''), '新對話'), 160),
    case
      when coalesce(item ->> 'savedAt', '') ~ '^[0-9]{1,16}$'
        then (item ->> 'savedAt')::bigint
      else floor(extract(epoch from clock_timestamp()) * 1000)::bigint
    end,
    left(coalesce(item ->> 'draftMessage', ''), 100000),
    coalesce(item -> 'messages', '[]'::jsonb),
    left(coalesce(item ->> 'provider', ''), 100),
    left(coalesce(item ->> 'model', ''), 160),
    left(coalesce(item ->> 'keyLabel', ''), 160),
    now()
  from jsonb_array_elements(p_items) as entries(item)
  on conflict (owner_id, conversation_key) do update
  set
    title = excluded.title,
    saved_at = excluded.saved_at,
    draft_message = excluded.draft_message,
    messages = excluded.messages,
    provider = excluded.provider,
    model = excluded.model,
    key_label = excluded.key_label,
    updated_at = now();

  select count(*)::integer
  into v_count
  from public.ai_workspace_conversations
  where owner_id = v_owner_id;

  return v_count;
end;
$$;

revoke all on function public.sync_ai_workspace_conversations(uuid, jsonb) from public;
revoke all on function public.sync_ai_workspace_conversations(uuid, jsonb) from anon;
grant execute on function public.sync_ai_workspace_conversations(uuid, jsonb)
  to authenticated, service_role;
