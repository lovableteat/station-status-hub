import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loader, database } = require("../../../tests/support/renderHarness.cjs");
const project = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const rule = () => ({ projectId: project, kind: "R", spec: "RES 10K 1% 0603", specKey: '["R","RES 10K 1% 0603"]', manufacturer: "Example", mpn: "R-10K", candidateKey: '["EXAMPLE","R-10K"]', customerApproval: "pending", avl: "pending", engineering: "pending", rank: null, notes: "", evidence: "" });
const row = () => ({ project_id: project, kind: "R", spec: "RES 10K 1% 0603", spec_key: rule().specKey, manufacturer: "Example", mpn: "R-10K", candidate_key: rule().candidateKey, customer_approval: "pending", avl: "pending", engineering: "pending", rank: null, notes: "", evidence: "", updated_at: "2026-10-28T00:00:00.000Z", updated_by: actor });
function fixture(run) {
  const calls = [];
  const db = database(query => { calls.push(query); return run(query); });
  const storage = loader({ mocks: { "@/integrations/supabase/client": { supabase: db } } })("src/components/material-requests/rlcPriorityStorage.ts");
  return { db, storage, calls };
}

test("RLC storage reads only requested project and converts server stamps", async () => {
  const { db, storage } = fixture(() => ({ data: [row()], error: null }));
  const rules = await storage.loadRlcPriorityRules(project);
  assert.equal(db.reads[0].table, "rlc_priority_rules");
  assert.equal(db.reads[0].filters.project_id, project);
  assert.equal(rules[0].updatedBy, actor);
  assert.equal(rules[0].updatedAt, row().updated_at);
});

test("RLC storage writes through actor checked RPC with expected timestamp", async () => {
  const { calls, storage } = fixture(() => ({ data: row(), error: null }));
  const input = { ...rule(), updatedAt: row().updated_at, updatedBy: "forged" };
  await storage.saveRlcPriorityRule(actor, input);
  assert.equal(calls[0].table, "save_rlc_priority_rule");
  assert.equal(calls[0].args.p_actor, actor);
  assert.equal(calls[0].args.p_expected_updated_at, row().updated_at);
  assert.equal(calls[0].args.p_rule.updatedBy, undefined);
  assert.equal(calls[0].args.p_rule.updatedAt, undefined);
});

test("RLC storage rejects invalid project, spoofed keys, qualifications and ranks before network", async () => {
  const { db, storage } = fixture(() => ({ data: row(), error: null }));
  for (const patch of [{ projectId: "" }, { specKey: "value-only" }, { candidateKey: "ROW-1" }, { customerApproval: "Approved" }, { rank: 1.5 }, { rank: 0 }, { manufacturer: "" }, { notes: "\0" }, { updatedAt: "invalid" }]) {
    await assert.rejects(storage.saveRlcPriorityRule(actor, { ...rule(), ...patch }));
  }
  assert.equal(db.reads.length, 0);
});

test("RLC CAS conflict and permission failures are surfaced without a local success", async () => {
  for (const code of ["40001", "23505", "42501"]) {
    const { storage } = fixture(() => ({ data: null, error: { code, message: "server rejected" } }));
    await assert.rejects(storage.saveRlcPriorityRule(actor, rule()), code === "42501" ? /權限|server rejected/ : /重新載入|更新/);
  }
});
