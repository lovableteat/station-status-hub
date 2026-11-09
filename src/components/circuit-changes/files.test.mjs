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
test("a file that can never be accepted is marked so, unlike a transfer that may work on retry", async () => {
  const api = media(async (path, value) => value instanceof File && value.name === "offline.png" ? { error: { message: "network down" } } : { error: null });
  const pdf = new File(["%PDF-1.7 not a picture"], "schematic.pdf", { type: "application/pdf" });
  const offline = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 1])], "offline.png", { type: "image/png" });
  const result = await api.uploadCircuitImages({ setId, itemId, files: [pdf, offline, file(3)], side: "after", actorId: setId });
  assert.equal(result.images.length, 1);
  const rejected = result.failures.find(failure => failure.file === pdf), dropped = result.failures.find(failure => failure.file === offline);
  assert.equal(rejected.permanent, true); assert.match(rejected.error, /PDF 請上傳到「PDF 圖面」再框選/);
  assert.equal(dropped.permanent, undefined); assert.match(dropped.error, /network down/);
});
test("links signed earlier are handed out again instead of signing every picture on each change", async () => {
  const signed = [];
  const api = loader({ mocks: { "@/integrations/supabase/client": { supabase: { storage: { from: () => ({ createSignedUrls: async paths => { signed.push([...paths]); return { data: paths.map(path => ({ path, signedUrl: `https://signed/${path}?t=${signed.length}`, error: null })), error: null }; } }) } } } }, globals: { Date } })("src/components/circuit-changes/files.ts");
  const picture = id => ({ id, name: `${id}.png`, path: `s/i/${id}.png`, thumbnailPath: `s/i/${id}-thumb.webp` });
  const first = await api.createCircuitImageUrls([picture("a"), picture("b")]);
  const second = await api.createCircuitImageUrls([picture("a"), picture("b"), picture("c")]);
  assert.equal(signed.length, 2); assert.equal(signed[0].length, 4);
  assert.equal(signed[1].join(), "s/i/c.png,s/i/c-thumb.webp", "only the picture that was added is signed");
  assert.equal(second.a.thumbnail, first.a.thumbnail, "an unchanged link does not make the thumbnail load again");
  assert.equal(second.a.original, first.a.original); assert.ok(second.c.original.includes("c.png"));
  assert.ok(api.CIRCUIT_IMAGE_URL_REUSE_MS >= 20 * 60 * 1000 && api.CIRCUIT_IMAGE_URL_REUSE_MS < 60 * 60 * 1000, "a reused link keeps a useful lifetime and is renewed before the hour is up");
});
test("a picture framed on a PDF keeps which dated version and page it came from, also when it is retried", async () => {
  let attempts = 0;
  const api = media(async (path, value) => { if (value instanceof File) attempts++; return value instanceof File && attempts === 1 ? { error: { message: "network down" } } : { error: null }; });
  const framed = file(7);
  const source = { kind: "pdf", documentId: "v9", name: "Vera.pdf", date: "2026-11-09", label: "V2", page: 12, rect: { x: .1, y: .2, width: .3, height: .4 } };
  api.circuitImageOrigins.set(framed, { source, caption: "2026-11-09 V2 版 PDF「Vera.pdf」第 12 頁" });
  const failed = await api.uploadCircuitImages({ setId, itemId, files: [framed], side: "after", actorId: setId });
  assert.equal(failed.failures.length, 1);
  const retried = await api.uploadCircuitImages({ setId, itemId, files: [failed.failures[0].file], side: "after", actorId: setId });
  const image = retried.images[0];
  assert.equal(image.caption, "2026-11-09 V2 版 PDF「Vera.pdf」第 12 頁");
  assert.equal(image.source.page, 12); assert.equal(image.source.date, "2026-11-09"); assert.equal(image.source.rect.width, .3);
  const plain = await api.uploadCircuitImages({ setId, itemId, files: [file(8)], side: "after", actorId: setId });
  assert.equal(plain.images[0].caption, ""); assert.equal("source" in plain.images[0], false, "an ordinary screenshot has no PDF source");
});
