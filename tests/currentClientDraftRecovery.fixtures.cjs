// Synthetic transport fixtures only. No network and no production identities.
const assert=require('node:assert/strict');
const base=require('./exact80/exact80-fixtures.cjs');
const BACKEND='https://draft-recovery.invalid';
const ANON_KEY='synthetic-anon-key-not-a-real-credential';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const FILE_NAME='synthetic-unsent.png';
const NOTE='  SYNTHETIC unsent maintenance note\n保留原始空白與 PNG  ';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const forbidden=()=>({kind:'forbidden',status:503,data:{message:'Unmodeled synthetic request; never forwarded'}});
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function uploadedFileBytes(request){
 const body=request.rawBody;
 if(!Buffer.isBuffer(body))return null;
 const content=request.headers['content-type']||'';
 if(content.startsWith('image/png'))return body;
 const match=content.match(/^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i);
 if(!match)return null;
 const marker=Buffer.from('--'+(match[1]||match[2]));
 let position=0,found=[];
 while((position=body.indexOf(marker,position))>=0){
  const start=position+marker.length,next=body.indexOf(marker,start);position=start;
  if(next<0)break;
  const endHeader=body.indexOf('\r\n\r\n',start);
  if(endHeader<0||endHeader>=next)continue;
  const header=body.subarray(start,endHeader).toString('utf8');
  if(/content-disposition:[^\r\n]*\bfilename=/i.test(header))found.push(body.subarray(endHeader+4,next-2));
 }
 return found.length===1?found[0]:null;
}
function createFixture(){
 const state={denyProtected:false,allowMaintenanceSuccess:false,messages:[],attachments:[],uploads:new Map(),writes:[]};
 const respond=request=>{
  const {pathname,method,body,headers={}}=request;
  if(pathname==='/rest/v1/rpc/maintenance_thread'&&method==='POST'){
   if(headers['content-profile']!=='workspace'||!exactKeys(body,['p_issue_id'])||body.p_issue_id!==base.ISSUE||request.search)return forbidden();
   return{kind:'read',data:{messages:state.messages,attachments:state.attachments}};
  }
  if(pathname==='/rest/v1/rpc/maintenance_add_note'&&method==='POST'){
   if(!state.allowMaintenanceSuccess||headers['content-profile']!=='workspace'||!exactKeys(body,['p_issue_id','p_message_id','p_body'])||body.p_issue_id!==base.ISSUE||!UUID.test(body.p_message_id||'')||typeof body.p_body!=='string'||body.p_body.trim()!==NOTE.trim()||request.search)return forbidden();
   const message={id:body.p_message_id,issue_id:base.ISSUE,actor_id:base.ACTOR,actor_name:'Synthetic editor',kind:'note',body:body.p_body.trim(),created_at:base.DATE};
   const previous=state.messages.find(x=>x.id===message.id);
   if(previous&&JSON.stringify(previous)!==JSON.stringify(message))return forbidden();
   if(!previous)state.messages.push(message);
   state.writes.push({kind:'note',id:message.id});return{kind:'synthetic-note-write',data:message};
  }
  if(pathname.startsWith('/storage/v1/object/issue-attachments/')&&method==='POST'){
   if(!state.allowMaintenanceSuccess)return forbidden();
   const objectPath=pathname.slice('/storage/v1/object/issue-attachments/'.length),parts=objectPath.split('/');
   const bytes=uploadedFileBytes(request);
   if(parts.length!==3||parts[0]!==base.ISSUE||!state.messages.some(x=>x.id===parts[1])||!UUID.test(parts[2])||!bytes?.equals(PNG))return forbidden();
   state.uploads.set(objectPath,{bytes:bytes.length});state.writes.push({kind:'upload',id:parts[2]});
   return{kind:'synthetic-attachment-upload',data:{Key:'issue-attachments/'+objectPath,Id:parts[2]}};
  }
  if(pathname==='/rest/v1/rpc/maintenance_add_attachment'&&method==='POST'){
   const file=body?.p_file;
   if(!state.allowMaintenanceSuccess||headers['content-profile']!=='workspace'||!exactKeys(body,['p_issue_id','p_message_id','p_file'])||body.p_issue_id!==base.ISSUE||!state.messages.some(x=>x.id===body.p_message_id)||!exactKeys(file,['id','file_path','file_name','file_size','file_type'])||!UUID.test(file.id||'')||request.search)return forbidden();
   const expected=`${base.ISSUE}/${body.p_message_id}/${file.id}`;
   if(file.file_path!==expected||!state.uploads.has(expected)||file.file_name!==FILE_NAME||file.file_size!==PNG.length||file.file_type!=='image/png')return forbidden();
   const attachment={...file,issue_id:base.ISSUE,maintenance_message_id:body.p_message_id};
   if(!state.attachments.some(x=>x.id===file.id))state.attachments.push(attachment);
   state.writes.push({kind:'attachment',id:file.id});return{kind:'synthetic-attachment-metadata',data:attachment};
  }
  if(pathname.startsWith('/storage/v1/object/sign/issue-attachments/')){
   const objectPath=pathname.slice('/storage/v1/object/sign/issue-attachments/'.length);
   if(!state.allowMaintenanceSuccess||!state.uploads.has(objectPath))return forbidden();
   if(method==='POST'&&exactKeys(body,['expiresIn'])&&body.expiresIn===300&&!request.search)return{kind:'synthetic-attachment-sign',data:{signedURL:'/object/sign/issue-attachments/'+objectPath+'?token=synthetic-signed-token'}};
   if(method==='GET'&&new URLSearchParams(request.search).get('token')==='synthetic-signed-token')return{kind:'synthetic-attachment-read',bytes:PNG,contentType:'image/png'};
   return forbidden();
  }
  // Legacy raw fixtures deliberately remain available: the new client must make
  // zero raw-permissions requests, rather than relying on the fixture hiding them.
  return base.responseFor(request,{denyRaw:false,denyProtected:state.denyProtected});
 };
 return{state,respond};
}
function assertSuccessfulMaintenance(state){
 assert.equal(state.messages.length,1);assert.equal(state.attachments.length,1);assert.equal(state.uploads.size,1);
 assert.deepEqual(state.writes.map(x=>x.kind),['note','upload','attachment']);
 assert.equal(state.messages[0].actor_id,base.ACTOR);
}
module.exports={...base,BACKEND,ANON_KEY,PNG,FILE_NAME,NOTE,createFixture,uploadedFileBytes,assertSuccessfulMaintenance};
