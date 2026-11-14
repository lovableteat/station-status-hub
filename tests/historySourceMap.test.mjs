import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const map=JSON.parse(read('tests/history-source-map.json'));
const expected={
 '34419778a95132a3ee73251bbde8b4327b6cd493':'0bf530aad16616117a764cc0944bf92c64149b7c',
 'f6fadefcf503d9326af88757a2d2d42a8dd45ad1':'dfc3e60ca4f6709404a9bd91e7ae9b6447481699',
 'cf6142474a7974d6a71ef0679dc549685171c40e':'0932c4057c1d8cc42c92c24b3fcdafd7c677ea95',
 '149184847764466db200250aff8c716dde46720a':'3a01a407ab4ad6b3e1d31a6bcf8c83cbc46489f9'
};
test('history cleanup keeps four reviewed source trees and pins replacement checkouts',()=>{
 assert.deepEqual(Object.keys(map).sort(),Object.keys(expected).sort());
 const workflow=read('.github/workflows/audit-regression.yml')+read('.github/workflows/latest68-crossrelease.yml');
 for(const[old,tree]of Object.entries(expected)){
  assert.equal(map[old].tree,tree);assert.match(map[old].commit,/^[a-f0-9]{40}$/);assert.notEqual(map[old].commit,old);
  assert.ok(workflow.includes('ref: '+map[old].commit));assert.ok(!workflow.includes('ref: '+old));
 }
});
test('fixed source verifiers still check exact tree, lock, and clean checkout',()=>{
 for(const dir of ['exact80cf614','exact68pair']){
  const build=read('tests/'+dir+'/build-candidate.mjs');
  for(const text of ['rewrittenSource.tree,manifest.candidateTree',"git(['rev-parse','HEAD']),rewrittenSource.commit","git(['rev-parse','HEAD^{tree}']),manifest.candidateTree",'manifest.candidateLockSha256',"git(['status','--porcelain=v1','--untracked-files=all'])"])assert.ok(build.includes(text));
 }
});
