import assert from 'node:assert/strict';import test from 'node:test';import {createRequire} from 'node:module';
const {loader}=createRequire(import.meta.url)('./support/renderHarness.cjs');
function fixture(count=1001,denied=false,reader){
  const reads=[],downloads=[];
  const data=Array.from({length:count},(_,i)=>({record_id:String(i).padStart(5,'0'),data:{manufacturerPartNumber:'P'+i,specDocument:{name:i===count-1?'last.dwg':'spec.txt',path:'safe/'+i,size:20}}}));
  const db={
    from(table){
      const q={table,start:0,end:999};
      const builder=new Proxy(q,{get(target,key){
        if(key==='then')return(ok,no)=>{reads.push({...q});return Promise.resolve({data:(table==='material_bom_workspaces'?[{id:'bom',name:'Board'}]:data).slice(q.start,q.end+1),error:null}).then(ok,no)};
        if(key==='range')return(a,b)=>{q.start=a;q.end=b;return builder};
        return()=>builder;
      }});return builder;
    },
    storage:{from(){return{async download(path){downloads.push(path);return denied?{data:null,error:new Error('denied')}:{data:new Blob(['maximum temperature 105 C']),error:null};}};}}
  };
  const load=loader({mocks:{'@/integrations/supabase/client':{supabase:db},'./materialSpecDocumentReaders':{readMaterialSpecDocument:reader??(async(name,blob)=>({text:await blob.text(),status:name.endsWith('.dwg')?'partial':'read',method:'QA reader',note:name.endsWith('.dwg')?'not full CAD conversion':''}))}},globals:{AbortSignal,Blob,TextDecoder,TextEncoder,btoa}});
  return{...load('src/components/api-management/materialSpecKnowledgeService.ts'),reads,downloads};
}
test('BOM records paginate past 1000 and every file type reaches the reader, including the final DWG',async()=>{
  const f=fixture();let access=0;
  const report=await f.searchMaterialSpecs({query:'105 C temperature',scope:'all',signal:new AbortController().signal,assertAccess(){access++},onProgress(){},inspectNative(){throw new Error('no images')}});
  assert.equal(report.files.length,1001);assert.equal(f.downloads.length,1001);assert.ok(f.reads.some(q=>q.table==='material_bom_records'&&q.start===1000));assert.equal(report.files.at(-1).status,'partial');assert.match(report.context,/105 C/);assert.ok(access>1001);
});
test('invalid image batches stay unread and do not repeatedly call the model for remaining files',async()=>{
  const f=fixture(6,false,async()=>({text:'',status:'partial',method:'image',native:[{blob:new Blob(['image']),mimeType:'image/png'}]}));let calls=0;
  const report=await f.searchMaterialSpecs({query:'ratings',scope:'all',signal:new AbortController().signal,assertAccess(){},onProgress(){},async inspectNative(){calls++;return JSON.stringify({files:[{id:'S1',text:'incomplete'}]})}});
  assert.equal(calls,1);assert.equal(report.files.length,6);assert.ok(report.files.every(file=>file.status==='unread'));assert.ok(report.files.every(file=>/未判讀|未續送/.test(file.note)));
});
test('attachment denial remains an unread item and permissions reject before any catalogue or model access',async()=>{
  const f=fixture(1,true);let models=0;
  const args={query:'voltage',scope:'all',signal:new AbortController().signal,assertAccess(){},onProgress(){},inspectNative(){models++;return''}};
  const report=await f.searchMaterialSpecs(args);assert.equal(report.files[0].status,'unread');assert.match(report.files[0].note,/權限/);assert.equal(models,0);
  const before=f.reads.length;await assert.rejects(f.searchMaterialSpecs({...args,assertAccess(){throw new Error('revoked')}}),/revoked/);assert.equal(f.reads.length,before);
});
