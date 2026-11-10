const key = (id, name, provider, model, baseUrl, patch = {}) => ({ id, key_name:name, api_key:`qa-only-${provider}`, is_active:true, expires_at:null,
  permissions:{read:true,write:true,metadata:{provider,model,baseUrl}}, ...patch });
export const records = [
  key('00000000-0000-4000-8000-000000000001','QA OpenAI','openai','gpt-5.4','https://api.openai.com/v1'),
  key('00000000-0000-4000-8000-000000000002','QA Gemini','gemini','gemini-2.5-flash','https://generativelanguage.googleapis.com/v1beta'),
  key('00000000-0000-4000-8000-000000000003','QA Claude','anthropic','qa-claude','https://api.anthropic.com/v1'),
  key('00000000-0000-4000-8000-000000000004','QA Compatible','openai-compatible','qa-text','https://compatible.invalid/v1'),
  key('inactive','Disabled','openai','qa-disabled','https://api.openai.com/v1',{is_active:false}),
  key('expired','Expired','gemini','qa-expired','https://generativelanguage.googleapis.com/v1beta',{expires_at:'2000-01-01T00:00:00Z'}),
  key('denied','Denied','anthropic','qa-denied','https://api.anthropic.com/v1',{permissions:{read:false,metadata:{provider:'anthropic',model:'qa-denied',baseUrl:'https://api.anthropic.com/v1'}}}),
];
export const qa = window.__nvQA = {requests:[],telemetry:[],reads:[],discoveries:[]};
const mapping = {headerRow:1,partNumber:1,mpn:2,manufacturer:3,description:4,qty:5,refs:6};
const modelKey = model => model.startsWith('gpt-') ? records[0].id : model.startsWith('gemini-') ? records[1].id : model==='qa-claude' ? records[2].id : records[3].id;
function userInput(body) {
  const message = body.contents?.at(-1) ?? body.messages?.at(-1);
  const content = message.parts ?? message.content;
  return JSON.parse(typeof content === 'string' ? content : content.map(part=>part.text || '').join(''));
}
export async function providerReply(provider, model, body, url, apiKeyId) {
  qa.requests.push({provider,model,body,url,apiKeyId});
  await new Promise(resolve=>setTimeout(resolve,60));
  if (model==='gpt-6.1-sol') return {status:403,payload:{error:{code:'model_not_found',message:'The model `gpt-6.1-sol` does not exist or you do not have access to it.'}}};
  const input=userInput(body), result=input.items ? {items:input.items.map(item=>({id:item.id,action:`QA ${item.kind} ${(item.after??item.before).partNumber}`,note:'QA source rows checked'}))} : {before:mapping,after:mapping,warnings:[]};
  const text=JSON.stringify(result);
  return {status:200,payload:provider==='gemini' ? {candidates:[{content:{parts:[{text}]},finishReason:'STOP'}]} : provider==='anthropic' ? {content:[{type:'text',text}],stop_reason:'end_turn'} : {choices:[{message:{content:text},finish_reason:'stop'}]}};
}
const resolved = result => ({abortSignal(){return Promise.resolve(result)},then(ok,no){return Promise.resolve(result).then(ok,no)}});
export const supabase = {
  from(table) { qa.reads.push(table);if(table!=='api_keys')throw new Error('Unexpected production table access');const result=resolved({data:records,error:null});for(const method of ['select','eq','order'])result[method]=()=>result;return result; },
  rpc(name,args) { qa.telemetry.push({name,...args});if(!['start_ai_model_usage_attempt','finish_ai_model_usage_attempt'].includes(name))throw new Error('Unexpected database write');return resolved({data:null,error:name==='start_ai_model_usage_attempt'&&args.p_api_key_id!==modelKey(args.p_model)?new Error('Credential identity changed'):null}); },
  functions:{async invoke(name,{body}) { if(name!=='openai-proxy'||!['models','chat'].includes(body.operation))throw new Error('Unexpected proxy operation');if(body.apiKeyId!==records[0].id)throw new Error('Proxy credential identity changed');if(body.operation==='models'){qa.discoveries.push(body);return {data:{data:['gpt-5.4','gpt-6.1-sol'].map(id=>({id}))},error:null,response:new Response(null,{status:200})};}const result=await providerReply('openai',body.request.model,body.request,'https://api.openai.com/v1/chat/completions',body.apiKeyId);return {data:result.payload,error:result.status===200?null:new Error('QA 403'),response:new Response(result.status===200?null:JSON.stringify(result.payload),{status:result.status,headers:{'Content-Type':'application/json'}})};}},
};
