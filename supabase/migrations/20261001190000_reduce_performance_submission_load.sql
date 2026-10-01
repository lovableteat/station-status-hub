-- Reduce shared database work during assessment submission and polling.
begin;
set local lock_timeout='3s';
create or replace function workspace.guard_performance_review_self_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor workspace.system_users%rowtype; v_allowed boolean; v_compare workspace.performance_reviews%rowtype;
begin
  select * into v_actor from workspace.system_users where id = workspace.current_system_user_id() and status = 'active';
  -- The account-service/database maintenance role has no user session.
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'UPDATE' and new.employee_id is distinct from old.employee_id then
    raise exception 'Review identity cannot be reassigned' using errcode = '42501';
  end if;
  -- Organization reassignment by an admin may update reviewer metadata only.
  if tg_op = 'UPDATE' then
    v_compare := new;
    v_compare.privacy_scope_ids := old.privacy_scope_ids;
    if v_actor.role in ('admin', 'super_admin') then
      v_compare.reviewer_name := old.reviewer_name;
      v_compare.updated_at := old.updated_at;
    end if;
    if v_compare is not distinct from old then return new; end if;
  end if;
  if tg_op = 'UPDATE' then
    v_allowed := workspace.can_manage_performance_record(old.employee_id, old.reviewer_name, old.privacy_scope_ids);
  else
    v_allowed := workspace.can_manage_performance_record(new.employee_id, new.reviewer_name, array[]::uuid[]);
  end if;
  if v_allowed then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.manager_feedback, '') <> '' or new.score is not null or coalesce(new.reviewer_name, '') <> '' or new.status = 'approved' then
      raise exception 'Only the authorized reviewer can edit manager assessment fields' using errcode = '42501';
    end if;
  elsif new.manager_feedback is distinct from old.manager_feedback or new.score is distinct from old.score
    or new.reviewer_name is distinct from old.reviewer_name
    or (new.status = 'approved' and old.status <> 'approved') then
    raise exception 'Only the authorized reviewer can edit manager assessment fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
create or replace function workspace.preserve_performance_name_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_compare workspace.performance_reviews%rowtype;
begin
  -- Composite comparison preserves null semantics and includes future columns,
  -- without serializing attachments twice just to test a name-only change.
  v_compare := new;
  v_compare.employee_name := old.employee_name;
  v_compare.employee_id := old.employee_id;
  v_compare.updated_at := old.updated_at;
  if v_compare is not distinct from old then new.updated_at := old.updated_at; end if;
  return new;
end;
$$;
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
  -- New clients acknowledge a committed, hashed receipt instead of receiving
  -- their multi-megabyte attachment payload again. Old clients remain valid.
  if p_review->>'receipt_only' = 'true' then
    v_result := jsonb_build_object(
      'id',v_row.id,'cycle_id',v_row.cycle_id,'employee_id',v_row.employee_id,
      'employee_name',v_row.employee_name,'department',v_row.department,
      'role',v_row.role,'reviewer_name',v_row.reviewer_name,'status',v_row.status,
      'score',case when p_mode='self' then null else v_row.score end,
      'due_date',v_row.due_date,'goals',v_row.goals,'updated_at',v_row.updated_at);
    return jsonb_build_object('review',v_result,'notification_id',v_notification,
      'receipt_kind','compact-v1','request_id',p_request_id,
      'content_hash',encode(sha256(convert_to(case when p_mode='self'
        then v_row.self_feedback else v_row.manager_feedback end,'UTF8')),'hex'));
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
-- No application subscribes to this table. Embedded files should not be
-- decoded and delivered by Realtime in addition to the normal API requests.
do $$ begin
  if exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='workspace' and tablename='performance_reviews') then
    alter publication supabase_realtime drop table workspace.performance_reviews;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
