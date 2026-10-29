import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const { loader } = createRequire(import.meta.url)("./support/renderHarness.cjs");

test("drop and file-picker uploads reject unsupported, empty and oversized files before Storage is called", async () => {
  const calls = [];
  const load = loader({ mocks: { "@/integrations/supabase/client": { supabase: { storage: { from: bucket => ({ upload: async (path, file) => { calls.push({ bucket, path, file }); return { error: null }; } }) } } } } });
  const { uploadMaterialSpecDocument, MATERIAL_SPEC_MAX_BYTES } = load("src/components/material-requests/materialSpecDocuments.ts");
  const upload = file => uploadMaterialSpecDocument({ workspaceId: "bom-W", recordId: "part-A", file, uploadedBy: "CE" });
  await assert.rejects(upload({ name: "unsafe.exe", size: 32 }), /未支援/);
  await assert.rejects(upload({ name: "empty.pdf", size: 0 }), /空的/);
  await assert.rejects(upload({ name: "large.pdf", size: MATERIAL_SPEC_MAX_BYTES + 1 }), /超過上限/);
  assert.equal(calls.length, 0);
  const document = await upload({ name: "完整規格.PDF", size: 128, type: "application/pdf" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bucket, "material-spec-documents");
  assert.match(document.path, /^bom-W\/part-A\//);
  assert.equal(document.name, "完整規格.PDF");
  assert.equal(document.uploadedBy, "CE");
});

test("SPEC preview and download sign the same private object with the requested response mode", async () => {
  const calls = [];
  let storageError = null;
  const load = loader({ mocks: { "@/integrations/supabase/client": { supabase: { storage: { from(bucket) { return {
    async createSignedUrl(path, seconds, options) {
      calls.push({ bucket, path, seconds, options });
      return storageError ? { error: storageError } : { data: { signedUrl: "https://example.test/signed-spec" } };
    },
  }; } } } } } });
  const { createMaterialSpecUrl } = load("src/components/material-requests/materialSpecDocuments.ts");
  assert.equal(await createMaterialSpecUrl("bom/part/spec.pdf"), "https://example.test/signed-spec");
  await createMaterialSpecUrl("bom/part/spec.pdf", "spec.pdf");
  assert.equal(calls[0].bucket, "material-spec-documents");
  assert.equal(calls[0].path, calls[1].path);
  assert.equal(calls[0].seconds, 3600);
  assert.equal(calls[0].options.download, false);
  assert.equal(calls[1].options.download, "spec.pdf");
  storageError = { message: "Access denied" };
  await assert.rejects(createMaterialSpecUrl("bom/part/spec.pdf", "spec.pdf"), /Access denied/);
});

test("ten engineering files upload independently with bounded concurrency and unique paths, including identical names", async () => {
  let active = 0, peak = 0;
  const calls = [], progress = [];
  const load = loader({ mocks: { "@/integrations/supabase/client": { supabase: { storage: { from: () => ({ upload: async (path, file) => {
    active++; peak = Math.max(peak, active); calls.push({path,file});
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    return file.name === "bad.stp" ? {error:{message:"Network error"}} : {error:null};
  } }) } } } } });
  const { uploadMaterialSpecDocuments } = load("src/components/material-requests/materialSpecDocuments.ts");
  const files = ["same.GLB", "same.GLB", "model.STP", "model.step", "mesh.stl", "board.dxf", "board.dwg", "board.kicad_pcb", "sheet.pdf", "bad.stp"].map(name=>({name,size:128,type:"application/octet-stream"}));
  const result = await uploadMaterialSpecDocuments({workspaceId:"bom-W",recordId:"part-A",files,onProgress:(done,total)=>progress.push([done,total])});
  assert.equal(calls.length,10);
  assert.equal(new Set(calls.map(call=>call.path)).size,10);
  assert.equal(peak,3);
  assert.equal(result.documents.length,9);
  assert.equal(result.failures[0].file.name,"bad.stp");
  assert.equal(result.documents.map(doc=>doc.name).join(","),files.slice(0,9).map(file=>file.name).join(","));
  assert.deepEqual(progress.at(-1),[10,10]);
});

test("legacy attachments merge without duplicates and removing one does not resurrect or remove another", () => {
  const { getMaterialSpecDocuments, withMaterialSpecDocuments } = loader()("src/components/material-requests/materialAttachments.ts");
  const old={name:"old.pdf",path:"old"}, next={name:"next.glb",path:"next"};
  const record=withMaterialSpecDocuments({specDocument:old},[old,next,old]);
  assert.equal(getMaterialSpecDocuments(record).length,2);
  const removed=withMaterialSpecDocuments(record,[next]);
  assert.equal(removed.specDocument.path,"next");
  assert.equal(getMaterialSpecDocuments(removed).length,1);
  assert.equal(getMaterialSpecDocuments(withMaterialSpecDocuments(removed,[])).length,0);
});
