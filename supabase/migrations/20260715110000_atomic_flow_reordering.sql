create or replace function public.reorder_test_flow_stations(
  p_project_id uuid,
  p_flow_version_id uuid,
  p_station_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected_count integer;
  v_provided_count integer;
  v_distinct_count integer;
begin
  if p_project_id is null or p_flow_version_id is null then
    raise exception 'Project and flow version are required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('flow-stations:' || p_flow_version_id::text, 0)
  );

  select count(*)
  into v_expected_count
  from public.test_flow_stations
  where project_id = p_project_id
    and flow_version_id = p_flow_version_id;

  v_provided_count := coalesce(cardinality(p_station_ids), 0);
  select count(distinct station_id)
  into v_distinct_count
  from unnest(coalesce(p_station_ids, '{}'::uuid[])) as station_id;

  if v_expected_count = 0
    or v_provided_count <> v_expected_count
    or v_distinct_count <> v_expected_count
    or exists (
      select 1
      from unnest(coalesce(p_station_ids, '{}'::uuid[])) as provided(station_id)
      left join public.test_flow_stations as stations
        on stations.id = provided.station_id
       and stations.project_id = p_project_id
       and stations.flow_version_id = p_flow_version_id
      where stations.id is null
    )
  then
    raise exception 'Station order does not match the selected flow';
  end if;

  update public.test_flow_stations
  set station_order = station_order + 1000000
  where project_id = p_project_id
    and flow_version_id = p_flow_version_id;

  update public.test_flow_stations as stations
  set station_order = ordered.station_order
  from (
    select station_id, (ordinality - 1)::integer as station_order
    from unnest(p_station_ids) with ordinality as provided(station_id, ordinality)
  ) as ordered
  where stations.id = ordered.station_id
    and stations.project_id = p_project_id
    and stations.flow_version_id = p_flow_version_id;
end;
$$;

create or replace function public.reorder_test_flow_items(
  p_project_id uuid,
  p_flow_version_id uuid,
  p_station_id uuid,
  p_item_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected_count integer;
  v_provided_count integer;
  v_distinct_count integer;
begin
  if p_project_id is null or p_flow_version_id is null or p_station_id is null then
    raise exception 'Project, flow version, and station are required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'flow-items:' || p_flow_version_id::text || ':' || p_station_id::text,
      0
    )
  );

  if not exists (
    select 1
    from public.test_flow_stations
    where id = p_station_id
      and project_id = p_project_id
      and flow_version_id = p_flow_version_id
  ) then
    raise exception 'Station does not belong to the selected flow';
  end if;

  select count(*)
  into v_expected_count
  from public.test_flow_items
  where project_id = p_project_id
    and flow_version_id = p_flow_version_id
    and station_id = p_station_id;

  v_provided_count := coalesce(cardinality(p_item_ids), 0);
  select count(distinct item_id)
  into v_distinct_count
  from unnest(coalesce(p_item_ids, '{}'::uuid[])) as item_id;

  if v_expected_count = 0
    or v_provided_count <> v_expected_count
    or v_distinct_count <> v_expected_count
    or exists (
      select 1
      from unnest(coalesce(p_item_ids, '{}'::uuid[])) as provided(item_id)
      left join public.test_flow_items as items
        on items.id = provided.item_id
       and items.project_id = p_project_id
       and items.flow_version_id = p_flow_version_id
       and items.station_id = p_station_id
      where items.id is null
    )
  then
    raise exception 'Item order does not match the selected station';
  end if;

  update public.test_flow_items
  set item_order = item_order + 1000000
  where project_id = p_project_id
    and flow_version_id = p_flow_version_id
    and station_id = p_station_id;

  update public.test_flow_items as items
  set item_order = ordered.item_order
  from (
    select item_id, (ordinality - 1)::integer as item_order
    from unnest(p_item_ids) with ordinality as provided(item_id, ordinality)
  ) as ordered
  where items.id = ordered.item_id
    and items.project_id = p_project_id
    and items.flow_version_id = p_flow_version_id
    and items.station_id = p_station_id;
end;
$$;

revoke all on function public.reorder_test_flow_stations(uuid, uuid, uuid[]) from public;
revoke all on function public.reorder_test_flow_items(uuid, uuid, uuid, uuid[]) from public;
grant execute on function public.reorder_test_flow_stations(uuid, uuid, uuid[]) to anon, authenticated;
grant execute on function public.reorder_test_flow_items(uuid, uuid, uuid, uuid[]) to anon, authenticated;
