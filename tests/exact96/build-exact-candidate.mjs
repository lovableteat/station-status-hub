// Build only, using the original already-public build configuration. No browser/network/service operation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(path.join(process.cwd(),'package.json'));
const manifest=JSON.parse(fs.readFileSync(new URL('./exact96-manifest.json',import.meta.url)));
const entry=fs.readFileSync(path.join(process.env.EXACT96_DIST,'assets/index-BBF4DeAK.js'),'utf8');
const urls=[...new Set([...entry.matchAll(/"(https:\/\/[a-z0-9-]+\.supabase\.co)"/g)].map(m=>m[1]))];
const keys=[...new Set([...entry.matchAll(/"(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/g)].map(m=>m[1]).filter(key=>{try{const c=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));return c.role==='anon'&&c.iss==='supabase'&&urls.some(u=>new URL(u).hostname===c.ref+'.supabase.co')}catch{return false}}))];
if(urls.length!==1||keys.length!==1)throw Error('Cannot uniquely validate original public anon build configuration');
process.env.VITE_SUPABASE_URL=urls[0];process.env.VITE_SUPABASE_ANON_KEY=keys[0];process.env.VITE_SUPABASE_SCHEMA='workspace';process.env.VITE_REALTIME_COLLABORATION_V2='true';
const {build}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')));
await build({root:process.cwd(),logLevel:'error',mode:'production'});
const root=path.join(process.cwd(),'dist');
const enumerate=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?enumerate(path.join(directory,e.name)):[path.relative(root,path.join(directory,e.name)).split(path.sep).join('/')]);
const actual=enumerate(root).sort(),expected=Object.keys(manifest.candidateFiles).sort();
if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`Candidate inventory paths do not match pinned ${manifest.candidateCommit} build`);
for(const filename of expected){const digest=createHash('sha256').update(fs.readFileSync(path.join(root,filename))).digest('hex');if(digest!==manifest.candidateFiles[filename])throw Error(`Candidate output differs from pinned ${manifest.candidateCommit}: ${filename}`)}
console.log(JSON.stringify({status:'exact-candidate-build-verified',candidateCommit:manifest.candidateCommit,files:expected.length,configurationLogged:false,browserExecuted:false}));
