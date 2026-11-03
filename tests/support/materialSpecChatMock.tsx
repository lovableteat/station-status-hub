import React from 'react';
import {AiQuotaStatus as RealAiQuotaStatus} from '../../src/components/api-management/AiQuotaStatus';
const catalogue=await(await fetch('/qa-catalogue')).json();
const records=[...catalogue,{name:'denied.pdf',size:100}].map((file,index)=>({record_id:String(index),data:{id:String(index),manufacturerPartNumber:'MPN-QA',manufacturer:'QA',refDes:'U'+index,specDocument:{name:file.name,path:'safe/'+file.name,size:file.size}}}));
export const useUser=()=>({user:{userId:'spec-qa',displayName:'QA'}});
export const AiQuotaStatus=props=> <RealAiQuotaStatus {...props} />;
export const AI_USAGE_RECORDED_EVENT='ai-usage-recorded';
export const supabase={
  from(table){const query={start:0,end:999};const b=new Proxy(query,{get(target,key){if(key==='then')return(ok,no)=>Promise.resolve({data:(table==='material_bom_workspaces'?[{id:'qa-bom',name:'QA BOM（全部附件測試）'}]:table==='material_bom_records'?records:[]).slice(query.start,query.end+1),error:null}).then(ok,no);if(key==='range')return(a,z)=>{query.start=a;query.end=z;return b};return()=>b}});return b;},
  rpc(name){const data=name==='get_ai_model_usage_summary'?{generated_at:new Date().toISOString(),tracking_started_at:'2026-11-01T00:00:00Z',targets:[{api_key_id:'qa-key',provider:'openai',model:'gpt-5.4',minute_attempts:0,pacific_day_attempts:6}]}:[];const b={abortSignal(){return b},then(ok,no){return Promise.resolve({data,error:null}).then(ok,no)}};return b},
  storage:{from(){return{async download(path){if(path.endsWith('denied.pdf'))return{data:null,error:new Error('QA permission denied')};const response=await fetch('/qa-spec/'+encodeURIComponent(path.slice(5)));return{data:await response.blob(),error:response.ok?null:new Error('not found')};},async createSignedUrl(path){return{data:{signedUrl:'/qa-spec/'+encodeURIComponent(path.slice(5))},error:null}}}}},
  channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel:async()=>{}
};
export async function trackedProviderFetch(input){
  const body=JSON.parse(input.init.body);const serialized=JSON.stringify(body);
  let text='### QA 模擬答覆\n\nMPN-QA 的 PDF 與 Office 文件記載工作溫度 105 C、電壓 1.2 V [S1]。RAR／7z 內容也已檢查。\n\nDWG 僅部分解析，denied.pdf 無下載權限，不能聲稱已完整讀取所有內容。請展開下方逐檔報告。';
  if(serialized.includes('只回傳 JSON')){const message=body.messages.find(message=>message.role==='user');const prompt=typeof message.content==='string'?message.content:message.content.find(part=>part.type==='text').text;const files=JSON.parse(prompt.match(/附件：(\[[\s\S]*\])$/)[1]);text=JSON.stringify({files:files.map(file=>({id:file.id,text:'QA 模擬圖像判讀：此為測試圖片，沒有實際工程額定值。'}))});}
  else if(!serialized.includes('105 C')||!serialized.includes('1.2 V'))throw new Error('QA 文件內容未傳入回答上下文');
  return new Response(JSON.stringify({choices:[{message:{content:text}}]}),{status:200});
}
