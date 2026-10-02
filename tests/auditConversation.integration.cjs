const test=require('node:test');
const assert=require('node:assert/strict');
const {React,act,create,child,browser,database,loader,flush}=require('./support/renderHarness.cjs');
test('opening and remounting an unchanged private conversation causes no write; actual draft edits still autosave',async()=>{
 const win=browser();const savedAt=Date.UTC(2026,9,2,5,51);
 const row={conversation_key:'conversation-active-workspace',title:'稽核測試',saved_at:savedAt,draft_message:'',messages:[{id:'u',role:'user',content:'測試問題',createdAt:savedAt},{id:'a',role:'assistant',content:'測試答案',createdAt:savedAt}],provider:'gemini',model:'gemini-2.5-flash',key_label:'Audit'};
 const calls=[];const db=database(q=>{if(q.method==='rpc'){calls.push(q);return {data:[],error:null};}return {data:q.table==='ai_workspace_conversations'?[row]:[],error:null};});
 const load=loader({window:win,transform:(source,file)=>process.env.AUDIT_CHAT_BEFORE&&file.endsWith('ApiChatConsole.tsx')?require('node:fs').readFileSync(process.env.AUDIT_CHAT_BEFORE,'utf8'):source,mocks:{'@/components/auth/UserContext':{useUser:()=>({user:{userId:'audit'}})},'@/integrations/supabase/client':{supabase:db},'sonner':{toast:{success(){},error(){}}},'./MarkdownMessage':{MarkdownMessage:child},'./MaintenanceCitationList':{MaintenanceCitationList:child},'./MaintenanceSourceSelector':{MaintenanceSourceSelector:child},'./pptxAttachment':{}},globals:{requestAnimationFrame:cb=>setTimeout(cb,0)}});
 const {ApiChatConsole}=load('src/components/api-management/ApiChatConsole.tsx');const props={mode:'chat-only',availableApiKeys:[],maintenanceProjects:[]};let root;
 try{
  await act(async()=>{root=create(React.createElement(ApiChatConsole,props));});await flush(1100);assert.equal(calls.length,0,'hydration must not rewrite the unchanged cloud conversation');
  await act(async()=>{root.unmount();root=create(React.createElement(ApiChatConsole,props));});await flush(1100);assert.equal(calls.length,0,'workspace reentry must not rewrite saved_at');
  const input=root.root.findAll(n=>n.props.value===''&&typeof n.props.onChange==='function'&&n.props.onKeyDown).at(-1);assert.ok(input,'actual composer');await act(async()=>input.props.onChange({target:{value:'尚未送出的繁體草稿'}}));await flush(1100);
  assert.equal(calls.length,1);assert.equal(calls[0].args.p_items[0].draftMessage,'尚未送出的繁體草稿');assert.ok(calls[0].args.p_items[0].savedAt>savedAt);assert.equal(calls[0].args.p_items[0].messages.length,2);
 }finally{await act(async()=>root?.unmount());}
});
