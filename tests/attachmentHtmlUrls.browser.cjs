// Run only in authorized isolated CI. BUILD_ONLY never imports/launches a browser.
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs');
const {createRequire}=require('node:module');
(async()=>{
 const bundle=await require('esbuild').build({stdin:{contents:`
 import React from 'react'; import {createRoot} from 'react-dom/client';
 import {PrivateAttachmentHtml} from './src/components/attachments/PrivateAttachmentHtml';
 const p='https://fixture.supabase.invalid/storage/v1/object/public/issue-attachments/fixture/old.png';
 window.original='<p style="color:red">原有資料</p><table><tr><td>保留表格</td></tr></table><picture><source srcset="'+p+' 2x"><img src="'+p+'" srcset="'+p+' 2x"></picture><video poster="'+p+'"><source src="'+p+'"></video><audio src="'+p+'"></audio><input type="image" src="'+p+'"><svg><image href="'+p+'"/><rect fill="url('+p+')"/></svg><div style="background:url('+p+')">CSS原文</div><style>div{background:url('+p+')}</style><a href="'+p+'">原附件</a>';
 const slash=String.fromCharCode(92),tail=p.slice('https://'.length);
 const aliases=[slash+slash+tail,'/'+slash+tail,slash+'/'+tail,'https:'+slash+slash+tail];
 window.original+=aliases.map(url=>'<img data-alias="true" src="'+url+'" srcset="'+url+' 2x">').join('');
 window.original+='<img data-alias="true" src="'+p.replace('fixture','fix'+String.fromCharCode(9)+'ture')+'">';
 createRoot(document.getElementById('root')).render(<PrivateAttachmentHtml html={window.original}/>);
 `,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,jsx:'automatic',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'isolated-client',setup(build){
 build.onResolve({filter:/^@\/integrations\/supabase\/client$/},()=>({path:'client',namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`
 export const SUPABASE_URL='https://fixture.supabase.invalid';
 const listeners=new Set(); window.pending=[];window.signCalls=0;window.mode='defer';
 window.auth=(event,user)=>{for(const fn of listeners)fn(event,user?{user:{id:user}}:null);};
 window.resolveAll=(token)=>{const all=window.pending.splice(0);all.forEach(resolve=>resolve({data:{signedUrl:location.origin+'/signed.png?owner='+token}}));};
 export const supabase={from(){window.persistenceOperations.push('database.from');throw Error('No persistence permitted');},auth:{onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};}},storage:{from(){return{upload(){window.persistenceOperations.push('storage.upload');throw Error('No writes');},update(){window.persistenceOperations.push('storage.update');throw Error('No writes');},remove(){window.persistenceOperations.push('storage.remove');throw Error('No writes');},move(){window.persistenceOperations.push('storage.move');throw Error('No writes');},copy(){window.persistenceOperations.push('storage.copy');throw Error('No writes');},createSignedUrl(){window.signCalls++;if(window.mode==='deny')return Promise.resolve({error:Error('denied')});return new Promise(resolve=>window.pending.push(resolve));}};}}};
 `}));
 build.onResolve({filter:/^@\//},args=>build.resolve(path.resolve('src',args.path.slice(2)),{resolveDir:process.cwd(),kind:args.kind}));
 }}]});
 if(process.env.AUDIT_BUILD_ONLY==='1'){console.log('PASS attachment HTML URL browser bundle (browser not launched)');return;}
 assert.equal(process.env.GITHUB_ACTIONS,'true','Real browser execution is restricted to GitHub Actions');
 assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request','Real browser execution is restricted to isolated pull-request CI');
 const qa=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'));
 const {chromium}=qa('playwright');
 const server=http.createServer((req,res)=>{
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 if(req.url.startsWith('/signed.png')){res.setHeader('Content-Type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Synthetic attachment URLs</title><div id="root"></div><script src="/fixture.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results=[];
 try{
 browser=await chromium.launch({headless:true});
 for(const viewport of [{width:1200,height:800},{width:390,height:844}]){
 const page=await browser.newPage({viewport}),requests=[],errors=[];
 let failure=null;
 try {
 await page.addInitScript(()=>{
 window.persistenceOperations=[];
 for(const method of ['setItem','removeItem','clear'])Storage.prototype[method]=function(){window.persistenceOperations.push('storage.'+method);throw Error('No browser persistence permitted');};
 indexedDB.open=function(){window.persistenceOperations.push('indexedDB.open');throw Error('No IndexedDB persistence permitted');};
 });
 // Installed BEFORE navigation/sanitization. Attempts are observed even if aborted.
 await page.route('**/*',route=>{requests.push({url:route.request().url(),method:route.request().method()});return new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort();});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>window.signCalls===1);
 const initial=await page.evaluate(()=>window.original);
 assert.equal(await page.locator('#root [data-alias][src], #root [data-alias][srcset]').count(),0,'normalized network aliases cannot remain fetchable');
 assert.doesNotMatch(await page.locator('#root').innerHTML(),/object\/public|owner=/);
 assert.equal(requests.filter(request=>request.url.includes('fixture.supabase.invalid')).length,0,'no unsigned request during parsing, CSS, or initial display');
 await page.evaluate(()=>window.auth('SIGNED_OUT',null));await page.evaluate(()=>window.resolveAll('old-user'));await page.waitForTimeout(50);
 assert.doesNotMatch(await page.locator('#root').innerHTML(),/old-user|object\/public/);
 assert.equal(requests.filter(request=>request.url.includes('owner=old-user')).length,0,'stale signer must not assign or fetch an old-session capability');
 await page.evaluate(()=>window.auth('SIGNED_IN','synthetic-new'));await page.waitForFunction(()=>window.signCalls===2);await page.evaluate(()=>window.resolveAll('new-user'));
 await page.waitForFunction(()=>document.querySelector('#root video')?.getAttribute('poster')?.includes('new-user'));
 assert.match(await page.locator('#root source').first().getAttribute('srcset'),/new-user/);
 await page.evaluate(()=>{window.mode='deny';window.auth('SIGNED_IN','synthetic-denied');});await page.waitForFunction(()=>document.querySelector('#root video')?.getAttribute('aria-disabled')==='true');
 assert.doesNotMatch(await page.locator('#root').innerHTML(),/owner=|object\/public/);assert.equal(await page.evaluate(()=>window.original),initial);
 assert.equal(requests.filter(request=>request.url.includes('fixture.supabase.invalid')).length,0);assert.deepEqual(errors,[]);
 assert.equal(await page.locator('#root table').innerText(),'保留表格');assert.equal(await page.locator('#root p').evaluate(p=>getComputedStyle(p).color),'rgb(255, 0, 0)');
 const persistenceOperations=await page.evaluate(()=>window.persistenceOperations);
 assert.deepEqual(persistenceOperations,[]);assert.deepEqual(requests.filter(request=>!['GET','HEAD'].includes(request.method)),[]);
 results.push({viewport,status:'passed',privateRequestAttempts:requests.filter(request=>request.url.includes('fixture.supabase.invalid')).length,persistenceOperations,networkMutationAttempts:requests.filter(request=>!['GET','HEAD'].includes(request.method)),sourceUnchanged:await page.evaluate(()=>window.original)===initial});
 } catch(error) {
 failure=error;
 results.push({viewport,status:'failed',error:String(error),requests,errors,persistenceOperations:await page.evaluate(()=>window.persistenceOperations).catch(()=>['unavailable'])});
 } finally {
 if(process.env.ATTACHMENT_HTML_EVIDENCE_DIR){
 fs.mkdirSync(process.env.ATTACHMENT_HTML_EVIDENCE_DIR,{recursive:true});
 fs.writeFileSync(path.join(process.env.ATTACHMENT_HTML_EVIDENCE_DIR,'results.json'),JSON.stringify(results,null,2));
 await page.screenshot({path:path.join(process.env.ATTACHMENT_HTML_EVIDENCE_DIR,viewport.width+(failure?'-failed':'-denied')+'.png')}).catch(()=>{});
 }
 await page.close();
 }
 if(failure)throw failure;
 }
 if(process.env.ATTACHMENT_HTML_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.ATTACHMENT_HTML_EVIDENCE_DIR,'results.json'),JSON.stringify(results,null,2));
 console.log('PASS actual browser attachment HTML URL, parsing/network, denied/session and immutable-source contracts',JSON.stringify(results));
 }catch(error){
 if(!results.some(result=>result.status==='failed'))results.push({status:'failed',phase:'setup-or-teardown',error:String(error)});
 throw error;
 }finally{
 if(process.env.ATTACHMENT_HTML_EVIDENCE_DIR){fs.mkdirSync(process.env.ATTACHMENT_HTML_EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.ATTACHMENT_HTML_EVIDENCE_DIR,'results.json'),JSON.stringify(results,null,2));}
 await browser?.close();await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
