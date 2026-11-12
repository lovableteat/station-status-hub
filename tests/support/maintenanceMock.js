export const SUPABASE_URL = location.origin;
import { useSyncExternalStore } from 'react';
import { setDocumentDraftActor } from '../../src/lib/documentDrafts';
const account = new URLSearchParams(location.search).get('qaUser') || 'A';
// Synthetic UserContext boundary owns identity, matching the real provider.
setDocumentDraftActor(account);
export const useUser = () => ({user:{userId:account,displayName:account === 'B' ? '林浩' : '王宇',username:account}});
export const usePermissions = () => ({canEditModule:() => account !== 'view',canViewModule:() => true});
let projectRevision=0;
const projectListeners=new Set();
const projectChanged=()=>{projectRevision++;projectListeners.forEach(fn=>fn());};
const projects=[{id:'p',name:'GB300',is_archived:false,status:'active'},{id:'p2',name:'其他專案',is_archived:false,status:'active'},{id:'archived',name:'封存專案',is_archived:true,status:'archived'}];
export function useTestProject() {
  useSyncExternalStore(fn=>{projectListeners.add(fn);return()=>projectListeners.delete(fn);},()=>projectRevision);
  const selected=window.fixtureProject||'p';
  return {activeProjectId:selected,activeProject:projects.find(p=>p.id===selected),allProjects:projects,projects,isLoadingProjects:false,projectSummaries:{},setActiveProjectId:id=>{window.fixtureProject=id;projectChanged();},refreshProjects:async()=>{},createProject:async input=>{const p={...input,id:'created-project',is_archived:false,status:'active'};projects.push(p);window.fixtureProject=p.id;projectChanged();return p;},updateProject:async input=>{Object.assign(projects.find(p=>p.id===input.projectId),input);projectChanged();return projects.find(p=>p.id===input.projectId);},archiveProject:async()=>true,restoreProject:async()=>true,deleteProject:async()=>true};
}
async function request(path,body) {
  const response = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-QA-User':account},body:JSON.stringify(body)});
  return response.json();
}
export const supabase = {
  auth:{onAuthStateChange:() => ({data:{subscription:{unsubscribe(){}}}})},
  rpc:(name,args) => request('/__maintenance/rpc',{name,args}),
  channel:() => { const channel={on:() => channel,subscribe:() => channel};return channel; },removeChannel:async()=>{},
  storage:{from:() => ({
    upload:async(path,file) => { const response=await fetch('/__maintenance/upload/'+encodeURIComponent(path),{method:'POST',headers:{'X-File-Name':encodeURIComponent(file.name)},body:file});return response.json(); },
    createSignedUrl:async path => ({data:{signedUrl:location.origin+'/__maintenance/file/'+encodeURIComponent(path)},error:null}),
    download:async path => {const response=await fetch('/__maintenance/file/'+encodeURIComponent(path));return {data:response.ok ? await response.blob() : null,error:response.ok ? null : new Error('Fixture attachment not found')};},
    getPublicUrl:path => ({data:{publicUrl:location.origin+'/__maintenance/file/'+encodeURIComponent(path)}}),
  })},
  from:table => { let offset=0,end=999,project='p';const q={select:()=>q,eq:(key,value)=>{if(key==='project_id')project=value;return q;},order:()=>q,range:(start,last)=>{offset=start;end=last;return q;},then:(yes,no)=>request('/__maintenance/table',{table,project,offset,end}).then(yes,no)};return q; },
};
