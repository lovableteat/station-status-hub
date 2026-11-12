import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const read=name=>readFile(new URL(name,import.meta.url),'utf8');
export const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const functions=JSON.parse(await read('functions.json'));
export const tasksSchema=JSON.parse(await read('tasks-schema.json'));
for(const f of functions)assert.equal(createHash('md5').update(f.definition).digest('hex'),f.definition_md5);
async function installFunctions(db,selected){
 for(const f of selected){
  await db.exec(f.definition);
  const signature=f.signature.includes('.')?f.signature:'public.'+f.signature;
  await db.exec(`revoke all on function ${signature} from public,anon,authenticated,service_role`);
  for(const entry of f.acl.slice(1,-1).split(',')) {
   const role=entry.split('=')[0];if(role==='postgres')continue;
   await db.exec(`grant execute on function ${signature} to ${role||'public'}`);
  }
 }
}
// Disposable fixtures only. Assumes existing roles/workspace; does not modify
// system_users/login_audit or auth/PCB helpers. Explicitly replaces delete stubs
// with the four reviewed definitions and exact captured ACLs.
export async function installAppliedTableContext(db){
 const columns=tasksSchema.columns.map(c=>`"${c.name}" ${c.type}${c.not_null?' not null':''}${c.default?' default '+c.default:''}`).join(',');
 await db.exec(`create table workspace.columns(id uuid primary key,name text);
 create table workspace.tasks(${columns});
 alter table workspace.tasks add constraint tasks_pkey primary key(id);
 alter table workspace.tasks add constraint tasks_column_id_fkey foreign key(column_id) references workspace.columns(id) on delete set null;
 create table workspace.test_progress_audit(id uuid primary key default gen_random_uuid(),system_id uuid not null,station_id uuid not null,item_id uuid not null,change_type text not null,old_values jsonb,new_values jsonb,user_id uuid,created_at timestamptz not null default now());
 create table workspace.test_progress(id uuid primary key default gen_random_uuid(),system_id uuid,station_id uuid,item_id uuid,started_at timestamptz,completed_at timestamptz,status text,actual_hours numeric);
 create table workspace.test_systems(id uuid primary key);
 create table workspace.issues(id uuid primary key,system_id uuid);
 create table workspace.issue_attachments(id uuid primary key,issue_id uuid);
 create table workspace.dashboard_item_exclusions(id uuid primary key,system_id uuid);
 create table workspace.station_time_records(id uuid primary key,system_id uuid);
 create table workspace.station_time_settings(id uuid primary key,system_id uuid);
 create table workspace.test_projects(id uuid primary key,note text);
 create table workspace.unrelated(id int primary key,value text);
 grant all on workspace.tasks,workspace.columns,workspace.test_progress_audit,workspace.test_progress,workspace.test_projects,workspace.unrelated to anon,authenticated,service_role;
 alter table workspace.tasks enable row level security;
 create policy "Allow anonymous access to tasks" on workspace.tasks for all to public using(true);
 alter table workspace.test_progress_audit enable row level security;
 create policy "Allow anonymous access to test_progress_audit" on workspace.test_progress_audit for all to public using(true);
 create policy "Users can insert audit records" on workspace.test_progress_audit for insert to public with check(true);
 create policy "Users can view all audit records" on workspace.test_progress_audit for select to public using(true);
 create schema if not exists realtime;
 create table realtime.subscription(entity regclass,claims_role regrole);
 create publication supabase_realtime for table workspace.tasks;
 insert into workspace.columns values('${uid(1)}','synthetic column');
 insert into workspace.tasks(id,title,column_id,description,custom_fields) values('${uid(2)}','synthetic task','${uid(1)}','keep exact fixture','{"original":true}');
 insert into workspace.test_projects values('${uid(4)}','unchanged synthetic project');
 insert into workspace.unrelated values(1,'synthetic untouched row');
 insert into workspace.test_progress_audit(system_id,station_id,item_id,change_type) values('${uid(2)}','${uid(3)}','${uid(4)}','fixture');`);
 for(const table of ['columns','test_progress','test_systems','issues','issue_attachments','dashboard_item_exclusions','station_time_records','station_time_settings','test_projects','unrelated']) {
  await db.exec(`alter table workspace.${table} enable row level security;create policy fixture_retained_access on workspace.${table} for all to public using(true) with check(true)`);
 }
 await installFunctions(db,functions.filter(f=>!f.signature.includes('authenticate_user')));
 await db.exec('create trigger log_test_progress_trigger after insert or update or delete on workspace.test_progress for each row execute function public.log_test_progress_changes()');
}
export async function fixture(){
 if(!process.env.PGLITE_MODULE)throw new Error('Set PGLITE_MODULE to a local pinned PGlite module');
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema workspace;
   grant usage on schema workspace,public to anon,authenticated,service_role;
   create table workspace.system_users(id uuid primary key,username varchar(50),role varchar(20),display_name varchar(100),status text,password_hash text);
   alter table workspace.system_users enable row level security;
   create table workspace.login_audit(id uuid primary key default gen_random_uuid(),user_id uuid not null,username varchar(50) not null,role varchar(20) not null,display_name varchar(100),login_time timestamptz not null default now(),ip_address text,user_agent text,success boolean not null default true);
   grant all on workspace.login_audit to authenticated,service_role;
   alter table workspace.login_audit enable row level security;
   create policy "Allow anonymous access to login_audit" on workspace.login_audit for all to public using(true);
   create function public.verify_password(a text,b text) returns boolean language sql immutable as $$select a=b$$;
   insert into workspace.system_users values('${uid(1)}','synthetic-user','engineer','Synthetic user','active','fixture-only');
   insert into workspace.login_audit(user_id,username,role) values('${uid(1)}','synthetic-user','engineer');`);
  await installAppliedTableContext(db);
  await installFunctions(db,functions.filter(f=>f.signature.includes('authenticate_user')));
  return db;
 }catch(error){await db.close();throw error;}
}
export async function snapshot(db){
 const out={};
 for(const {schemaname,tablename} of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('workspace','realtime') order by 1,2")).rows)
  out[`${schemaname}.${tablename}`]=(await db.query(`select to_jsonb(t) data from "${schemaname}"."${tablename}" t order by to_jsonb(t)::text`)).rows;
 return out;
}
export async function state(db){return {
 acl:(await db.query("select c.oid::regclass::text name,array(select x::text from unnest(c.relacl) x order by x::text) acl,c.relowner::regrole::text owner,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='workspace' and c.relkind='r' order by name")).rows,
 columnACL:(await db.query("select c.relname,a.attname,a.attacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid where n.nspname='workspace' and a.attnum>0 and not a.attisdropped order by 1,2")).rows,
 policies:(await db.query("select * from pg_policies where schemaname='workspace' order by tablename,policyname")).rows,
 constraints:(await db.query("select c.oid::regclass::text relation,k.conname,pg_get_constraintdef(k.oid) definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='workspace' order by 1,2")).rows,
 publications:(await db.query('select * from pg_publication_tables order by pubname,schemaname,tablename')).rows,
 triggers:(await db.query("select c.oid::regclass::text relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='workspace' and not t.tgisinternal order by 1,2")).rows,
 functions:(await db.query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::regrole::text owner,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('workspace','public') and p.prokind='f' order by 1")).rows
};}
export async function as(db,role,sql){await db.exec('set role '+role);try{return await db.query(sql);}finally{await db.exec('reset role');}}
