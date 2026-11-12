// Hash/config validation only. Never makes network requests or logs config values.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const manifest=require('./manifest.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function pathsUnder(root){
 const files=[];
 function visit(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  assert.ok(!entry.isSymbolicLink(),'Input symlink forbidden');
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())visit(file);else{assert.ok(entry.isFile(),'Only regular input files');files.push(path.relative(root,file).split(path.sep).join('/'));}
 }}visit(root);return files.sort();
}
function parsePublicConfiguration(text){
 const urls=[...new Set([...text.matchAll(/"(https:\/\/[a-z0-9-]+\.supabase\.co)"/g)].map(x=>x[1]))];
 const keys=[...new Set([...text.matchAll(/"(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/g)].map(x=>x[1]).filter(key=>{
  try{const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));return claims.role==='anon'&&claims.iss==='supabase'&&urls.some(url=>new URL(url).hostname===claims.ref+'.supabase.co');}catch{return false;}
 }))];
 assert.equal(urls.length,1,'Public endpoint must be unique');assert.equal(keys.length,1,'Matching public anon configuration must be unique');
 return{anon:keys[0],realtimeV2:true,schema:'workspace',url:urls[0]};
}
function verifiedPublicConfiguration(oldRoot){
 const entry=manifest.derivation.bootRoots.ENTRY,bytes=fs.readFileSync(path.join(oldRoot,entry));
 assert.equal(sha(bytes),manifest.oldAllowedBoot[entry].sha256,'Original entry hash mismatch');
 const config=parsePublicConfiguration(bytes.toString());
 assert.equal(sha(Buffer.from(JSON.stringify(config))),manifest.publicBuildConfiguration.sha256,'Public build configuration hash mismatch');
 return config;
}
function verifyCandidateDirectory(root){
 const actual=pathsUnder(root),expected=Object.keys(manifest.candidateFiles).sort();
 assert.deepEqual(actual,expected,'Exact pinned candidate paths required');let bytes=0;
 for(const file of expected){
  assert.ok(!file.startsWith('/')&&!file.split('/').some(x=>!x||x==='.'||x==='..')&&!/[\\\0]/.test(file));
  const content=fs.readFileSync(path.join(root,file)),hash=sha(content);bytes+=content.length;
  assert.equal(hash,manifest.candidateFiles[file],`Changed candidate bytes: ${file}`);
  assert.ok(!manifest.revokedHashes.includes(hash),'Revoked executable bytes in candidate');
  assert.ok(!/materialRequestSeed/i.test(file),'Seed filename forbidden');
  if(/\.(?:js|mjs|html)$/.test(file))assert.ok(!/materialRequestSeed/i.test(content.toString()),'Seed marker forbidden');
 }
 assert.equal(bytes,manifest.candidateStaticIdentity.bytes,'Candidate total byte count mismatch');
 const entry=fs.readFileSync(path.join(root,manifest.candidateEntryPaths.ENTRY),'utf8');
 assert.equal(sha(Buffer.from(JSON.stringify(parsePublicConfiguration(entry)))),manifest.publicBuildConfiguration.sha256,'Candidate public configuration differs');
 return{files:actual.length,bytes,pathHashInventorySha256:manifest.candidateStaticIdentity.pathHashInventorySha256};
}
module.exports={sha,pathsUnder,parsePublicConfiguration,verifiedPublicConfiguration,verifyCandidateDirectory};
