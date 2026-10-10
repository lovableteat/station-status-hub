const test = require('node:test');
const assert = require('node:assert/strict');
const { React, act, create, loader, flush, deferred, child } = require('./support/renderHarness.cjs');

const integratedText = '【IDP】\n實績 1：建立跨團隊技術指引，讓 2 位新進同仁完成驗證。\n\n【OKR】\n實績 1：開發自動檢查工具，工時由 30 分鐘縮短至 5 分鐘。\n\n【KPI】\n實績 1：如期完成 PCB 設計與驗證。';
const renderedText = root => JSON.stringify(root.toJSON());
const childrenText = value => Array.isArray(value) ? value.map(childrenText).join('') : typeof value === 'string' ? value : value?.props ? childrenText(value.props.children) : '';
const button = (root, label) => root.root.findAllByType('button').find(node => childrenText(node.props.children).includes(label));

async function copyFixture(t, clipboard, props = {}) {
  const selection = { focuses: 0, selects: 0 };
  const load = loader({
    mocks: {
      '@/components/ui/button': { Button: ({ children, ...rest }) => React.createElement('button', rest, children) },
      '@/components/ui/textarea': { Textarea: React.forwardRef((rest, ref) => React.createElement('textarea', { ...rest, ref })) },
    },
    globals: { navigator: { clipboard } },
  });
  const { PerformanceCopyPanel } = load('src/components/performance/PerformanceCopyPanel.tsx');
  let current = { getText: () => integratedText, contextKey: 'employee-a', ...props };
  let root;
  await act(async () => {
    root = create(React.createElement(PerformanceCopyPanel, current), {
      createNodeMock: element => element.type === 'textarea' ? {
        focus() { selection.focuses++; }, select() { selection.selects++; },
      } : null,
    });
  });
  t.after(() => act(async () => root.unmount()));
  const update = async next => {
    current = { ...current, ...next };
    await act(async () => root.update(React.createElement(PerformanceCopyPanel, current)));
    await flush();
  };
  return { root, selection, update };
}

test('one-click copy transfers exact IDP, OKR and KPI content and obtains current edits on every click', async t => {
  const copied = [];
  let latest = integratedText;
  const f = await copyFixture(t, { writeText: async text => copied.push(text) }, { getText: () => latest });
  await act(async () => button(f.root, '一鍵複製全部實績').props.onClick());
  await flush();
  assert.deepEqual(copied, [integratedText]);
  assert.match(renderedText(f.root), /已複製全部實績，可直接貼入單一欄位。/);
  assert.equal(f.root.root.findAllByType('textarea').length, 0, 'a successful copy does not open a window or expand a field');
  latest += '\n實績 2：最新補充的 KPI 成果。';
  await act(async () => button(f.root, '一鍵複製全部實績').props.onClick());
  await flush();
  assert.equal(copied[1], latest, 'copy reads live edits rather than a previously captured snapshot');
});

test('denied clipboard exposes selected read-only inline text without a dialog', async t => {
  const f = await copyFixture(t, { writeText: async () => { throw new Error('permission denied'); } });
  await act(async () => button(f.root, '一鍵複製全部實績').props.onClick());
  await flush();
  const field = f.root.root.findByType('textarea');
  assert.equal(field.props.readOnly, true);
  assert.equal(field.props.value, integratedText);
  assert.equal(field.props['aria-label'], 'IDP、OKR、KPI 整合文字');
  assert.equal(f.selection.focuses, 1); assert.equal(f.selection.selects, 1);
  assert.match(renderedText(f.root), /Ctrl／⌘ \+ C/);
  assert.equal(f.root.root.findAll(node => node.props.role === 'dialog' || node.type === 'dialog').length, 0);
});

test('preview stays inline, reopening refreshes content, and disabled/context changes clear exposed content', async t => {
  let latest = integratedText;
  const f = await copyFixture(t, undefined, { getText: () => latest });
  await act(async () => button(f.root, '檢視整合文字').props.onClick());
  assert.equal(f.root.root.findByType('textarea').props.value, integratedText);
  assert.equal(button(f.root, '收合整合文字').props['aria-expanded'], true);
  await act(async () => button(f.root, '收合整合文字').props.onClick());
  latest = '【KPI】\n最新的自評內容';
  await act(async () => button(f.root, '檢視整合文字').props.onClick());
  assert.equal(f.root.root.findByType('textarea').props.value, latest);
  await f.update({ contextKey: 'employee-b' });
  assert.equal(f.root.root.findAllByType('textarea').length, 0, 'another employee never inherits a visible preview');
  await act(async () => button(f.root, '檢視整合文字').props.onClick());
  await f.update({ disabled: true });
  assert.equal(f.root.root.findAllByType('textarea').length, 0);
  assert.equal(button(f.root, '一鍵複製全部實績').props.disabled, true);
  assert.equal(button(f.root, '檢視整合文字').props.disabled, true);
  await act(async () => { button(f.root, '一鍵複製全部實績').props.onClick(); button(f.root, '檢視整合文字').props.onClick(); });
  assert.equal(f.root.root.findAllByType('textarea').length, 0, 'direct handler invocation cannot bypass disabled privacy state');
  await f.update({ disabled: false });
  assert.equal(f.root.root.findAllByType('textarea').length, 0, 'reenabling does not restore a sensitive old preview');
});

test('pending clipboard cannot duplicate copy or reopen stale employee text after context switches', async t => {
  const pending = deferred(); let writes = 0;
  const f = await copyFixture(t, { writeText: () => { writes++; return pending.promise; } });
  const click = button(f.root, '一鍵複製全部實績').props.onClick;
  await act(async () => { click(); click(); });
  assert.equal(writes, 1);
  assert.equal(button(f.root, '複製中…').props.disabled, true);
  await f.update({ contextKey: 'employee-b', getText: () => '另一位同仁的實績' });
  await act(async () => pending.reject(new Error('permission denied')));
  await flush();
  assert.equal(f.root.root.findAllByType('textarea').length, 0);
  assert.doesNotMatch(renderedText(f.root), /Ctrl／⌘|已複製|建立跨團隊/);
  assert.equal(button(f.root, '一鍵複製全部實績').props.disabled, false);
});

const person = (id, values = {}) => ({ employee_id: id, employee_name: `同仁${id}`, username: `E${id}`, department: '研發部', section: '工程課', reviewer_name: '課長', locked: false, review_id: id, status: 'draft', updated_at: 'v1', score: null, ...values });

async function departmentFixture(t, rpc, exporter, props = {}) {
  const load = loader({ mocks: {
    'react-router-dom': { useSearchParams: () => [new URLSearchParams('workspace=performance'), () => {}] },
    './usePerformancePrivacy': { privacyDb: { rpc } },
    './ReviewDetail': { ReviewDetail: child },
    './performanceExport': exporter,
  } });
  const { DepartmentAssessments } = load('src/components/performance/DepartmentAssessments.tsx');
  let current = { rows: [person('1'), person('2'), person('3', { locked: true }), person('4', { review_id: null })], cycle: '2026-q3', ready: true, loading: false, exportRevealVersion: 1, ...props };
  let root;
  await act(async () => { root = create(React.createElement(DepartmentAssessments, current)); });
  await flush();
  t.after(() => act(async () => root.unmount()));
  const update = async next => {
    current = { ...current, ...next };
    await act(async () => root.update(React.createElement(DepartmentAssessments, current)));
    await flush();
  };
  return { root, update };
}

function departmentButton(root, label) {
  return root.root.findAll(node => node.type === child && typeof node.props.onClick === 'function').find(node => childrenText(node.props.children).includes(label));
}

test('department ZIP reads selected saved/unlocked people only and exposes packing progress', async t => {
  const reads = [], downloads = [], pending = deferred();
  const f = await departmentFixture(t, async (name, args) => {
    reads.push([name, args]);
    return { data: { id: args.p_review_id, cycle_id: '2026-q3', employee_name: `同仁${args.p_review_id}`, self_feedback: '完整 STAR 文字', manager_feedback: '主管整體回覆' }, error: null };
  }, { downloadPerformanceZip: async (...args) => {
    downloads.push(args); args[2].onProgress('正在打包附件 1 / 2…'); await pending.promise;
  } });
  const check = id => f.root.root.findByProps({ 'aria-label': `匯出 同仁${id}` });
  assert.equal(check('3').props.disabled, true); assert.equal(check('4').props.disabled, true);
  await act(async () => check('2').props.onChange({ target: { checked: false } }));
  await act(async () => departmentButton(f.root, 'ZIP').props.onClick()); await flush();
  assert.equal(reads.length, 1); assert.equal(reads[0][1].p_review_id, '1');
  assert.equal(downloads.length, 1); assert.equal(downloads[0][0].length, 1);
  assert.equal(downloads[0][0][0].selfFeedback, '完整 STAR 文字');
  assert.equal(downloads[0][0][0].managerFeedback, '主管整體回覆');
  assert.equal(downloads[0][2].includeOverview, true);
  assert.equal(downloads[0][2].canDownload(), true);
  assert.match(renderedText(f.root), /正在打包附件 1 \/ 2/);
  assert.equal(check('1').props.disabled, true, 'selection cannot mutate while the archive is being built');
  await act(async () => pending.resolve()); await flush();
  assert.match(renderedText(f.root), /已匯出 1 人的 .*ZIP/);
});

test('department lock invalidates pending ZIP progress and download guard', async t => {
  const pending = deferred(); let guard, progress, downloads = 0;
  const f = await departmentFixture(t, async (_, args) => ({ data: { id: args.p_review_id, cycle_id: '2026-q3', self_feedback: '敏感 STAR' }, error: null }), {
    downloadPerformanceZip: async (_, __, options) => {
      guard = options.canDownload; progress = options.onProgress; await pending.promise;
      if (!guard()) throw new Error('privacy changed'); downloads++;
    },
  }, { rows: [person('1')] });
  await act(async () => departmentButton(f.root, 'ZIP').props.onClick()); await flush();
  assert.equal(guard(), true);
  await f.update({ ready: false });
  assert.equal(guard(), false);
  await act(async () => progress('SHOULD NOT EXPOSE PACKING STATE'));
  assert.doesNotMatch(renderedText(f.root), /SHOULD NOT EXPOSE PACKING STATE/);
  await act(async () => pending.resolve()); await flush();
  assert.equal(downloads, 0);
  assert.match(renderedText(f.root), /匯出未完成/);
});

test('self editor copies and ZIP exports current unsaved edits without saving or submitting', async t => {
  const exports = [], copied = []; let saves = 0;
  const load = loader({ mocks: {
    '@/components/ui/button': { Button: ({ children, ...rest }) => React.createElement('button', rest, children) },
    '@/components/ui/textarea': { Textarea: React.forwardRef((rest, ref) => React.createElement('textarea', { ...rest, ref })) },
    './assessmentDrafts.mjs': { readAssessmentDraft: () => null, keepAssessmentDraft() {}, cancelAssessmentDraftWrite() {}, forgetAssessmentDraft() {} },
  }, globals: { navigator: { clipboard: { writeText: async value => copied.push(value) } } } });
  const { AssessmentEditor } = load('src/components/performance/AssessmentEditor.tsx');
  const { createAssessmentForm } = load('src/components/performance/rd2Assessment.mjs');
  const initial = createAssessmentForm(null, { userId: 'test-person', displayName: '測試同仁' });
  initial.self.sections.IDP.entries = [{ id: 'idp-1', text: '已加入的 IDP 實績' }];
  const props = {
    initial, mode: 'self', draftKey: 'local-fixture', employees: [], demo: false, canSubmit: true,
    onSave: async form => { saves++; return form; },
    onExport: async (...args) => exports.push(args),
    getCopyText: form => `${form.self.sections.IDP.entries[0].text}\n${form.self.sections.IDP.draftText}`,
  };
  let root;
  await act(async () => { root = create(React.createElement(AssessmentEditor, props)); });
  t.after(() => act(async () => root.unmount()));
  await act(async () => root.root.findAllByType('textarea').find(node => node.props.id === 'rd2-IDP').props.onChange({ target: { value: '尚未按新增實績的最新內容' } }));
  await act(async () => button(root, '一鍵複製全部實績').props.onClick()); await flush();
  assert.equal(copied[0], '已加入的 IDP 實績\n尚未按新增實績的最新內容');
  await act(async () => button(root, '匯出完整 ZIP').props.onClick());
  assert.equal(exports.length, 1); assert.equal(exports[0][0], 'zip');
  assert.equal(exports[0][1].self.sections.IDP.draftText, '尚未按新增實績的最新內容');
  assert.equal(saves, 0, 'transfer actions do not save or submit the appraisal');
  await act(async () => button(root, '檢視整合文字').props.onClick());
  assert.ok(root.root.findAllByType('textarea').some(node => node.props['aria-label'] === 'IDP、OKR、KPI 整合文字'));
  await act(async () => root.update(React.createElement(AssessmentEditor, { ...props, exporting: true, exportStatus: '正在打包 2 / 3 附件…' })));
  assert.equal(button(root, '一鍵複製全部實績').props.disabled, true);
  assert.ok(root.root.findAllByType('button').filter(node => childrenText(node.props.children).includes('匯出中')).every(node => node.props.disabled));
  assert.match(renderedText(root), /正在打包 2 \/ 3 附件/);
  assert.equal(root.root.findAllByType('textarea').filter(node => node.props['aria-label'] === 'IDP、OKR、KPI 整合文字').length, 0);
});
