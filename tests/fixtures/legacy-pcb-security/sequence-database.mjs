import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {read} from './database.mjs';

// Minimal synthetic surroundings for the unchanged broad 01 / station-only 02 /
// Storage 03 proposals. Never weakens or replaces the exact legacy-read fixture.
export async function installSequenceContext(db) {
 const helper=JSON.parse(await read('sequence-authorization-function.json'));
 const expected=JSON.parse(await read('read-surface-manifest.json')).find(f=>f.schema==='workspace'&&f.name==='current_user_can_workspace');
 assert.equal(createHash('md5').update(helper.definition).digest('hex'),expected.definition_md5);
 assert.deepEqual(helper.acl.slice(1,-1).split(',').sort(),[...expected.acl].sort());
 await db.exec(helper.definition);
 await db.exec(`revoke all on function workspace.current_user_can_workspace(text,text) from public,anon,authenticated,service_role;
 grant execute on function workspace.current_user_can_workspace(text,text) to authenticated,service_role;
 alter table workspace.machine_sentinel enable row level security;
 create policy fixture_machine on workspace.machine_sentinel for all to authenticated using(true) with check(true);
 alter table workspace.user_page_permissions enable row level security;
 alter table workspace.login_audit add column user_id uuid;
 create table workspace.users(id uuid primary key,password_hash text);
 alter table workspace.users enable row level security;
 create table workspace.user_roles(id uuid primary key,note text);
 alter table workspace.user_roles enable row level security;
 create schema storage;
 grant usage on schema storage to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,public boolean);
 create table storage.objects(id integer primary key,bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
 create policy fixture_storage on storage.objects for all to public using(true) with check(true);
 insert into storage.buckets values('issue-attachments',true),('task-attachments',true),('unrelated',true);
 insert into storage.objects values(1,'issue-attachments','synthetic.png'),(2,'task-attachments','synthetic.pdf'),(3,'unrelated','retained.txt');`);
 for(const schema of ['public','workspace']) {
  // Inert surrounding login fixtures: never credentials or actual authentication.
  await db.exec(`create function ${schema}.authenticate_user(username_input text,password_input text) returns boolean language sql security definer set search_path='' as $$select false$$;
   revoke all on function ${schema}.authenticate_user(text,text) from public;
   grant execute on function ${schema}.authenticate_user(text,text) to anon,authenticated,service_role;`);
 }
}
