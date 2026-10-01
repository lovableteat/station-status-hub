-- Lists must never wait for every employee's embedded evidence files.
begin;
set local lock_timeout='3s';
alter table workspace.performance_reviews add column if not exists review_index jsonb not null default '{}'::jsonb;

create or replace function workspace.performance_review_index_payload(p_self text,p_manager text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare s jsonb := '{}'; m jsonb := '{}'; sections jsonb := '{}'; category text;
begin
  if starts_with(coalesce(p_self,''),E'RD2_SELF_V1\n') then
    begin s := substring(p_self from length(E'RD2_SELF_V1\n')+1)::jsonb;
    exception when invalid_text_representation then s := '{}'; end;
  end if;
  if starts_with(coalesce(p_manager,''),E'RD2_MANAGER_V1\n') then
    begin m := substring(p_manager from length(E'RD2_MANAGER_V1\n')+1)::jsonb;
    exception when invalid_text_representation then m := '{}'; end;
  end if;
  foreach category in array array['IDP','OKR','KPI'] loop
    sections := sections || jsonb_build_object(category,jsonb_build_object('selfScore',s->'sections'->category->'selfScore'));
  end loop;
  return jsonb_build_object('selfFeedback',E'RD2_SELF_V1\n'||jsonb_build_object(
    'employeeNumber',s->>'employeeNumber','grade',s->>'grade','sections',sections)::text,
    'managerFeedback',E'RD2_MANAGER_V1\n'||jsonb_build_object('employeeNumber',m->>'employeeNumber')::text);
end;
$$;
revoke all on function workspace.performance_review_index_payload(text,text) from public,anon,authenticated;

create or replace function workspace.sync_performance_review_index()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.review_index := workspace.performance_review_index_payload(new.self_feedback,new.manager_feedback);
  elsif new.self_feedback is distinct from old.self_feedback
     or new.manager_feedback is distinct from old.manager_feedback
     or old.review_index='{}'::jsonb then
    new.review_index := workspace.performance_review_index_payload(new.self_feedback,new.manager_feedback);
  else
    -- The projection is database-owned; direct client edits cannot forge it.
    new.review_index := old.review_index;
  end if;
  return new;
end;
$$;
revoke all on function workspace.sync_performance_review_index() from public,anon,authenticated;
create or replace trigger sync_performance_review_index before insert or update on workspace.performance_reviews
for each row execute function workspace.sync_performance_review_index();

create or replace function workspace.preserve_performance_name_version()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_compare workspace.performance_reviews%rowtype;
begin
  v_compare := new;
  v_compare.employee_name := old.employee_name;
  v_compare.employee_id := old.employee_id;
  v_compare.updated_at := old.updated_at;
  -- Rebuilding this derived index is not a change to assessment content.
  v_compare.review_index := old.review_index;
  if v_compare is not distinct from old then new.updated_at := old.updated_at; end if;
  return new;
end;
$$;
revoke all on function workspace.preserve_performance_name_version() from public,anon,authenticated;
update workspace.performance_reviews set review_index=review_index where review_index='{}'::jsonb;

notify pgrst,'reload schema';
commit;
