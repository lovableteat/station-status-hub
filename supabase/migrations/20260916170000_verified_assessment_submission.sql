-- Review identifiers are TEXT (including performance-<uuid>); generic notification
-- reference_id remains UUID. Store the exact review identity in metadata.
begin;
drop function if exists workspace.ensure_performance_return_notification(uuid);
create or replace function workspace.ensure_performance_return_notification(
  p_review_id text
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
    and notification.metadata ->> 'review_id' = p_review_id
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
    null,
    jsonb_build_object(
      'module', 'performance',
      'performance_tab', 'self',
      'cycle_id', v_review.cycle_id,
      'review_id', v_review.id,
      'employee_name', v_review.employee_name
    ),
    'system',
    'high',
    'pending',
    false
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;


revoke all on function workspace.ensure_performance_return_notification(text) from public, anon;
grant execute on function workspace.ensure_performance_return_notification(text) to authenticated, service_role;

create or replace function workspace.notify_returned_performance_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'in-progress' and old.status in ('submitted', 'approved') then
    perform workspace.ensure_performance_return_notification(new.id);
  end if;
  return new;
end;
$$;

-- One committed request receipt makes a lost response safely retryable. No scores
-- or employee content are stored in this internal table.
create table if not exists workspace.performance_submission_receipts (
  request_id uuid primary key,
  actor_id uuid not null,
  review_id text not null,
  action text not null,
  mode text not null,
  request_hash text not null,
  result_version timestamptz not null,
  notification_id uuid,
  created_at timestamptz not null default now()
);
alter table workspace.performance_submission_receipts enable row level security;
revoke all on workspace.performance_submission_receipts from public, anon, authenticated;

create or replace function workspace.submit_performance_assessment(
  p_request_id uuid, p_review jsonb, p_mode text, p_action text,
  p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := workspace.current_system_user_id();
  v_id text := p_review ->> 'id';
  v_row workspace.performance_reviews%rowtype;
  v_receipt workspace.performance_submission_receipts%rowtype;
  v_exists boolean;
  v_notification uuid;
  v_result jsonb;
  v_manager jsonb;
begin
  if v_actor is null or not workspace.current_user_can_workspace('performance','edit') then
    raise exception '沒有提交權限，請重新登入確認帳號。' using errcode='42501';
  end if;
  if p_request_id is null or coalesce(v_id,'') = '' or coalesce(p_mode,'') not in ('self','manager')
     or coalesce(p_action,'') not in ('submit','return') or (p_mode='self' and p_action<>'submit') then
    raise exception '提交參數不完整。' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  -- Also serialize first creation across tabs for the same employee and cycle.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    coalesce(p_review->>'employee_id','') || ':' || coalesce(p_review->>'cycle_id',''),1));
  select * into v_row from workspace.performance_reviews where id=v_id for update;
  v_exists := found;
  if p_mode='self' then
    if not workspace.current_user_is_performance_employee(coalesce(v_row.employee_id,p_review->>'employee_id'))
       or not exists(select 1 from workspace.performance_org_members where employee_id=v_actor and performance_role in ('employee','manager')) then
      raise exception '只能提交自己的自評，且須已加入績效組織。' using errcode='42501';
    end if;
  elsif not v_exists or not workspace.can_manage_performance_record(v_row.employee_id,v_row.reviewer_name,v_row.privacy_scope_ids) then
    raise exception '只有組織架構指定的直屬主管可以退回或提交評分。' using errcode='42501';
  end if;

  select * into v_receipt from workspace.performance_submission_receipts where request_id=p_request_id;
  if found then
    if v_receipt.actor_id<>v_actor or v_receipt.review_id<>v_id or v_receipt.mode<>p_mode
       or v_receipt.action<>p_action or v_receipt.request_hash<>md5(p_review::text) then
      raise exception '提交識別碼不相符。' using errcode='22023';
    end if;
    if v_row.updated_at is distinct from v_receipt.result_version then
      raise exception '這次提交已完成，但考核已有後續更新；請重新開啟查看最新結果。' using errcode='40001';
    end if;
    v_notification := v_receipt.notification_id;
  else
    if v_exists and v_row.updated_at is distinct from p_expected_updated_at then
      raise exception '考核已由另一個視窗或主管更新。本頁輸入仍保留，請另開考核核對最新內容後再提交。' using errcode='40001';
    end if;
    if not v_exists and p_expected_updated_at is not null then
      raise exception '原考核已不存在，請重新開啟。' using errcode='40001';
    end if;
    if p_mode='self' then
      if v_exists and v_row.status='approved' then
        raise exception '考核已完成，請聯絡直屬主管。' using errcode='42501';
      end if;
      if coalesce(trim(p_review->>'self_feedback'),'')='' or coalesce(trim(p_review->>'employee_name'),'')='' then
        raise exception '請完成自評內容後提交。' using errcode='22023';
      end if;
      if v_exists then
        -- Deliberately omit all supervisor-owned columns. Redacted client data
        -- must never overwrite the original private scores or feedback.
        update workspace.performance_reviews set
          employee_name=p_review->>'employee_name', department=coalesce(p_review->>'department',''),
          role=coalesce(p_review->>'role','工程師'), due_date=nullif(p_review->>'due_date','')::date,
          goals=coalesce(p_review->'goals','[]'::jsonb), self_feedback=p_review->>'self_feedback',
          status='submitted', updated_at=clock_timestamp()
        where id=v_id returning * into v_row;
      else
        if exists(select 1 from workspace.performance_reviews where cycle_id=p_review->>'cycle_id'
          and workspace.resolve_performance_employee(employee_id)=v_actor) then
          raise exception '本期已有自評，請從自己的考核繼續填寫。' using errcode='40001';
        end if;
        insert into workspace.performance_reviews(id,cycle_id,employee_id,employee_name,department,role,due_date,goals,self_feedback,status)
        values(v_id,p_review->>'cycle_id',v_actor::text,p_review->>'employee_name',coalesce(p_review->>'department',''),
          coalesce(p_review->>'role','工程師'),nullif(p_review->>'due_date','')::date,
          coalesce(p_review->'goals','[]'::jsonb),p_review->>'self_feedback','submitted') returning * into v_row;
      end if;
    else
      if coalesce(trim(p_review->>'manager_feedback'),'')='' then
        raise exception '請填寫主管評分或退回回饋。' using errcode='22023';
      end if;
      update workspace.performance_reviews set
        manager_feedback=p_review->>'manager_feedback', score=nullif(p_review->>'score','')::numeric,
        status=case when p_action='return' then 'in-progress' else 'approved' end,
        updated_at=clock_timestamp()
      where id=v_id returning * into v_row;
      if p_action='return' then
        -- Covers an explicit retry of a previously returned record too.
        v_notification := workspace.ensure_performance_return_notification(v_id);
      end if;
    end if;
    insert into workspace.performance_submission_receipts(request_id,actor_id,review_id,action,mode,request_hash,result_version,notification_id)
    values(p_request_id,v_actor,v_id,p_action,p_mode,md5(p_review::text),v_row.updated_at,v_notification);
  end if;
  v_result := to_jsonb(v_row);
  if p_mode='self' then
    v_result := v_result || jsonb_build_object('score',null,'manager_feedback','');
    -- Only return instructions and attachments to the employee, never ratings.
    if v_row.status='in-progress' and v_row.manager_feedback like E'RD2_MANAGER_V1\n%' then
      v_manager := substring(v_row.manager_feedback from 16)::jsonb;
      v_result := v_result || jsonb_build_object('manager_feedback',E'RD2_MANAGER_V1\n' || jsonb_build_object(
        'feedback',v_manager->>'feedback','attachments',coalesce(v_manager->'attachments','[]'::jsonb))::text);
    end if;
  end if;
  return jsonb_build_object('review',v_result,'notification_id',v_notification);
end;
$$;
revoke all on function workspace.submit_performance_assessment(uuid,jsonb,text,text,timestamptz) from public,anon;
grant execute on function workspace.submit_performance_assessment(uuid,jsonb,text,text,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
