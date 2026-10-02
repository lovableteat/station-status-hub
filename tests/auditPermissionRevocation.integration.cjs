const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const qa=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'));
const {PGlite}=qa('@electric-sql/pglite');
const sql=n=>fs.readFileSync(`supabase/migrations/${n}.sql`,'utf8');
const func=(s,name)=>{const i=s.toLowerCase().indexOf('create or replace function '+name.toLowerCase());assert.ok(i>=0,name);return s.slice(i,s.indexOf('$$;',s.toLowerCase().indexOf('as $$',i)+5)+3);};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('latest effective permission policies enforce revocation, hierarchy, durable settings and legacy compatibility',async()=>{
 const db=new PGlite();let checks=0;
 const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 const actor=async n=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.role','authenticated',false)",[id(n)]);await db.exec('set role authenticated');};
 const root=()=>db.exec("reset role;select set_config('test.role','service_role',false)");
 const settings=async(n,value)=>{await root();await db.query('update workspace.system_users set permissions=$1 where id=$2',[value,id(n)]);await actor(n);};
 const visible=async()=> (await db.query('select id from workspace.performance_reviews order by id')).rows.map(r=>r.id);
 const dc=async()=> (await db.query('select public.can_view_data_center_projects() as public_view,workspace.can_view_data_center_projects() as view,public.can_edit_data_center_projects() as public_edit,workspace.can_edit_data_center_projects() as edit')).rows[0];
 const accounts=async()=> (await db.query('select public.can_manage_system_users() as public_manage,workspace.can_manage_system_users() as manage')).rows[0];
 try{
  await db.exec(`create schema workspace;create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
   grant usage on schema workspace,auth,public to authenticated;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.role() returns text language sql stable as $$select current_setting('test.role',true)::text$$;
   create table workspace.system_users(id uuid primary key,auth_user_id uuid,username text,display_name text,role text,status text,permissions jsonb);
   create table workspace.user_page_permissions(user_id uuid,permission text,granted_by text);
   create function workspace.current_system_user_id() returns uuid language sql stable security definer set search_path='' as $$select id from workspace.system_users where auth_user_id=auth.uid()$$;
   create table workspace.performance_org_members(employee_id uuid,manager_id uuid,performance_role text,org_level text,section text);
   create function workspace.performance_scopes_unlocked(uuid[]) returns boolean language sql stable as $$select coalesce(current_setting('test.unlocked',true),'true') <> 'false'$$;
   create table workspace.performance_reviews(id text,employee_id text,reviewer_name text,privacy_scope_ids uuid[],manager_feedback text);
   grant select,update,delete,insert on workspace.performance_reviews to authenticated;alter table workspace.performance_reviews enable row level security;
   create table workspace.data_center_projects(id text primary key,name text);
   grant select,insert,update,delete on workspace.data_center_projects to authenticated;alter table workspace.data_center_projects enable row level security;`);
  await db.exec(func(sql('20260824120000_repair_workspace_schema_and_sensitive_access'),'workspace.current_user_can_workspace'));
  await db.exec(func(sql('20260903120000_add_performance_organization'),'workspace.resolve_performance_employee'));
  await db.exec(func(sql('20260902130000_restore_performance_employee_identity'),'workspace.current_user_is_performance_employee'));
  const final=sql('20260907130000_restrict_performance_scores_to_assigned_supervisors');
  for(const name of ['current_user_is_performance_manager','can_manage_performance_record','can_read_performance_section_report'])await db.exec(func(final,'workspace.'+name));
  await db.exec(func(sql('20261001190000_reduce_performance_submission_load'),'workspace.guard_performance_review_self_update'));
  await db.exec('create trigger guard_review before insert or update on workspace.performance_reviews for each row execute function workspace.guard_performance_review_self_update()');
  const policy=sql('20260903130000_protect_performance_groups');
  await db.exec(policy.slice(policy.indexOf('create policy performance_reviews_read'),policy.indexOf('create or replace function workspace.sync_performance_review_org_manager')));
  const original=sql('20260731120000_registration_and_shared_data_center');
  for(const name of ['can_view_data_center_projects','can_edit_data_center_projects']){
   const body=func(original,'public.'+name).replaceAll('public.system_users','workspace.system_users').replaceAll('public.user_page_permissions','workspace.user_page_permissions');
   await db.exec(body);await db.exec(body.replace('public.'+name,'workspace.'+name));
  }
  const accountBody=func(sql('20260731170000_align_account_approval_permissions'),'public.can_manage_system_users').replaceAll('public.system_users','workspace.system_users').replaceAll('public.user_page_permissions','workspace.user_page_permissions');
  await db.exec(accountBody);await db.exec(accountBody.replace('public.can_manage_system_users','workspace.can_manage_system_users'));
  await db.exec(`create policy dc_read on workspace.data_center_projects for select to authenticated using(public.can_view_data_center_projects());
   create policy dc_insert on workspace.data_center_projects for insert to authenticated with check(public.can_edit_data_center_projects());
   create policy dc_update on workspace.data_center_projects for update to authenticated using(public.can_edit_data_center_projects()) with check(public.can_edit_data_center_projects());
   create policy dc_delete on workspace.data_center_projects for delete to authenticated using(public.can_edit_data_center_projects());`);
  await root();
  for(let n=1;n<=9;n++)await db.query('insert into workspace.system_users values($1,$1,$2,$2,$3,\'active\',$4)',[id(n),`fixture-${n}`,n===8?'admin':n===9?'super_admin':'engineer',{workspaceAccess:{performance:'edit'},performanceManager:[1,3,6].includes(n)}]);
  for(const [n,parent,level,section] of [[3,null,'director',''],[1,3,'section_chief','A'],[2,1,'member','A'],[4,3,'member','acting B'],[5,6,'member','C'],[6,3,'section_chief','C'],[7,6,'member','C']])await db.query('insert into workspace.performance_org_members values($1,$2,$3,$4,$5)',[id(n),parent?id(parent):null,level==='member'?'employee':'manager',level,section]);
  for(const n of [1,2,4,5,6,7])await db.query('insert into workspace.performance_reviews values($1,$2,\'assigned\',array[]::uuid[],\'PRIVATE FEEDBACK\')',[`review-${n}`,id(n)]);
  await db.exec("insert into workspace.data_center_projects values('DC','fixture');");
  await db.query("insert into workspace.user_page_permissions values($1,'data_center_edit','fixture'),($1,'admin_edit','fixture')",[id(1)]);
  // Establish the exact old-policy counterexamples before applying the additive fix.
  await settings(1,{workspaceAccess:{performance:'edit','data-center':'none','user-management':'none'},performanceManager:false,pagePermissions:[]});
  equal(await visible(),['review-1','review-2'],'before: revoked chief still reads subordinate feedback');
  equal(await dc(),{public_view:true,view:true,public_edit:true,edit:true},'before: stale DC rows bypass explicit none');
  equal(await accounts(),{public_manage:true,manage:true},'before: stale admin row bypasses explicit none/durable empty');
  await root();await db.exec(sql('20261002160000_enforce_explicit_permission_revocation'));
  await actor(1);
  equal(await visible(),['review-1'],'revoked chief retains own row only');
  equal((await db.query("update workspace.performance_reviews set manager_feedback='unauthorized' where id='review-2' returning id")).rows,[],'revoked chief cannot update subordinate');
  await assert.rejects(()=>db.query("insert into workspace.performance_reviews values('unauthorized',$1,'assigned',array[]::uuid[],'private')",[id(2)]));checks++;
  equal((await db.query("delete from workspace.performance_reviews where id='review-2' returning id")).rows,[],'revoked chief cannot delete subordinate');
  equal(await dc(),{public_view:false,view:false,public_edit:false,edit:false},'explicit DC none blocks both public/workspace aliases');
  equal(await accounts(),{public_manage:false,manage:false},'explicit account none blocks both aliases');
  for(const level of ['none','view','edit',null,'invalid']){
   await settings(1,{workspaceAccess:{'data-center':level,'user-management':level},pagePermissions:['admin_edit']});
   equal(await dc(),{public_view:['view','edit'].includes(level),view:['view','edit'].includes(level),public_edit:level==='edit',edit:level==='edit'},`DC ${level} overrides legacy edit`);
   equal(await accounts(),{public_manage:level==='edit',manage:level==='edit'},`account ${level} intersects admin detail`);
   equal((await db.query('select id from workspace.data_center_projects')).rows.length,['view','edit'].includes(level)?1:0,`DC RLS SELECT ${level}`);
   equal((await db.query("update workspace.data_center_projects set name='fixture-updated' where id='DC' returning id")).rows.length,level==='edit'?1:0,`DC RLS UPDATE ${level}`);
   if(level!=='edit'){await assert.rejects(()=>db.query("insert into workspace.data_center_projects values('DENIED','denied')"));checks++;equal((await db.query("delete from workspace.data_center_projects where id='DC' returning id")).rows.length,0,`DC RLS DELETE ${level}`);}
  }
  await settings(1,{workspaceAccess:{'user-management':'edit'},pagePermissions:[]});
  equal(await accounts(),{public_manage:false,manage:false},'durable empty array overrides stale legacy admin_edit');
  equal(await dc(),{public_view:false,view:false,public_edit:false,edit:false},'absent DC workspace uses durable page array before stale rows');
  await settings(1,{workspaceAccess:{'user-management':'edit'},pagePermissions:['api_management_edit']});
  equal(await accounts(),{public_manage:false,manage:false},'API editing does not grant account management');
  await settings(1,{pagePermissions:['data_center_view','admin_edit']});
  equal(await dc(),{public_view:true,view:true,public_edit:false,edit:false},'durable legacy view preserved when key absent');
  equal(await accounts(),{public_manage:true,manage:true},'durable legacy account edit preserved when key absent');
  await settings(1,{});
  equal(await dc(),{public_view:true,view:true,public_edit:true,edit:true},'old account without durable copy retains legitimate legacy DC edit');
  equal(await accounts(),{public_manage:true,manage:true},'old account retains legitimate legacy admin edit');
  for(const n of [8,9]){
   await settings(n,{workspaceAccess:{'data-center':'none','user-management':'none'},pagePermissions:[]});
   equal(await dc(),{public_view:true,view:true,public_edit:true,edit:true},`active site-admin ${n} DC exception retained`);
   equal(await accounts(),{public_manage:true,manage:true},`active site-admin ${n} account exception retained`);
   equal(await visible(),[],`site-admin ${n} has no assessment-data bypass`);
   await root();await db.query("update workspace.system_users set status='inactive' where id=$1",[id(n)]);await actor(n);
   equal(await dc(),{public_view:false,view:false,public_edit:false,edit:false},`inactive admin ${n} DC denied`);
   equal(await accounts(),{public_manage:false,manage:false},`inactive admin ${n} account denied`);
  }
  await settings(1,{workspaceAccess:{performance:'edit'},performanceManager:true});
  equal(await visible(),['review-1','review-2'],'assigned chief sees only own/direct member');
  equal((await db.query("update workspace.performance_reviews set manager_feedback='allowed' where id='review-2' returning id")).rows.length,1,'assigned chief can update direct member');
  for(const level of ['view','none']){await settings(1,{workspaceAccess:{performance:level},performanceManager:true});equal(await visible(),level==='view'?['review-1']:[],`chief ${level} cannot manage direct member`);}
  await settings(1,{workspaceAccess:{performance:'edit'},performanceManager:true});await db.exec("select set_config('test.unlocked','false',false)");
  equal((await db.query('select workspace.can_manage_performance_record($1,\'assigned\',array[]::uuid[]) as allowed',[id(2)])).rows[0].allowed,false,'locked direct supervisor scope stays protected');
  await db.exec("select set_config('test.unlocked','true',false)");
  await actor(3);equal(await visible(),['review-1','review-4','review-6'],'director sees direct chiefs and named acting section, not grandchild members');
  equal((await db.query('select workspace.can_read_performance_section_report($1,$2,\'submitted\',array[]::uuid[]) as allowed',[id(1),id(3)])).rows[0].allowed,true,'assigned director reads submitted chief report');
  await settings(3,{workspaceAccess:{performance:'edit'},performanceManager:false});
  equal(await visible(),[],'director flag revocation removes assigned supervision');
  equal((await db.query('select workspace.can_read_performance_section_report($1,$2,\'submitted\',array[]::uuid[]) as allowed',[id(1),id(3)])).rows[0].allowed,false,'director flag revocation removes cross-person report access');
  await actor(6);equal(await visible(),['review-5','review-6','review-7'],'unrelated chief restricted to own section');
  await actor(2);equal(await visible(),['review-2'],'employee self read unaffected');
  await root();await db.query("update workspace.system_users set status='inactive' where id=$1",[id(1)]);await actor(1);equal(await visible(),[],'inactive supervisor denied');
  console.log(JSON.stringify({checks,effectivePolicies:['20260907130000','20261001190000','20261002160000'],privateGroupUnlock:'isolated controllable stub; true/false verified',database:'isolated PGlite, no production migration applied'}));
 }finally{await db.close();}
});
