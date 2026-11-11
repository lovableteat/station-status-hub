-- All rows are synthetic and rolled back, including the report audit history.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $probe$
declare
  editor uuid:=gen_random_uuid();
  editor_auth uuid:=gen_random_uuid();
  series text:='qa:pdf-pair:'||gen_random_uuid()::text;
  pdf_a text:=gen_random_uuid()::text;
  pdf_b text:=gen_random_uuid()::text;
  pinned text:=gen_random_uuid()::text;
  archived text:=gen_random_uuid()::text;
  elsewhere text:=gen_random_uuid()::text;
  base_report jsonb;
  report jsonb;
  saved jsonb;
  denied boolean;
  candidate text;
begin
  insert into workspace.system_users(id,username,password_hash,role,status,auth_user_id,permissions,display_name)
    values(editor,'circuit-pair-qa-'||editor,'not-a-login','engineer','active',editor_auth,'{"workspaceAccess":{"material-requests":"edit"}}','Circuit PDF Pair QA');
  insert into workspace.ui_table_preferences(table_key,column_order) values
    ('circuit-change-pdfs:'||series,jsonb_build_object('documents',jsonb_build_array(
      jsonb_build_object('id',pdf_a,'pages',5),
      jsonb_build_object('id',pdf_b,'pages',7,'localOnly',true),
      jsonb_build_object('id',pinned,'pages',1,'removedAt','2026-11-10T00:00:00Z'),
      jsonb_build_object('id',archived,'pages',7,'removedAt','2026-11-10T00:00:00Z')))),
    ('circuit-change-pdfs:'||series||':elsewhere',jsonb_build_object('documents',jsonb_build_array(jsonb_build_object('id',elsewhere,'pages',7))));
  insert into workspace.circuit_pdf_official(series_id,document_id,document,updated_by,updated_by_name)
    values(series,pinned,jsonb_build_object('id',pinned,'pages',3),editor,'Circuit PDF Pair QA');
  perform set_config('request.jwt.claim.sub',editor_auth::text,true);
  execute 'set local role authenticated';

  base_report:=jsonb_build_object('version',1,'summary','QA','modelLabel','fixture','generatedBy','Circuit PDF Pair QA',
    'checks','[{"category":"connectivity","state":"unverifiable","note":"QA"},{"category":"net-name","state":"unverifiable","note":"QA"},{"category":"label-name","state":"unverifiable","note":"QA"}]'::jsonb,
    'findings','[]'::jsonb);
  report:=base_report||jsonb_build_object('id',gen_random_uuid(),'officialVersionId',pdf_a,'workingVersionId',pdf_b,
    'officialPage',5,'workingPage',7,'key',format('v1:%s:%s:5:7',pdf_a,pdf_b));
  saved:=workspace.circuit_pdf_save_ai_review(series,report,0);
  assert saved->>'revision'='1' and saved->>'target_key'=report->>'key','two nonofficial PDFs, including local-only, must save';
  assert (select document_id=pinned from workspace.circuit_pdf_official where series_id=series),'comparison must preserve the official version';
  saved:=workspace.circuit_pdf_save_ai_review(series,saved->'report',1);
  assert saved->>'revision'='2','previously saved report and revision must remain valid';

  saved:=workspace.circuit_pdf_save_ai_review(series,base_report||jsonb_build_object('id',gen_random_uuid(),
    'officialVersionId',pdf_a,'workingVersionId',pinned,'officialPage',2,'workingPage',3,
    'key',format('v1:%s:%s:2:3',pdf_a,pinned)),0);
  assert saved->>'revision'='1','protected official snapshot works as the right source even with conflicting registry metadata';
  saved:=workspace.circuit_pdf_save_ai_review(series,base_report||jsonb_build_object('id',gen_random_uuid(),
    'officialVersionId',pinned,'workingVersionId',pdf_b,'officialPage',3,'workingPage',2,
    'key',format('v1:%s:%s:3:2',pinned,pdf_b)),0);
  assert saved->>'revision'='1','protected official snapshot works as the left source';

  foreach candidate in array array[archived,elsewhere,pdf_a] loop
    denied:=false;
    begin
      perform workspace.circuit_pdf_save_ai_review(series,base_report||jsonb_build_object('id',gen_random_uuid(),
        'officialVersionId',pdf_a,'workingVersionId',candidate,'officialPage',1,'workingPage',1,
        'key',format('v1:%s:%s:1:1',pdf_a,candidate)),0);
    exception when invalid_parameter_value then denied:=true; end;
    assert denied,'archived, out-of-series and duplicate PDFs must not save';
  end loop;
  denied:=false;
  begin
    perform workspace.circuit_pdf_save_ai_review(series,base_report||jsonb_build_object('id',gen_random_uuid(),
      'officialVersionId',pdf_a,'workingVersionId',pdf_b,'officialPage',6,'workingPage',1,
      'key',format('v1:%s:%s:6:1',pdf_a,pdf_b)),0);
  exception when invalid_parameter_value then denied:=true; end;
  assert denied,'page bounds must use the selected source';
  assert (select count(*)=4 from workspace.circuit_pdf_ai_review_history where series_id=series),'only valid writes should create history';
end $probe$;
rollback;
