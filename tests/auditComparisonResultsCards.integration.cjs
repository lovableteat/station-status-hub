// AutoCheck results on a phone: cards by default, the shared empty text, and a 表格 switch back to the table.
const test = require('node:test');
const assert = require('node:assert/strict');
const { React, act, create, child, loader, flush } = require('./support/renderHarness.cjs');

const row = (key, extra = {}) => ({ key, gid: key, category: 'CONN', rule: 'NET-01', severity: 'ERROR', status: 'NEW', page: 3, page_title: 'PWR', refdes: ['U1', 'R2'], pins: ['1'], nets: ['VCC'], title: `差異 ${key}`, detail: '說明', related: [], dest: key, ...extra });
const session = (rows) => ({ version: 1, projectName: 'QA', id: 'qa', savedAt: '2026-11-04T00:00:00.000Z', replies: { a: { disp: '修改', owner: '王工', target_rev: '', note: '', filled: '' } }, history: [], result: { mode: 'compare', meta: { tool_version: '1', generated: '2026-11-04', a: { label: 'EVT', sources: [] }, b: { label: 'DVT', sources: [] } }, findings: [], rows, overview: [], capRows: [], railTodo: [], railDomain: [], powerTree: {}, powerTreeA: {}, i2cMap: {}, i2cMapA: {}, inputIssues: [], warnings: [], library: [], artifacts: [] } });
const filters = (overrides = {}) => ({ tab: 'compare', query: '', status: 'all', owner: 'all', severity: 'all', category: 'all', page: 'all', rule: 'all', disposition: 'all', revisionStatus: 'all', ...overrides });

async function mount(rows, compact = true, extra = {}) {
  const hooks = { '@/hooks/use-mobile': { useIsCompactLayout: () => compact, useIsMobile: () => compact } };
  // The harness resolves files, not directory barrels, so the shared card is loaded by file and handed in as the barrel.
  const mobile = loader({ mocks: hooks })('src/components/layout/mobile/MobileRecordCard.tsx');
  const load = loader({ mocks: {
    ...hooks,
    '@/components/layout/mobile': mobile,
    './ComparisonReviewTools': { ComparisonBatchReview: child, ComparisonSideBySide: child },
  } });
  const { ComparisonResults } = load('src/components/comparison/ComparisonResults.tsx');
  let root;
  await act(async () => { root = create(React.createElement(ComparisonResults, { session: session(rows), filters: filters(extra.filters), update() {}, clear() {}, canEdit: true, onSaveReply: async () => {}, busy: false })); });
  await flush();
  return root;
}
const cards = (root) => root.root.findAll((node) => node.type === 'article' && node.props['data-testid'] === 'comparison-result-card');
const text = (root) => JSON.stringify(root.toJSON());

test('phones render one card per result with severity, change state, RefDes and a 檢視 action', async () => {
  const root = await mount([row('a'), row('b', { severity: 'WARN', status: 'CHANGE', refdes: [], nets: [] })]);
  try {
    assert.equal(cards(root).length, 2);
    const body = text(root);
    assert.match(body, /comparison-severity is-error/);
    assert.match(body, /comparison-row-status is-change/);
    assert.match(body, /U1, R2/);
    assert.match(body, /修改 · 王工/);
    assert.match(body, /未填 · 未指派/);
    assert.doesNotMatch(body, /comparison-result-table/, 'the 920px table is not mounted while cards are shown');
    assert.ok(root.root.findAll((node) => node.props && node.props['aria-label'] === '結果呈現方式').length >= 1);
  } finally { await act(async () => root.unmount()); }
});

test('an empty filtered result keeps the shared wording inside the card list', async () => {
  const root = await mount([row('a')], true, { filters: { severity: 'INFO' } });
  try {
    assert.equal(cards(root).length, 0);
    assert.match(text(root), /目前篩選條件沒有符合的比對結果/);
  } finally { await act(async () => root.unmount()); }
});

test('desktop keeps the table and never mounts the card list', async () => {
  const root = await mount([row('a')], false);
  try {
    assert.equal(cards(root).length, 0);
    assert.match(text(root), /comparison-result-table/);
    assert.doesNotMatch(text(root), /comparison-result-cards/);
  } finally { await act(async () => root.unmount()); }
});
