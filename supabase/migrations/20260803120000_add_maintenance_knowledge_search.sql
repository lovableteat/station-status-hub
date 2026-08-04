-- Live maintenance knowledge retrieval for the AI query workspace.
-- Chunks are composed from the source tables at query time so citations never
-- depend on a stale embedding index or a separate synchronization job.

create extension if not exists pg_trgm with schema extensions;

create or replace function public.search_maintenance_knowledge(
  p_query text,
  p_project_ids uuid[],
  p_limit integer default 16
)
returns table (
  chunk_id text,
  source_type text,
  source_id uuid,
  project_id uuid,
  project_name text,
  title text,
  content text,
  source_label text,
  module text,
  route_params jsonb,
  updated_at timestamptz,
  rank real
)
language plpgsql
stable
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user public.system_users%rowtype;
  v_user_id uuid := public.current_system_user_id();
  v_query text := btrim(coalesce(p_query, ''));
  v_query_lower text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 16), 20));
  v_station_access boolean := false;
  v_ai_access boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authenticated approved system user required' using errcode = '42501';
  end if;

  select users.*
  into v_user
  from public.system_users as users
  where users.id = v_user_id
    and users.status = 'active'
    and users.approved_at is not null;

  if not found then
    raise exception 'Approved active system account required' using errcode = '42501';
  end if;

  if v_user.role in ('admin', 'super_admin') then
    v_station_access := true;
    v_ai_access := true;
  else
    if coalesce(v_user.permissions, '{}'::jsonb) #> '{workspaceAccess}' ? 'station-status' then
      v_station_access := coalesce(
        v_user.permissions #>> '{workspaceAccess,station-status}',
        'none'
      ) in ('view', 'edit');
    else
      select exists (
        select 1
        from public.user_page_permissions as permissions
        where permissions.user_id = v_user_id
          and permissions.permission::text in (
            'dashboard_view', 'dashboard_edit',
            'test_tracker_view', 'test_tracker_edit',
            'flow_info_view', 'flow_info_edit',
            'issues_view', 'issues_edit',
            'production_view', 'production_edit',
            'tools_view', 'tools_edit'
          )
      ) into v_station_access;
    end if;

    if coalesce(v_user.permissions, '{}'::jsonb) #> '{workspaceAccess}' ? 'ai-chat' then
      v_ai_access := coalesce(
        v_user.permissions #>> '{workspaceAccess,ai-chat}',
        'none'
      ) in ('view', 'edit');
    else
      select exists (
        select 1
        from public.user_page_permissions as permissions
        where permissions.user_id = v_user_id
          and permissions.permission::text in (
            'comparison_view', 'comparison_edit',
            'api_management_view', 'api_management_edit'
          )
      ) into v_ai_access;
    end if;
  end if;

  if not v_station_access or not v_ai_access then
    raise exception 'Maintenance and AI query workspace access required' using errcode = '42501';
  end if;

  if v_query = '' then
    raise exception 'Search query is required' using errcode = '22023';
  end if;

  if char_length(v_query) > 500 then
    raise exception 'Search query exceeds 500 characters' using errcode = '22023';
  end if;

  if p_project_ids is null or cardinality(p_project_ids) = 0 then
    raise exception 'At least one project is required' using errcode = '22023';
  end if;

  if cardinality(p_project_ids) > 50 then
    raise exception 'At most 50 projects may be searched' using errcode = '22023';
  end if;

  v_query_lower := lower(v_query);

  if not exists (
    select 1
    from public.test_projects as projects
    where projects.id = any(p_project_ids)
      and projects.is_archived = false
  ) then
    raise exception 'No active requested project exists' using errcode = '22023';
  end if;

  return query
  with selected_projects as (
    select projects.*
    from public.test_projects as projects
    where projects.id = any(p_project_ids)
      and projects.is_archived = false
  ),
  project_chunks as (
    select
      'project:' || projects.id::text as chunk_id,
      'project'::text as source_type,
      projects.id as source_id,
      projects.id as project_id,
      projects.name as project_name,
      projects.name as title,
      concat_ws(E'\n',
        '專案：' || projects.name,
        '狀態：' || projects.status,
        '說明：' || coalesce(projects.description, '未填寫'),
        '預計開始：' || coalesce(projects.planned_start_date::text, '未設定'),
        '預計結束：' || coalesce(projects.planned_end_date::text, '未設定')
      ) as content,
      '維修專案'::text as source_label,
      'dashboard'::text as module,
      '{}'::jsonb as route_params,
      projects.updated_at,
      projects.name as exact_key,
      concat_ws(' ', '維修 專案 專案狀態', projects.name, projects.status, projects.description) as search_text,
      5.0::real as source_boost
    from selected_projects as projects
  ),
  machine_chunks as (
    select
      'machine:' || systems.id::text as chunk_id,
      'machine'::text as source_type,
      systems.id as source_id,
      projects.id as project_id,
      projects.name as project_name,
      systems.system_name as title,
      concat_ws(E'\n',
        '機台代碼：' || systems.system_name,
        '序號：' || coalesce(systems.serial_number, '未設定'),
        '型號：' || coalesce(systems.model, '未設定'),
        '狀態：' || coalesce(systems.status, '未設定'),
        '目前站點：' || coalesce(systems.current_station, '未設定'),
        '整體進度：' || coalesce(round(systems.overall_progress)::text || '%', '未設定'),
        '工程師：' || coalesce(systems.assigned_engineer, '未指派'),
        '機櫃：' || coalesce(systems.cabinet, '未設定'),
        'Ubuntu：' || coalesce(systems.ubuntu_version, '未設定'),
        'CUDA：' || coalesce(systems.cuda_version, '未設定'),
        'BMC：' || coalesce(systems.bmc_address, '未設定')
      ) as content,
      '機台'::text as source_label,
      'test-tracker'::text as module,
      jsonb_build_object('system', systems.system_name) as route_params,
      systems.updated_at,
      systems.system_name as exact_key,
      concat_ws(' ',
        '機台 機台代碼 序號 型號 站點 進度 工程師',
        systems.system_name, systems.serial_number, systems.model, systems.status,
        systems.current_station, systems.assigned_engineer, systems.cabinet,
        systems.ubuntu_version, systems.cuda_version, systems.bmc_address
      ) as search_text,
      12.0::real as source_boost
    from public.test_systems as systems
    join selected_projects as projects on projects.id = systems.project_id
  ),
  station_chunks as (
    select
      'station:' || stations.id::text as chunk_id,
      'station'::text as source_type,
      stations.id as source_id,
      projects.id as project_id,
      projects.name as project_name,
      stations.station_name as title,
      concat_ws(E'\n',
        '站點：' || stations.station_name,
        '順序：第 ' || (stations.station_order + 1)::text || ' 站',
        '說明：' || coalesce(stations.description, '未填寫'),
        '預估工時：' || coalesce(stations.estimated_hours::text || ' 小時', '未設定'),
        '測項：' || coalesce(items.item_names, '尚無測項'),
        '作業內容：' || coalesce(contents.content_titles, '尚無作業內容')
      ) as content,
      '流程站點'::text as source_label,
      'flow-info'::text as module,
      jsonb_build_object('station', stations.id::text) as route_params,
      greatest(
        projects.updated_at,
        coalesce(items.updated_at, stations.created_at),
        coalesce(contents.updated_at, stations.created_at)
      ) as updated_at,
      stations.station_name as exact_key,
      concat_ws(' ',
        '流程 站點 測項 作業內容', stations.station_name, stations.description,
        items.item_names, contents.content_titles
      ) as search_text,
      8.0::real as source_boost
    from public.test_flow_stations as stations
    join selected_projects as projects on projects.id = stations.project_id
    left join lateral (
      select
        string_agg(concat(flow_items.item_name, coalesce('：' || flow_items.description, '')), '；' order by flow_items.item_order) as item_names,
        max(flow_items.created_at) as updated_at
      from public.test_flow_items as flow_items
      where flow_items.station_id = stations.id
        and flow_items.flow_version_id = stations.flow_version_id
    ) as items on true
    left join lateral (
      select
        string_agg(concat(station_content.title, coalesce('：' || station_content.content, '')), '；' order by station_content.order_num) as content_titles,
        max(station_content.updated_at) as updated_at
      from public.station_contents as station_content
      where station_content.station_id = stations.id
        and station_content.flow_version_id = stations.flow_version_id
    ) as contents on true
    where projects.active_flow_version_id is null
       or stations.flow_version_id = projects.active_flow_version_id
  ),
  progress_chunks as (
    select
      'progress:' || systems.id::text || ':' || stations.id::text as chunk_id,
      'progress'::text as source_type,
      (array_agg(progress.id order by progress.updated_at desc))[1] as source_id,
      projects.id as project_id,
      projects.name as project_name,
      systems.system_name || ' · ' || stations.station_name as title,
      concat_ws(E'\n',
        '機台：' || systems.system_name,
        '站點：' || stations.station_name,
        '測項總數：' || count(*)::text,
        '已完成：' || count(*) filter (where progress.status = 'completed')::text,
        '進行中：' || count(*) filter (where progress.status = 'in_progress')::text,
        '未完成：' || count(*) filter (where coalesce(progress.status, 'pending') not in ('completed'))::text,
        '平均進度：' || round(avg(coalesce(progress.progress_percent, 0)))::text || '%',
        '測項明細：' || string_agg(
          flow_items.item_name || ' [' || coalesce(progress.status, 'pending') || ', '
            || coalesce(round(progress.progress_percent)::text, '0') || '%]'
            || coalesce(' 備註：' || progress.notes, ''),
          '；' order by flow_items.item_order
        )
      ) as content,
      '測項進度'::text as source_label,
      'test-tracker'::text as module,
      jsonb_build_object('system', systems.system_name, 'station', stations.id::text) as route_params,
      max(progress.updated_at) as updated_at,
      systems.system_name as exact_key,
      concat_ws(' ',
        '機台 站點 測項 進度 完成 未完成 進行中',
        systems.system_name, stations.station_name,
        string_agg(flow_items.item_name || ' ' || coalesce(progress.status, 'pending') || ' ' || coalesce(progress.notes, ''), ' ')
      ) as search_text,
      11.0::real as source_boost
    from public.test_progress as progress
    join selected_projects as projects on projects.id = progress.project_id
    join public.test_systems as systems on systems.id = progress.system_id
    join public.test_flow_stations as stations on stations.id = progress.station_id
    join public.test_flow_items as flow_items on flow_items.id = progress.item_id
    group by projects.id, projects.name, systems.id, systems.system_name, stations.id, stations.station_name
  ),
  issue_chunks as (
    select
      'issue:' || issues.id::text as chunk_id,
      'issue'::text as source_type,
      issues.id as source_id,
      projects.id as project_id,
      projects.name as project_name,
      issues.title as title,
      concat_ws(E'\n',
        '問題：' || issues.title,
        '狀態：' || issues.status,
        '優先級：' || issues.priority,
        '類別：' || coalesce(issues.category, '未分類'),
        '機台：' || coalesce(systems.system_name, '未指定'),
        '站點：' || coalesce(stations.station_name, '未指定'),
        '測項：' || coalesce(flow_items.item_name, '未指定'),
        '說明：' || issues.description,
        '處理紀錄：' || coalesce(issues.process_notes, '尚無'),
        '解決方式：' || coalesce(issues.solution, '尚無')
      ) as content,
      '問題追蹤'::text as source_label,
      'issues'::text as module,
      jsonb_build_object('openIssue', issues.id::text) as route_params,
      issues.updated_at,
      coalesce(systems.system_name, issues.title) as exact_key,
      concat_ws(' ',
        '問題 異常 優先級 處理 解決', issues.title, issues.status, issues.priority,
        issues.category, issues.description, issues.process_notes, issues.solution,
        systems.system_name, stations.station_name, flow_items.item_name,
        array_to_string(issues.tags, ' ')
      ) as search_text,
      13.0::real as source_boost
    from public.issues as issues
    join selected_projects as projects on projects.id = issues.project_id
    left join public.test_systems as systems on systems.id = issues.system_id
    left join public.test_flow_stations as stations on stations.id = issues.station_id
    left join public.test_flow_items as flow_items on flow_items.id = issues.test_item_id
  ),
  asset_chunks as (
    select
      'asset:tool:' || tools.id::text as chunk_id,
      'asset'::text as source_type,
      tools.id as source_id,
      projects.id as project_id,
      projects.name as project_name,
      tools.tool_name as title,
      concat_ws(E'\n',
        '工具：' || tools.tool_name,
        '版本：' || coalesce(assignments.pinned_version, tools.version, '未指定'),
        '類別：' || coalesce(tools.category, '未分類'),
        '說明：' || coalesce(tools.description, '未填寫'),
        '配置備註：' || coalesce(assignments.notes, '無')
      ) as content,
      '工具資產'::text as source_label,
      'tools'::text as module,
      jsonb_build_object('assetView', 'tools', 'assetId', tools.id::text) as route_params,
      coalesce(tools.updated_at, assignments.created_at) as updated_at,
      tools.tool_name as exact_key,
      concat_ws(' ', '工具 資產 軟體', tools.tool_name, tools.version, tools.category, tools.description, assignments.notes) as search_text,
      7.0::real as source_boost
    from public.test_project_tool_assignments as assignments
    join selected_projects as projects on projects.id = assignments.project_id
    join public.tools_management as tools on tools.id = assignments.tool_id

    union all

    select
      'asset:code:' || snippets.id::text,
      'asset'::text,
      snippets.id,
      projects.id,
      projects.name,
      snippets.title,
      concat_ws(E'\n',
        '程式碼：' || snippets.title,
        '語言：' || snippets.language,
        '類別：' || snippets.category,
        '說明：' || coalesce(snippets.description, '未填寫'),
        '配置備註：' || coalesce(assignments.notes, '無')
      ),
      '程式碼資產'::text,
      'tools'::text,
      jsonb_build_object('assetView', 'code', 'assetId', snippets.id::text),
      snippets.updated_at,
      snippets.title,
      concat_ws(' ', '程式碼 資產 腳本', snippets.title, snippets.language, snippets.category, snippets.description, assignments.notes),
      7.0::real
    from public.test_project_code_assignments as assignments
    join selected_projects as projects on projects.id = assignments.project_id
    join public.code_snippets as snippets on snippets.id = assignments.code_snippet_id

    union all

    select
      'asset:command:' || commands.id::text,
      'asset'::text,
      commands.id,
      projects.id,
      projects.name,
      commands.name,
      concat_ws(E'\n',
        '指令：' || commands.name,
        '平台：' || commands.platform,
        '類別：' || commands.category,
        '說明：' || commands.description,
        '指令內容：' || commands.command,
        '配置備註：' || coalesce(assignments.notes, '無')
      ),
      '指令資產'::text,
      'tools'::text,
      jsonb_build_object('assetView', 'commands', 'assetId', commands.id::text),
      commands.updated_at,
      commands.name,
      concat_ws(' ', '指令 資產 命令', commands.name, commands.platform, commands.category, commands.description, commands.command, assignments.notes),
      7.0::real
    from public.test_project_command_assignments as assignments
    join selected_projects as projects on projects.id = assignments.project_id
    join public.command_library as commands on commands.id = assignments.command_id
    where commands.is_active = true
  ),
  chunks as (
    select * from project_chunks
    union all select * from machine_chunks
    union all select * from station_chunks
    union all select * from progress_chunks
    union all select * from issue_chunks
    union all select * from asset_chunks
  ),
  ranked as (
    select
      chunks.*,
      token_score.matches,
      (
        case when lower(chunks.exact_key) = v_query_lower then 100 else 0 end
        + case when lower(chunks.exact_key) like v_query_lower || '%' then 35 else 0 end
        + case when position(v_query_lower in lower(chunks.search_text)) > 0 then 20 else 0 end
        + token_score.matches * 6
        + greatest(
            extensions.similarity(v_query_lower, lower(chunks.title)),
            extensions.similarity(v_query_lower, lower(chunks.search_text))
          ) * 20
        + chunks.source_boost
        + case when chunks.updated_at >= now() - interval '30 days' then 2 else 0 end
      )::real as calculated_rank
    from chunks
    cross join lateral (
      select count(*)::integer as matches
      from regexp_split_to_table(v_query_lower, E'[\\s,，。；;:：/\\\\|]+') as token(value)
      where char_length(token.value) >= 2
        and position(token.value in lower(chunks.search_text)) > 0
    ) as token_score
  ),
  scored as (
    select
      ranked.*,
      max(ranked.calculated_rank) over () as max_rank
    from ranked
    where lower(ranked.exact_key) = v_query_lower
       or position(v_query_lower in lower(ranked.search_text)) > 0
       or ranked.matches > 0
       or greatest(
            extensions.similarity(v_query_lower, lower(ranked.title)),
            extensions.similarity(v_query_lower, lower(ranked.search_text))
          ) >= 0.08
  )
  select
    scored.chunk_id,
    scored.source_type,
    scored.source_id,
    scored.project_id,
    scored.project_name,
    scored.title,
    scored.content,
    scored.source_label,
    scored.module,
    scored.route_params,
    scored.updated_at,
    scored.calculated_rank as rank
  from scored
  where scored.calculated_rank >= scored.max_rank * 0.35
  order by scored.calculated_rank desc, scored.updated_at desc nulls last, scored.chunk_id
  limit v_limit;
end;
$$;

revoke all on function public.search_maintenance_knowledge(text, uuid[], integer) from public;
grant execute on function public.search_maintenance_knowledge(text, uuid[], integer) to authenticated, service_role;
