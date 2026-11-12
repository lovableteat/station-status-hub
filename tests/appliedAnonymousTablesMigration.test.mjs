import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
const directory=new URL('../supabase/migrations/',import.meta.url);
const records=[
 ['20261112073038','restrict_anonymous_test_progress_audit_access',12157,'5ba847e461c80f9f73f55868f4e0fb56464e87d4a3a00bc1d52c2d4f842d3d49','d6874d1241faf8c1b9f0cbf7eed21fab','test_progress_audit'],
 ['20261112073518','restrict_anonymous_tasks_access',6089,'144d4ae5ba3667adcb3ddcbf10a408a360c0055114aecb7e37c8bc4b00351c64','013553eadb40f0acbf3676dd2908717e','tasks'],
];
for(const [version,name,length,sha256,md5,table] of records){
 const filename=`${version}_${name}.sql`,bytes=await readFile(new URL(filename,directory)),sql=bytes.toString('utf8');
 test(`${table} applied ledger retains exact server bytes, historical comments and original wrapper`,()=>{
  assert.equal(bytes.length,length);assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256);assert.equal(createHash('md5').update(bytes).digest('hex'),md5);
  assert.match(sql,/^-- PENDING/);assert.match(sql,/\nbegin;\n/);assert.ok(sql.endsWith('\ncommit;\n'));assert.equal(sql.endsWith('\n\n'),false);
 });
 test(`${table} applied ledger retains original unique version and LF checkout`,async()=>{
  assert.deepEqual((await readdir(directory)).filter(name=>name.startsWith(version+'_')),[filename]);
  assert.ok((await read('../.gitattributes')).split(/\r?\n/).includes(`supabase/migrations/${filename} text eol=lf`));
 });
 test(`${table} applied SQL only removes its anonymous table ACL without business DML or regrants`,()=>{
  assert.deepEqual([...sql.matchAll(/^revoke[^;]+;/gm)].map(m=>m[0]),[`revoke all privileges on table workspace.${table} from anon;`]);
  assert.doesNotMatch(sql,/^\s*(?:grant|insert\s+into|update\s+\w|delete\s+from|truncate\s+table|drop\s|alter\s|create\s)\b/im);
  assert.match(sql,/set local lock_timeout='1s'/);assert.match(sql,/set local statement_timeout='5s'/);
  assert.match(sql,/has_table_privilege\('anon'/);assert.match(sql,/has_any_column_privilege\('anon'/);
 });
}
const verifier=await read('../docs/security-proposals/verify-applied-six-ledger-baseline.sql');
const next=await read('../docs/security-proposals/01-close-anonymous-access-after-six-ledgers.sql');
const old=await read('../docs/security-proposals/01-close-anonymous-access.sql');
test('six-ledger read-only verifier pins all six exact statements and retains protected API checks',async()=>{
 assert.match(verifier,/BEGIN READ ONLY;/);
 assert.doesNotMatch(verifier,/^\s*(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|NOTIFY)\b/im);
 const names=(await readdir(directory)).filter(name=>/^(20261112001122|20261112013540|20261112022029|20261112064452|20261112073038|20261112073518)_/.test(name));
 assert.equal(names.length,6);
 for(const name of names){const bytes=await readFile(new URL(name,directory));assert.ok(verifier.includes(`('${name.slice(0,14)}','${name.slice(15,-4)}',${bytes.length},'${createHash('md5').update(bytes).digest('hex')}')`));}
 const block=text=>text.match(/DO \$legacy_api_postflight\$[\s\S]*?\$legacy_api_postflight\$;/)[0];
 assert.equal(block(verifier),block(await read('../docs/security-proposals/legacy-pcb/verify-applied-read-apis.sql')));
 for(const label of ['internal_rpc_preflight','delete_rpc_preflight','login_audit_preflight'])assert.ok(verifier.includes(`$${label}$`));
 assert.match(verifier,/Applied anonymous table boundary reopened/);
 assert.match(verifier,/Applied anonymous table retained privilege lost/);
});
test('explicit stage01 successor preserves historical body except applied-table sweep exclusions',()=>{
 assert.ok(next.includes(createHash('sha256').update(old).digest('hex')));
 const original=old.slice(old.indexOf('-- Already applied by 20261112001122')).replace(/notify pgrst, 'reload schema';\ncommit;\n$/,'');
 const extended=original.replaceAll("and c.oid <> 'workspace.login_audit'::regclass","and c.oid NOT IN ('workspace.login_audit'::regclass,'workspace.test_progress_audit'::regclass,'workspace.tasks'::regclass)");
 assert.ok(next.includes('-- BEGIN UNCHANGED V1 BODY (only applied-table sweep exclusions extended).\n'+extended+'-- END UNCHANGED V1 BODY.'));
 assert.doesNotMatch(next,/^\s*(?:begin|commit)\s*;/gim);
 assert.match(next,/RUNNER-OWNED TRANSACTION REQUIRED/);
 for(const label of ['applied_progress_audit_preflight','applied_tasks_preflight','six_ledger_table_capture','six_ledger_table_postflight','six_ledger_raw_prerequisite'])assert.ok(next.includes(`$${label}$`));
 assert.equal((next.match(/DO \$applied_legacy_pcb_ledger\$/g)||[]).length,2);
 assert.match(next,/Six-ledger retained audit\/cleanup functions changed/);
 assert.match(next,/Six-ledger retained publication changed/);
});
test('current rollback entry point fails closed and carries no grant, mutation or data restoration',async()=>{
 const sql=await read('../docs/security-proposals/anonymous-table-rollback-RETIRED.sql');
 assert.match(sql,/RAISE EXCEPTION 'Anonymous table rollback retired/);
 assert.doesNotMatch(sql,/\b(?:GRANT|CREATE OR REPLACE|DELETE FROM|TRUNCATE|UPDATE)\b/i);
});
test('portable table fixtures expose no real account IDs, endpoint, token or operational report',async()=>{
 for(const name of ['functions.json','tasks-schema.json']){
  const source=await read('fixtures/applied-anonymous-tables/'+name);
  assert.doesNotMatch(source,/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(source,/https?:\/\/|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20}|checked_at|session_aggregates/);
 }
});
