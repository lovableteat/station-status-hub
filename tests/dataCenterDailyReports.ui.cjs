const test = require('node:test');
const assert = require('node:assert/strict');
const { React, create, act, loader, browser } = require('./support/renderHarness.cjs');
const row = { id: 'saved', author_id: 'author', site_id: 'taipei', report_date: '2026-10-07', status: 'completed', summary: '雲端工作', next_steps: '', blockers: '', updated_at: '2026-10-07T12:00:00Z', author: { display_name: 'QA' } };
function mount(save = async () => row) {
  const window = browser();
  window.confirm = () => assert.fail('draft replacement must not use a blocking native dialog');
  const { DataCenterDailyReports } = loader({ window, globals: { document: { getElementById: () => ({ focus() {} }) } }, mocks: {
    '@tanstack/react-query': { useQuery: () => ({ data: [row], isPending: false, isFetching: false, isError: false }), useQueryClient: () => ({ invalidateQueries: async () => {} }) },
    './dailyWorkReports': { WORK_REPORT_STATUSES: { 'on-track': '進行中', blocked: '待協助', completed: '已完成' }, taipeiReportDate: () => '2026-10-07', saveDailyWorkReport: save },
  } })('src/components/data-center/DataCenterDailyReports.tsx');
  let view;
  act(() => { view = create(React.createElement(DataCenterDailyReports, { projectId: 'project', projectName: 'Test', sites: [{ id: 'taipei', label: 'Taipei' }], selectedSiteId: 'taipei', user: { userId: 'author', displayName: 'QA' }, canEdit: true, onBack() {}, onProjects() {} })); });
  const change = value => act(() => view.root.findByProps({ id: 'dc-work-summary' }).props.onChange({ target: { value } }));
  const button = text => view.root.findAll(n => n.type === 'stub' && n.props.children === text && n.props.onClick)[0];
  return { window, view, change, button };
}
test('dirty drafts survive edit selection until inline replacement is explicitly accepted', () => {
  const h = mount();
  try {
    h.change('未提交的工作');
    act(() => h.view.root.findByProps({ className: 'dc-work-edit' }).props.onClick());
    assert.equal(h.view.root.findByProps({ id: 'dc-work-summary' }).props.value, '未提交的工作');
    act(() => h.button('保留草稿').props.onClick());
    assert.equal(h.view.root.findByProps({ id: 'dc-work-summary' }).props.value, '未提交的工作');
    act(() => h.view.root.findByProps({ className: 'dc-work-edit' }).props.onClick());
    act(() => h.button('載入這筆回報').props.onClick());
    assert.equal(h.view.root.findByProps({ id: 'dc-work-summary' }).props.value, '雲端工作');
    assert.equal(JSON.parse(h.window.localStorage.getItem('data-center-work-draft:author:project')).previous.updated_at, row.updated_at);
  } finally { act(() => h.view.unmount()); }
});
test('a failed save retains recovery text and never renders a cloud receipt', async () => {
  const h = mount(async () => { throw new Error('version conflict'); });
  try {
    h.change('必須保留');
    await act(async () => { await h.view.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    assert.equal(h.view.root.findByProps({ id: 'dc-work-summary' }).props.value, '必須保留');
    assert.equal(JSON.parse(h.window.localStorage.getItem('data-center-work-draft:author:project')).draft.summary, '必須保留');
    assert.match(JSON.stringify(h.view.toJSON()), /version conflict/);
    assert.doesNotMatch(JSON.stringify(h.view.toJSON()), /已儲存至雲端/);
  } finally { act(() => h.view.unmount()); }
});
test('visible filters retain table headers at zero rows and clear without losing navigation context', () => {
  const h = mount();
  try {
    act(() => h.view.root.findByProps({ type: 'search' }).props.onChange({ target: { value: 'no-match' } }));
    assert.equal(h.window.location.searchParams.get('dcReportSearch'), 'no-match');
    assert.match(JSON.stringify(h.view.toJSON()), /目前篩選條件沒有符合的回報/);
    assert.equal(h.view.root.findAllByType('th').length, 3);
    act(() => h.view.root.findByProps({ children: '全部清除' }).props.onClick());
    assert.equal(h.window.location.searchParams.has('dcReportSearch'), false);
    assert.equal(h.window.location.searchParams.get('workspace'), 'station-status');
    assert.equal(h.window.location.searchParams.get('project'), 'A');
  } finally { act(() => h.view.unmount()); }
});
