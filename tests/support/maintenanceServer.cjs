const {randomUUID}=require('node:crypto');
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
function createMaintenanceServer() {
  let tick=0;const now=()=>new Date(Date.now()+ ++tick).toISOString();
  const people=[{id:'A',name:'王宇',username:'A'},{id:'B',name:'林浩',username:'B'},{id:'C',name:'陳凱',username:'C'}];
  const issues=[['GB300-021','無法開機，電源燈未亮','waiting_parts','缺 PSU，待到料',['A','B']],['GB300-021','網路連線間歇中斷','diagnosing','已換線，繼續查因',['A','B']],['GB300-034','風扇轉速異常','repairing','更換後重測',['C']],['GB300-034','系統無法辨識 SSD','pending','新回報',[]],['GB300-048','螢幕無訊號','diagnosing','換線後仍無畫面',['B','A']],['GB300-048','USB 連接埠接觸不良','waiting_parts','待前面板模組',['C']],['GB300-090','舊故障完整內容','resolved','舊處理內容',[]]].map(([asset,title,status,summary,owners],index)=>({id:`issue-${index}`,project_id:'p',asset_identifier:asset,system_id:null,title,description:index===6?'<p>原始描述：開機失敗</p>':title,process_notes:index===6?'<p>原本處理紀錄</p>':null,solution:index===6?'原解決方式':null,status:index===6?'closed':'open',maintenance_status:index===6?null:status,summary,assigned_to:owners.map(id=>people.find(p=>p.id===id).name).join('、')||null,assignee_user_ids:owners,category:index===6?'舊分類':null,created_at:now(),updated_at:now()}));
  issues.push({...issues[0],id:'other',project_id:'p2',asset_identifier:'OTHER-001',title:'其他專案故障'});
  issues.push({...issues[6],id:'archived-fault',project_id:'archived',title:'封存專案的已關閉故障'});
  const systems=[{id:'known',project_id:'p',system_name:'原機台名稱',serial_number:'GB300-100',status:'Completed',assigned_engineer:'原工程師',actual_started_at:null,actual_completed_at:null,model:'GB300',overall_progress:100}];
  const messages=[],attachments=[{id:'legacy-file',issue_id:'issue-6',maintenance_message_id:null,file_name:'原附件.png',file_path:'legacy.png',file_type:'image/png',file_size:image.length}],objects=new Map([['legacy.png',image]]),failed=new Set();
  const touch=issue=>{issue.updated_at=now();};
  const addEvent=(issue,actor,kind,body='',metadata={})=>{const m={id:randomUUID(),issue_id:issue.id,project_id:issue.project_id,actor_id:actor,actor_name:people.find(p=>p.id===actor)?.name||actor,kind,body,metadata,created_at:now()};messages.push(m);return m;};
  const rpc=(name,a,actor)=>{
    const issue=issues.find(i=>i.id===a.p_issue_id);
    if(name==='maintenance_workspace')return {issues:issues.filter(i=>i.project_id===a.p_project_id).map(i=>({...i,summary:messages.find(m=>m.id===i.handover_message_id)?.body||[...messages].reverse().find(m=>m.issue_id===i.id&&m.kind==='note')?.body||i.summary})),systems:systems.filter(s=>s.project_id===a.p_project_id),people,categories:['電源','連線','舊分類']};
    if(name==='maintenance_thread')return {messages:messages.filter(m=>m.issue_id===a.p_issue_id),attachments:attachments.filter(f=>f.issue_id===a.p_issue_id)};
    if(actor==='view')throw {message:'沒有維修編輯權限',code:'42501'};
    if(name==='maintenance_create_fault'){
      if(issue)return issue;
      const next={id:a.p_issue_id,project_id:a.p_project_id,title:a.p_title,description:a.p_title,asset_identifier:a.p_asset_identifier,system_id:a.p_system_id||null,status:'open',maintenance_status:'pending',assigned_to:null,assignee_user_ids:[],category:null,created_at:now(),updated_at:now()};issues.push(next);addEvent(next,actor,'created',next.title);return next;
    }
    if(!issue)throw {message:'找不到故障'};
    if(name==='maintenance_update_fault'){
      if(a.p_expected_updated_at!==issue.updated_at)throw {message:'紀錄已由其他人更新，已保留你的修改，請確認最新內容後再儲存',code:'PT409',details:issue.updated_at};
      const changes=a.p_changes,previous={...issue};
      if(changes.maintenance_status==='resolved'&&!(changes.category||issue.category))throw {message:'結案前請補選故障分類'};
      Object.assign(issue,changes);
      if(changes.maintenance_status)issue.status=changes.maintenance_status==='resolved'?'resolved':'in_progress';
      if(changes.assignee_user_ids)issue.assigned_to=people.filter(p=>changes.assignee_user_ids.includes(p.id)).map(p=>p.name).join('、')||null;
      addEvent(issue,actor,changes.maintenance_status?'status':changes.assignee_user_ids?'assignees':changes.handover_message_id!==undefined?'handover':'edited','',{status:issue.maintenance_status,assignees:issue.assigned_to,previous_assignees:previous.assigned_to,handover_message_id:issue.handover_message_id,category:issue.category,previous_category:previous.category,title:issue.title,previous_title:previous.title,asset:issue.asset_identifier,previous_asset:previous.asset_identifier,asset_changed:issue.asset_identifier!==previous.asset_identifier});touch(issue);return issue;
    }
    if(name==='maintenance_add_note'){let m=messages.find(m=>m.id===a.p_message_id);if(!m){m=addEvent(issue,actor,'note',a.p_body);m.id=a.p_message_id;touch(issue);}return m;}
    if(name==='maintenance_add_attachment'){const found=attachments.find(f=>f.id===a.p_file.id);if(found)return found;const f={...a.p_file,issue_id:issue.id,maintenance_message_id:a.p_message_id};attachments.push(f);touch(issue);return f;}
    throw {message:'Unknown RPC '+name};
  };
  const middleware=async(req,res,next)=>{
    if(!req.url?.startsWith('/__maintenance/'))return next();
    const url=new URL(req.url,'http://localhost');
    const respond=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
    if(url.pathname.startsWith('/__maintenance/file/')){res.setHeader('Content-Type','image/png');res.end(objects.get(decodeURIComponent(url.pathname.slice('/__maintenance/file/'.length)))||image);return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
    if(url.pathname.startsWith('/__maintenance/upload/')){const filename=decodeURIComponent(req.headers['x-file-name']||'');if(filename==='fail.png'&&!failed.has(filename)){failed.add(filename);respond({error:{message:'模擬單檔上傳中斷'}});return;}objects.set(decodeURIComponent(url.pathname.slice('/__maintenance/upload/'.length)),body);respond({data:{},error:null});return;}
    if(url.pathname==='/__maintenance/state'){respond({issues,messages,attachments});return;}
    try { const input=JSON.parse(body.toString()||'{}');if(url.pathname==='/__maintenance/table'){respond({data:(input.table==='test_systems'?systems.filter(s=>s.project_id===input.project):[]).slice(input.offset,input.end+1),error:null});return;}respond({data:rpc(input.name,input.args,req.headers['x-qa-user']||'A'),error:null}); } catch(error){respond({data:null,error});}
  };
  return {middleware};
}
module.exports={createMaintenanceServer};
