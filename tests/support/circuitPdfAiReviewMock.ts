import type { ApiKeyRecord } from '../../src/components/api-management/apiKeyHelpers';
const model: ApiKeyRecord = {id:'qa-vision',key_name:'QA Vision',api_key:'qa-no-real-key',description:null,is_active:true,expires_at:null,last_used_at:null,usage_count:0,created_at:'2026-11-09T00:00:00Z',permissions:{read:true,metadata:{provider:'openai',model:'qa-vision',baseUrl:'https://api.openai.com/v1',editable:false}}};
export const supabase = {from(){return{select(){return this},eq(){return this},order(){return this},abortSignal(){return Promise.resolve({data:[model],error:null})}}}};
export async function trackedProviderFetch(request: {init:RequestInit}) {
  const qa=(window as unknown as {__circuitAiQA:{mode:string;calls:Array<Record<string,unknown>>}}).__circuitAiQA;
  const body=JSON.parse(String(request.init.body)), system=body.messages[0].content;
  const systemText=typeof system==='string'?system:system.map((part:{text?:string})=>part.text??'').join('');
  const target={officialVersionId:'official-v1',workingVersionId:'work-v2',officialPage:1,workingPage:1};
  const images=body.messages.flatMap((message:{content:unknown})=>Array.isArray(message.content)?message.content:[]).filter((part:{type?:string})=>part.type==='image_url');
  qa.calls.push({target,images:images.length,detail:images.map((part:{image_url:{detail:string}})=>part.image_url.detail),text:JSON.stringify(body.messages.map((message:{content:unknown})=>message.content)).replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,'[image omitted]'),scope:systemText.includes('不得聲稱通過工程審核')});
  if(qa.mode==='slow') await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,30000);request.init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));},{once:true})});
  const content={...target,summary:'本頁有一處差分 Net 標籤需要人工核對。未使用原生 netlist，不能證明完整連通。',checks:[
    {category:'connectivity',state:'unverifiable',note:'PDF 未附原生 netlist，需人工核對接點'},
    {category:'net-name',state:'possible-issue',note:'CON2A A1 的 P/N 名稱不同'},
    {category:'label-name',state:'no-visible-issue',note:'可見接腳名稱相同'}],findings:[{category:'net-name',priority:'high',title:'CON2A A1 差分 P/N 名稱不同',location:'右上 CON2A，A1 接腳',officialEvidence:'PCIE_RX_P',workingEvidence:'PCIE_RX_N',suggestion:'請核對原始設計意圖與 netlist，再決定是否更正。'}]};
  return {ok:true,status:200,headers:new Headers(),json:async()=>({choices:[{finish_reason:qa.mode==='truncate'?'length':'stop',message:{content:qa.mode==='invalid'?'{}':JSON.stringify(content)}}]})};
}
