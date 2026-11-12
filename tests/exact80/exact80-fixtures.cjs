// All values here are synthetic. This module never opens a network connection.
const ACTOR='10000000-0000-4000-8000-000000000001', AUTH='20000000-0000-4000-8000-000000000001';
const PROJECT='30000000-0000-4000-8000-000000000001', ISSUE='40000000-0000-4000-8000-000000000001';
const DATE='2026-11-12T10:00:00.000Z';
const actor={id:ACTOR,user_id:ACTOR,username:'synthetic-editor',display_name:'Synthetic editor',role:'admin',status:'active',permissions:{},avatar_path:null};
// Strict schema of the already-added protected profile API; no legacy PCB snapshot.
const protectedProfile={id:ACTOR,username:actor.username,display_name:actor.display_name,role:'admin',status:'active',permissions:{},created_by:null,created_at:DATE,updated_at:DATE,registration_requested_at:null,approved_at:null,approved_by:null,auth_user_id:AUTH,auth_migrated_at:null,last_seen_at:null,avatar_path:null};
const project={id:PROJECT,name:'SYNTHETIC CUTOVER PROJECT',status:'active',is_archived:false,created_at:DATE,updated_at:DATE,owner_user_id:ACTOR};
const fault={id:ISSUE,project_id:PROJECT,title:'SYNTHETIC CUTOVER FAULT',description:'Synthetic note, no external resource.',status:'open',maintenance_status:'pending',assigned_to:null,assignee_user_ids:[],asset_identifier:'SYNTHETIC MACHINE',system_id:null,category:'Synthetic',created_at:DATE,updated_at:DATE};
const pcbProject={schemaVersion:1,id:'synthetic-board',name:'SYNTHETIC PCB',description:'Synthetic existing PCB',status:'draft',board:{width:100,height:80,gridSize:1,showGrid:true,snapToGrid:true,background:'#102030',layerColors:{top:'#00aa44',bottom:'#0044aa'},cuts:[]},components:[],keepouts:[],measurements:[],createdAt:DATE,updatedAt:DATE};
const pcb={projects:[pcbProject],templates:[],library:[],activeProjectId:pcbProject.id,modelAssets:{},pendingPlacementsByProject:{},remoteDeletions:{projects:[],templates:[],library:[]},updatedAt:DATE};
function workspaceQuery(workspace) {
 if(!['station-status','pcb-designer'].includes(workspace))throw Error('Unmodeled research workspace');
 const query=new URLSearchParams({project:PROJECT,workspace});
 // Original Index prioritizes station modules over workspace; PCB must not carry issues.
 if(workspace==='station-status'){query.set('module','issues');query.set('openIssue',ISSUE);}
 return query;
}
function session() {
 const expires=Math.floor(Date.now()/1000)+3600;
 const token=[{alg:'HS256',typ:'JWT'},{sub:AUTH,exp:expires,role:'authenticated',aud:'authenticated'},'synthetic-signature'].map((x,i)=>i===2?x:Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 return {access_token:token,refresh_token:'synthetic-refresh-not-a-real-credential',token_type:'bearer',expires_in:3600,expires_at:expires,user:{id:AUTH,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',created_at:DATE,app_metadata:{provider:'email',system_user_id:ACTOR,username:actor.username,role:'admin',display_name:actor.display_name},user_metadata:{},identities:[]}};
}
const READ_TABLES=new Set(['user_page_permissions','test_flow_stations','test_flow_items','station_contents','test_systems','test_progress','issues','user_notifications','chat_read_receipts','chat_messages','chat_history_clears','user_presence']);
const EMPTY_READ_RPC=new Set(['get_test_project_summaries','list_direct_chat_threads','list_active_collaboration_members','list_pcb_designer_model_assets']);
function responseFor(request,{denyRaw=false,denyProtected=false}={}) {
 const {pathname,method,search,headers,body}=request;
 if(pathname==='/auth/v1/user'&&method==='GET')return{kind:'auth-read',data:session().user};
 if(pathname==='/auth/v1/token'&&method==='POST')return{kind:'auth-synthetic-refresh',data:session()};
 if(pathname.startsWith('/rest/v1/rpc/')&&method==='POST'){
  const name=pathname.split('/').pop();
  if(name==='get_current_system_user')return{kind:'read',data:[actor]};
  if(name==='list_system_user_profiles'){
   const parameters=new URLSearchParams(search);
   if((headers['content-profile']||headers['accept-profile'])!=='workspace'||!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length||(parameters.has('id')&&parameters.get('id')!=='eq.'+ACTOR))return{kind:'forbidden',status:503,data:{message:'Unmodeled protected profile contract'}};
   if(denyProtected)return{kind:'protected-profile-denial',status:403,data:{code:'42501',message:'Synthetic protected profile denial'}};
   const single=(headers.accept||'').includes('application/vnd.pgrst.object');
   return{kind:'protected-profile-read',data:single?protectedProfile:[protectedProfile]};
  }
  if(EMPTY_READ_RPC.has(name))return{kind:'read',data:[]};
  if(name==='maintenance_workspace')return{kind:'read',data:{issues:[fault],systems:[],people:[{id:ACTOR,name:actor.display_name,username:actor.username}],categories:['Synthetic']}};
  if(name==='maintenance_thread')return{kind:'read',data:{messages:[],attachments:[]}};
  if(name==='load_pcb_designer_workspace_shared')return{kind:'read',data:pcb};
  if(['acquire_pcb_designer_project_lock','load_pcb_designer_project_lock'].includes(name))return{kind:'synthetic-lease',data:{available:true,acquired:true,lock:null}};
  if(name==='release_pcb_designer_project_lock')return{kind:'synthetic-lease',data:true};
 }
 if(pathname.startsWith('/rest/v1/')&&method==='GET'){
  const table=pathname.split('/').pop();
  if(table==='test_projects')return{kind:'read',data:[project]};
  if(table==='system_users'){
   if(denyRaw&&new URLSearchParams(search).get('select')?.includes('permissions'))return{kind:'raw-denial',status:403,data:{code:'42501',message:'Synthetic permission denial'}};
   const single=(headers.accept||'').includes('application/vnd.pgrst.object');
   const select=new URLSearchParams(search).get('select')||'*';
   return{kind:select==='*'||select.includes('permissions')?'raw-permissions-read':'raw-profile-read',data:single?actor:[actor]};
  }
  if(READ_TABLES.has(table))return{kind:'read',data:[]};
 }
 return{kind:'forbidden',status:503,data:{code:'SYNTHETIC_UNMATCHED_REQUEST',message:'No fixture exists; never forwarded'}};
}
function realtimeResponse(value) {
 const array=Array.isArray(value);
 const [joinRef,ref,topic,event,payload]=array?value:[value?.join_ref,value?.ref,value?.topic,value?.event,value?.payload];
 const channel=typeof topic==='string'&&topic.startsWith('realtime:');
 const protocol=(event==='heartbeat'&&topic==='phoenix')||(channel&&['phx_join','phx_leave','access_token'].includes(event));
 const presence=channel&&event==='presence'&&['track','untrack'].includes(payload?.event);
 if(!protocol&&!presence)return{kind:'forbidden',event:typeof event==='string'?event:'invalid'};
 const changes=payload?.config?.postgres_changes||[];
 if(event==='phx_join'&&!Array.isArray(changes))return{kind:'forbidden',event};
 const response={status:'ok',response:event==='phx_join'?{postgres_changes:changes.map((binding,index)=>({...binding,id:index+1}))}: {}};
 return{kind:presence?'synthetic-presence':'synthetic-realtime-protocol',event,reply:array?[joinRef,ref,topic,'phx_reply',response]:{join_ref:joinRef,ref,topic,event:'phx_reply',payload:response}};
}
module.exports={protectedProfile,workspaceQuery,realtimeResponse,ACTOR,AUTH,PROJECT,ISSUE,DATE,pcb,session,responseFor};
