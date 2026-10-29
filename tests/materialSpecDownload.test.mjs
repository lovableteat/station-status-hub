import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const { loader } = createRequire(import.meta.url)("./support/renderHarness.cjs");

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
