import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const { loader } = createRequire(import.meta.url)("./support/renderHarness.cjs");

test("drop and file-picker uploads reject unsupported, empty and oversized files before Storage is called", async () => {
  const calls = [];
  const load = loader({ mocks: { "@/integrations/supabase/client": { supabase: { storage: { from: bucket => ({ upload: async (path, file) => { calls.push({ bucket, path, file }); return { error: null }; } }) } } } } });
  const { uploadMaterialSpecDocument, MATERIAL_SPEC_MAX_BYTES } = load("src/components/material-requests/materialSpecDocuments.ts");
  const upload = file => uploadMaterialSpecDocument({ workspaceId: "bom-W", recordId: "part-A", file, uploadedBy: "CE" });
  await assert.rejects(upload({ name: "unsafe.exe", size: 32 }), /不支援/);
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
