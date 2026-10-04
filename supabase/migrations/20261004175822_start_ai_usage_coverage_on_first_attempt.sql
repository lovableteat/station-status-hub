alter table workspace.ai_model_usage_tracking_state
  alter column tracking_started_at drop not null;

update workspace.ai_model_usage_tracking_state as state
set tracking_started_at = (
  select min(events.started_at)
  from workspace.ai_model_usage_events as events
)
where state.singleton;

create or replace function workspace.mark_ai_model_usage_tracking_started()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update workspace.ai_model_usage_tracking_state as state
  set tracking_started_at = coalesce(state.tracking_started_at, new.started_at)
  where state.singleton;

  return new;
end;
$$;

revoke all on function workspace.mark_ai_model_usage_tracking_started()
  from public, anon, authenticated;
grant execute on function workspace.mark_ai_model_usage_tracking_started()
  to service_role;

create trigger mark_ai_model_usage_tracking_started
after insert on workspace.ai_model_usage_events
for each row execute function workspace.mark_ai_model_usage_tracking_started();

comment on function workspace.mark_ai_model_usage_tracking_started() is
  'Starts completeness coverage at the first provider attempt that this application actually records.';
