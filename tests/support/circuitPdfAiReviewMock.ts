import type { ApiKeyRecord } from '../../src/components/api-management/apiKeyHelpers';
const model: ApiKeyRecord = {id:'qa-vision',key_name:'QA Vision',api_key:'qa-no-real-key',description:null,is_active:true,expires_at:null,last_used_at:null,usage_count:0,created_at:'2026-11-09T00:00:00Z',permissions:{read:true,metadata:{provider:'openai',model:'qa-vision',baseUrl:'https://api.openai.com/v1',editable:false}}};
export const supabase = {from(){return{select(){return this},eq(){return this},order(){return this},abortSignal(){return Promise.resolve({data:[model],error:null})}}}};
export async function trackedProviderFetch(request: {init:RequestInit}) {
  const qa=(window as unknown as {__circuitAiQA:{mode:string;calls:Array<Record<string,unknown>>;failPages?:number[];slowPages?:number[];held?:Record<number,()=>void>}}).__circuitAiQA;
  const body=JSON.parse(String(request.init.body)), system=body.messages[0].content;
  const systemText=typeof system==='string'?system:system.map((part:{text?:string})=>part.text??'').join('');
  const target={officialVersionId:JSON.parse(systemText.match(/"officialVersionId":("[^"]+")/)?.[1]??'"official-v1"'),workingVersionId:JSON.parse(systemText.match(/"workingVersionId":("[^"]+")/)?.[1]??'"work-v2"'),officialPage:Number(systemText.match(/"officialPage":(\d+)/)?.[1]??1),workingPage:Number(systemText.match(/"workingPage":(\d+)/)?.[1]??1)};
  const images=body.messages.flatMap((message:{content:unknown})=>Array.isArray(message.content)?message.content:[]).filter((part:{type?:string})=>part.type==='image_url');
  qa.calls.push({target,images:images.length,detail:images.map((part:{image_url:{detail:string}})=>part.image_url.detail),text:JSON.stringify(body.messages.map((message:{content:unknown})=>message.content)).replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,'[image omitted]'),scope:systemText.includes('不可聲稱通過電氣驗證或正式審核')});
  if(qa.mode==='hold') {
    const held=qa.held??={};
    const page=target.workingPage,signal=request.init.signal;
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{delete held[page];reject(new DOMException('Cancelled','AbortError'));};
      if(signal?.aborted){abort();return;}
      held[page]=()=>{delete held[page];signal?.removeEventListener('abort',abort);resolve();};
      signal?.addEventListener('abort',abort,{once:true});
    });
  }
  if(qa.mode==='slow'||qa.slowPages?.includes(target.workingPage)) await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,30000);request.init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));},{once:true})});
  if(qa.failPages?.includes(target.workingPage))throw new Error(`QA 第 ${target.workingPage} 頁分析失敗`);
  const content={...target,summary:`工作第 ${target.workingPage} 頁／官方第 ${target.officialPage} 頁有一處差分 Net 標籤需要人工核對。未使用原生 netlist，不能證明完整連通。`,checks:[
    {category:'connectivity',state:'unverifiable',note:'PDF 未附原生 netlist，需人工核對接點'},
    {category:'net-name',state:'possible-issue',note:'CON2A A1 的 P/N 名稱不同'},
    {category:'label-name',state:'unverifiable',note:'接腳名稱太小，無法確定完整文字'}],findings:[
    {category:'net-name',priority:'high',title:'CON2A A1 差分 P/N 名稱不同',location:'CON2A A1 差分 Net 標籤',officialEvidence:'PCIE_RX_P',workingEvidence:'PCIE_RX_N',suggestion:'請核對原始設計意圖與 netlist，再決定是否更正。',certainty:'suspected',officialBox:{x:.125,y:.283,width:.15,height:.058},workingBox:{x:.125,y:.283,width:.15,height:.058}},
    {category:'connectivity',priority:'medium',title:'接點是否實際連通無法確認',location:'位置無法定位',officialEvidence:'未見可判定的接點',workingEvidence:'未見可判定的接點',suggestion:'請人工核對連接性。',certainty:'unclear',officialBox:{x:.98,y:.55,width:.15,height:.06},workingBox:null},
    {category:'connectivity',priority:'low',title:'A1 接點需確認',location:'右側 A1 接腳',officialEvidence:'無法定位接點',workingEvidence:'A1',suggestion:'確認線段是否接上 A1。',certainty:'unclear',officialBox:null,workingBox:{x:.77,y:.33,width:.10,height:.07}},
  ]};
  return {ok:true,status:200,headers:new Headers(),json:async()=>({choices:[{finish_reason:qa.mode==='truncate'?'length':'stop',message:{content:qa.mode==='invalid'?'{}':JSON.stringify(content)}}]})};
}
