-- Shared engineering references and AI review runs use the existing material read/edit authority.
create table workspace.circuit_pdf_official (
  series_id text primary key, document_id text not null, document jsonb not null,
  revision integer not null default 1, updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references workspace.system_users(id), updated_by_name text not null
);
create table workspace.circuit_pdf_official_history (
  id bigint generated always as identity primary key, series_id text not null,
  document_id text not null, document jsonb not null, revision integer not null,
  created_at timestamptz not null default clock_timestamp(), actor_id uuid not null, actor_name text not null
);
create table workspace.circuit_pdf_ai_reviews (
  id uuid primary key, series_id text not null, target_key text not null,
  official_document_id text not null, working_document_id text not null,
  official_page integer not null check (official_page between 1 and 3000),
  working_page integer not null check (working_page between 1 and 3000),
  report jsonb not null, revision integer not null default 1,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references workspace.system_users(id), updated_by uuid not null references workspace.system_users(id)
);
create index circuit_pdf_ai_reviews_target on workspace.circuit_pdf_ai_reviews(series_id,target_key,created_at desc);
create table workspace.circuit_pdf_ai_review_history (
  id bigint generated always as identity primary key, review_id uuid not null references workspace.circuit_pdf_ai_reviews(id),
  series_id text not null, revision integer not null, report jsonb not null,
  created_at timestamptz not null default clock_timestamp(), actor_id uuid not null, actor_name text not null
);
alter table workspace.circuit_pdf_official enable row level security;
alter table workspace.circuit_pdf_official_history enable row level security;
alter table workspace.circuit_pdf_ai_reviews enable row level security;
alter table workspace.circuit_pdf_ai_review_history enable row level security;
revoke all on workspace.circuit_pdf_official,workspace.circuit_pdf_official_history,workspace.circuit_pdf_ai_reviews,workspace.circuit_pdf_ai_review_history from public,anon,authenticated;
grant select on workspace.circuit_pdf_official,workspace.circuit_pdf_official_history,workspace.circuit_pdf_ai_reviews,workspace.circuit_pdf_ai_review_history to authenticated;
grant all on workspace.circuit_pdf_official,workspace.circuit_pdf_official_history,workspace.circuit_pdf_ai_reviews,workspace.circuit_pdf_ai_review_history to service_role;
create policy circuit_pdf_official_read on workspace.circuit_pdf_official for select to authenticated using ((select rlc_priority_private.has_access(false)));
create policy circuit_pdf_official_history_read on workspace.circuit_pdf_official_history for select to authenticated using ((select rlc_priority_private.has_access(false)));
create policy circuit_pdf_ai_reviews_read on workspace.circuit_pdf_ai_reviews for select to authenticated using ((select rlc_priority_private.has_access(false)));
create policy circuit_pdf_ai_review_history_read on workspace.circuit_pdf_ai_review_history for select to authenticated using ((select rlc_priority_private.has_access(false)));
create index circuit_pdf_official_history_path on workspace.circuit_pdf_official_history((document->>'path'));
-- A client opened before this release must not delete an original used as an official reference.
create policy circuit_pdf_preserve_official_original on storage.objects as restrictive for delete to authenticated
using (bucket_id<>'material-spec-documents' or not exists(select 1 from workspace.circuit_pdf_official_history history where history.document->>'path'=name));

create function workspace.circuit_pdf_set_official(p_series_id text,p_document_id text,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; actor_label text; doc jsonb; prior workspace.circuit_pdf_official; saved workspace.circuit_pdf_official;
begin
  actor:=circuit_change_private.actor_id();
  if p_series_id is null or char_length(p_series_id) not between 1 and 500 or p_expected_revision is null or p_expected_revision<0 then raise exception '官方基準資料不正確' using errcode='22023'; end if;
  select value into doc from workspace.ui_table_preferences pref,
    lateral jsonb_array_elements(pref.column_order->'documents') where pref.table_key='circuit-change-pdfs:'||p_series_id
    and value->>'id'=p_document_id and coalesce(value->>'localOnly','false')='false' and coalesce(value->>'removedAt','')=''
    and value->>'path' ~ '^circuit-pdf/[0-9a-f]{32}/[0-9a-f-]{36}\.pdf$';
  if doc is null then raise exception '請先上傳並保存這份 PDF，再設為官方基準' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('circuit-official:'||p_series_id,0));
  select * into prior from workspace.circuit_pdf_official where series_id=p_series_id for update;
  if coalesce(prior.revision,0)<>p_expected_revision then raise exception '官方基準已由其他人更新，請重新載入' using errcode='PT409'; end if;
  select left(coalesce(nullif(display_name,''),username,'使用者'),160) into actor_label from workspace.system_users where id=actor;
  insert into workspace.circuit_pdf_official(series_id,document_id,document,revision,updated_by,updated_by_name)
  values(p_series_id,p_document_id,doc,coalesce(prior.revision,0)+1,actor,actor_label)
  on conflict(series_id) do update set document_id=excluded.document_id,document=excluded.document,revision=excluded.revision,updated_at=clock_timestamp(),updated_by=actor,updated_by_name=actor_label returning * into saved;
  insert into workspace.circuit_pdf_official_history(series_id,document_id,document,revision,actor_id,actor_name) values(p_series_id,p_document_id,doc,saved.revision,actor,actor_label);
  return to_jsonb(saved);
end;
$$;

create function workspace.circuit_pdf_save_ai_review(p_series_id text,p_report jsonb,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; actor_label text; run_id uuid; official_id text; working_id text; official_page integer; working_page integer; target text;
  prior workspace.circuit_pdf_ai_reviews; saved workspace.circuit_pdf_ai_reviews; official workspace.circuit_pdf_official;
  working jsonb; finding jsonb; check_value jsonb; normalized jsonb; reviewed jsonb; prior_finding jsonb; now_text text;
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
    if official.document_id is distinct from official_id or official_page>(official.document->>'pages')::integer then raise exception '官方基準已變更，請重新選擇版本後初審' using errcode='PT409'; end if;
    select value into working from workspace.ui_table_preferences pref,lateral jsonb_array_elements(pref.column_order->'documents')
      where pref.table_key='circuit-change-pdfs:'||p_series_id and value->>'id'=working_id and coalesce(value->>'removedAt','')='';
    if working is null or working_page>(working->>'pages')::integer then raise exception '找不到這份工作版本或頁碼' using errcode='22023'; end if;
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
revoke all on function workspace.circuit_pdf_set_official(text,text,integer),workspace.circuit_pdf_save_ai_review(text,jsonb,integer) from public,anon;
grant execute on function workspace.circuit_pdf_set_official(text,text,integer),workspace.circuit_pdf_save_ai_review(text,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
