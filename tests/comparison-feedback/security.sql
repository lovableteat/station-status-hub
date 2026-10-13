-- Run against the hosted project through execute_sql. Every test write rolls back.
begin;
select set_config('feedback_qa.owner',(select id::text from workspace.system_users where username='LA2400580'),true);
select set_config('feedback_qa.other',(select id::text from workspace.system_users where username='ericchuang'),true);
select set_config('feedback_qa.admin',(select id::text from workspace.system_users where username='liu52417'),true);
select set_config('feedback_qa.empty_report',gen_random_uuid()::text,true);
select set_config('feedback_qa.image_report',gen_random_uuid()::text,true);
select set_config('feedback_qa.image_id',gen_random_uuid()::text,true);
select set_config('feedback_qa.path',current_setting('feedback_qa.owner')||'/'||current_setting('feedback_qa.image_report')||'/'||current_setting('feedback_qa.image_id')||'.png',true);

-- Reporters only need view access, even when they cannot modify comparisons.
update workspace.system_users set permissions=jsonb_set(permissions,'{workspaceAccess,ai-chat}','"view"'::jsonb)
where id=current_setting('feedback_qa.owner')::uuid;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from workspace.system_users where id=current_setting('feedback_qa.owner')::uuid),true);
set local role authenticated;
do $$ declare response jsonb; rejected boolean;
begin
  if workspace.current_user_can_workspace('ai-chat','edit') or not workspace.current_user_can_workspace('ai-chat','view') then raise exception 'Read-only setup failed'; end if;
  response:=workspace.create_comparison_feedback_draft(current_setting('feedback_qa.empty_report')::uuid,current_setting('feedback_qa.owner')::uuid,'transactional QA','Description','bug','review','QA','{}','[]');
  if response->>'reporter_id'<>current_setting('feedback_qa.owner') or (response->>'is_submitted')::boolean then raise exception 'Actor stamping/draft visibility failed'; end if;
  response:=workspace.submit_comparison_feedback(current_setting('feedback_qa.empty_report')::uuid);
  if not (response->>'is_submitted')::boolean then raise exception 'Text-only submission failed'; end if;
  if workspace.submit_comparison_feedback(current_setting('feedback_qa.empty_report')::uuid)->>'id'<>current_setting('feedback_qa.empty_report') then raise exception 'Idempotent finalize failed'; end if;
  perform workspace.create_comparison_feedback_draft(current_setting('feedback_qa.image_report')::uuid,current_setting('feedback_qa.owner')::uuid,'image QA','Screenshot QA','ui','compare','QA','{}',jsonb_build_array(jsonb_build_object('id',current_setting('feedback_qa.image_id'),'name','screen.png','path',current_setting('feedback_qa.path'),'mime','image/png','size',68)));
  if not comparison_feedback_private.allows_object(current_setting('feedback_qa.path'),'write') or not comparison_feedback_private.allows_object(current_setting('feedback_qa.path'),'read') or not comparison_feedback_private.allows_object(current_setting('feedback_qa.path'),'delete') then raise exception 'Owner staging storage authorization failed'; end if;
  rejected:=false;
  begin perform workspace.submit_comparison_feedback(current_setting('feedback_qa.image_report')::uuid); exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'Missing screenshot finalized'; end if;
  rejected:=false;
  begin perform workspace.create_comparison_feedback_draft(gen_random_uuid(),current_setting('feedback_qa.other')::uuid,'spoof','spoof','bug','compare','','{}','[]'); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Reporter spoof was accepted'; end if;
  rejected:=false;
  begin update workspace.comparison_feedback set admin_note='not allowed' where id=current_setting('feedback_qa.empty_report')::uuid; exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Direct client update was allowed'; end if;
  rejected:=false;
  begin perform workspace.review_comparison_feedback(current_setting('feedback_qa.empty_report')::uuid,current_setting('feedback_qa.owner')::uuid,'resolved','spoof',now()); exception when insufficient_privilege then rejected:=true; end;
  if not rejected or workspace.comparison_feedback_is_admin() then raise exception 'Regular user gained review/admin access'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from workspace.system_users where id=current_setting('feedback_qa.other')::uuid),true);
set local role authenticated;
do $$ declare rejected boolean:=false;
begin
  if exists(select 1 from workspace.comparison_feedback where id in(current_setting('feedback_qa.empty_report')::uuid,current_setting('feedback_qa.image_report')::uuid)) then raise exception 'Cross-user reports visible'; end if;
  if comparison_feedback_private.allows_object(current_setting('feedback_qa.path'),'read') or comparison_feedback_private.allows_object(current_setting('feedback_qa.path'),'write') or comparison_feedback_private.allows_object(current_setting('feedback_qa.path'),'delete') then raise exception 'Cross-user screenshot access allowed'; end if;
  begin perform workspace.submit_comparison_feedback(current_setting('feedback_qa.image_report')::uuid); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Other user finalized report'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from workspace.system_users where id=current_setting('feedback_qa.admin')::uuid),true);
set local role authenticated;
do $$ declare response jsonb; before_update timestamptz; rejected boolean;
begin
  if not workspace.comparison_feedback_is_admin() then raise exception 'Admin identity check failed'; end if;
  if not exists(select 1 from workspace.comparison_feedback where id=current_setting('feedback_qa.empty_report')::uuid) then raise exception 'Admin cannot read submitted report'; end if;
  if exists(select 1 from workspace.comparison_feedback where id=current_setting('feedback_qa.image_report')::uuid) or comparison_feedback_private.allows_object(current_setting('feedback_qa.path'),'read') then raise exception 'Admin can see another user incomplete draft'; end if;
  select updated_at into before_update from workspace.comparison_feedback where id=current_setting('feedback_qa.empty_report')::uuid;
  response:=workspace.review_comparison_feedback(current_setting('feedback_qa.empty_report')::uuid,current_setting('feedback_qa.admin')::uuid,'in_progress','Repair plan',before_update);
  if response->>'status'<>'in_progress' or response->>'admin_note'<>'Repair plan' or response->>'title'<>'transactional QA' then raise exception 'Admin review failed or modified source fields'; end if;
  rejected:=false;
  begin perform workspace.review_comparison_feedback(current_setting('feedback_qa.empty_report')::uuid,current_setting('feedback_qa.admin')::uuid,'resolved','stale',before_update); exception when serialization_failure then rejected:=true; end;
  if not rejected then raise exception 'Stale review overwrote another version'; end if;
end $$;

-- Exercise submitted-image RLS with a transaction-local metadata fixture;
-- no storage.objects rows are written by SQL.
reset role;
update workspace.comparison_feedback set is_submitted=true,submitted_at=now() where id=current_setting('feedback_qa.image_report')::uuid;
set local role authenticated;
do $$ begin
  if not comparison_feedback_private.allows_object(current_setting('feedback_qa.path'),'read')
    or comparison_feedback_private.allows_object(current_setting('feedback_qa.path'),'write')
    or comparison_feedback_private.allows_object(current_setting('feedback_qa.path'),'delete') then raise exception 'Submitted screenshot immutability/admin read failed'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from workspace.system_users where username='LA2400003'),true);
set local role authenticated;
do $$ declare rejected boolean:=false;
begin
  if exists(select 1 from workspace.comparison_feedback where id in(current_setting('feedback_qa.empty_report')::uuid,current_setting('feedback_qa.image_report')::uuid)) then raise exception 'No-access user read reports'; end if;
  begin perform workspace.create_comparison_feedback_draft(gen_random_uuid(),workspace.current_system_user_id(),'blocked','blocked','bug','compare','','{}','[]'); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'No-access submission allowed'; end if;
end $$;

reset role;
set local role anon;
do $$ declare rejected boolean:=false;
begin
  begin perform workspace.submit_comparison_feedback(current_setting('feedback_qa.empty_report')::uuid); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Anonymous RPC access allowed'; end if;
end $$;
rollback;
select 'PASS: read-only submission, actor stamping, complete-image gate, owner-only history/drafts, cross-user rejection, admin review/export check, optimistic conflict, immutable images, revoked/anonymous access (all writes rolled back)' as verification;
