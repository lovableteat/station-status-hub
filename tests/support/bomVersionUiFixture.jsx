import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { BomVersionCenter } from '../../src/components/material-requests/BomVersionCenter';
import '../../src/index.css';

const project = { id:'qa-empty', name:'Carlo-Next-(GB300)' };
const other = { id:'qa-vera', name:'Vera CPU / 工程驗證與長專案名稱測試' };
const now = new Date().toISOString();
function makeSeries(id, name, count=2, archived=false) {
  const versions = Array.from({length:count}, (_, index) => {
    const current = index === count - 1, workspaceId = `bom:ui:${id}:v${index+1}`;
    return { workspace:{ id:workspaceId, name, updatedAt:now, payload:{ sourceFile:`${name.replace(/\.xlsx$/, '')}_V${index+1}.xlsx`, sheetName:'QA', recordCount:650+index, records:[], generatedAt:now } }, version:{ seriesId:id, seriesName:name, versionNumber:index+1, label:`EVT revision ${index+1}`, note:current?'主料、替代料與追蹤均為隔離假資料':'保留歷史說明', uploadedAt:now, uploadedBy:'QA 工程師', isCurrent:current, currentChangedAt:now, carry:current?{matched:640,orphaned:2,manual:1}:undefined }, stored:true, isCurrent:current, displayNumber:`V${index+1}` };
  });
  return { id, name, versions, current:versions.at(-1), project:{projectId:other.id,projectName:other.name}, archive:archived?{archived:true,archivedAt:now,archivedBy:'QA'}:undefined, recordCount:650, updatedAt:now };
}
const initial = [
  makeSeries('rack','Vera_CPU_Rack_E1.S.xlsx',3),
  makeSeries('module','Vera_CPU_Rack_CPU_Module_超長系列名稱保持可識別並且不撐破版面.xlsx',1),
  makeSeries('base','Vera_CPU_Baseboard.xlsx',2),
  makeSeries('tpm','Vera_CPU_TPM_交付格式.xlsx',1),
  makeSeries('archive','已封存_工程驗證板.xlsx',1,true),
];
window.__bomUiFixture = {calls:[]};
function App() {
  const [series,setSeries] = useState(initial), [open,setOpen] = useState(true), [active,setActive] = useState(initial[0].current.workspace.id);
  const record=(name,...args)=>window.__bomUiFixture.calls.push({name,args});
  return <TooltipProvider><div className="min-h-screen bg-background text-foreground"><p>隔離 BOM 版本管理驗證，全部為 QA 假資料</p><button onClick={()=>setOpen(true)}>重新開啟 BOM 管理</button><BomVersionCenter open={open} onOpenChange={setOpen} canEdit ready activeBomId={active} activeProjectId={project.id} activeProjectName={project.name} projects={[project,other]} projectNames={new Map([[project.id,project.name],[other.id,other.name]])} seriesList={series} exportedBy="QA" loadRecords={async id=>{record('loadRecords',id);return[]}} onView={id=>{record('view',id);setActive(id)}} onSetCurrent={(version,item)=>record('current',version.workspace.id,item.id)} onUploadVersion={item=>record('uploadVersion',item.id)} onUploadNew={()=>record('uploadNew')} onAssignProject={async(item,id)=>{record('assign',item.id,id)}} onRenameSeries={async(item,name)=>{record('rename',item.id,name);setSeries(rows=>rows.map(row=>row.id===item.id?{...row,name}:row))}} onUpdateVersion={async(version,item,patch)=>{record('editVersion',version.workspace.id,item.id,patch);setSeries(rows=>rows.map(row=>row.id===item.id?(()=>{const versions=row.versions.map(v=>v.workspace.id===version.workspace.id?{...v,version:{...v.version,...patch}}:v);return {...row,versions,current:versions.find(v=>v.isCurrent)};})():row))}} onSetArchived={(item,value)=>record('archive',item.id,value)} onDeleteVersion={(version,item)=>record('deleteVersion',version.workspace.id,item.id)} onDeleteSeries={item=>record('deleteSeries',item.id)} onOpenPageTracker={id=>record('pages',id)} onDownloadSource={version=>record('source',version.workspace.id)} /></div></TooltipProvider>;
}
createRoot(document.getElementById('root')).render(<App />);
