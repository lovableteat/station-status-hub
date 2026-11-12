import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('./sanitizedProfiles.browser.cjs',import.meta.url),'utf8');
const context=vm.createContext({require(name){
 if(name==='node:assert/strict')return require(name);
 if(name.endsWith('protectedReadBrowserHarness.cjs'))return {runProtectedReadBrowser:async()=>undefined};
 if(name.endsWith('sanitizedProfilesBrowser.cjs'))return {buildSanitizedProfilesFixture(){throw new Error('No browser or build in geometry unit tests');}};
 throw new Error('Unexpected import '+name);
},console,process:{exitCode:0},document:{querySelector(){return context.element;}}});
vm.runInContext(source+'\nglobalThis.inspectGeometry=dialogGeometry;',context);
const viewport={width:1280,height:800};
function fixture(bounds={x:60,y:12,width:1160,height:776},count=1){
 const calls=[];
 context.element={getAnimations:()=>[{pending:true,playState:'running'}]};
 const dialog={count:async()=>count,scrollIntoViewIfNeeded:async options=>{calls.push('stable');assert.equal(options.timeout,8000);},boundingBox:async()=>{calls.push('measure');return bounds;}};
 const page={locator:()=>dialog,viewportSize:()=>viewport,waitForFunction:async(fn,selector,options)=>{
  calls.push('animation');assert.equal(options.timeout,8000);assert.equal(selector,'[data-admin-dialog=permissions]');
  assert.equal(fn(selector),false,'pending root animation is not stable');
  context.element.getAnimations=()=>[{pending:false,playState:'finished'}];assert.equal(fn(selector),true);
 }};
 return {page,calls};
}
test('dialog geometry waits for animations and stable actionability before measuring without changing CSS',async()=>{
 const {page,calls}=fixture();const result=await context.inspectGeometry(page);
 assert.deepEqual(calls,['animation','stable','measure']);assert.equal(result.settled,true);
 assert.deepEqual(result.bounds,{x:60,y:12,width:1160,height:776});
 const helper=source.slice(source.indexOf('async function dialogGeometry'),source.indexOf('async function rosterLayout'));
 assert.doesNotMatch(helper,/addStyleTag|animation\.finish|animation\.cancel|style\.|waitForTimeout/);
});
test('settled dialogs still fail every viewport boundary and retain exact failed geometry in diagnostics',async()=>{
 for(const bounds of [{x:-2,y:12,width:1160,height:776},{x:60,y:-2,width:1160,height:776},{x:60,y:12,width:1222,height:776},{x:60,y:12,width:1160,height:790},{x:0,y:0,width:0,height:1},null]){
  const {page,calls}=fixture(bounds);await assert.rejects(context.inspectGeometry(page),error=>error.message.includes('Permission dialog remains inside viewport')&&error.message.includes(JSON.stringify({bounds,viewport})));
  assert.deepEqual(calls,['animation','stable','measure']);
 }
});
test('no open dialog skips geometry only, while an unresolved animation remains a hard failure',async()=>{
 const absent=fixture(null,0);assert.equal(await context.inspectGeometry(absent.page),null);assert.deepEqual(absent.calls,[]);
 const present=fixture();present.page.waitForFunction=async()=>{throw new Error('synthetic animation timeout');};
 await assert.rejects(context.inspectGeometry(present.page),/synthetic animation timeout/);assert.deepEqual(present.calls,[]);
});
