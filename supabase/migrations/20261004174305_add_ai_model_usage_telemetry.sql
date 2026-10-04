-- Records only this application's provider attempts. It does not represent the
-- Google project's authoritative usage because other sites and keys may share it.
create table workspace.ai_model_usage_tracking_state (
  singleton boolean primary key default true check (singleton),
  tracking_started_at timestamptz not null default clock_timestamp()
);

insert into workspace.ai_model_usage_tracking_state (singleton)
values (true)
on conflict (singleton) do nothing;

create table workspace.ai_model_usage_events (
  event_id uuid primary key,
  api_key_id uuid not null references workspace.api_keys(id) on delete cascade,
  actor_user_id uuid references workspace.system_users(id) on delete set null,
  provider text not null check (provider = lower(provider) and char_length(provider) between 1 and 64),
  model text not null check (char_length(model) between 1 and 160),
  source text not null check (source in ('ai-chat', 'api-test')),
  attempt_number integer not null check (attempt_number between 1 and 20),
  outcome text not null default 'started'
    check (outcome in ('started', 'succeeded', 'http_error', 'rate_limited', 'timeout', 'network_error')),
  http_status integer check (http_status between 100 and 599),
  duration_ms integer check (duration_ms between 0 and 900000),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  check (
    (outcome = 'started' and finished_at is null)
    or (outcome <> 'started' and finished_at is not null)
  )
);

create index ai_model_usage_events_target_time_idx
  on workspace.ai_model_usage_events (api_key_id, model, started_at desc);
create index ai_model_usage_events_outcome_time_idx
  on workspace.ai_model_usage_events (outcome, started_at desc);

alter table workspace.ai_model_usage_tracking_state enable row level security;
alter table workspace.ai_model_usage_events enable row level security;

revoke all on table workspace.ai_model_usage_tracking_state from public, anon, authenticated;
revoke all on table workspace.ai_model_usage_events from public, anon, authenticated;
grant all on table workspace.ai_model_usage_tracking_state to service_role;
grant all on table workspace.ai_model_usage_events to service_role;

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
        and coalesce(api_keys.permissions -> 'metadata' ->> 'model', '') = btrim(p_model)
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
              and coalesce(api_keys.permissions -> 'metadata' ->> 'model', '') = btrim(p_model)
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

create or replace function workspace.finish_ai_model_usage_attempt(
  p_event_id uuid,
  p_outcome text,
  p_http_status integer default null,
  p_duration_ms integer default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := workspace.current_system_user_id();
  v_event workspace.ai_model_usage_events%rowtype;
begin
  if v_actor is null
    or not coalesce(workspace.current_user_can_workspace('ai-chat', 'view'), false) then
    raise exception 'AI usage tracking requires AI workspace access' using errcode = '42501';
  end if;
  if p_outcome not in ('succeeded', 'http_error', 'rate_limited', 'timeout', 'network_error') then
    raise exception 'invalid terminal outcome' using errcode = '22023';
  end if;
  if p_http_status is not null and p_http_status not between 100 and 599 then
    raise exception 'invalid HTTP status' using errcode = '22023';
  end if;
  if p_duration_ms is not null and p_duration_ms not between 0 and 900000 then
    raise exception 'invalid duration' using errcode = '22023';
  end if;

  update workspace.ai_model_usage_events as events
  set outcome = p_outcome,
      http_status = p_http_status,
      duration_ms = p_duration_ms,
      finished_at = clock_timestamp()
  where events.event_id = p_event_id
    and events.actor_user_id = v_actor
    and events.outcome = 'started'
  returning events.* into v_event;

  if v_event.event_id is null then
    select events.* into v_event
    from workspace.ai_model_usage_events as events
    where events.event_id = p_event_id
      and events.actor_user_id = v_actor;
  end if;

  if v_event.event_id is null then
    raise exception 'usage event was not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'event_id', v_event.event_id,
    'outcome', v_event.outcome,
    'finished_at', v_event.finished_at
  );
end;
$$;

create or replace function workspace.get_ai_model_usage_summary(
  p_api_key_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := workspace.current_system_user_id();
  v_now timestamptz := clock_timestamp();
  v_tracking_started_at timestamptz;
  v_targets jsonb;
begin
  if v_actor is null
    or not coalesce(workspace.current_user_can_workspace('ai-chat', 'view'), false) then
    raise exception 'AI usage summary requires AI workspace access' using errcode = '42501';
  end if;
  if p_api_key_ids is null or cardinality(p_api_key_ids) not between 1 and 100 then
    raise exception 'one to one hundred API key identifiers are required' using errcode = '22023';
  end if;

  select state.tracking_started_at into v_tracking_started_at
  from workspace.ai_model_usage_tracking_state as state
  where state.singleton;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'api_key_id', summaries.api_key_id,
        'provider', summaries.provider,
        'model', summaries.model,
        'minute_attempts', summaries.minute_attempts,
        'pacific_day_attempts', summaries.pacific_day_attempts,
        'total_attempts', summaries.total_attempts,
        'succeeded_attempts', summaries.succeeded_attempts,
        'rate_limited_attempts', summaries.rate_limited_attempts,
        'timeout_attempts', summaries.timeout_attempts,
        'failed_attempts', summaries.failed_attempts,
        'in_flight_attempts', summaries.in_flight_attempts
      ) order by summaries.api_key_id, summaries.model
    ),
    '[]'::jsonb
  ) into v_targets
  from (
    select
      events.api_key_id,
      events.provider,
      events.model,
      count(*) filter (
        where events.started_at >= clock_timestamp() - interval '60 seconds'
      )::integer as minute_attempts,
      count(*) filter (
        where events.started_at >= (
          date_trunc('day', clock_timestamp() at time zone 'America/Los_Angeles')
          at time zone 'America/Los_Angeles'
        )
      )::integer as pacific_day_attempts,
      count(*)::integer as total_attempts,
      count(*) filter (where events.outcome = 'succeeded')::integer as succeeded_attempts,
      count(*) filter (where events.outcome = 'rate_limited')::integer as rate_limited_attempts,
      count(*) filter (where events.outcome = 'timeout')::integer as timeout_attempts,
      count(*) filter (
        where events.outcome in ('http_error', 'rate_limited', 'timeout', 'network_error')
      )::integer as failed_attempts,
      count(*) filter (where events.outcome = 'started')::integer as in_flight_attempts
    from workspace.ai_model_usage_events as events
    where events.api_key_id = any(p_api_key_ids)
    group by events.api_key_id, events.provider, events.model
  ) as summaries;

  return jsonb_build_object(
    'generated_at', v_now,
    'tracking_started_at', v_tracking_started_at,
    'pacific_day_started_at', (
      date_trunc('day', v_now at time zone 'America/Los_Angeles')
      at time zone 'America/Los_Angeles'
    ),
    'targets', v_targets
  );
end;
$$;

revoke all on function workspace.start_ai_model_usage_attempt(uuid, uuid, text, text, text, integer) from public, anon;
revoke all on function workspace.finish_ai_model_usage_attempt(uuid, text, integer, integer) from public, anon;
revoke all on function workspace.get_ai_model_usage_summary(uuid[]) from public, anon;

grant execute on function workspace.start_ai_model_usage_attempt(uuid, uuid, text, text, text, integer) to authenticated, service_role;
grant execute on function workspace.finish_ai_model_usage_attempt(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function workspace.get_ai_model_usage_summary(uuid[]) to authenticated, service_role;

comment on table workspace.ai_model_usage_events is
  'One row per actual provider attempt made by this application; excludes usage from other clients sharing the provider project.';
comment on function workspace.get_ai_model_usage_summary(uuid[]) is
  'Returns aggregate app-observed attempts only; never an authoritative provider-project remaining quota.';
