-- Match the official OpenAI proxy's one-use Sol route while keeping GPT-5.4 as the saved model.
create or replace function workspace.start_ai_model_usage_attempt(
  p_event_id uuid,
  p_api_key_id uuid,
  p_provider text,
  p_model text,
  p_source text,
  p_attempt_number integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := workspace.current_system_user_id();
  v_inserted_id uuid;
  v_started_at timestamptz;
begin
  if v_actor is null
    or not coalesce(workspace.current_user_can_workspace('ai-chat', 'view'), false) then
    raise exception 'AI usage tracking requires AI workspace access' using errcode = '42501';
  end if;

  if p_event_id is null or p_api_key_id is null then
    raise exception 'event and API key identifiers are required' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_provider, ''))) !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then
    raise exception 'invalid provider' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_model, ''))) not between 1 and 160 then
    raise exception 'invalid model' using errcode = '22023';
  end if;
  if p_source not in ('ai-chat', 'api-test') then
    raise exception 'invalid usage source' using errcode = '22023';
  end if;
  if p_attempt_number not between 1 and 20 then
    raise exception 'invalid attempt number' using errcode = '22023';
  end if;

  insert into workspace.ai_model_usage_events (
    event_id,
    api_key_id,
    actor_user_id,
    provider,
    model,
    source,
    attempt_number
  )
  select
    p_event_id,
    api_keys.id,
    v_actor,
    lower(btrim(p_provider)),
    btrim(p_model),
    p_source,
    p_attempt_number
  from workspace.api_keys as api_keys
  where api_keys.id = p_api_key_id
    and api_keys.is_active
    and (api_keys.expires_at is null or api_keys.expires_at > clock_timestamp())
    and lower(coalesce(api_keys.permissions -> 'metadata' ->> 'provider', '')) = lower(btrim(p_provider))
    and (
      (
        lower(btrim(p_provider)) = 'gemini'
        and btrim(p_model) in ('gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash')
      )
      or (
        lower(btrim(p_provider)) <> 'gemini'
        and (
          coalesce(api_keys.permissions -> 'metadata' ->> 'model', '') = btrim(p_model)
          or (
            lower(btrim(p_provider)) = 'openai'
            and btrim(api_keys.permissions -> 'metadata' ->> 'model') = 'gpt-5.4'
            and rtrim(btrim(api_keys.permissions -> 'metadata' ->> 'baseUrl'), '/') = 'https://api.openai.com/v1'
            and btrim(p_model) = 'gpt-6.1-sol'
          )
        )
      )
    )
  on conflict (event_id) do nothing
  returning event_id, started_at into v_inserted_id, v_started_at;

  if v_inserted_id is null then
    select events.started_at
      into v_started_at
    from workspace.ai_model_usage_events as events
    where events.event_id = p_event_id
      and events.api_key_id = p_api_key_id
      and events.actor_user_id = v_actor
      and events.provider = lower(btrim(p_provider))
      and events.model = btrim(p_model)
      and events.source = p_source
      and events.attempt_number = p_attempt_number;

    if v_started_at is null then
      if not exists (
        select 1 from workspace.api_keys as api_keys
        where api_keys.id = p_api_key_id
          and api_keys.is_active
          and (api_keys.expires_at is null or api_keys.expires_at > clock_timestamp())
          and lower(coalesce(api_keys.permissions -> 'metadata' ->> 'provider', '')) = lower(btrim(p_provider))
          and (
            (
              lower(btrim(p_provider)) = 'gemini'
              and btrim(p_model) in ('gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash')
            )
            or (
              lower(btrim(p_provider)) <> 'gemini'
              and (
                coalesce(api_keys.permissions -> 'metadata' ->> 'model', '') = btrim(p_model)
                or (
                  lower(btrim(p_provider)) = 'openai'
                  and btrim(api_keys.permissions -> 'metadata' ->> 'model') = 'gpt-5.4'
                  and rtrim(btrim(api_keys.permissions -> 'metadata' ->> 'baseUrl'), '/') = 'https://api.openai.com/v1'
                  and btrim(p_model) = 'gpt-6.1-sol'
                )
              )
            )
          )
      ) then
        raise exception 'API key is unavailable' using errcode = '22023';
      end if;
      raise exception 'event identifier is already used by another attempt' using errcode = '23505';
    end if;

    return jsonb_build_object(
      'event_id', p_event_id,
      'started_at', v_started_at,
      'duplicate', true
    );
  end if;

  update workspace.api_keys as api_keys
  set usage_count = api_keys.usage_count + 1,
      last_used_at = greatest(coalesce(api_keys.last_used_at, v_started_at), v_started_at),
      updated_at = clock_timestamp()
  where api_keys.id = p_api_key_id;

  return jsonb_build_object(
    'event_id', v_inserted_id,
    'started_at', v_started_at,
    'duplicate', false
  );
end;
$$;
