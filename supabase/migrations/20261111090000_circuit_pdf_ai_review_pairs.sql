-- Select either available PDF in this series. Existing report keys and history remain compatible.
create or replace function workspace.circuit_pdf_save_ai_review(p_series_id text,p_report jsonb,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; actor_label text; run_id uuid; official_id text; working_id text; official_page integer; working_page integer; target text;
  prior workspace.circuit_pdf_ai_reviews; saved workspace.circuit_pdf_ai_reviews; official workspace.circuit_pdf_official;
  registry jsonb; baseline jsonb; working jsonb; finding jsonb; check_value jsonb; normalized jsonb; reviewed jsonb; prior_finding jsonb; now_text text;
begin
  actor:=circuit_change_private.actor_id();
  if p_series_id is null or char_length(p_series_id) not between 1 and 500 or p_expected_revision is null or p_expected_revision<0
    or jsonb_typeof(p_report) is distinct from 'object' or octet_length(p_report::text)>2000000
    or p_report->>'version'<>'1' or char_length(coalesce(p_report->>'summary','')) not between 1 and 4000
    or char_length(coalesce(p_report->>'modelLabel','')) not between 1 and 250
    or jsonb_typeof(p_report->'checks') is distinct from 'array' or jsonb_array_length(p_report->'checks')<>3
    or jsonb_typeof(p_report->'findings') is distinct from 'array' or jsonb_array_length(p_report->'findings')>40
  then raise exception 'AI 初審紀錄格式不正確' using errcode='22023'; end if;
  run_id:=(p_report->>'id')::uuid; official_id:=p_report->>'officialVersionId'; working_id:=p_report->>'workingVersionId';
  official_page:=(p_report->>'officialPage')::integer; working_page:=(p_report->>'workingPage')::integer;
  target:=format('v1:%s:%s:%s:%s',official_id,working_id,official_page,working_page);
  if run_id is null or official_id is null or working_id is null or official_id=working_id or p_report->>'key' is distinct from target
    or official_page not between 1 and 3000 or working_page not between 1 and 3000 then raise exception 'AI 初審版本或頁碼不正確' using errcode='22023'; end if;
  for check_value in select value from jsonb_array_elements(p_report->'checks') loop
    if check_value->>'category' not in ('connectivity','net-name','label-name') or check_value->>'state' not in ('possible-issue','no-visible-issue','unverifiable') or char_length(coalesce(check_value->>'note','')) not between 1 and 2000 then raise exception 'AI 檢查項目不完整' using errcode='22023'; end if;
  end loop;
  if (select count(distinct value->>'category') from jsonb_array_elements(p_report->'checks'))<>3 then raise exception 'AI 檢查項目重複' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('circuit-ai:'||run_id::text,0));
  select * into prior from workspace.circuit_pdf_ai_reviews where id=run_id for update;
  if coalesce(prior.revision,0)<>p_expected_revision then raise exception 'AI 判讀紀錄已由其他人更新，請重新開啟核對' using errcode='PT409'; end if;
  if prior.id is null then
    select * into official from workspace.circuit_pdf_official where series_id=p_series_id;
    select column_order->'documents' into registry from workspace.ui_table_preferences
      where table_key='circuit-change-pdfs:'||p_series_id;
    if jsonb_typeof(registry) is distinct from 'array' then registry:='[]'::jsonb; end if;
    -- An official version keeps its protected snapshot regardless of which side it occupies.
    if official.document_id=official_id then baseline:=official.document;
    else
      select value into baseline from jsonb_array_elements(registry)
        where value->>'id'=official_id and coalesce(value->>'removedAt','')='';
    end if;
    if official.document_id=working_id then working:=official.document;
    else
      select value into working from jsonb_array_elements(registry)
        where value->>'id'=working_id and coalesce(value->>'removedAt','')='';
    end if;
    if baseline is null or coalesce((baseline->>'pages')::integer,0)<official_page then
      raise exception '找不到選定的基準版本或頁碼' using errcode='22023';
    end if;
    if working is null or coalesce((working->>'pages')::integer,0)<working_page then
      raise exception '找不到選定的比對版本或頁碼' using errcode='22023';
    end if;
  else
    if prior.series_id<>p_series_id or prior.target_key<>target or (prior.report-array['updatedAt','findings','generatedBy']) is distinct from (p_report-array['updatedAt','findings','generatedBy'])
      or (select jsonb_agg(value-array['decision','reviewNote','reviewedBy','reviewedAt'] order by ordinality) from jsonb_array_elements(prior.report->'findings') with ordinality)
      is distinct from (select jsonb_agg(value-array['decision','reviewNote','reviewedBy','reviewedAt'] order by ordinality) from jsonb_array_elements(p_report->'findings') with ordinality)
      then raise exception 'AI 分析原文不可改寫；重新分析會建立新的紀錄' using errcode='22023'; end if;
  end if;
  select left(coalesce(nullif(display_name,''),username,'使用者'),160) into actor_label from workspace.system_users where id=actor;
  now_text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); reviewed:='[]'::jsonb;
  for finding in select value from jsonb_array_elements(p_report->'findings') loop
    if finding->>'category' not in ('connectivity','net-name','label-name') or finding->>'priority' not in ('high','medium','low') or finding->>'decision' not in ('pending','confirmed','dismissed')
      or char_length(coalesce(finding->>'id','')) not between 1 and 80 or char_length(coalesce(finding->>'title','')) not between 1 and 300
      or char_length(coalesce(finding->>'location','')) not between 1 and 500 or char_length(coalesce(finding->>'officialEvidence','')) not between 1 and 2000
      or char_length(coalesce(finding->>'workingEvidence','')) not between 1 and 2000 or char_length(coalesce(finding->>'suggestion','')) not between 1 and 2000
      or char_length(coalesce(finding->>'reviewNote',''))>2000 then raise exception 'AI 問題或人工判讀格式不正確' using errcode='22023'; end if;
    if prior.id is null then finding:=finding||jsonb_build_object('decision','pending','reviewNote','','reviewedBy','','reviewedAt','');
    else
      select value into prior_finding from jsonb_array_elements(prior.report->'findings') where value->>'id'=finding->>'id';
      if (finding->>'decision',finding->>'reviewNote') is distinct from (prior_finding->>'decision',prior_finding->>'reviewNote') then
        finding:=finding||jsonb_build_object('reviewedBy',actor_label,'reviewedAt',now_text);
      else finding:=finding||jsonb_build_object('reviewedBy',prior_finding->>'reviewedBy','reviewedAt',prior_finding->>'reviewedAt'); end if;
    end if;
    reviewed:=reviewed||jsonb_build_array(finding);
  end loop;
  normalized:=p_report||jsonb_build_object('findings',reviewed,'updatedAt',now_text,'generatedBy',coalesce(prior.report->>'generatedBy',actor_label));
  insert into workspace.circuit_pdf_ai_reviews(id,series_id,target_key,official_document_id,working_document_id,official_page,working_page,report,created_by,updated_by)
    values(run_id,p_series_id,target,official_id,working_id,official_page,working_page,normalized,actor,actor)
    on conflict(id) do update set report=excluded.report,revision=prior.revision+1,updated_at=clock_timestamp(),updated_by=actor returning * into saved;
  insert into workspace.circuit_pdf_ai_review_history(review_id,series_id,revision,report,actor_id,actor_name) values(run_id,p_series_id,saved.revision,normalized,actor,actor_label);
  return to_jsonb(saved);
end;
$$;
notify pgrst,'reload schema';
