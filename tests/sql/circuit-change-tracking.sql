-- Transaction-only actors, BOM and Storage metadata; never touches an existing account or BOM.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $probe$
#variable_conflict use_variable
declare
  editor uuid:=gen_random_uuid(); editor_auth uuid:=gen_random_uuid(); reviewer uuid:=gen_random_uuid(); reviewer_auth uuid:=gen_random_uuid();
  viewer uuid:=gen_random_uuid(); viewer_auth uuid:=gen_random_uuid(); source_bom text:='qa:circuit:'||gen_random_uuid()::text;
  change_set jsonb; saved jsonb; content jsonb; item_id uuid:=gen_random_uuid(); set_id uuid; image_id uuid; image_path text;
  images jsonb:='[]'::jsonb; denied boolean; old_set_stamp timestamptz; n integer; stamp_name text;
begin
  insert into workspace.system_users(id,username,password_hash,role,status,auth_user_id,permissions,display_name)
  values(editor,'circuit-qa-'||editor::text,'not-a-login','engineer','active',editor_auth,'{"workspaceAccess":{"material-requests":"edit"}}','Circuit QA Editor'),
    (reviewer,'circuit-qa-'||reviewer::text,'not-a-login','engineer','active',reviewer_auth,'{"workspaceAccess":{"material-requests":"edit"}}','Circuit QA Reviewer'),
    (viewer,'circuit-qa-'||viewer::text,'not-a-login','engineer','active',viewer_auth,'{"workspaceAccess":{"material-requests":"view"}}','Circuit QA Viewer');
  insert into workspace.material_bom_workspaces(id,name,source_file,sheet_name,record_count)
    values(source_bom,'Circuit QA transaction only','QA.xlsx','QA',0);
  perform set_config('request.jwt.claim.sub',editor_auth::text,true);
  execute 'set local role authenticated';
  change_set:=workspace.circuit_change_create_set(source_bom,source_bom,null,'QA line changes','V1','V2');
  set_id:=(change_set->>'id')::uuid; old_set_stamp:=(change_set->>'updated_at')::timestamptz;
  assert change_set->>'created_by'=editor::text,'set actor must be server derived';
  content:='{"title":"Replace circuit","reason":"review","description":"","refs":"R1","net":"VDD","page":"1","owner":"Engineer","images":[]}'::jsonb;
  saved:=workspace.circuit_change_save_item(set_id,item_id,0,content);
  assert saved->>'number'='1' and saved->>'revision'='1' and saved->>'status'='draft','create numbering/revision';
  assert saved->>'created_by'=editor::text and saved->>'updated_by'=editor::text,'item actor must be server derived';
  assert (select updated_at>old_set_stamp from workspace.circuit_change_sets where id=set_id),'set poll stamp must advance';
  denied:=false; begin perform workspace.circuit_change_action(item_id,1,'submit',''); exception when invalid_parameter_value then denied:=true; end;
  assert denied,'submit needs actual change evidence';
  content:=jsonb_set(content,'{description}','"Change R1 value"');
  saved:=workspace.circuit_change_save_item(set_id,item_id,1,content);
  saved:=workspace.circuit_change_action(item_id,2,'submit','Ready');
  assert saved->>'status'='in_review','submit status';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',reviewer_auth::text,true);
  execute 'set local role authenticated';
  saved:=workspace.circuit_change_action(item_id,3,'approve','Checked');
  assert saved->>'status'='approved' and saved->>'updated_by'=reviewer::text,'non-admin editor can review';
  saved:=workspace.circuit_change_save_item(set_id,item_id,4,content);
  assert saved->>'revision'='4' and saved->>'status'='approved','no-op save must retain review';
  content:=jsonb_set(content,'{description}','"Change R1 again"');
  saved:=workspace.circuit_change_save_item(set_id,item_id,4,content);
  assert saved->>'status'='draft' and saved->>'revision'='5','edit must invalidate current review';
  assert (select snapshot->>'status'='approved' and snapshot#>>'{content,description}'='Change R1 value'
    from workspace.circuit_change_events e where e.item_id=item_id and e.revision=4),'old review content must remain';
  denied:=false; begin perform workspace.circuit_change_save_item(set_id,item_id,4,content); exception when sqlstate 'PT409' then denied:=true; end;
  assert denied,'stale save must return PT409';
  saved:=workspace.circuit_change_action(item_id,5,'submit','');
  denied:=false; begin perform workspace.circuit_change_action(item_id,6,'request_changes',''); exception when invalid_parameter_value then denied:=true; end;
  assert denied,'return must require note';
  saved:=workspace.circuit_change_action(item_id,6,'request_changes','Please add after images');
  saved:=workspace.circuit_change_action(item_id,7,'comment','Working on the requested images');
  assert saved->>'status'='needs_changes' and saved->>'revision'='8','comment must preserve review state';
  for n in 1..10 loop
    image_id:=gen_random_uuid(); image_path:=set_id::text||'/'||item_id::text||'/'||image_id::text||'.png';
    insert into storage.objects(bucket_id,name) values('circuit-change-images',image_path);
    images:=images||jsonb_build_array(jsonb_build_object('id',image_id,'name','image.png','path',image_path,'mime','image/png','size',10,'width',100,'height',100,
      'side','after','caption','Image '||n,'marks','[]'::jsonb,'uploadedAt',clock_timestamp(),'uploadedBy',reviewer));
  end loop;
  content:=jsonb_set(content,'{images}',images);
  saved:=workspace.circuit_change_save_item(set_id,item_id,8,content);
  assert jsonb_array_length(saved#>'{content,images}')=10,'same-name images must append and persist';
  assert jsonb_array_length((workspace.circuit_change_list_items(set_id)->0)#>'{content,images}')=0
    and workspace.circuit_change_list_items(set_id)->0->>'image_count'='10','list must strip image payload';
  denied:=false; begin update workspace.circuit_change_items set status='approved' where id=item_id; exception when insufficient_privilege then denied:=true; end;
  assert denied,'direct writes must not bypass history';
  denied:=false; begin insert into storage.objects(bucket_id,name) values('circuit-change-images',set_id::text||'/'||gen_random_uuid()::text||'/bad.png'); exception when insufficient_privilege then denied:=true; end;
  assert denied,'upload must reference an existing item';
  update storage.objects set name=set_id::text||'/'||item_id::text||'/overwritten.png' where bucket_id='circuit-change-images' and name=image_path;
  assert not found,'original image overwrite must be denied';
  denied:=false;
  begin
    delete from storage.objects where bucket_id='circuit-change-images' and name=image_path;
    denied:=not found;
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'original image delete must be denied';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',viewer_auth::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=1 from workspace.circuit_change_items where id=item_id),'viewer can read shared changes';
  assert (select count(*)=10 from storage.objects where bucket_id='circuit-change-images' and (storage.foldername(name))[1]=set_id::text),'viewer can read shared images';
  denied:=false; begin insert into storage.objects(bucket_id,name) values('circuit-change-images',set_id::text||'/'||item_id::text||'/viewer.png'); exception when insufficient_privilege then denied:=true; end;
  assert denied,'viewer cannot upload images';
  denied:=false; begin perform workspace.circuit_change_action(item_id,9,'submit',''); exception when insufficient_privilege then denied:=true; end;
  assert denied,'viewer cannot modify or review';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  execute 'set local role authenticated';
  assert not exists(select 1 from workspace.circuit_change_sets where id=set_id),'unmapped session cannot read changes';
  assert not exists(select 1 from storage.objects where bucket_id='circuit-change-images' and (storage.foldername(name))[1]=set_id::text),'unmapped session cannot read images';
  execute 'reset role';
  assert (select count(*)=9 from workspace.circuit_change_events e where e.item_id=item_id),'every real write needs one immutable event';
end;
$probe$;
select jsonb_build_object('passed',true,'checks',array['create','per-item review','no-op approval retention','revision PT409','snapshot history','ten same-name images','metadata-only lists','shared viewer access','write permissions','immutable originals']) as circuit_change_probe;
rollback;
