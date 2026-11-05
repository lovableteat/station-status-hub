import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const native = createRequire(import.meta.url);
const { loader } = native("./support/renderHarness.cjs");
const model = { id: "key-1", label: "QA model", record: { id: "key-1", api_key: "secret-QA-only", is_active: true, expires_at: null, permissions: { read: true, metadata: { provider: "gemini", model: "qa-vision", baseUrl: "https://example.invalid/v1beta" } } } };
const photo = { id: "template", name: "form.png", blob: new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM3sAAAAASUVORK5CYII=", "base64")]) };
const part = { manufacturerPartNumber: "000-QA-A", manufacturer: "QA", name: "part", refDes: "U1" };
const sources = Array.from({ length: 10 }, (_, i) => ({ id: "spec-" + (i + 1), name: `source-${i}.txt`, blob: new Blob([`QA-A voltage 1.2 V, source ${i}`]) }));
const result = { title: "filled", partMatch: "matched", columns: ["Voltage"], rows: [[{ kind: "source", value: "1.2 V", sourceId: "spec-1", page: "1", quote: "voltage 1.2 V" }]], warnings: [] };
function service(run = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }))) {
  const calls = [];
  const load = loader({ transform: source => source.replaceAll("import.meta.url", '"file:///qa/"'), mocks: {
    "@/integrations/supabase/client": { supabase: {} },
    "../api-management/aiUsageTelemetry": { trackedProviderFetch: async input => { calls.push(input); return run(input); } },
  }, globals: { Blob, TextDecoder, TextEncoder, btoa, Response } });
  return { ...load("src/components/material-requests/materialSpecFillService.ts"), calls };
}
test("one photo + ten uncompressed SPEC sources use the existing tracked provider path and exact selected part", async () => {
  const f = service();
  const answer = await f.analyzeSpecFill({ part, photo, sources, model, note: "Min / Typ / Max", signal: new AbortController().signal });
  assert.equal(answer.rows[0][0].value, "1.2 V");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].apiKeyId, "key-1");
  const body = JSON.parse(f.calls[0].init.body);
  const serialized = JSON.stringify(body);
  assert.match(serialized, /000-QA-A/);
  assert.match(serialized, /spec-10/);
  assert.match(serialized, /Min \/ Typ \/ Max/);
  assert.match(serialized, /inlineData/);
  assert.equal(serialized.includes("secret-QA-only"), false);
  assert.equal(f.calls[0].source, "ai-chat");
});
test("no photo, no SPEC, invalid PDF, empty MPN, expired key and cancelled requests never call AI", async () => {
  const f = service(); const base = { part, photo, sources, model, note: "", signal: new AbortController().signal };
  for (const patch of [{ photo: { ...photo, name: "form.txt" } }, { sources: [] }, { sources: [{ id: "spec-1", name: "bad.pdf", blob: new Blob(["not pdf"]) }] }, { part: { ...part, manufacturerPartNumber: "" } }, { model: { ...model, record: { ...model.record, expires_at: "2000-01-01" } } }]) await assert.rejects(f.analyzeSpecFill({ ...base, ...patch }));
  const stopped = new AbortController(); stopped.abort();
  await assert.rejects(f.analyzeSpecFill({ ...base, signal: stopped.signal }));
  assert.equal(f.calls.length, 0);
});
test("permission/quota failures stay failures and do not produce fabricated results or automatic retries", async () => {
  const f = service(async () => new Response(JSON.stringify({ error: { message: "api_key=secret-QA-only" } }), { status: 403 }));
  await assert.rejects(f.analyzeSpecFill({ part, photo, sources, model, note: "", signal: new AbortController().signal }), e => e.kind === "auth" && !e.message.includes("secret-QA-only"));
  assert.equal(f.calls.length, 1);
});

test("PDF SPEC and template photo are sent as native attachments for Gemini, OpenAI and Claude", async () => {
  for (const provider of ["gemini", "openai", "anthropic"]) {
    const f = service(async () => new Response(JSON.stringify(provider === "gemini" ? { candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] } : provider === "openai" ? { choices: [{ message: { content: JSON.stringify(result) } }] } : { content: [{ type: "text", text: JSON.stringify(result) }] })));
    const selected = { ...model, record: { ...model.record, permissions: { read: true, metadata: { provider, model: "qa-vision", baseUrl: provider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com/v1" } } } };
    const pdf = { id: "spec-1", name: "public-qa.pdf", blob: new Blob(["%PDF-1.4\nSynthetic provider-format fixture"]) };
    const answer = await f.analyzeSpecFill({ part, photo, sources: [pdf], model: selected, note: "", signal: new AbortController().signal });
    assert.equal(answer.rows[0][0].value, "1.2 V");
    const serialized = f.calls[0].init.body;
    assert.match(serialized, /application\/pdf/);
    assert.match(serialized, /image\/png/);
    assert.equal(serialized.includes("secret-QA-only"), false);
  }
});

test("twenty uncompressed photos reach AI in one request and each receives its own result", async () => {
  const photos=Array.from({length:20},(_,i)=>({...photo,id:`template-${i+1}`,name:`photo-${i+1}.png`}));
  const f=service(async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({tables:photos.map(p=>({...result,templateId:p.id}))})}]}}]})));
  const tables=await f.analyzeSpecFillPhotos({part,photos,sources,model,note:'all photos',signal:new AbortController().signal});
  assert.equal(tables.length,20);
  assert.deepEqual(Array.from(tables,t=>t.templateId),photos.map(p=>p.id));
  assert.equal(f.calls.length,1);
  const body=JSON.parse(f.calls[0].init.body);
  const images=body.contents.flatMap(message=>message.parts).filter(p=>p.inlineData?.mimeType==='image/png');
  assert.equal(images.length,20);
  assert.match(f.calls[0].init.body,/template-20/);
  assert.match(f.calls[0].init.body,/spec-10/);
});

test("multi-photo batches use native images for all three providers and preserve separate table layouts", async () => {
  const photos=[{...photo,id:'template-1'},{...photo,id:'template-2',name:'second.png'}];
  for(const provider of ['gemini','openai','anthropic']) {
    const batch={tables:[{...result,templateId:'template-2',columns:['Other'],rows:[[{...result.rows[0][0],value:'0016'}]]},{...result,templateId:'template-1'}]};
    const f=service(async()=>new Response(JSON.stringify(provider==='gemini'?{candidates:[{content:{parts:[{text:JSON.stringify(batch)}]}}]}:provider==='openai'?{choices:[{message:{content:JSON.stringify(batch)}}]}:{content:[{type:'text',text:JSON.stringify(batch)}]})));
    const selected={...model,record:{...model.record,permissions:{read:true,metadata:{provider,model:'qa-vision',baseUrl:provider==='gemini'?'https://generativelanguage.googleapis.com/v1beta':provider==='openai'?'https://api.openai.com/v1':'https://api.anthropic.com/v1'}}}};
    const tables=await f.analyzeSpecFillPhotos({part,photos,sources,model:selected,note:'',signal:new AbortController().signal});
    assert.equal(tables[1].columns[0],'Other');assert.equal(tables[1].rows[0][0].value,'0016');
    const body=JSON.parse(f.calls[0].init.body);
    const parts=provider==='gemini'?body.contents.flatMap(m=>m.parts):body.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]);
    assert.equal(parts.filter(p=>p.inlineData?.mimeType==='image/png'||p.type==='image'||p.type==='image_url').length,2);
  }
});

test("bad or oversized photo batches never send; a response omitting photos is never presented as complete", async () => {
  const f=service();const base={part,photos:[{...photo,id:'template-1'},{...photo,id:'template-2'}],sources,model,note:'',signal:new AbortController().signal};
  for(const photos of [[],[photo,photo],Array.from({length:21},(_,i)=>({...photo,id:String(i)})),[{...photo,blob:{size:18*1024*1024+1}}],[{...photo,name:'bad.jpg'}]]) await assert.rejects(f.analyzeSpecFillPhotos({...base,photos}));
  assert.equal(f.calls.length,0);
  await assert.rejects(f.analyzeSpecFillPhotos(base),/未完整/);
  assert.equal(f.calls.length,1);
});

test("follow-up includes prior questions, checked tables and selected documents without losing context", async () => {
  for (const provider of ["gemini", "openai", "anthropic"]) {
  const text=JSON.stringify({reply:"已保留原條件，補上單位",tables:[{...result,templateId:"template"}]});
  const payload=provider==="gemini"?{candidates:[{content:{parts:[{text}]}}]}:provider==="openai"?{choices:[{message:{content:text}}]}:{content:[{type:"text",text}]};
  const f = service(async () => new Response(JSON.stringify(payload)));
  const selected={...model,record:{...model.record,permissions:{read:true,metadata:{provider,model:"qa-vision",baseUrl:provider==="gemini"?"https://generativelanguage.googleapis.com/v1beta":provider==="openai"?"https://api.openai.com/v1":"https://api.anthropic.com/v1"}}}};
  const first = { question: "填寫電壓", reply: "找到 1.2 V", tables: [{ ...result, templateId: "template", templateName: "form.png" }] };
  const answer = await f.analyzeSpecFillConversation({ part, photos: [photo], sources, model:selected, note: "保留 Min/Typ/Max", question: "單位呢？", history: [first], signal: new AbortController().signal });
  assert.equal(answer.reply, "已保留原條件，補上單位");
  assert.equal(answer.tables[0].rows[0][0].value, "1.2 V");
  assert.equal(answer.sources.length, 10);
  const body = JSON.parse(f.calls[0].init.body);
  assert.ok((body.contents??body.messages).some(message => message.role === (provider==="gemini"?"model":"assistant") && JSON.stringify(message).includes("找到 1.2 V")));
  assert.match(f.calls[0].init.body, /填寫電壓/);
  assert.match(f.calls[0].init.body, /單位呢/);
  assert.match(f.calls[0].init.body, /spec-10/);
  await assert.rejects(f.analyzeSpecFillConversation({ part, photos: [photo], sources, model, note: "", question: "again", history: Array(13).fill(first), signal: new AbortController().signal }), /對話/);
  assert.equal(f.calls.length, 1);
  }
});

test("a standalone screenshot question reaches the selected provider and can cite the screenshot without a BOM part", async () => {
  const screenshot = { ...photo, id: "question-1", name: "rating.png" };
  const citation = { sourceId: screenshot.id, page: "圖片", quote: "Voltage: 1.2 V" };
  const reply = { reply: "截圖標示 1.2 V。", citations: [citation] };
  const f = service(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] })));
  const answer = await f.askSpecFillQuestion({ questionImages: [screenshot], sources: [], model, question: "", signal: new AbortController().signal });

  assert.equal(answer.reply, reply.reply);
  assert.equal(answer.citations[0].sourceId, screenshot.id);
  assert.equal(answer.preparedSources.length, 0);
  assert.equal(answer.sources[0].name, screenshot.name);
  const body = JSON.parse(f.calls[0].init.body);
  const message = body.contents.find(entry => entry.parts.some(p => p.text?.includes("問題截圖來源 sourceId=question-1")));
  assert.equal(message.parts[1].inlineData.mimeType, "image/png");
  assert.match(body.contents.at(-1).parts[0].text, /整理圖片可核對的規格/);
  assert.deepEqual(body.generationConfig.responseJsonSchema.properties.citations.items.properties.sourceId.enum, [screenshot.id]);
});

test("a follow-up can include multiple screenshots while retaining the selected SPEC and earlier answer", async () => {
  const screenshots = [
    { ...photo, id: "question-1", name: "first.png" },
    { ...photo, id: "question-2", name: "next.png" },
  ];
  const reply = { reply: "第二張對應 25°C 條件。", citations: [{ sourceId: "question-2", page: "圖片", quote: "25°C" }] };
  const f = service(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] })));
  const history = [{ question: "第一張呢？", reply: "查到第一張。", tables: [] }];
  const answer = await f.askSpecFillQuestion({ part, questionImages: screenshots, sources: [sources[0]], model, question: "請和前一張比較", history, signal: new AbortController().signal });

  assert.equal(answer.reply, reply.reply);
  assert.equal(answer.preparedSources.length, 1);
  assert.deepEqual(Array.from(answer.sources, source => source.id), ["spec-1", "question-1", "question-2"]);
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.contents.flatMap(entry => entry.parts).filter(p => p.inlineData?.mimeType === "image/png").length, 2);
  assert.ok(body.contents.some(entry => entry.role === "model" && entry.parts[0].text.includes("查到第一張")));
});

test("question reference photos cannot be cited in a photo-fill conversation or bypass the SPEC requirement", async () => {
  const screenshot = { ...photo, id: "question-1", name: "reference.png" };
  const reply = { reply: "截圖標示 1.2 V。", citations: [{ sourceId: screenshot.id, page: "圖片", quote: "1.2 V" }] };
  const f = service(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] })));
  const input = { part, photos: [photo], questionImages: [screenshot], sources: [sources[0]], model, question: "請核對畫面上的電壓", signal: new AbortController().signal };

  await assert.rejects(f.askSpecFillQuestion({ ...input, sources: [] }), /SPEC/);
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.askSpecFillQuestion(input), /無法核對/);
  const body = JSON.parse(f.calls[0].init.body);
  assert.deepEqual(body.generationConfig.responseJsonSchema.properties.citations.items.properties.sourceId.enum, ["spec-1"]);
  assert.match(f.calls[0].init.body, /問題參考圖/);
});
