import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { React, create, act, loader, ui } = require('./support/renderHarness.cjs');
const clock = { now: Date.parse('2026-10-30T04:15:00Z'), intervals: new Map() };
class TestDate extends Date { static now() { return clock.now; } }
const load = loader({
  mocks: { './useMaterialRequestOwners': {useMaterialRequestOwners:()=>({owners:[],error:''})}, './MaterialRequestOwnerPicker': { MaterialRequestOwnerPicker: ui.Select } },
  globals: { toWorkbookRecord: record=>record, PendingCategoryPicker: ui.Select, PendingMailDialog: ui.Dialog, SupplierDirectoryDialog: ui.Dialog,
    STALE_PENDING_MS: 3 * 86400000, getPendingGroupUpdatedAt: () => Date.now(), getTrackingStatusTone: () => '',
    CHIP_BASE: '', CHIP_TONES: { danger: '' }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, Date: TestDate,
    setInterval(callback) { const key = Symbol(); clock.intervals.set(key, callback); return key; },
    clearInterval(key) { clock.intervals.delete(key); } },
  transform(source, file) {
    if (!file.endsWith('MaterialRequestPage.tsx')) return source;
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    return ast.statements.filter(node =>
      ts.isFunctionDeclaration(node) && ['PendingMaterialsDialog', 'loadMarkedGroups', 'saveMarkedGroups', 'getMarkedGroupsStorageKey'].includes(node.name?.text)
      || ts.isVariableStatement(node) && node.getText(ast).startsWith('const MARKED_GROUPS_KEY_PREFIX')
      || ts.isImportDeclaration(node) && ['react', 'lucide-react', '@/lib/utils', './materialRequestPresentation', './MaterialRequestOwnerPicker', './useMaterialRequestOwners', './materialTrackingStatus', './pendingMaterialsExport', './materialApplicationTiming'].includes(node.moduleSpecifier.text)
      || ts.isImportDeclaration(node) && node.moduleSpecifier.text.startsWith('@/components/ui/')
    ).map(node => node.getText(ast)).join('\n') + '\nexport { loadMarkedGroups, saveMarkedGroups };';
  },
});

test('pending rows show first-update age, refresh while open, and keep opening the same record', () => {
  const { PendingMaterialsDialog } = load('src/components/material-requests/MaterialRequestPage.tsx');
  const start = clock.now;
  const record = { ...groups[0].primaryRecord, trackingHistory: [{ id: 'first', status: '已發信', createdAt: new Date(start - 25 * 3600000).toISOString() }] };
  const timedGroup = { ...groups[0], records: [record], primaryRecord: record };
  let root, opened, open = true;
  const render = () => React.createElement(PendingMaterialsDialog, { groups: [timedGroup, groups[1]], canEdit: true, open, workspaceName: 'QA', exportedBy: 'QA',
    onOpenChange() {}, onOpenTracking(value) { opened = value; }, onSetCategory() {}, onSetOwner() {}, markedGroupKeys: new Set(), onToggleMarked() {},
  });
  try {
    act(() => { root = create(render()); });
    const values = () => root.root.findAllByProps({ 'data-testid': 'pending-application-elapsed' }).map(node => node.props.children[1].props.children);
    assert.deepEqual(values(), ['1 天', '尚無紀錄']);
    assert.match(root.root.findAllByProps({ 'data-testid': 'pending-application-elapsed' })[0].props.title, /1 天 1 小時 0 分鐘/);
    const status = root.root.findAllByProps({ 'data-testid': 'pending-status-segment' })[0];
    assert.equal(status.type, 'span', 'current status is a non-interactive indicator');
    assert.equal(status.props.onClick, undefined);
    assert.equal(status.props['aria-label'], '目前狀態：未處理');
    const tracking = root.root.findAll(node => node.type === 'stub' && node.props['data-testid'] === 'pending-tracking-control')[0];
    assert.equal(tracking.findAllByProps({ 'data-testid': 'pending-status-segment' }).length, 0, 'status is outside the update button');
    assert.equal(status.parent.props.className, 'pending-row-status');
    assert.ok(status.parent.findAll(node => node === tracking).length, 'indicator and action remain in the same fixed slot');
    act(() => root.root.findAll(node => node.type === 'stub' && node.props['data-testid'] === 'pending-tracking-control')[0].props.onClick());
    assert.equal(opened, record);
    clock.now += 86400000;
    act(() => { for (const refresh of clock.intervals.values()) refresh(); });
    assert.deepEqual(values(), ['2 天', '尚無紀錄']);
    act(() => { open = false; root.update(render()); });
    assert.equal(clock.intervals.size, 0, 'closed dialogs stop their clock');
    clock.now += 86400000;
    act(() => { open = true; root.update(render()); });
    assert.deepEqual(values(), ['3 天', '尚無紀錄']);
  } finally {
    act(() => root?.unmount());
    clock.now = start;
  }
  assert.equal(clock.intervals.size, 0, 'unmount clears the refresh timer');
});

const groups = ['J1', 'R1'].map(ref => {
  const record = { id: ref, refDes: ref, needsApplication: true, manufacturer: 'Example', manufacturerPartNumber: 'MPN-' + ref };
  return { key: 'group-' + ref, displayRef: ref, name: ref, searchText: ref.toLowerCase(), primaryRecord: record, records: [record, { ...record, id: ref + '-alternate' }] };
});

test('fresh opens show all categories and clear search; returning from an editor retains the chosen view', () => {
  const { PendingMaterialsDialog } = load('src/components/material-requests/MaterialRequestPage.tsx');
  let open = true, restoreView = false, root;
  const render = () => React.createElement(PendingMaterialsDialog, {
    groups, canEdit: false, open, restoreView, workspaceName: 'QA', exportedBy: 'QA',
    onOpenChange() {}, onOpenTracking() {}, onSetCategory() {}, markedGroupKeys: new Set(['group-J1']), onToggleMarked() {},
  });
  act(() => { root = create(render()); });
  const selectedTab = () => root.root.find(node => node.type === 'button' && node.props.role === 'tab' && node.props['aria-selected']).props.children;
  const rows = () => root.root.findAllByProps({ 'data-testid': 'pending-application' });
  const search = () => root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '搜尋待處理料');
  const selectTab = name => act(() => root.root.find(node => node.type === 'button' && node.props.role === 'tab' && node.props.children.includes(name)).props.onClick());
  const reopen = restore => {
    act(() => { open = false; root.update(render()); });
    act(() => { open = true; restoreView = restore; root.update(render()); });
  };
  assert.ok(selectedTab().includes('全部'));
  assert.equal(rows().length, 2, 'initial open includes CONNECTOR and RLC');
  selectTab('CONNECTOR');
  act(() => search().props.onChange({ target: { value: 'j1' } }));
  assert.equal(rows().length, 1);
  reopen(false);
  assert.ok(selectedTab().includes('全部'));
  assert.equal(search().props.value, '');
  assert.equal(rows().length, 2);
  assert.ok(root.root.find(node => node.type === 'stub' && node.props['data-testid'] === 'pending-export-button').props.children.includes('匯出表格（2）'));
  selectTab('RLC 被動元件');
  act(() => search().props.onChange({ target: { value: 'r1' } }));
  reopen(true);
  assert.ok(selectedTab().includes('RLC 被動元件'));
  assert.equal(search().props.value, 'r1');
  assert.equal(rows().length, 1, 'editor return preserves the filtered list');
  act(() => root.unmount());
});

test('marks filter by location, survive clearing filters, and unmarking the last row stays in the empty marked view', () => {
  const { PendingMaterialsDialog } = load('src/components/material-requests/MaterialRequestPage.tsx');
  let marks = new Set();
  let root;
  const render = () => React.createElement(PendingMaterialsDialog, { groups, canEdit: false, open: true, workspaceName: 'QA', exportedBy: 'QA',
    onOpenChange() {}, onOpenTracking() {}, onSetCategory() {}, markedGroupKeys: marks,
    onToggleMarked(key) { marks = new Set(marks); if (marks.has(key)) marks.delete(key); else marks.add(key); root.update(render()); },
  });
  act(() => { root = create(render()); });
  const clickTab = key => act(() => root.root.find(node => node.type === 'button' && node.props.role === 'tab' && (node.props.children.includes(key))).props.onClick());
  const rows = () => root.root.findAllByProps({ 'data-testid': 'pending-application' });
  const markButton = () => root.root.findAll(node => node.type === 'stub' && node.props['data-testid'] === 'pending-mark-toggle')[0];
  clickTab('全部');
  act(() => markButton().props.onClick());
  assert.equal(marks.size, 1);
  clickTab('特別標記');
  assert.equal(rows().length, 1);
  assert.equal(markButton().props['aria-pressed'], true);
  act(() => root.root.find(node => node.type === 'stub' && node.props['data-testid'] === 'pending-include-alternates').props.onClick());
  assert.equal(rows().length, 2, 'all vendor rows of the marked location share its star');
  act(() => markButton().props.onClick());
  assert.equal(rows().length, 0);
  assert.match(JSON.stringify(root.toJSON()), /尚未特別標記/);
  const selected = root.root.find(node => node.type === 'button' && node.props.role === 'tab' && node.props['aria-selected']);
  assert.ok(selected.props.children.includes('特別標記'));
  act(() => root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '清除待處理料分類條件').props.onClick());
  assert.equal(rows().length, 4);
  act(() => markButton().props.onClick());
  act(() => root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '搜尋待處理料').props.onChange({ target: { value: 'no-match' } }));
  assert.equal(rows().length, 0);
  act(() => root.root.find(node => node.type === 'stub' && node.props.children === '全部清除').props.onClick());
  assert.equal(rows().length, 2);
  assert.equal(marks.size, 1, 'clear-all clears filters, not stored marks');
  act(() => root.unmount());
});

test('existing mark storage restores the marked locations for the same BOM without sharing another BOM', () => {
  const { loadMarkedGroups, saveMarkedGroups } = load('src/components/material-requests/MaterialRequestPage.tsx');
  saveMarkedGroups('qa-BOM-A', ['group-J1', 'group-J1']);
  assert.deepEqual([...loadMarkedGroups('qa-BOM-A')], ['group-J1']);
  assert.deepEqual([...loadMarkedGroups('qa-BOM-B')], []);
});
