import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const version='20261112064452';
const filename=`${version}_add_protected_profile_and_legacy_pcb_read_apis.sql`;
const directory=new URL('../supabase/migrations/',import.meta.url);
const sql=await readFile(new URL(filename,directory));
const source=sql.toString('utf8');
const candidate=await readFile(new URL('../docs/security-proposals/legacy-pcb/01-add-read-apis-PENDING.sql',import.meta.url),'utf8');
const verifier=await readFile(new URL('../docs/security-proposals/legacy-pcb/verify-applied-read-apis.sql',import.meta.url),'utf8');

test('applied additive APIs retain the exact server-ledger statement including one final LF',()=>{
 assert.equal(sql.length,42759);
 assert.equal(createHash('sha256').update(sql).digest('hex'),'ffa4e0437d54bbe6b894c93b32b48a63f58d9da70267ed5a842f5214c7623449');
 assert.equal(createHash('md5').update(sql).digest('hex'),'ad9bd1f1d425fed402deee5074f08d8d');
 assert.ok(source.endsWith("NOTIFY pgrst, 'reload schema';\n"));
 assert.equal(source.endsWith('\n\n'),false);
});
test('server transport differs from immutable additive candidate only by removed outer BEGIN/COMMIT',()=>{
 assert.equal(createHash('sha256').update(candidate).digest('hex'),'e516210585588b31b50a7e8d3328070cad853ef04a772ce56fa4bd40b83310cf');
 assert.equal(candidate.split('\nBEGIN;\nSET LOCAL').length,2);
 assert.ok(candidate.endsWith('\nCOMMIT;\n'));
 assert.equal(source,candidate.replace('\nBEGIN;\nSET LOCAL','\nSET LOCAL').slice(0,-'COMMIT;\n'.length));
 const bodies=text=>[...text.matchAll(/AS \$(profile|legacy)\$([\s\S]*?)\$\1\$/g)].map(m=>m[2]);
 assert.equal(bodies(source).length,2);assert.deepEqual(bodies(source),bodies(candidate));
 assert.deepEqual(source.match(/^(?:GRANT|REVOKE)[^;]+;/gm),candidate.match(/^(?:GRANT|REVOKE)[^;]+;/gm));
 assert.doesNotMatch(source,/^\s*(?:BEGIN|COMMIT)\s*;/gm);
 assert.doesNotMatch(source,/SET\s+(?:LOCAL\s+)?ROLE/i);
 assert.match(source,/SET LOCAL lock_timeout='1s'/);assert.match(source,/SET LOCAL statement_timeout='10s'/);
});
test('applied additive statement keeps its unique server version and LF checkout policy',async()=>{
 assert.deepEqual((await readdir(directory)).filter(name=>name.startsWith(`${version}_`)),[filename]);
 const attributes=await readFile(new URL('../.gitattributes',import.meta.url),'utf8');
 assert.ok(attributes.split(/\r?\n/).includes(`supabase/migrations/${filename} text eol=lf`));
});
test('post-apply verifier is read-only and reuses the exact applied two-API owner/body/ACL checks',async()=>{
 assert.match(verifier,/BEGIN READ ONLY;/);
 assert.doesNotMatch(verifier,/^\s*(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|NOTIFY)\b/im);
 assert.doesNotMatch(verifier,/\bFROM\s+workspace\./i);
 assert.doesNotMatch(verifier,/SELECT\s+(?:\*\s+FROM\s+)?workspace\.(?:list_system_user_profiles|load_pcb_designer_legacy_workspace)\(/i);
 const postflight=text=>text.match(/DO \$legacy_api_postflight\$[\s\S]*?\$legacy_api_postflight\$;/)[0];
 assert.equal(postflight(verifier),postflight(source));
 for(const name of ['20261112001122_restrict_internal_stats_cleanup_execution.sql','20261112013540_restrict_anonymous_delete_test_system_execution.sql','20261112022029_restrict_anonymous_login_audit_access.sql',filename]) {
  const bytes=await readFile(new URL(name,directory));
  assert.ok(verifier.includes(`('${name.slice(0,14)}','${name.slice(15,-4)}',${bytes.length},'${createHash('md5').update(bytes).digest('hex')}')`));
 }
 assert.match(verifier,/cardinality\(m\.statements\)=1/);assert.match(verifier,/octet_length\(m\.statements\[1\]\)/);
});
