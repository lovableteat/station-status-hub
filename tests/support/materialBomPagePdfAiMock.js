import * as base from './materialWorkspaceMock';
export * from './materialWorkspaceMock';

const workspaceId = 'bom:qa-board:v2:qa0002';
const initialTracker = { totalPages:4, currentPage:3, updatedAt:'2026-11-09T00:00:00Z', pages:[
  {pageNumber:1,title:'原標題 POWER',status:'done',note:'保留工程師備註'},
  {pageNumber:2,title:'原標題 CLOCK',status:'done_missing',note:'待料紀錄'},
  {pageNumber:3,title:'原標題 RESET',status:'pending',note:'第3頁原備註'},
  {pageNumber:4,title:'第4頁必須保留',status:'done',note:'短PDF不能移除這一頁'},
] };
window.__pdfAiFixture = { tracker:structuredClone(initialTracker), saves:0 };
const decorate = result => ({...result,workspaces:result.workspaces.map(workspace => workspace.id===workspaceId ? {...workspace,pageTracker:structuredClone(window.__pdfAiFixture.tracker)} : workspace)});
export const loadBomWorkspacesDetailed = async (preferredId,options={}) => decorate(await base.loadBomWorkspacesDetailed(preferredId,{...options,onPreview:options.onPreview ? value=>options.onPreview(decorate(value)) : undefined}));
export const loadPageTrackerMap = async () => new Map([[workspaceId,structuredClone(window.__pdfAiFixture.tracker)]]);
export const saveBomWorkspacePageTracker = async (id,tracker) => {
  window.__pdfAiFixture.tracker=structuredClone(tracker);window.__pdfAiFixture.saves++;
  await base.saveBomWorkspacePageTracker(id,tracker);
};
const model = {id:'pdf-qa-model',key_name:'QA Vision',api_key:'qa-no-real-api-key',is_active:true,expires_at:null,permissions:{read:true,write:false,metadata:{provider:'openai',model:'fixture-vision',baseUrl:location.origin+'/__qa',editable:false}},created_at:'2026-11-09T00:00:00Z'};
const query = data => ({select(){return this},eq(){return this},order(){return this},abortSignal(){return this},then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject)}});
export const supabase = {...base.supabase,
  from(table){return table==='api_keys' ? query([model,{...model,id:'pdf-qa-model-2',key_name:'QA Vision 2',permissions:{...model.permissions,metadata:{...model.permissions.metadata,model:'fixture-vision-2'}}}]) : base.supabase.from(table)},
  rpc(name,args){return ['start_ai_model_usage_attempt','finish_ai_model_usage_attempt'].includes(name) ? query(null) : base.supabase.rpc(name,args)},
};
