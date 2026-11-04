begin;
-- Only synthetic metadata is created below; this local flag permits RLS delete checks before rollback.
set local storage.allow_delete_query='true';
do $$
declare
  a record; b record; denied boolean;
  path_a text; path_b text;
begin
  select id,auth_user_id into a from workspace.system_users where status='active' and role='admin' and auth_user_id is not null limit 1;
  select id,auth_user_id into b from workspace.system_users where status='active' and role<>'admin' and auth_user_id is not null and id<>a.id limit 1;
  assert a.id is not null and b.id is not null,'two linked test roles required';
  update workspace.system_users set permissions=jsonb_set(coalesce(permissions,'{}'),'{workspaceAccess}',coalesce(permissions->'workspaceAccess','{}')||'{"ai-chat":"view"}') where id in(a.id,b.id);
  path_a:=a.id::text||'/'||gen_random_uuid()::text||'/content';
  path_b:=b.id::text||'/'||gen_random_uuid()::text||'/content';
  assert (select not public from storage.buckets where id='ai-chat-attachments'),'private bucket is public';

  perform set_config('request.jwt.claim.sub',a.auth_user_id::text,true);
  execute 'set local role authenticated';
  insert into storage.objects(bucket_id,name) values('ai-chat-attachments',path_a);
  assert (select count(*)=1 from storage.objects where bucket_id='ai-chat-attachments' and name=path_a),'owner cannot read its attachment';
  denied:=false;
  begin insert into storage.objects(bucket_id,name) values('ai-chat-attachments',path_b);
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'owner can upload into another account';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',b.auth_user_id::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=0 from storage.objects where bucket_id='ai-chat-attachments' and name=path_a),'another account can read private attachment';
  delete from storage.objects where bucket_id='ai-chat-attachments' and name=path_a;
  assert not found,'another account can delete private attachment';
  insert into storage.objects(bucket_id,name) values('ai-chat-attachments',path_b);
  update storage.objects set name=path_a where bucket_id='ai-chat-attachments' and name=path_b;
  assert not found,'an attachment can be overwritten or reassigned';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',a.auth_user_id::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=0 from storage.objects where bucket_id='ai-chat-attachments' and name=path_b),'admin can read another account attachment';
  delete from storage.objects where bucket_id='ai-chat-attachments' and name=path_a;
  assert found,'owner cannot delete attachment';
  execute 'reset role';

  update workspace.system_users set permissions=jsonb_set(permissions,'{workspaceAccess,ai-chat}','"none"') where id=b.id;
  perform set_config('request.jwt.claim.sub',b.auth_user_id::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=0 from storage.objects where bucket_id='ai-chat-attachments' and name=path_b),'revoked account retains attachment access';
  execute 'reset role';
  execute 'set local role anon';
  assert (select count(*)=0 from storage.objects where bucket_id='ai-chat-attachments'),'anonymous attachment access';
  execute 'reset role';
end $$;
rollback;
select 'PASS: private bucket, owner CRUD boundaries, view-only uploads, admin isolation, revoked access and anonymous denial; all fixtures rolled back' as result;
