import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export const read = name => readFile(new URL(name,import.meta.url),'utf8');
export const uid = n => '00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const fields = 'id,username,display_name,role,status,permissions,created_by,created_at,updated_at,registration_requested_at,approved_at,approved_by,auth_user_id,auth_migrated_at,last_seen_at,avatar_path'.split(',');
export const definitions = JSON.parse(await read('authorization-functions.json'));
export const schema = JSON.parse(await read('system-users-schema.json'));
export const pcbFunctions = JSON.parse(await read('../pcb-rpc-security/functions.json'));
export async function as(db,role,auth,sql,args=[]) {
 await db.exec('set role '+role);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[auth?uid(auth):'']);
 try{return await db.query(sql,args);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
}
export async function snapshot(db) {
 const data={};
 for(const {tablename} of (await db.query("select tablename from pg_tables where schemaname='workspace' order by tablename")).rows)
  data[tablename]=(await db.query(`select to_jsonb(t) data from workspace.${tablename} t order by to_jsonb(t)::text`)).rows;
 return data;
}
export async function metadata(db) {
 return {
  columns:(await db.query("select attname,attacl::text from pg_attribute where attrelid='workspace.system_users'::regclass and attnum>0 order by attnum")).rows,
  functions:(await db.query("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','workspace') order by 1,2,3")).rows
 };
}
export async function fixture(database) {
 let db=database;
 if (!db) {
  if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to a local pinned PGlite module');
  const { PGlite }=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
  db=new PGlite();
 }
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema workspace;create schema auth;create schema supabase_migrations;
 grant usage on schema workspace,auth,public to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('role')$$;
 create type public.page_permission as enum ('admin_edit','dashboard_view','dashboard_edit');
 create table workspace.system_users(${schema.columns.map(c=>`${c.name} ${c.type}${c.not_null?' not null':''}`).join(',')},primary key(id));
 alter table workspace.system_users enable row level security;
 alter table workspace.system_users replica identity full;
 grant all on workspace.system_users to service_role;
 grant select(${fields.join(',')}) on workspace.system_users to authenticated;
 create table workspace.user_page_permissions(user_id uuid,permission public.page_permission,granted_by text,primary key(user_id,permission));
 create table workspace.machine_sentinel(id int primary key,state text);insert into workspace.machine_sentinel values(1,'running');
 grant select,update on workspace.machine_sentinel to authenticated;
 create table workspace.login_audit(id uuid primary key,note text);alter table workspace.login_audit enable row level security;
 grant all on workspace.login_audit to authenticated,service_role;
 create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
 const pcbSchema=JSON.parse(await read('../pcb-rpc-security/schema.json'));
 const constraints=JSON.parse(await read('../pcb-rpc-security/constraints.json'));
 for(const rel of pcbSchema.relations) {
  const cols=pcbSchema.columns.filter(c=>c.table===rel.name).map(c=>`${c.name} ${c.type}${c.not_null?' not null':''}${c.default?' default '+c.default:''}`);
  await db.exec(`create table ${rel.name}(${cols.join(',')});alter table ${rel.name} enable row level security;grant select,insert,update,delete on ${rel.name} to service_role;`);
 }
 for(const c of constraints.constraints.filter(c=>c.table!=='workspace.system_users'))await db.exec(`alter table ${c.table} add constraint ${c.name} ${c.definition}`);
 await db.exec('set check_function_bodies=off');
 for(const f of [...pcbFunctions.map(f=>({definition:f.definition,acl:f.proacl,signature:f.signature})),...definitions]) {
  await db.exec(f.definition);
  const functionName=f.definition.match(/FUNCTION (.*?)\(/)[1];
  const args=f.definition.match(/FUNCTION .*?\(([\s\S]*?)\)\n RETURNS/)[1].split(',').filter(Boolean).map(arg=>arg.trim().split(/\s+/)[1]).join(',');
  const signature=f.signature ?? `${functionName}(${args})`;
  await db.exec(`revoke all on function ${signature} from public,anon,authenticated,service_role`);
  const acl=f.acl.replace(/^{|}$/g,'').split(',');
  for(const entry of acl) {
   const name=entry.split('=')[0];if(name==='postgres')continue;
   await db.exec(`grant execute on function ${signature} to ${name||'public'}`);
  }
 }
 await db.exec('set check_function_bodies=on');
 await db.exec("create policy system_users_authenticated_read on workspace.system_users for select to authenticated using(workspace.current_system_user_id() is not null)");
 for(const tr of constraints.triggers) await db.exec(tr.definition);
 for(const namespace of ['public','workspace']) {
  for(const name of ['calculate_daily_production_stats','cleanup_old_notifications'])await db.exec(`create function ${namespace}.${name}() returns void language sql security definer as $$select$$;revoke all on function ${namespace}.${name}() from public,anon,authenticated;grant execute on function ${namespace}.${name}() to service_role`);
  await db.exec(`create function ${namespace}.delete_test_system(uuid) returns void language plpgsql security definer as $$begin return;end$$;revoke all on function ${namespace}.delete_test_system(uuid) from public,anon;grant execute on function ${namespace}.delete_test_system(uuid) to authenticated,service_role`);
 }
 for(const name of ['20261112001122_restrict_internal_stats_cleanup_execution','20261112013540_restrict_anonymous_delete_test_system_execution','20261112022029_restrict_anonymous_login_audit_access']) {
  const sql=await read('../../../supabase/migrations/'+name+'.sql');
  await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',[name.slice(0,14),name.slice(15),[sql]]);
 }
 return db;
 } catch(error) {
  if (!database) await db.close();
  throw error;
 }
}
export async function addAccount(db,id,{role='engineer',status='active',access='view',auth=100+id,permissions}={}) {
 const p=permissions===undefined?{workspaceAccess:{'pcb-designer':access,'station-status':'edit','material-requests':'none','data-center':'none'},pagePermissions:['dashboard_view']}:permissions;
 await db.query(`insert into workspace.system_users(id,username,password_hash,role,status,permissions,created_by,created_at,updated_at,display_name,auth_user_id,avatar_path) values($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11)`,[uid(id),'synthetic-'+id,'not-a-credential',role,status,JSON.stringify(p),'Synthetic creator','2026-01-01T00:00:00Z','Synthetic '+id,auth?uid(auth):null,id%2?'avatar-'+id:null]);
}
