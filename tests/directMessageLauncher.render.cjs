const test=require('node:test');
const assert=require('node:assert/strict');
const {React,act,create,loader,browser,child}=require('./support/renderHarness.cjs');
async function fixture(t,initialPosition=null,commit=true,insets={},headerBottom=0){
  const win=browser();win.innerWidth=800;win.innerHeight=600;
  const element={parentElement:{},ownerDocument:{querySelector:()=>headerBottom?{getBoundingClientRect:()=>({bottom:headerBottom})}:null},getBoundingClientRect(){return{x:720,y:528,left:720,top:528,width:56,height:56}},setPointerCapture(){},hasPointerCapture(){return true},releasePointerCapture(){}};
  const load=loader({window:win,mocks:{'@/integrations/supabase/client':{supabase:{}},'@/components/auth/UserContext':{useUser:()=>({user:null})},'@/hooks/useUserPresence':{useUserPresence:()=>({})},'./DirectMessagesPanel':{DirectMessagesPanel:child}},globals:{getComputedStyle:el=>({bottom:el===element.parentElement?'16px':'0px',width:'56px',height:'56px',getPropertyValue:key=>`${insets[key.replace('--chat-safe-','')]||0}px`})}});
  const {DirectMessageLauncher}=load('src/components/collaboration/CollaborationCenter.tsx');let opens=0;const commits=[];let root;
  await act(async()=>{root=create(React.createElement(DirectMessageLauncher,{unreadCount:120,onOpen(){opens++},initialPosition,onPositionChange:commit?p=>commits.push(p):undefined}),{createNodeMock:node=>node.type==='button'?element:null})});
  t.after(()=>act(async()=>root.unmount()));
  const button=()=>root.root.findByType('button');
  const event=(x,y,extra={})=>({currentTarget:element,pointerId:1,isPrimary:true,button:0,clientX:x,clientY:y,preventDefault(){},...extra});
  return{win,button,event,commits,get opens(){return opens}};
}
test('tap opens chat, dragging tracks its grab offset and does not also open chat',async t=>{
  const f=await fixture(t);assert.match(f.button().props['aria-label'],/120 則未讀/);
  await act(async()=>{f.button().props.onPointerDown(f.event(740,548));f.button().props.onPointerUp(f.event(742,550));f.button().props.onClick({detail:1,preventDefault(){}})});assert.equal(f.opens,1);
  await act(async()=>{f.button().props.onPointerDown(f.event(740,548));f.button().props.onPointerMove(f.event(220,180));f.button().props.onPointerUp(f.event(220,180));f.button().props.onClick({detail:1,preventDefault(){}})});
  assert.equal(f.opens,1);assert.equal(f.button().props.style.translate,'200px 160px');assert.deepEqual(JSON.parse(JSON.stringify(f.commits.at(-1))),{x:200,y:160});
  await act(async()=>f.button().props.onClick({detail:0,preventDefault(){}}));assert.equal(f.opens,2,'keyboard activation still works after dragging');
});
test('a remembered position is fitted on remount and movement works without a persistence callback',async t=>{
  const f=await fixture(t,{x:200,y:160},false);assert.equal(f.button().props.style.translate,'200px 160px');
  await act(async()=>f.button().props.onKeyDown({key:'ArrowLeft',currentTarget:f.event(0,0).currentTarget,preventDefault(){},stopPropagation(){}}));
  assert.equal(f.button().props.style.translate,'184px 160px');
});
test('notch safe areas and the application header are part of the visible movement bounds',async t=>{
  const f=await fixture(t,{x:0,y:0},true,{left:40,top:24,right:30});
  assert.equal(f.button().props.style.translate,'52px 36px');
  const header=await fixture(t,{x:0,y:0},true,{},64);assert.equal(header.button().props.style.translate,'12px 76px');
});
test('drag/cancel and resize stay visible; keyboard arrows offer an alternative to dragging',async t=>{
  const f=await fixture(t);
  await act(async()=>{f.button().props.onPointerDown(f.event(740,548));f.button().props.onPointerMove(f.event(-300,-200));f.button().props.onPointerCancel(f.event(-300,-200))});
  assert.equal(f.button().props.style.translate,'12px 12px');assert.equal(f.opens,0);
  await act(async()=>f.button().props.onKeyDown({key:'ArrowRight',currentTarget:{...f.event(0,0).currentTarget,getBoundingClientRect:()=>({left:12,top:12,width:56,height:56})},preventDefault(){},stopPropagation(){}}));
  assert.equal(f.button().props.style.translate,'28px 12px');
  f.win.innerWidth=80;f.win.innerHeight=100;await act(async()=>f.win.dispatchEvent(new Event('resize')));
  assert.equal(f.button().props.style.translate,'12px 12px');
});
