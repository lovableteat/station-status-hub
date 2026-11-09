import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { loader } = createRequire(import.meta.url)("./support/renderHarness.cjs");
const at = "2026-11-09T04:00:00.000Z";
const copy = value => JSON.parse(JSON.stringify(value));

function fakeSupabase(run) {
  const calls = [];
  const query = initial => {
    const call = { ...initial, filters: {}, orders: [] };
    const chain = {
      select(columns) { call.columns = columns; return chain; },
      eq(column, value) { call.filters[column] = value; return chain; },
      order(column, options) { call.orders.push({ column, ...options }); return chain; },
      range(from, to) { call.range = [from, to]; return chain; },
      maybeSingle() { call.single = true; return chain; },
      abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return chain; },
      then(resolve, reject) {
        calls.push(copy(call));
        return Promise.resolve().then(() => run(call)).then(resolve, reject);
      },
    };
    return chain;
  };
  return { calls, from: table => query({ table }), rpc: (name, args) => query({ rpc: name, args }) };
}

function load(file, supabase) {
  return loader({ mocks: { "@/integrations/supabase/client": { supabase } }, globals: { AbortSignal } })(`src/components/circuit-changes/${file}.ts`);
}

function document(overrides = {}) {
  return { id: "official-pdf", name: "Official schematic.pdf", date: "2026-09-30", label: "官方原版", path: "circuit-pdf/board/official.pdf", localOnly: false,
    size: 1024, pages: 500, uploadedAt: at, uploadedBy: "engineer", uploadedByName: "工程師", updatedAt: at, ...overrides };
}

function officialRow(overrides = {}) {
  return { document_id: "official-pdf", document: document(), updated_at: at, updated_by: "reviewer", updated_by_name: "審核者", revision: 3, ...overrides };
}

function report(index = 1) {
  return { version: 1, id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    officialVersionId: "official-pdf", workingVersionId: "working-pdf", officialPage: 500, workingPage: 499,
    key: "v1:official-pdf:working-pdf:500:499", officialName: "官方.pdf", workingName: "工作.pdf", createdAt: at, updatedAt: at,
    generatedBy: "工程師", modelLabel: "OpenAI 圖像模型", summary: "本頁需核對 NET 名稱；PDF 不能證明電氣連通。",
    checks: ["connectivity", "net-name", "label-name"].map(category => ({ category, state: "unverifiable", note: "請以網表及原圖核對。" })),
    findings: [{ id: "F1", category: "net-name", priority: "medium", title: "核對網路名稱", location: "U1 接腳 3", officialEvidence: "NET_A", workingEvidence: "NET_B",
      suggestion: "核對改名是否符合設計意圖。", decision: "confirmed", reviewNote: "已核對原圖", reviewedBy: "審核者", reviewedAt: at }] };
}

test("official baseline loads its canonical document snapshot without consulting mutable registry metadata", async () => {
  const snapshot = document();
  const registryDocument = document({ name: "New edited registry label.pdf", path: "circuit-pdf/board/other.pdf" });
  const supabase = fakeSupabase(call => {
    assert.equal(call.table, "circuit_pdf_official", "the registry is not the canonical official baseline");
    return { data: officialRow({ document: snapshot, column_order: { documents: [registryDocument], officialDocumentId: "working-pdf" } }), error: null };
  });
  const value = await load("officialPdfStorage", supabase).loadCircuitPdfOfficial("series-1");
  assert.deepEqual(copy(value.document), snapshot);
  assert.equal(value.documentId, "official-pdf");
  assert.equal(value.byName, "審核者");
  assert.equal(value.revision, 3);
  assert.deepEqual(supabase.calls[0].filters, { series_id: "series-1" });
  assert.equal(supabase.calls[0].single, true);
});

test("official baseline rejects an absent, mismatched, local-only or incomplete document snapshot", async () => {
  for (const invalid of [null, document({ id: "other-pdf" }), document({ localOnly: true }), document({ path: "" }), document({ pages: 0 })]) {
    const supabase = fakeSupabase(() => ({ data: officialRow({ document: invalid }), error: null }));
    await assert.rejects(load("officialPdfStorage", supabase).loadCircuitPdfOfficial("series-1"), /官方基準原檔資訊不完整/);
  }
  const absent = fakeSupabase(() => ({ data: null, error: null }));
  assert.equal(await load("officialPdfStorage", absent).loadCircuitPdfOfficial("series-1"), null);
});

test("setting an official baseline sends the observed revision to the authoritative RPC", async () => {
  for (const currentRevision of [0, 7]) {
    const supabase = fakeSupabase(call => call.rpc
      ? { data: officialRow({ revision: currentRevision + 1, document_id: "replacement", document: document({ id: "replacement" }) }), error: null }
      : { data: currentRevision ? officialRow({ revision: currentRevision }) : null, error: null });
    const saved = await load("officialPdfStorage", supabase).saveCircuitPdfOfficial("series-1", "replacement");
    assert.equal(saved.revision, currentRevision + 1);
    assert.equal(saved.documentId, "replacement");
    assert.equal(supabase.calls.length, 2, "read once, then perform one CAS write");
    assert.deepEqual(supabase.calls[1].args, { p_series_id: "series-1", p_document_id: "replacement", p_expected_revision: currentRevision });
    assert.equal(supabase.calls[1].rpc, "circuit_pdf_set_official");
  }
});

test("official baseline CAS conflicts are surfaced without retrying or overwriting", async () => {
  for (const failure of [{ error: { code: "PT409", message: "stale" } }, { error: { message: "stale" }, status: 409 }]) {
    const supabase = fakeSupabase(call => call.rpc ? failure : { data: officialRow(), error: null });
    await assert.rejects(load("officialPdfStorage", supabase).saveCircuitPdfOfficial("series-1", "replacement"), /官方基準已由其他人更新/);
    assert.equal(supabase.calls.filter(call => call.rpc).length, 1);
  }
});

test("AI review loading paginates past 100 reports with a stable order and target scope", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ report: report(index + 1), revision: index + 1 }));
  const supabase = fakeSupabase(call => {
    assert.equal(call.table, "circuit_pdf_ai_reviews");
    const [from, to] = call.range;
    return { data: rows.slice(from, to + 1), error: null };
  });
  const saved = await load("pdfAiReviewStorage", supabase).loadCircuitPdfAiReviews("series-1", report().key);
  assert.equal(saved.length, 101);
  assert.equal(saved[100].revision, 101);
  assert.deepEqual(copy(saved[0].report), report());
  assert.deepEqual(supabase.calls.map(call => call.range), [[0, 99], [100, 199]]);
  for (const call of supabase.calls) {
    assert.deepEqual(call.filters, { series_id: "series-1", target_key: report().key });
    assert.deepEqual(call.orders, [{ column: "created_at", ascending: false }, { column: "id" }]);
  }
});

test("AI review loading refuses malformed reports, invalid revisions and non-array responses", async () => {
  const invalidReports = [null, { ...report(), key: "wrong-target" }, { ...report(), checks: [report().checks[0], report().checks[0], report().checks[2]] },
    { ...report(), findings: [{ ...report().findings[0], decision: "automatic-approval" }] }];
  for (const invalid of invalidReports) {
    const supabase = fakeSupabase(() => ({ data: [{ report: invalid, revision: 1 }], error: null }));
    await assert.rejects(load("pdfAiReviewStorage", supabase).loadCircuitPdfAiReviews("series-1", report().key), /AI 初審紀錄格式不完整/);
  }
  for (const revision of [0, -1, 1.5, "2"]) {
    const supabase = fakeSupabase(() => ({ data: [{ report: report(), revision }], error: null }));
    await assert.rejects(load("pdfAiReviewStorage", supabase).loadCircuitPdfAiReviews("series-1", report().key), /AI 初審紀錄格式不完整/);
  }
  const supabase = fakeSupabase(() => ({ data: null, error: null }));
  await assert.rejects(load("pdfAiReviewStorage", supabase).loadCircuitPdfAiReviews("series-1", report().key), /AI 初審清單回應不完整/);
});

test("AI review save preserves the human decisions and passes the caller's CAS revision", async () => {
  const input = report();
  for (const expectedRevision of [0, 4]) {
    const supabase = fakeSupabase(call => ({ data: { report: call.args.p_report, revision: expectedRevision + 1 }, error: null }));
    const saved = await load("pdfAiReviewStorage", supabase).saveCircuitPdfAiReview("series-1", input, expectedRevision);
    assert.deepEqual(copy(saved.report), input);
    assert.equal(saved.revision, expectedRevision + 1);
    assert.deepEqual(supabase.calls, [{ rpc: "circuit_pdf_save_ai_review", args: { p_series_id: "series-1", p_report: input, p_expected_revision: expectedRevision }, filters: {}, orders: [] }]);
  }
});

test("AI review rejects incomplete local reports before writing and incomplete save responses", async () => {
  const supabase = fakeSupabase(() => assert.fail("invalid local reports must not reach the server"));
  await assert.rejects(load("pdfAiReviewStorage", supabase).saveCircuitPdfAiReview("series-1", { ...report(), checks: [] }, 0), /AI 初審結果不完整，未寫入紀錄/);
  assert.equal(supabase.calls.length, 0);
  const incomplete = fakeSupabase(() => ({ data: { report: report(), revision: 0 }, error: null }));
  await assert.rejects(load("pdfAiReviewStorage", incomplete).saveCircuitPdfAiReview("series-1", report(), 0), /AI 初審紀錄格式不完整/);
});

test("AI review HTTP 409 and PT409 conflicts remain visible without retries", async () => {
  for (const failure of [{ error: { code: "PT409", message: "stale revision" } }, { error: { message: "stale revision" }, status: 409 }]) {
    const supabase = fakeSupabase(() => failure);
    await assert.rejects(load("pdfAiReviewStorage", supabase).saveCircuitPdfAiReview("series-1", report(), 4), /初審紀錄已變更.*你的判讀尚未覆蓋其他人/);
    assert.equal(supabase.calls.length, 1);
    assert.equal(supabase.calls[0].args.p_expected_revision, 4);
  }
});
