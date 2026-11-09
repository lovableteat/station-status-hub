import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { loader } = createRequire(import.meta.url)('./support/renderHarness.cjs');
const knowledge = () => loader()('src/components/api-management/siteKnowledge.ts');
function database(rows = {}) {
  const calls = [];
  return { calls, from(table) {
    const call = { table }; calls.push(call);
    const builder = { select(fields, options) { Object.assign(call, { fields, options }); return builder; }, is() { return builder; }, eq(column, value) { call.eq = [column, value]; return builder; }, in(column, values) { call.in = [column, values]; return builder; }, or(filter) { call.filter = filter; return builder; }, limit(limit) { call.limit = limit; return builder; }, abortSignal() { return Promise.resolve(rows[table] ?? { data: [], count: 0, error: null }); } };
    return builder;
  } };
}
const options = client => ({ client, query: '全站 Vera 資料', modules: ['material-requests', 'test-plan', 'data-center'], userId: 'qa', signal: new AbortController().signal, assertAccess() {}, projectIds: [] });

test('greetings, arithmetic and general knowledge skip website reads; a referential follow-up preserves the target', () => {
  const k = knowledge();
  for (const question of ['你好', '1+1=?', '請解釋牛頓第二定律', '幫我翻譯這段英文']) assert.equal(k.siteKnowledgeQuery(question), null);
  assert.equal(k.siteKnowledgeQuery('Vera BOM 有多少料？'), 'Vera BOM 有多少料？');
  assert.match(k.siteKnowledgeQuery('那筆狀態呢？', '查料號 R2301 的申請紀錄'), /R2301/);
  assert.deepEqual(Array.from(k.routeSiteKnowledgeModules('查 BOM 料號', ['material-requests', 'data-center'])), ['material-requests']);
});

test('cross-module evidence uses explicit safe selections, bounded matches and honest raw BOM counts', async () => {
  const k = knowledge(), client = database({
    material_bom_workspaces: { data: [{ id: 'b1', name: 'Vera BOM', record_count: 650 }], count: 14, error: null },
    test_plan_files: { data: [{ id: 'f1', space_id: 's1', original_name: 'Vera.pdf', description: 'GPU Cage' }], count: 1, error: null },
    data_center_projects: { data: [{ id: 'd1', name: 'Vera DC', description: 'GPU Cage' }], count: 1, error: null },
  });
  const report = await k.searchSiteKnowledge(options(client));
  assert.ok(report.citations.some(item => item.content.includes('650')));
  assert.ok(report.citations.some(item => item.title.includes('Vera.pdf')));
  assert.ok(report.citations.some(item => item.title.includes('Vera DC')));
  assert.equal(report.sources.find(item => item.label === 'BOM').count, 14);
  assert.ok(report.sources.find(item => item.label === 'BOM').note.includes('12'));
  for (const call of client.calls) { assert.ok(!call.fields.includes('*')); assert.ok([12, 201].includes(call.limit)); assert.equal(call.options.count, 'exact'); }
  const context = k.buildSiteKnowledgeContext(report);
  assert.match(context, /原始廠商紀錄.*不等於畫面合併後的主料數/);
  assert.match(context, /\[W\d+\]/);
  assert.equal(k.parseSiteKnowledgeReport(report).citations.length, report.citations.length);
});

test('module permission and question routing stop disallowed requests; RLS errors remain explicit', async () => {
  const k = knowledge(), client = database({ performance_reviews: { data: null, count: null, error: { message: 'RLS denied' } } });
  const report = await k.searchSiteKnowledge({ ...options(client), query: '績效考核紀錄', modules: ['performance', 'test-plan'] });
  assert.deepEqual(client.calls.map(call => call.table), ['performance_reviews']);
  assert.equal(report.sources[0].error, 'RLS denied');
  assert.ok(!client.calls[0].fields.match(/score|goals|feedback|review_index/));
  assert.ok(!report.citations.some(item => item.module === 'material-requests'));
});

test('aborted or revoked requests cannot produce provider evidence', async () => {
  const k = knowledge(), client = database(), controller = new AbortController(); controller.abort();
  await assert.rejects(k.searchSiteKnowledge({ ...options(client), signal: controller.signal }));
  assert.equal(client.calls.length, 0);
  await assert.rejects(k.searchSiteKnowledge({ ...options(client), assertAccess() { throw Error('revoked'); } }), /revoked/);
});

test('persisted source URLs cannot escape the product origin', () => {
  const k = knowledge();
  assert.equal(k.parseSiteKnowledgeReport({ checkedAt: 'now', sources: [], citations: [{ id: 'W1', title: 'x', module: 'test-plan', content: 'x', href: 'https://evil.invalid' }] }), undefined);
});

test('overview and count questions do not become literal filters; named BOM status questions scope their raw records', async () => {
  const k = knowledge();
  for (const question of ['全站總覽', '目前有哪些 BOM', '網站有多少料號']) assert.deepEqual(Array.from(k.siteQueryTerms(question)), []);
  for (const question of ['目前有哪些 BOM', '網站有多少料號']) {
    const client = database(); await k.searchSiteKnowledge({ ...options(client), query: question });
    assert.ok(client.calls.filter(call => call.table.startsWith('material_bom')).every(call => !call.filter));
  }
  const client = database({ material_bom_workspaces: { data: [{ id: 'vera-cpu', name: 'Vera CPU' }], count: 1, error: null }, material_bom_records: { data: [{ record_id:'r1', mpn:'CPU-PART', status:null }], count:1, error:null } });
  const report = await k.searchSiteKnowledge({ ...options(client), query: 'Vera CPU 的未處理料件' });
  const parts = client.calls.find(call => call.table === 'material_bom_records');
  const bomFilter = client.calls.find(call => call.table === 'material_bom_workspaces').filter;
  assert.equal(bomFilter, 'and(or(name.ilike.%vera%,source_file.ilike.%vera%),or(name.ilike.%cpu%,source_file.ilike.%cpu%))', 'A named BOM must match all name terms, so Vera GPU cannot enter the Vera CPU scope');
  assert.equal(parts.in[0], 'workspace_id'); assert.deepEqual(Array.from(parts.in[1]), ['vera-cpu']);
  assert.match(parts.filter, /trackingStatus.eq.未處理/);
  assert.ok(!parts.filter.includes('Vera')); assert.ok(report.sources.find(source => source.label === 'BOM 料件與追蹤').note.includes('已限定'));
  assert.ok(report.citations.some(item => item.content.includes('未處理（儲存狀態空白）')));
  assert.match(k.buildSiteKnowledgeContext(report), /不表示缺少料號或已提出申請/);
});


test('all bounded source citations survive conversation persistence', () => {
  const k = knowledge();
  const report = { checkedAt: 'now', sources: [], citations: Array.from({length: 163}, (_, index) => ({ id: `W${index + 1}`, module: 'material-requests', title: 'source', content: 'evidence', href: '?workspace=material-requests' })) };
  assert.equal(k.parseSiteKnowledgeReport(report).citations.length, 163);
});
