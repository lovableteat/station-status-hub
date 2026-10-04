create index if not exists ai_model_usage_events_actor_user_id_idx
  on workspace.ai_model_usage_events (actor_user_id);
