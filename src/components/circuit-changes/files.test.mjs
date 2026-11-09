import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loader } = require("../../../tests/support/renderHarness.cjs");
const setId = "00000000-0000-4000-8000-000000000001", itemId = "00000000-0000-4000-8000-000000000002";
const file = index => new File([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0,index])], "same.png", { type:"image/png", lastModified:index });
function media(upload) {
  return loader({ mocks:{ "@/integrations/supabase/client":{ supabase:{ storage:{ from:()=>({ upload }) } } } }, globals:{ Blob, Image:class { naturalWidth=400; naturalHeight=300; async decode(){} },
    document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toBlob:resolve=>resolve(new Blob(["thumbnail"],{type:"image/webp"}))})} } })("src/components/circuit-changes/files.ts");
}
test("12 same-name images append in selection order with bounded uploads and explicit partial failure", async()=>{
  let active=0,maxActive=0;const originals=[];
  const api=media(async(path,value)=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,2));active--;if(value instanceof File){originals.push({path,index:value.lastModified});if(value.lastModified===5)return{error:{message:"failed-image-5"}}}return{error:null}});
  const results=await api.uploadCircuitImages({setId,itemId,files:Array.from({length:12},(_,i)=>file(i)),side:"before",actorId:setId});
  assert.equal(results.images.length,11);assert.equal(results.failures.length,1);assert.equal(results.failures[0].file.lastModified,5);
  assert.equal(maxActive,3);assert.equal(new Set(results.images.map(value=>value.path)).size,11);
  assert.deepEqual(Array.from(results.images,value=>originals.find(row=>row.path===value.path).index),[0,1,2,3,4,6,7,8,9,10,11]);
  assert.ok(results.images.every(value=>value.name==="same.png"&&value.side==="before"&&value.thumbnailPath));
});
test("thumbnail transport failure preserves a successfully uploaded original",async()=>{
  const api=media(async path=>{if(path.endsWith("-thumb.webp"))throw new Error("thumbnail offline");return{error:null}});
  const result=await api.uploadCircuitImages({setId,itemId,files:[file(1)],side:"after",actorId:setId});
  assert.equal(result.images.length,1);assert.equal(result.failures.length,0);assert.equal(result.warnings.length,1);assert.equal(result.images[0].thumbnailPath,undefined);
});
test("unsupported and oversized files fail before Storage",async()=>{
  let uploads=0;const api=media(async()=>{uploads++;return{error:null}});
  await assert.rejects(api.validateCircuitImage(new File(["<svg></svg>"],"bad.svg",{type:"image/svg+xml"})),/PNG/);
  await assert.rejects(api.validateCircuitImage({size:51*1024*1024}),/50 MB/);assert.equal(uploads,0);
});
