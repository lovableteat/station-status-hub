// Actual full-app regression adapted from the parent-authorized mobile worker fixture.
// Every account, database response and mutation is synthetic; outbound requests are blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const qa=createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools','package.json'));
const {chromium}=qa('playwright');
let server,baseURL;
async function open(query,w,h){
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:w<768,deviceScaleFactor:1});
  await context.route('**/*',r=>new URL(r.request().url()).origin===baseURL?r.continue():r.abort('blockedbyclient'));
  const page=await context.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto(baseURL+'/station-status-hub/?demo=admin&'+query);
  await page.waitForSelector('[data-mobile-app-header]',{timeout:45000});
  await page.locator('[data-mobile-maintenance-nav],.maintenance-sidebar').first().waitFor({timeout:45000});
  await page.waitForTimeout(800);return{page,browser,pageErrors};
 }catch(e){await browser.close();throw e;}
}
const out=path.resolve(process.env.AUDIT_SCREENSHOT_DIR || '../evidence-20261002/short-integrated');fs.mkdirSync(out,{recursive:true});
async function shot(page,name){await page.waitForTimeout(400);await page.screenshot({path:path.join(out,name+'.png')});}
async function geometry(page,locator){return locator.evaluate(e=>{const r=e.getBoundingClientRect(),dock=document.querySelector('[data-mobile-workspace-dock]')?.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{x:r.x,y:r.y,w:r.width,h:r.height,full:r.y>=76&&r.bottom<=(dock?.height?dock.top:innerHeight)&&r.x>=0&&r.right<=innerWidth,hit:!!hit&&(hit===e||e.contains(hit))}});}
async function swipe(page,distance=120){const cdp=await page.context().newCDPSession(page);const x=page.viewportSize().width/2,start=distance>0?page.viewportSize().height-90:95;const repeats=Math.ceil(Math.abs(distance)/130);for(let j=0;j<repeats;j++){const delta=Math.sign(distance)*Math.min(130,Math.abs(distance)-j*130);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start,id:0}]});for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start-delta*i/10,id:0}]});await page.waitForTimeout(35);}await page.waitForTimeout(150);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);}await cdp.detach();await page.waitForTimeout(500);}
async function main(){const results=[];for(const[w,h]of [[568,320],[320,568],[844,390],[1440,900]]){const{page,browser,pageErrors}=await open('workspace=station-status&module=issues',w,h);const id=`${w}x${h}`,r={id,checks:[],errors:pageErrors};try{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),w);const nav=page.locator('[data-mobile-maintenance-nav]');if(w<1024){assert.equal(await nav.locator('button').count(),6);r.position=await nav.evaluate(e=>getComputedStyle(e).position);assert.equal(r.position,h<=500?'static':'sticky');r.checks.push('all-six-nav-items-and-position');}else{assert.equal(await nav.count(),0);r.checks.push('desktop-sidebar-unchanged');}await shot(page,id+'-initial');const trigger=page.getByRole('button',{name:'新增問題',exact:true});if(h<500){await swipe(page,150);r.scrollY=await page.evaluate(()=>scrollY);assert.ok(r.scrollY>0,'touch swipe must scroll page');}r.trigger=await geometry(page,trigger);assert.ok(r.trigger.full&&r.trigger.hit,JSON.stringify(r.trigger));r.checks.push('touch-scroll-to-full-create');await shot(page,id+'-scrolled');await trigger.tap();const dialog=page.getByRole('dialog',{name:'新增問題',exact:true});await dialog.waitFor();await shot(page,id+'-dialog');const close=dialog.getByRole('button',{name:'Close',exact:true});await close.tap();await dialog.waitFor({state:'hidden'});assert.equal(await trigger.evaluate(e=>document.activeElement===e),true);r.checks.push('tap-create-tap-close-focus-return');await shot(page,id+'-returned');if(w===568){await swipe(page,200);await shot(page,id+'-results-scroll');await swipe(page,-700);await page.waitForTimeout(400);const dashboard=page.locator('[data-mobile-maintenance-module="dashboard"]');await dashboard.tap();await page.getByRole('heading',{name:'系統儀表板',exact:true}).waitFor();r.checks.push('scroll-back-and-use-nav');await shot(page,id+'-dashboard');}assert.deepEqual(r.errors,[]);r.status='passed';}catch(e){r.status='failed';r.errors.push(e.message);await shot(page,id+'-failure');}finally{results.push(r);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));await browser.close();}console.log(JSON.stringify(r));}assert.ok(results.every(r=>r.status==='passed'));}

(async()=>{
 const {createServer}=await import('vite');const {default:react}=await import('@vitejs/plugin-react-swc');
 try{
  server=await createServer({configFile:false,envFile:false,root:process.cwd(),base:'/station-status-hub/',plugins:[react()],
   server:{host:'127.0.0.1',port:0,strictPort:false,fs:{allow:[process.cwd()]}},
   resolve:{alias:[{find:'@/integrations/supabase/client',replacement:path.resolve('tests/support/mobileAppMock.mjs')},{find:'@',replacement:path.resolve('src')}]},
   optimizeDeps:{exclude:['occt-wasm']},worker:{format:'es'}});
  await server.listen();baseURL='http://127.0.0.1:'+server.httpServer.address().port;
  await main();
 }finally{if(server)await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
