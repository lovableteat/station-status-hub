begin;
set local lock_timeout = '5s';

create schema if not exists circuit_change_private;
revoke all on schema circuit_change_private from public, anon;
grant usage on schema circuit_change_private to authenticated;

create table workspace.circuit_change_sets (
  id uuid primary key default gen_random_uuid(),
  series_id text not null check (char_length(series_id) between 1 and 500),
  workspace_id text not null,
  project_id text,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  from_label text not null default '' check (char_length(from_label) <= 200),
  to_label text not null default '' check (char_length(to_label) <= 200),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index circuit_change_sets_series_updated on workspace.circuit_change_sets(series_id, updated_at desc, id);

create table workspace.circuit_change_items (
  id uuid primary key,
  set_id uuid not null references workspace.circuit_change_sets(id) on delete restrict,
  number integer not null check (number > 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  status text not null default 'draft' check (status in ('draft','in_review','needs_changes','approved')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(set_id, number)
);
create index circuit_change_items_set_updated on workspace.circuit_change_items(set_id, updated_at desc, id);

create table workspace.circuit_change_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references workspace.circuit_change_items(id) on delete restrict,
  set_id uuid not null references workspace.circuit_change_sets(id) on delete restrict,
  type text not null check (type in ('created','edited','submit','approve','request_changes','comment')),
  actor_id uuid not null,
  actor_name text not null,
  revision integer not null,
  note text not null default '' check (char_length(note) <= 10000),
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(item_id, revision)
);
create index circuit_change_events_item_revision on workspace.circuit_change_events(item_id, revision desc);
create index circuit_change_events_set_created on workspace.circuit_change_events(set_id, created_at, id);

alter table workspace.circuit_change_sets enable row level security;
alter table workspace.circuit_change_items enable row level security;
alter table workspace.circuit_change_events enable row level security;
revoke all on workspace.circuit_change_sets, workspace.circuit_change_items, workspace.circuit_change_events from public, anon, authenticated;
grant select on workspace.circuit_change_sets, workspace.circuit_change_items, workspace.circuit_change_events to authenticated;
grant all on workspace.circuit_change_sets, workspace.circuit_change_items, workspace.circuit_change_events to service_role;
create policy circuit_change_sets_read on workspace.circuit_change_sets for select to authenticated using ((select rlc_priority_private.has_access(false)));
create policy circuit_change_items_read on workspace.circuit_change_items for select to authenticated using ((select rlc_priority_private.has_access(false)));
create policy circuit_change_events_read on workspace.circuit_change_events for select to authenticated using ((select rlc_priority_private.has_access(false)));

create function circuit_change_private.actor_id() returns uuid
language plpgsql stable security invoker set search_path = '' as $$
declare result uuid;
begin
  result := workspace.current_system_user_id();
  if result is null or not coalesce(rlc_priority_private.has_access(true),false) then
    raise exception '沒有線路修改編輯權限，請重新確認帳號' using errcode='42501';
  end if;
  return result;
end;
$$;
revoke all on function circuit_change_private.actor_id() from public, anon, authenticated;

create function circuit_change_private.validate_content(p_content jsonb,p_set_id uuid,p_item_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare field text; maximum integer; image jsonb; mark jsonb; image_path text; thumbnail_path text;
begin
  if jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>2000000 then
    raise exception '修改內容格式或大小不正確' using errcode='22023';
  end if;
  foreach field in array array['title','reason','description','refs','net','page','owner'] loop
    maximum := case field when 'title' then 500 when 'reason' then 10000 when 'description' then 40000 when 'refs' then 4000 when 'net' then 2000 when 'page' then 500 else 200 end;
    if jsonb_typeof(p_content->field) is distinct from 'string' or char_length(p_content->>field)>maximum then
      raise exception '修改欄位格式或長度不正確：%',field using errcode='22023';
    end if;
  end loop;
  if jsonb_typeof(p_content->'images') is distinct from 'array' or jsonb_array_length(p_content->'images')>200 then
    raise exception '每個修改項目最多 200 張圖片' using errcode='22023';
  end if;
  if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_content->'images') x) then
    raise exception '圖片識別重複，請重新加入' using errcode='22023';
  end if;
  for image in select value from jsonb_array_elements(p_content->'images') loop
    if jsonb_typeof(image) is distinct from 'object' then raise exception '圖片格式不正確' using errcode='22023'; end if;
    foreach field in array array['id','name','path','mime','side','caption','uploadedAt','uploadedBy'] loop
      if jsonb_typeof(image->field) is distinct from 'string' then raise exception '圖片欄位格式不正確：%',field using errcode='22023'; end if;
    end loop;
    if image->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or char_length(image->>'name') not between 1 and 500 or char_length(image->>'caption')>4000
      or image->>'side' not in ('before','after','reference')
      or image->>'mime' not in ('image/png','image/jpeg','image/webp','image/gif','image/bmp')
      or jsonb_typeof(image->'size') is distinct from 'number' or (image->>'size')::numeric not between 1 and 52428800
      or jsonb_typeof(image->'width') is distinct from 'number' or (image->>'width')::numeric not between 1 and 65535
      or jsonb_typeof(image->'height') is distinct from 'number' or (image->>'height')::numeric not between 1 and 65535 then
      raise exception '圖片名稱、尺寸、大小或格式不正確' using errcode='22023';
    end if;
    image_path := image->>'path';
    thumbnail_path := nullif(image->>'thumbnailPath','');
    if image_path !~ ('^'||p_set_id::text||'/'||p_item_id::text||'/[A-Za-z0-9_.-]+\.(png|jpg|jpeg|webp|gif|bmp)$')
      or (thumbnail_path is not null and thumbnail_path !~ ('^'||p_set_id::text||'/'||p_item_id::text||'/[A-Za-z0-9_.-]+\.(png|jpg|jpeg|webp|gif|bmp)$')) then
      raise exception '圖片必須屬於目前修改項目' using errcode='22023';
    end if;
    if not exists(select 1 from storage.objects where bucket_id='circuit-change-images' and name=image_path)
      or (thumbnail_path is not null and not exists(select 1 from storage.objects where bucket_id='circuit-change-images' and name=thumbnail_path)) then
      raise exception '圖片尚未上傳完成，請保留草稿並重試' using errcode='22023';
    end if;
    if jsonb_typeof(image->'marks') is distinct from 'array' or jsonb_array_length(image->'marks')>100 then
      raise exception '每張圖片最多 100 個標記' using errcode='22023';
    end if;
    for mark in select value from jsonb_array_elements(image->'marks') loop
      if jsonb_typeof(mark) is distinct from 'object' or jsonb_typeof(mark->'id') is distinct from 'string'
        or char_length(mark->>'id') not between 1 and 100 or jsonb_typeof(mark->'kind') is distinct from 'string' or mark->>'kind' not in ('pin','box')
        or jsonb_typeof(mark->'text') is distinct from 'string' or char_length(mark->>'text')>2000
        or jsonb_typeof(mark->'x') is distinct from 'number' or (mark->>'x')::numeric not between 0 and 1
        or jsonb_typeof(mark->'y') is distinct from 'number' or (mark->>'y')::numeric not between 0 and 1 then
        raise exception '圖片標記座標或文字不正確' using errcode='22023';
      end if;
      if mark->>'kind'='box' and (jsonb_typeof(mark->'width') is distinct from 'number'
        or jsonb_typeof(mark->'height') is distinct from 'number' or (mark->>'width')::numeric not between 0.000001 and 1
        or (mark->>'height')::numeric not between 0.000001 and 1
        or (mark->>'x')::numeric+(mark->>'width')::numeric>1.000001
        or (mark->>'y')::numeric+(mark->>'height')::numeric>1.000001) then
        raise exception '框選不得超出圖片' using errcode='22023';
      end if;
    end loop;
  end loop;
end;
$$;
revoke all on function circuit_change_private.validate_content(jsonb,uuid,uuid) from public, anon, authenticated;

create function circuit_change_private.record_event(p_item workspace.circuit_change_items,p_type text,p_note text,p_actor uuid) returns void
language sql security invoker set search_path = '' as $$
  insert into workspace.circuit_change_events(item_id,set_id,type,actor_id,actor_name,revision,note,snapshot)
  select p_item.id,p_item.set_id,p_type,p_actor,coalesce(nullif(btrim(u.display_name),''),u.username),p_item.revision,coalesce(p_note,''),to_jsonb(p_item)
  from workspace.system_users u where u.id=p_actor;
  update workspace.circuit_change_sets set updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=p_item.set_id;
$$;
revoke all on function circuit_change_private.record_event(workspace.circuit_change_items,text,text,uuid) from public, anon, authenticated;

create function workspace.circuit_change_create_set(p_series_id text,p_workspace_id text,p_project_id text,p_title text,p_from_label text,p_to_label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid; saved workspace.circuit_change_sets;
begin
  actor := circuit_change_private.actor_id();
  if p_series_id is null or char_length(p_series_id) not between 1 and 500 or p_workspace_id is null
    or p_title is null or char_length(btrim(p_title)) not between 1 and 300
    or p_from_label is null or char_length(p_from_label)>200 or p_to_label is null or char_length(p_to_label)>200
    or char_length(coalesce(p_project_id,''))>500 then raise exception '修改批次欄位不正確' using errcode='22023'; end if;
  if not exists(select 1 from workspace.material_bom_workspaces where id=p_workspace_id) then raise exception '找不到來源 BOM' using errcode='P0002'; end if;
  insert into workspace.circuit_change_sets(series_id,workspace_id,project_id,title,from_label,to_label,created_by)
  values(p_series_id,p_workspace_id,nullif(p_project_id,''),btrim(p_title),p_from_label,p_to_label,actor) returning * into saved;
  return to_jsonb(saved);
end;
$$;

create function workspace.circuit_change_save_item(p_set_id uuid,p_item_id uuid,p_expected_revision integer,p_content jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid; saved workspace.circuit_change_items; prior workspace.circuit_change_items; next_number integer;
begin
  actor := circuit_change_private.actor_id();
  if p_item_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception '修改項目版本不正確' using errcode='22023'; end if;
  perform circuit_change_private.validate_content(p_content,p_set_id,p_item_id);
  -- Parent first in every writer keeps numbering and revision writes in one lock order.
  perform 1 from workspace.circuit_change_sets where id=p_set_id for update;
  if not found then raise exception '找不到修改批次' using errcode='P0002'; end if;
  select * into prior from workspace.circuit_change_items where id=p_item_id for update;
  if not found then
    if p_expected_revision<>0 then raise exception '修改項目已變更，請載入最新版本' using errcode='PT409'; end if;
    select coalesce(max(number),0)+1 into next_number from workspace.circuit_change_items where set_id=p_set_id;
    insert into workspace.circuit_change_items(id,set_id,number,content,created_by,updated_by)
    values(p_item_id,p_set_id,next_number,p_content,actor,actor) returning * into saved;
    perform circuit_change_private.record_event(saved,'created','',actor);
  else
    if prior.set_id is distinct from p_set_id or prior.revision<>p_expected_revision then raise exception '其他人已更新此項目，請保留草稿並核對最新版本' using errcode='PT409'; end if;
    if prior.content=p_content then return to_jsonb(prior); end if;
    update workspace.circuit_change_items set content=p_content,status='draft',revision=revision+1,updated_by=actor,
      updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=p_item_id returning * into saved;
    perform circuit_change_private.record_event(saved,'edited','',actor);
  end if;
  return to_jsonb(saved);
end;
$$;

create function workspace.circuit_change_action(p_item_id uuid,p_expected_revision integer,p_action text,p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid; saved workspace.circuit_change_items; item_set_id uuid; next_status text;
begin
  actor := circuit_change_private.actor_id();
  if p_action is null or p_action not in ('submit','approve','request_changes','comment') or p_note is null or char_length(p_note)>10000 then
    raise exception 'Review 動作或意見不正確' using errcode='22023'; end if;
  select set_id into item_set_id from workspace.circuit_change_items where id=p_item_id;
  if not found then raise exception '找不到修改項目' using errcode='P0002'; end if;
  perform 1 from workspace.circuit_change_sets where id=item_set_id for update;
  select * into saved from workspace.circuit_change_items where id=p_item_id for update;
  if p_expected_revision is null or saved.revision<>p_expected_revision then raise exception '其他人已更新此項目，請保留草稿並核對最新版本' using errcode='PT409'; end if;
  next_status:=saved.status;
  if p_action='submit' then
    if saved.status not in ('draft','needs_changes') then raise exception '目前狀態無法送出 Review' using errcode='22023'; end if;
    if nullif(btrim(saved.content->>'title'),'') is null or (nullif(btrim(saved.content->>'description'),'') is null
      and not exists(select 1 from jsonb_array_elements(saved.content->'images') i where i->>'side'='after')) then
      raise exception '送出前請填寫標題，並補上修改說明或修改後圖片' using errcode='22023'; end if;
    next_status:='in_review';
  elsif p_action in ('approve','request_changes') then
    if saved.status<>'in_review' then raise exception '請先送出 Review，才能確認或退回' using errcode='22023'; end if;
    if p_action='request_changes' and nullif(btrim(p_note),'') is null then raise exception '退回補充請填寫原因' using errcode='22023'; end if;
    next_status:=case p_action when 'approve' then 'approved' else 'needs_changes' end;
  elsif nullif(btrim(p_note),'') is null then raise exception '請填寫留言' using errcode='22023'; end if;
  update workspace.circuit_change_items set status=next_status,revision=revision+1,updated_by=actor,
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=p_item_id returning * into saved;
  perform circuit_change_private.record_event(saved,p_action,btrim(p_note),actor);
  return to_jsonb(saved);
end;
$$;

create function workspace.circuit_change_list_items(p_set_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not coalesce(rlc_priority_private.has_access(false),false) then raise exception '沒有線路修改檢視權限' using errcode='42501'; end if;
  return coalesce((select jsonb_agg((to_jsonb(i)-'content')||jsonb_build_object('content',jsonb_set(i.content,'{images}','[]'::jsonb),'image_count',jsonb_array_length(i.content->'images')) order by i.number)
    from workspace.circuit_change_items i where i.set_id=p_set_id),'[]'::jsonb);
end;
$$;

revoke all on function workspace.circuit_change_create_set(text,text,text,text,text,text),workspace.circuit_change_save_item(uuid,uuid,integer,jsonb),workspace.circuit_change_action(uuid,integer,text,text),workspace.circuit_change_list_items(uuid) from public, anon;
grant execute on function workspace.circuit_change_create_set(text,text,text,text,text,text),workspace.circuit_change_save_item(uuid,uuid,integer,jsonb),workspace.circuit_change_action(uuid,integer,text,text),workspace.circuit_change_list_items(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('circuit-change-images','circuit-change-images',false,52428800,array['image/png','image/jpeg','image/webp','image/gif','image/bmp']);
create policy circuit_change_images_read on storage.objects for select to authenticated using (
  bucket_id='circuit-change-images' and (select rlc_priority_private.has_access(false))
  and exists(select 1 from workspace.circuit_change_items i where i.id::text=(storage.foldername(name))[2] and i.set_id::text=(storage.foldername(name))[1]));
create policy circuit_change_images_insert on storage.objects for insert to authenticated with check (
  bucket_id='circuit-change-images' and (select rlc_priority_private.has_access(true))
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_.-]+\.(png|jpg|jpeg|webp|gif|bmp)$'
  and exists(select 1 from workspace.circuit_change_items i where i.id::text=(storage.foldername(name))[2] and i.set_id::text=(storage.foldername(name))[1]));

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table workspace.circuit_change_sets;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
