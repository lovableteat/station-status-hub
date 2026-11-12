import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
const additive=await read('../docs/security-proposals/legacy-pcb/01-add-read-apis-PENDING.sql');
const enforcement=await read('../docs/security-proposals/legacy-pcb/02-close-raw-permissions-PENDING.sql');
const gate=JSON.parse(await read('fixtures/legacy-pcb-security/release-gate.json'));
const fields='id,username,display_name,role,status,permissions,created_by,created_at,updated_at,registration_requested_at,approved_at,approved_by,auth_user_id,auth_migrated_at,last_seen_at,avatar_path'.split(',');

test('Only the exact applied additive ledger is promoted; pending legacy enforcement stays outside migrations',async()=>{
 const names=await readdir(new URL('../supabase/migrations',import.meta.url));
 assert.deepEqual(names.filter(name=>/legacy.*pcb|pcb.*legacy/.test(name)),['20261112064452_add_protected_profile_and_legacy_pcb_read_apis.sql']);
 for(const sql of [additive,enforcement])assert.doesNotMatch(sql,/^\s*(?:UPDATE\s+(?:workspace\.)?system_users|DELETE\s+FROM\s+(?:workspace\.)?system_users|TRUNCATE|INSERT\s+INTO\s+(?:workspace\.)?system_users)\b/im);
});
test('Two new zero-argument APIs are additive and use exact existing sixteen profile columns',async()=>{
 assert.deepEqual([...additive.matchAll(/CREATE FUNCTION ([^(]+)\(([^)]*)\)/g)].map(m=>[m[1],m[2]]),[['workspace.list_system_user_profiles',''],['workspace.load_pcb_designer_legacy_workspace','']]);
 const schema=JSON.parse(await read('fixtures/legacy-pcb-security/system-users-schema.json'));
 const types=new Map(schema.columns.map(c=>[c.name,c.type]));
 assert.ok(additive.includes(`RETURNS TABLE(${fields.map(f=>f+' '+types.get(f)).join(',')})`));
 assert.match(additive,/CASE WHEN jsonb_typeof\(u\.permissions\)='object' THEN u\.permissions-'pcbDesignerWorkspace' ELSE u\.permissions END/);
 assert.match(additive,/actor:=workspace\.current_system_user_id\(\)/);
 assert.doesNotMatch(additive,/GRANT[^;]*TO\s+(?:anon|PUBLIC|service_role)/i);
});
test('Enforcement unconditionally blocks until release gates are resolved and revokes only raw permissions SELECT',()=>{
 const hash=createHash('sha256').update(gate.text).digest('hex');
 assert.equal(hash,'32d951b69930d11c9d8c3cb37063f69740964a1839b9b3e016d9961f4fbaa5c8');
 assert.equal(gate.sha256,hash);assert.equal(enforcement.split(gate.text).length,2);
 assert.ok(enforcement.indexOf(gate.text)<enforcement.indexOf('DO $legacy_pcb_baseline$'));
 assert.deepEqual([...enforcement.matchAll(/^REVOKE[^;]+;/gm)].map(m=>m[0]),['REVOKE SELECT(permissions) ON workspace.system_users FROM authenticated;']);
 assert.doesNotMatch(enforcement,/^GRANT\b/gm);
});
test('Both stages pin all three immutable ledger statements and reject indirect-read surface drift',()=>{
 for(const sql of [additive,enforcement]) {
  for(const version of ['20261112001122','20261112013540','20261112022029'])assert.ok(sql.includes(version));
  assert.match(sql,/cardinality\(m\.statements\)=1/);
  assert.match(sql,/unknown or changed system_users function/);
  assert.match(sql,/unreviewed dependent view or materialized view/);
  assert.match(sql,/API role inheritance or bypass drift/);
 }
 assert.equal((enforcement.match(/md5\(pg_get_functiondef\(p\.oid\)\)='6d9168d17709b75c19c69b4475899a2c'/g)||[]).length,2);
});
test('New API read-surface exemption uses exact zero-argument identities, never broad names',()=>{
 const exemption="AND p.oid NOT IN (coalesce(to_regprocedure('workspace.list_system_user_profiles()'),0::oid),\n    coalesce(to_regprocedure('workspace.load_pcb_designer_legacy_workspace()'),0::oid))";
 for(const sql of [additive,enforcement]) {
  for(const block of [...sql.matchAll(/DO \$legacy_read_surface\$([\s\S]*?)\$legacy_read_surface\$;/g)].map(m=>m[1])) {
   assert.ok(block.includes(exemption));
   assert.doesNotMatch(block,/p\.proname\s+NOT\s+IN/i);
  }
  for(const block of [...sql.matchAll(/DO \$legacy_api_postflight\$([\s\S]*?)\$legacy_api_postflight\$;/g)].map(m=>m[1])) {
   assert.ok(block.includes(exemption));
   assert.match(block,/unexpected name or overload collision/);
   assert.match(block,/p\.prokind='f'/);
   assert.match(block,/p\.pronargs=0 AND pg_get_function_identity_arguments\(p\.oid\)=''/);
  }
 }
});
test('New fixture metadata has no account identifiers, credentials, live URL or PCB payload',async()=>{
 for(const name of ['system-users-schema.json','authorization-functions.json','read-surface-manifest.json','sequence-authorization-function.json']) {
  const text=await read('fixtures/legacy-pcb-security/'+name);
  assert.doesNotMatch(text,/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(text,/https?:\/\/|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20}/);
 }
});
