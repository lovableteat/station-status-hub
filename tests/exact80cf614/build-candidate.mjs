// Compile pinned cf614 only; public config is never printed or sent to a service.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const localRequire=createRequire(import.meta.url),candidateRequire=createRequire(path.join(process.cwd(),'package.json'));
const manifest=localRequire('./manifest.json');
const {sha,verifiedPublicConfiguration,verifyCandidateDirectory}=localRequire('./inputs.cjs');
const git=args=>execFileSync('git',args,{cwd:process.cwd(),encoding:'utf8'}).trim();
function verifySource(){
 assert.equal(git(['rev-parse','HEAD']),manifest.candidateCommit,'Candidate commit is not pinned cf614');
 assert.equal(git(['rev-parse','HEAD^{tree}']),manifest.candidateTree,'Candidate source tree changed');
 assert.equal(git(['status','--porcelain=v1','--untracked-files=all']),'','Candidate checkout must be clean (ignored outputs excluded)');
 assert.equal(sha(fs.readFileSync('package-lock.json')),manifest.candidateLockSha256,'Locked dependency input changed');
}
verifySource();
const config=verifiedPublicConfiguration(process.env.EXACT80_CF614_DIST);
process.env.VITE_SUPABASE_URL=config.url;process.env.VITE_SUPABASE_ANON_KEY=config.anon;
process.env.VITE_SUPABASE_SCHEMA='workspace';process.env.VITE_REALTIME_COLLABORATION_V2='true';
const {build}=await import(pathToFileURL(path.join(path.dirname(candidateRequire.resolve('vite/package.json')),'dist/node/index.js')));
await build({root:process.cwd(),logLevel:'error',mode:'production'});
verifySource();const inventory=verifyCandidateDirectory(path.join(process.cwd(),'dist'));
console.log(JSON.stringify({status:'exact-candidate-build-verified',candidateCommit:manifest.candidateCommit,candidateTree:manifest.candidateTree,...inventory,configurationLogged:false,browserExecuted:false}));
