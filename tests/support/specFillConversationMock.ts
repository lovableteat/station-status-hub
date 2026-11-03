import {prepareSpecFillSources} from '../../src/components/material-requests/materialSpecFillSources';
export {canReadSpecForFill,SPEC_FILL_ACCEPT} from '../../src/components/material-requests/materialSpecFillSources';
export const SPEC_FILL_MAX_BYTES=18*1024*1024, SPEC_FILL_MAX_PHOTOS=20;
export const loadSpecFillModels=async()=>[{id:'qa',label:'QA 模擬 AI（不會發送外部請求）',record:{}}];
export const downloadSpecForFill=async()=>{throw new Error('No production downloads in QA');};
export async function analyzeSpecFillConversation(input){
  const prepared=await prepareSpecFillSources(input.sources,input.signal);
  const content=await Promise.all(prepared.inputs.map(source=>source.blob.text()));
  const modelIndex=prepared.inputs.findIndex(source=>source.name.includes('模型解析'));
  if(modelIndex<0)throw new Error('QA requires an actual STEP model parse');
  if(input.question.includes('失敗'))throw new Error('QA 模擬請求失敗，舊結果應保留');
  return {sources:prepared.inputs.map(({id,name})=>({id,name})),preparedSources:prepared.inputs,warnings:prepared.warnings,reply:input.history.length?`已延續前 ${input.history.length} 次對話。\n這是 QA 模擬回答：${input.question}\n模型外框為 X=10、Y=20、Z=3 mm，不能代替工程圖公差。`:'這是 QA 模擬 AI 回覆。\nRAR 已實際解壓，STEP 已由 OpenCascade 解析。\n照片只定義欄位，模型外框與電氣資料分別查核。',tables:input.photos.map(photo=>({templateId:photo.id,templateName:photo.name,title:'QA 模型與規格查核表',partMatch:'matched',columns:['查核項目','解析結果','判讀範圍'],rows:[[{kind:'label',value:'模型外框 X/Y/Z'},{kind:'source',value:'10 × 20 × 3 mm',sourceId:prepared.inputs[modelIndex].id,page:'模型',quote:content[modelIndex].split('\n').find(line=>line.includes('X=10 mm'))},{kind:'label',value:'原始模型座標軸，非工程圖公差'}],[{kind:'label',value:'電氣額定值'},{kind:'missing',value:'待確認',quote:'請核對原始電氣 SPEC，不能由幾何外形推測。'},{kind:'label',value:'模型無法提供'}]],warnings:['測試資料與模擬回答，不代表任何實際料件。']}))};
}
