-- Create return notifications from the verified review and organization rows.
-- The browser must not have to duplicate the private hierarchy check or write
-- directly through the notification RLS policy after the review was saved.
create or replace function workspace.ensure_performance_return_notification(
  p_review_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := workspace.current_system_user_id();
  v_review workspace.performance_reviews%rowtype;
  v_recipient uuid;
  v_notification_id uuid;
begin
  if v_actor is null then
    raise exception 'Authenticated account required' using errcode = '42501';
  end if;

  select * into v_review
  from workspace.performance_reviews
  where id = p_review_id;

  if not found then
    raise exception 'Performance review not found' using errcode = 'P0002';
  end if;

  v_recipient := workspace.resolve_performance_employee(v_review.employee_id);
  if v_recipient is null or not exists (
    select 1
    from workspace.system_users recipient
    where recipient.id = v_recipient
      and recipient.status = 'active'
  ) then
    raise exception 'Performance review recipient is unavailable' using errcode = '22023';
  end if;

  if v_review.status <> 'in-progress'
     or not workspace.can_manage_performance_record(
       v_review.employee_id,
       v_review.reviewer_name,
       v_review.privacy_scope_ids
     ) then
    raise exception 'Only the assigned supervisor can notify a returned review'
      using errcode = '42501';
  end if;

  -- Serialize retries for one review. A lost response may safely call this
  -- function again without creating duplicate unread notifications.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_review_id::text, 0)
  );

  select notification.id into v_notification_id
  from workspace.user_notifications notification
  where notification.recipient_id = v_recipient
    and notification.sender_id = v_actor
    and notification.notification_type = 'performance_review_returned'
    and notification.reference_type = 'performance_review'
    and notification.reference_id = p_review_id
    and notification.archived_at is null
    and notification.is_read = false
  order by notification.created_at desc
  limit 1
  for update;

  if v_notification_id is not null then
    update workspace.user_notifications
    set
      title = '績效自評已退回補充',
      message = '直屬主管已退回你的本期自評，請查看退回回饋並補充後重新送出。',
      metadata = jsonb_build_object(
        'module', 'performance',
        'performance_tab', 'self',
        'cycle_id', v_review.cycle_id,
        'review_id', v_review.id,
        'employee_name', v_review.employee_name
      ),
      priority = 'high',
      status = 'pending',
      updated_at = clock_timestamp()
    where id = v_notification_id;
    return v_notification_id;
  end if;

  insert into workspace.user_notifications (
    recipient_id,
    sender_id,
    notification_type,
    title,
    message,
    reference_type,
    reference_id,
    metadata,
    category,
    priority,
    status,
    is_read
  ) values (
    v_recipient,
    v_actor,
    'performance_review_returned',
    '績效自評已退回補充',
    '直屬主管已退回你的本期自評，請查看退回回饋並補充後重新送出。',
    'performance_review',
    v_review.id,
    jsonb_build_object(
      'module', 'performance',
      'performance_tab', 'self',
      'cycle_id', v_review.cycle_id,
      'review_id', v_review.id,
      'employee_name', v_review.employee_name
    ),
    'performance',
    'high',
    'pending',
    false
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

revoke all on function workspace.ensure_performance_return_notification(uuid)
  from public, anon;
grant execute on function workspace.ensure_performance_return_notification(uuid)
  to authenticated, service_role;

create or replace function workspace.notify_returned_performance_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'submitted' and new.status = 'in-progress' then
    perform workspace.ensure_performance_return_notification(new.id);
  end if;
  return new;
end;
$$;

revoke all on function workspace.notify_returned_performance_review()
  from public, anon, authenticated;

drop trigger if exists notify_returned_performance_review
  on workspace.performance_reviews;
create trigger notify_returned_performance_review
after update of status on workspace.performance_reviews
for each row
when (old.status is distinct from new.status)
execute function workspace.notify_returned_performance_review();

notify pgrst, 'reload schema';
