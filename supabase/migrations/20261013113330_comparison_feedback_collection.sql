begin;
set local lock_timeout = '5s';

create schema if not exists comparison_feedback_private;
revoke all on schema comparison_feedback_private from public, anon;
grant usage on schema comparison_feedback_private to authenticated, service_role;

create table if not exists workspace.comparison_feedback (
  id uuid primary key,
  reporter_id uuid references workspace.system_users(id) on delete set null,
  attachment_owner_id uuid not null,
  reporter_name text not null,
  reporter_username text not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null check (length(btrim(description)) between 1 and 4000),
  category text not null check (category in ('bug','ui','suggestion','other')),
  comparison_tab text not null check (comparison_tab in ('compare','review','power','i2c','library')),
  project_name text not null default '' check (length(project_name) <= 120),
  page_context jsonb not null default '{}' check (jsonb_typeof(page_context)='object' and length(page_context::text)<=4096),
  screenshots jsonb not null default '[]' check (jsonb_typeof(screenshots)='array' and jsonb_array_length(screenshots)<=5),
  is_submitted boolean not null default false,
  status text not null default 'new' check (status in ('new','in_progress','resolved')),
  admin_note text not null default '' check (length(admin_note)<=2000),
  reviewed_by uuid references workspace.system_users(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists comparison_feedback_reporter_idx on workspace.comparison_feedback(reporter_id,id);
create index if not exists comparison_feedback_submitted_idx on workspace.comparison_feedback(status,submitted_at desc) where is_submitted;
alter table workspace.comparison_feedback enable row level security;
revoke all on workspace.comparison_feedback from public, anon, authenticated;
grant select on workspace.comparison_feedback to authenticated;
grant all on workspace.comparison_feedback to service_role;

create or replace function comparison_feedback_private.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from workspace.system_users
    where auth_user_id=(select auth.uid()) and status='active' and role in ('admin','super_admin'))
$$;

drop policy if exists "comparison-feedback-read" on workspace.comparison_feedback;
create policy "comparison-feedback-read" on workspace.comparison_feedback for select to authenticated
using (workspace.current_user_can_workspace('ai-chat','view') and (
  reporter_id=workspace.current_system_user_id()
  or (is_submitted and comparison_feedback_private.is_admin())
));

-- Only reserved, canonical image paths are writable. Submitted attachments
-- are immutable; owners and administrators can read submitted screenshots.
create or replace function comparison_feedback_private.allows_object(object_name text, action text)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null
    and workspace.current_user_can_workspace('ai-chat','view')
    and exists(select 1 from workspace.comparison_feedback reports
      where reports.id::text=split_part(object_name,'/',2)
        and reports.attachment_owner_id::text=split_part(object_name,'/',1)
        and exists(select 1 from jsonb_array_elements(reports.screenshots) image where image->>'path'=object_name)
        and case when action='read' then
          reports.reporter_id=workspace.current_system_user_id()
          or (reports.is_submitted and comparison_feedback_private.is_admin())
        when action in ('write','delete') then
          not reports.is_submitted and reports.reporter_id=workspace.current_system_user_id()
        else false end
    )
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('comparison-feedback','comparison-feedback',false,10485760,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "comparison-feedback-images-read" on storage.objects;
drop policy if exists "comparison-feedback-images-insert" on storage.objects;
drop policy if exists "comparison-feedback-images-delete" on storage.objects;
create policy "comparison-feedback-images-read" on storage.objects for select to authenticated
using(bucket_id='comparison-feedback' and comparison_feedback_private.allows_object(name,'read'));
create policy "comparison-feedback-images-insert" on storage.objects for insert to authenticated
with check(bucket_id='comparison-feedback' and comparison_feedback_private.allows_object(name,'write'));
create policy "comparison-feedback-images-delete" on storage.objects for delete to authenticated
using(bucket_id='comparison-feedback' and comparison_feedback_private.allows_object(name,'delete'));

create or replace function comparison_feedback_private.create_draft(
  p_id uuid,p_reporter_id uuid,p_title text,p_description text,p_category text,p_tab text,p_project text,p_context jsonb,p_images jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor workspace.system_users%rowtype; report workspace.comparison_feedback%rowtype; image jsonb; extension text;
begin
  select * into actor from workspace.system_users where auth_user_id=(select auth.uid()) and status='active';
  if not found or actor.id is distinct from p_reporter_id or not workspace.current_user_can_workspace('ai-chat','view') then
    raise exception '需要安全登入與比對系統檢視權限' using errcode='42501';
  end if;
  if p_id is null or p_title is null or length(btrim(p_title)) not between 1 and 120
    or p_description is null or length(btrim(p_description)) not between 1 and 4000
    or p_category is null or p_category not in ('bug','ui','suggestion','other')
    or p_tab is null or p_tab not in ('compare','review','power','i2c','library')
    or p_project is null or length(p_project)>120 then raise exception '回報內容格式不正確' using errcode='22023'; end if;
  if p_context is null or jsonb_typeof(p_context)<>'object' or length(p_context::text)>4096
    or (p_context-array['browser','width','height','revisionA','revisionB'])<>'{}'::jsonb then
    raise exception '頁面資訊格式不正確' using errcode='22023';
  end if;
  if p_images is null or jsonb_typeof(p_images)<>'array' or jsonb_array_length(p_images)>5 then
    raise exception '最多可附上 5 張截圖' using errcode='22023';
  end if;
  for image in select value from jsonb_array_elements(p_images) loop
    extension:=case image->>'mime' when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' end;
    if jsonb_typeof(image)<>'object' or extension is null
      or coalesce(image->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or length(coalesce(image->>'name','')) not between 1 and 180
      or image->>'path' is distinct from actor.id::text||'/'||p_id::text||'/'||(image->>'id')||'.'||extension
      or jsonb_typeof(image->'size') is distinct from 'number'
      or (image->>'size')::numeric not between 1 and 10485760
      or floor((image->>'size')::numeric)<>(image->>'size')::numeric
      or (image-array['id','name','path','mime','size'])<>'{}'::jsonb then
      raise exception '截圖格式或大小不正確' using errcode='22023';
    end if;
  end loop;
  if (select count(distinct value->>'path') from jsonb_array_elements(p_images))<>jsonb_array_length(p_images) then
    raise exception '截圖路徑不可重複' using errcode='22023';
  end if;
  select * into report from workspace.comparison_feedback where id=p_id for update;
  if found then
    if report.reporter_id is distinct from actor.id then raise exception '無法存取這份回報' using errcode='42501'; end if;
    if report.is_submitted then
      if report.title<>btrim(p_title) or report.description<>btrim(p_description) or report.screenshots<>p_images
        or report.category<>p_category or report.comparison_tab<>p_tab or report.project_name<>p_project then
        raise exception '這份回報已送出，請建立新的回報' using errcode='22023';
      end if;
      return to_jsonb(report);
    end if;
    if exists(select 1 from storage.objects where bucket_id='comparison-feedback' and name like actor.id::text||'/'||p_id::text||'/%') then
      raise exception '上次的附件還在清理，請重試' using errcode='22023';
    end if;
    update workspace.comparison_feedback set title=btrim(p_title),description=btrim(p_description),category=p_category,
      comparison_tab=p_tab,project_name=p_project,page_context=p_context,screenshots=p_images,updated_at=clock_timestamp()
      where id=p_id returning * into report;
  else
    insert into workspace.comparison_feedback(id,reporter_id,attachment_owner_id,reporter_name,reporter_username,title,description,category,comparison_tab,project_name,page_context,screenshots)
    values(p_id,actor.id,actor.id,coalesce(nullif(btrim(actor.display_name),''),actor.username),actor.username,
      btrim(p_title),btrim(p_description),p_category,p_tab,p_project,p_context,p_images) returning * into report;
  end if;
  return to_jsonb(report);
end;
$$;

create or replace function comparison_feedback_private.finalize(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare report workspace.comparison_feedback%rowtype; image jsonb;
begin
  if not workspace.current_user_can_workspace('ai-chat','view') then raise exception '無回報權限' using errcode='42501'; end if;
  select * into report from workspace.comparison_feedback where id=p_id for update;
  if not found or report.reporter_id is distinct from workspace.current_system_user_id() then
    raise exception '無法存取這份回報' using errcode='42501';
  end if;
  if report.is_submitted then return to_jsonb(report); end if;
  for image in select value from jsonb_array_elements(report.screenshots) loop
    if not exists(select 1 from storage.objects where bucket_id='comparison-feedback' and name=image->>'path'
      and (metadata->>'size')::bigint=(image->>'size')::bigint and lower(metadata->>'mimetype')=image->>'mime') then
      raise exception '截圖尚未完整上傳，請重試' using errcode='22023';
    end if;
  end loop;
  update workspace.comparison_feedback set is_submitted=true,submitted_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=p_id returning * into report;
  return to_jsonb(report);
end;
$$;

create or replace function comparison_feedback_private.abandon(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare report workspace.comparison_feedback%rowtype;
begin
  if not workspace.current_user_can_workspace('ai-chat','view') then raise exception '無回報權限' using errcode='42501'; end if;
  select * into report from workspace.comparison_feedback where id=p_id for update;
  if not found then return false; end if;
  if report.reporter_id is distinct from workspace.current_system_user_id() then raise exception '無法存取這份回報' using errcode='42501'; end if;
  if report.is_submitted then return false; end if;
  if exists(select 1 from storage.objects where bucket_id='comparison-feedback' and name like report.attachment_owner_id::text||'/'||p_id::text||'/%') then
    raise exception '附件仍待清理，請重試';
  end if;
  delete from workspace.comparison_feedback where id=p_id;
  return true;
end;
$$;

create or replace function comparison_feedback_private.review(p_id uuid,p_reviewer_id uuid,p_status text,p_note text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare report workspace.comparison_feedback%rowtype;
begin
  if p_reviewer_id is distinct from workspace.current_system_user_id() or not comparison_feedback_private.is_admin() then raise exception '只有管理員能處理回報' using errcode='42501'; end if;
  if p_status is null or p_status not in ('new','in_progress','resolved') or p_note is null or length(p_note)>2000 then
    raise exception '處理狀態或備註格式不正確' using errcode='22023';
  end if;
  select * into report from workspace.comparison_feedback where id=p_id and is_submitted for update;
  if not found then raise exception '回報不存在' using errcode='22023'; end if;
  if report.updated_at is distinct from p_expected_updated_at then raise exception '回報已由其他管理員更新，請重新整理' using errcode='40001'; end if;
  update workspace.comparison_feedback set status=p_status,admin_note=p_note,reviewed_by=workspace.current_system_user_id(),updated_at=clock_timestamp()
    where id=p_id returning * into report;
  return to_jsonb(report);
end;
$$;

-- Public API wrappers remain invokers. Definer code stays outside exposed schemas
-- and independently validates the real Auth identity and workspace permission.
create or replace function workspace.create_comparison_feedback_draft(p_id uuid,p_reporter_id uuid,p_title text,p_description text,p_category text,p_tab text,p_project text,p_context jsonb,p_images jsonb)
returns jsonb language sql security invoker set search_path='' as $$select comparison_feedback_private.create_draft(p_id,p_reporter_id,p_title,p_description,p_category,p_tab,p_project,p_context,p_images)$$;
create or replace function workspace.submit_comparison_feedback(p_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select comparison_feedback_private.finalize(p_id)$$;
create or replace function workspace.abandon_comparison_feedback_draft(p_id uuid)
returns boolean language sql security invoker set search_path='' as $$select comparison_feedback_private.abandon(p_id)$$;
create or replace function workspace.review_comparison_feedback(p_id uuid,p_reviewer_id uuid,p_status text,p_note text,p_expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$select comparison_feedback_private.review(p_id,p_reviewer_id,p_status,p_note,p_expected_updated_at)$$;

revoke all on all functions in schema comparison_feedback_private from public, anon;
grant execute on all functions in schema comparison_feedback_private to authenticated, service_role;
revoke all on function workspace.create_comparison_feedback_draft(uuid,uuid,text,text,text,text,text,jsonb,jsonb) from public, anon;
revoke all on function workspace.submit_comparison_feedback(uuid) from public, anon;
revoke all on function workspace.abandon_comparison_feedback_draft(uuid) from public, anon;
revoke all on function workspace.review_comparison_feedback(uuid,uuid,text,text,timestamptz) from public, anon;
grant execute on function workspace.create_comparison_feedback_draft(uuid,uuid,text,text,text,text,text,jsonb,jsonb) to authenticated, service_role;
grant execute on function workspace.submit_comparison_feedback(uuid) to authenticated, service_role;
grant execute on function workspace.abandon_comparison_feedback_draft(uuid) to authenticated, service_role;
grant execute on function workspace.review_comparison_feedback(uuid,uuid,text,text,timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
