import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import test from 'node:test';
const require=createRequire(import.meta.url);
const qa=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'));
const {JSDOM}=qa('jsdom');
const {loader,React,create,act,flush,deferred}=require('./support/renderHarness.cjs');
const project='https://project.supabase.co';
const old=project+'/storage/v1/object/public/issue-attachments/fixture/old.png';
function harness({sign=async(bucket,p)=>`${project}/storage/v1/object/sign/${bucket}/${p}?token=fresh`}={}) {
 const dom=new JSDOM(''),listeners=new Set(),calls=[];let tick;
 const purify=require('dompurify')(dom.window);
 const client={SUPABASE_URL:project,supabase:{from(){throw Error('No persistent mutation');},auth:{onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};}},storage:{from(bucket){return{async createSignedUrl(p){calls.push([bucket,p]);try{return{data:{signedUrl:await sign(bucket,p)}};}catch(error){return{error};}}};}}}};
 const load=loader({mocks:{'@/integrations/supabase/client':client,dompurify:{__esModule:true,default:purify}},globals:{queueMicrotask,setInterval:fn=>{tick=fn;return 1;},clearInterval(){}}});
 return{dom,listeners,calls,tick:()=>tick(),api:load('src/lib/privateAttachmentHtml.ts'),Component:load('src/components/attachments/PrivateAttachmentHtml.tsx').PrivateAttachmentHtml};
}
const output=tree=>tree.root.findByType('div').props.dangerouslySetInnerHTML.__html;
const close=async(h,tree)=>{await act(async()=>tree?.unmount());h.dom.window.close();};

test('srcset follows URL-token boundaries, retaining comma data URLs, URL commas and valid descriptors',()=>{
 const h=harness();try {
 const parse=h.api.parseAttachmentSrcset;
 assert.deepEqual(JSON.parse(JSON.stringify(parse(`data:image/png;base64,AA== 1x, ${old} 2x`))),[{url:'data:image/png;base64,AA==',descriptor:'1x'},{url:old,descriptor:'2x'}]);
 assert.deepEqual(JSON.parse(JSON.stringify(parse('https://external.test/a,b.png 320w, https://external.test/c.png 640w'))),[{url:'https://external.test/a,b.png',descriptor:'320w'},{url:'https://external.test/c.png',descriptor:'640w'}]);
 assert.equal(parse(`${old} 1x 2x, ${old} -1x, ${old} 0w, ${old} calc(2,3), ${old} 2x`).length,1);
 assert.equal(parse(`${old}, https://external.test/x.png,`).length,2);
 }finally{h.dom.window.close();}
});
test('all retained HTML/SVG/MathML URL transports remove private references before asynchronous authorization',async()=>{
 const pending=deferred();const h=harness({sign:()=>pending.promise});let tree;
 const html=`<p>保留文字</p><picture><source srcset="${old} 2x, https://outside.test/x.png 1x"><img src="${old}" srcset="${old} 1x"></picture><video src="${old}" poster="${old}"><source src="${old}"></video><audio src="${old}"></audio><input type="image" src="${old}"><table background="${old}"><tr><td>原表格</td></tr></table><a href="${old}">附件</a><svg><image href="${old}"/><a xlink:href="${old}">svg</a></svg><math href="${old}"><mi>x</mi></math>`;
 try {
 await act(async()=>{tree=create(React.createElement(h.Component,{html}));});
 assert.doesNotMatch(output(tree),/object\/(public|sign)/);assert.match(output(tree),/outside.test/);assert.match(output(tree),/保留文字|原表格/);
 await act(async()=>pending.resolve(project+'/storage/v1/object/sign/issue-attachments/fixture/old.png?token=fresh'));await flush();
 assert.doesNotMatch(output(tree),/object\/public/);assert.match(output(tree),/token=fresh/);assert.equal(h.calls.length,1);
 const doc=new h.dom.window.DOMParser().parseFromString(output(tree),'text/html');
 for(const selector of ['video[src]','video[poster]','source[src]','audio[src]','input[src]','table[background]','svg image[href]','math[href]'])assert.ok(doc.querySelector(selector),selector);
 assert.ok(html.includes('/object/public/'));assert.ok(!html.includes('token=fresh'));
 }finally{await close(h,tree);}
});
test('mixed srcset retains public external candidates on denial and never retains a private unsigned fallback',async()=>{
 const h=harness({sign:async()=>{throw Error('denied');}});let tree;
 const html=`<img alt="原圖" srcset="https://outside.test/normal.png 1x, ${old} 2x, https://outside.test/a,b.png 3x"><video poster="${old}"><source src="${old}"></video>`;
 try{await act(async()=>{tree=create(React.createElement(h.Component,{html}));});await flush();
 assert.doesNotMatch(output(tree),/project.supabase.co|token=/);assert.match(output(tree),/outside.test\/normal.png 1x/);assert.match(output(tree),/outside.test\/a,b.png 3x/);assert.match(output(tree),/附件無法載入/);
 assert.equal(h.calls.length,1);assert.match(html,/object\/public/);
 }finally{await close(h,tree);}
});
test('CSS stylesheets and URL-capable presentation styles are display-only blocked; ordinary formatting survives',()=>{
 const h=harness();try{
 const html=`<div style="color:red;font-weight:bold"><style>@import '${old}';</style><p style="background-image:u\\72l('${old}')">原文</p><span style="background: image-set('${old}' 1x)">img</span><svg><rect fill="url(${old})" stroke="red" filter="url(${old})"/></svg><table style="border:1px solid red"><tr><td>cell</td></tr></table></div>`;
 const {body}=h.api.preparePrivateAttachmentHtml(html);
 assert.equal(body.querySelector('style'),null);assert.equal(body.querySelector('p').getAttribute('style'),null);assert.equal(body.querySelector('span').getAttribute('style'),null);
 assert.equal(body.querySelector('rect').getAttribute('fill'),null);assert.equal(body.querySelector('rect').getAttribute('filter'),null);assert.equal(body.querySelector('rect').getAttribute('stroke'),'red');
 assert.match(body.querySelector('div').getAttribute('style'),/color:red/);assert.match(body.querySelector('table').getAttribute('style'),/border/);assert.match(html,/background-image/);
 }finally{h.dom.window.close();}
});
test('same-project protocol-relative and image-transform URLs are scoped; other projects remain external; invalid private paths stay blocked',async()=>{
 const h=harness();let tree;
 const transform=old.replace('/object/','/render/image/');
 const html=`<img src="${old.replace('https:','')}"><img src="${transform}"><img src="${old.replace('project.','other.')}"><img src="${project}/storage/v1/object/public/issue-attachments/%ZZ">`;
 try{await act(async()=>{tree=create(React.createElement(h.Component,{html}));});await flush();
 assert.equal(h.calls.length,1);assert.match(output(tree),/other.supabase.co\/storage\/v1\/object\/public/);assert.doesNotMatch(output(tree),/%ZZ|render\/image|src="\/\/project/);
 }finally{await close(h,tree);}
});
test('signout, user switch, stale signing and refresh cannot restore previous-session srcset/poster',async()=>{
 const oldRequest=deferred(),newRequest=deferred();let number=0;const h=harness({sign:()=>++number===1?oldRequest.promise:newRequest.promise});let tree;
 const html=`<video poster="${old}"><source srcset="${old} 2x"></video>`;
 try {
 await act(async()=>{tree=create(React.createElement(h.Component,{html}));});
 await act(async()=>{for(const fn of h.listeners)fn('SIGNED_OUT',null);});await flush();
 await act(async()=>oldRequest.resolve(project+'/old-account-token'));await flush();assert.doesNotMatch(output(tree),/old-account-token|object\/public/);
 await act(async()=>h.tick());assert.equal(h.calls.length,1);
 await act(async()=>{for(const fn of h.listeners)fn('SIGNED_IN',{user:{id:'synthetic-next'}});});await flush();
 await act(async()=>newRequest.resolve(project+'/new-account-token'));await flush();assert.match(output(tree),/new-account-token/);assert.doesNotMatch(output(tree),/old-account-token/);
 await act(async()=>{for(const fn of h.listeners)fn('SIGNED_OUT',null);});await flush();assert.doesNotMatch(output(tree),/new-account-token/);
 }finally{await close(h,tree);}
});

test('data URL srcset retains the pre-existing DOMPurify rejection instead of broadening sanitizer permissions',()=>{
 const h=harness();try {
 const html=`<img srcset="data:image/png;base64,AA== 1x, ${old} 2x">`;
 const before=require('dompurify')(h.dom.window).sanitize(html);
 assert.equal(h.api.preparePrivateAttachmentHtml(html).body.innerHTML,before);
 assert.doesNotMatch(before,/srcset/);
 }finally{h.dom.window.close();}
});
test('local SVG paint fragments survive while remote/escaped paint and stylesheet URLs cannot load',()=>{
 const h=harness();try {
 const html=`<svg><defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs><rect fill="url(#g)" style="stroke:url('#g');color:red"/><circle fill="u\\72l(${old})"/></svg>`;
 const {body}=h.api.preparePrivateAttachmentHtml(html);
 assert.equal(body.querySelector('rect').getAttribute('fill'),'url(#g)');assert.match(body.querySelector('rect').getAttribute('style'),/color:red/);assert.equal(body.querySelector('circle').getAttribute('fill'),null);
 }finally{h.dom.window.close();}
});
test('a late old-HTML signing request cannot replace newer content or publish after unmount',async()=>{
 const previous=deferred(),current=deferred();let n=0;const h=harness({sign:()=>++n===1?previous.promise:current.promise});let tree;
 try{
 await act(async()=>{tree=create(React.createElement(h.Component,{html:`<p>old text</p><video poster="${old}"></video>`}));});
 await act(async()=>tree.update(React.createElement(h.Component,{html:`<p>new text</p><img srcset="${old.replace('old.png','new.png')} 2x">`})));
 await act(async()=>previous.resolve('https://signed.invalid/old-owner'));await flush();assert.match(output(tree),/new text/);assert.doesNotMatch(output(tree),/old-owner|old text/);
 await act(async()=>tree.unmount());tree=null;await act(async()=>current.resolve('https://signed.invalid/new-owner'));await flush();assert.equal(h.listeners.size,0);
 }finally{await close(h,tree);}
});

test('signed srcset URL whitespace is encoded so it cannot become descriptors or a second candidate',()=>{
 const h=harness();try{
 assert.equal(h.api.serializeAttachmentCandidates([{url:'https://signed.test/a b,c.png?token=fresh',descriptor:'2x'}],true),'https://signed.test/a%20b,c.png?token=fresh 2x');
 }finally{h.dom.window.close();}
});
test('direct account replacement clears current signed URLs before the replacement request resolves',async()=>{
 const second=deferred();let n=0;const h=harness({sign:()=>++n===1?Promise.resolve('https://signed.test/first-owner'):second.promise});let tree;
 try{
 await act(async()=>{tree=create(React.createElement(h.Component,{html:`<p>保留內容</p><video poster="${old}"></video>`}));});await flush();assert.match(output(tree),/first-owner/);
 await act(async()=>{for(const fn of h.listeners)fn('SIGNED_IN',{user:{id:'synthetic-second'}});});await flush();assert.doesNotMatch(output(tree),/first-owner/);assert.match(output(tree),/保留內容/);
 await act(async()=>second.resolve('https://signed.test/second-owner'));await flush();assert.match(output(tree),/second-owner/);
 }finally{await close(h,tree);}
});

test('unexpected executable signed response is rejected rather than inserted after sanitization',async()=>{
 const h=harness({sign:async()=> 'javascript:alert(1)'});let tree;
 try{await act(async()=>{tree=create(React.createElement(h.Component,{html:`<a href="${old}">原附件</a><img srcset="${old} 2x">`}));});await flush();assert.doesNotMatch(output(tree),/javascript:|object\/public|href=/);assert.match(output(tree),/附件無法載入/);}
 finally{await close(h,tree);}
});

test('srcset accepts leading-zero positive widths and future-compatible w/h pairs but rejects ambiguous or nonfinite descriptors',()=>{
 const h=harness();try {
 const parse=h.api.parseAttachmentSrcset;
 assert.equal(parse(`${old} 000320w, ${old} 320w 200h, ${old} -0x, ${old} 1e2x`).length,4);
 assert.equal(parse(`${old} 200h, ${old} 1.x, ${old} 1e999x, ${old} 2x 320w, ${old} 0w`).length,0);
 }finally{h.dom.window.close();}
});

test('nested inert template contents do not retain unsigned latent attachment transports',()=>{
 const h=harness();try {
 const html=`<div><template><video poster="${old}"></video><template><img srcset="${old} 2x"></template></template></div>`;
 const {body,bindings}=h.api.preparePrivateAttachmentHtml(html);
 assert.equal(bindings.length,2);assert.doesNotMatch(body.innerHTML,/object\/public/);assert.match(html,/object\/public/);
 }finally{h.dom.window.close();}
});

test('invalid private srcset candidates and unsafe non-first schemes are removed rather than left dormant',()=>{
 const h=harness();try {
 const html=`<img srcset="${old} 0w"><img srcset="https://outside.test/x.png 1x, javascript:alert(1) 2x">`;
 const {body,bindings}=h.api.preparePrivateAttachmentHtml(html);
 assert.equal(bindings.length,0);assert.doesNotMatch(body.innerHTML,/object\/public|javascript:/);assert.match(body.innerHTML,/outside.test/);assert.match(html,/object\/public/);
 }finally{h.dom.window.close();}
});

test('scheduled refresh removes expiring URLs while renewed srcset/poster authorization is pending',async()=>{
 const renewed=deferred();let n=0;const h=harness({sign:()=>++n===1?Promise.resolve('https://signed.test/initial-token'):renewed.promise});let tree;
 try{
 await act(async()=>{tree=create(React.createElement(h.Component,{html:`<img srcset="${old} 2x"><video poster="${old}"></video>`}));});await flush();assert.match(output(tree),/initial-token/);
 await act(async()=>h.tick());await flush();assert.equal(h.calls.length,2);assert.doesNotMatch(output(tree),/initial-token|object\/public/);
 await act(async()=>renewed.resolve('https://signed.test/renewed-token'));await flush();assert.match(output(tree),/renewed-token/);assert.equal(h.calls.length,2);
 }finally{await close(h,tree);}
});

test('same-host wrong-origin or encoded private routing is blocked without widening signer scope',async()=>{
 const h=harness();let tree;
 const urls=[old.replace('https:','http:'),old.replace('.co/','.co:444/'),old.replace('.co/','.co./'),old.replace('issue-attachments','%69ssue-attachments'),old.replace('/storage/v1/','/%73torage%2Fv1%2F'),old.replace('/storage/v1/','/%2573torage%252Fv1%252F'),old.replace('issue-attachments/fixture/old.png','%69ssue-attachments/%ZZ')];
 const html=urls.map(url=>`<img src="${url}">`).join('')+`<img src="${project}/storage/v1/object/public/user-avatars/avatar.png">`;
 try{await act(async()=>{tree=create(React.createElement(h.Component,{html}));});await flush();assert.equal(h.calls.length,0);assert.doesNotMatch(output(tree),/issue-attachments|%69ssue|%73torage|%2573torage|:444|http:\/\/|supabase.co\.\//);assert.match(output(tree),/user-avatars\/avatar.png/);assert.match(html,/%69ssue/);}
 finally{await close(h,tree);}
});

test('allowed SVG camel-case qualified attributes use case-insensitive classification without broadening the sanitizer',()=>{
 const h=harness();try {
 const html=`<svg><glyphRef glyphRef="${old}" xlink:href="${old}"/></svg>`;
 const baseline=require('dompurify')(h.dom.window).sanitize(html);
 assert.match(baseline,/glyphRef=/,'real sanitizer retains the canonical SVG attribute');
 const {body,bindings}=h.api.preparePrivateAttachmentHtml(html);
 assert.equal(bindings.length,2);assert.doesNotMatch(body.innerHTML,/object\/public/);
 }finally{h.dom.window.close();}
});


test('WHATWG backslash network aliases and control-normalized private URLs never bypass or expand signing',async()=>{
 const h=harness();let tree;
 const tail=old.slice('https://'.length),slash=String.fromCharCode(92);
 const aliases=[slash+slash+tail,'/'+slash+tail,slash+'/'+tail,
  'https:'+slash+slash+tail,old.replace('project','pro\tject'),old.replace('/storage/','/sto\nrage/'),
  old.replace('https:','ht\rtps:'),'/storage/v1/object/public/issue-attachments/fixture/old.png'];
 const compact=aliases.filter(url=>!/[\t\r\n]/.test(url));
 for(const url of aliases)assert.equal(new URL(url,project+'/').href,old);
 const html=aliases.map(url=>`<img src="${url}"><a href="${url}">保留</a>`).join('')+compact.map(url=>`<img srcset="${url} 2x">`).join('');
 try{
 const prepared=h.api.preparePrivateAttachmentHtml(html);
 assert.ok(prepared.bindings.length>=aliases.length);assert.doesNotMatch(prepared.body.innerHTML,/issue-attachments/);
 assert.ok(prepared.bindings.every(binding=>binding.candidates.every(candidate=>candidate.reference===null)));
 await act(async()=>{tree=create(React.createElement(h.Component,{html}));});await flush();
 assert.equal(h.calls.length,0);assert.doesNotMatch(output(tree),/issue-attachments/);assert.match(output(tree),/保留/);
 }finally{await close(h,tree);}
});


test('scalar literal-space attachment filenames retain the same strict signing path as percent-encoded spaces',async()=>{
 const h=harness();let tree;
 const literal=old.replace('old.png','old name.png'),encoded=old.replace('old.png','old%20name.png');
 try{
 const {bindings}=h.api.preparePrivateAttachmentHtml(`<img src="${literal}"><a href="${encoded}">附件</a>`);
 assert.equal(bindings.length,2);assert.ok(bindings.every(binding=>binding.candidates[0].reference));
 assert.equal(bindings[0].candidates[0].reference.path,bindings[1].candidates[0].reference.path);
 await act(async()=>{tree=create(React.createElement(h.Component,{html:`<img src="${literal}"><a href="${encoded}">附件</a>`}));});await flush();
 assert.equal(h.calls.length,1);assert.match(output(tree),/object\/sign/);assert.doesNotMatch(output(tree),/無法載入/);
 }finally{await close(h,tree);}
});
