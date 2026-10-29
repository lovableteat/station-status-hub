import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { React, create, act, loader, ui } = require('./support/renderHarness.cjs');
const load = loader({
  mocks: { './useMaterialRequestOwners': {useMaterialRequestOwners:()=>({owners:[],error:''})}, './MaterialRequestOwnerPicker': { MaterialRequestOwnerPicker: ui.Select } },
  globals: { toWorkbookRecord: record=>record, PendingCategoryPicker: ui.Select, PendingMailDialog: ui.Dialog, SupplierDirectoryDialog: ui.Dialog,
    STALE_PENDING_MS: 3 * 86400000, getPendingGroupUpdatedAt: () => Date.now(), getTrackingStatusTone: () => '',
    CHIP_BASE: '', CHIP_TONES: { danger: '' }, requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
  transform(source, file) {
    if (!file.endsWith('MaterialRequestPage.tsx')) return source;
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    return ast.statements.filter(node =>
      ts.isFunctionDeclaration(node) && ['PendingMaterialsDialog', 'loadMarkedGroups', 'saveMarkedGroups', 'getMarkedGroupsStorageKey'].includes(node.name?.text)
      || ts.isVariableStatement(node) && node.getText(ast).startsWith('const MARKED_GROUPS_KEY_PREFIX')
      || ts.isImportDeclaration(node) && ['react', 'lucide-react', '@/lib/utils', './materialRequestPresentation', './MaterialRequestOwnerPicker', './useMaterialRequestOwners', './materialTrackingStatus', './pendingMaterialsExport'].includes(node.moduleSpecifier.text)
      || ts.isImportDeclaration(node) && node.moduleSpecifier.text.startsWith('@/components/ui/')
    ).map(node => node.getText(ast)).join('\n') + '\nexport { loadMarkedGroups, saveMarkedGroups };';
  },
});

const groups = ['J1', 'R1'].map(ref => {
  const record = { id: ref, refDes: ref, needsApplication: true, manufacturer: 'Example', manufacturerPartNumber: 'MPN-' + ref };
  return { key: 'group-' + ref, displayRef: ref, name: ref, searchText: ref.toLowerCase(), primaryRecord: record, records: [record, { ...record, id: ref + '-alternate' }] };
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
