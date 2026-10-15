const assert = require('node:assert/strict');
const test = require('node:test');
const { React, create, act, loader } = require('../support/renderHarness.cjs');

const stamp = '2026-10-15T00:00:00.000Z';
function space(id, ownerId, name, username, ownerRole = 'engineer') {
  return { id, ownerId, ownerRole, name, description: `@${username}`, isPersonal: true, projectId: null, color: '#5fae94', createdAt: stamp, updatedAt: stamp };
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children ?? []).map(text).join('');
}
const host = node => typeof node.type === 'string';

// The default harness cannot resolve SelectValue's selected-item label.
const SelectContext = React.createContext(null);
function SelectItem({ children, ...props }) { return React.createElement('stub', { ...props, 'data-select-option': true }, children); }
function Select({ value, children, ...props }) {
  let label;
  const visit = nodes => React.Children.forEach(nodes, node => {
    if (!React.isValidElement(node)) return;
    if (node.type === SelectItem && node.props.value === value) label = node.props.children;
    else visit(node.props.children);
  });
  visit(children);
  return React.createElement(SelectContext.Provider, { value: { label, disabled: props.disabled } }, React.createElement('stub', { ...props, value, 'data-select-root': true }, children));
}
function SelectValue({ placeholder, children }) {
  const selected = React.useContext(SelectContext);
  return React.createElement('stub', { placeholder }, children ?? selected?.label ?? placeholder);
}
function SelectTrigger({ children, ...props }) {
  const selected = React.useContext(SelectContext);
  return React.createElement('stub', { ...props, disabled: props.disabled ?? selected?.disabled }, children);
}
const child = ({ children, ...props }) => React.createElement('stub', props, children);

function fixture(spaces, ownerId = spaces[0].ownerId) {
  const opened = [];
  const state = {
    spaces, ownerId, activeSpaceId: spaces[0].id, activeSpace: spaces[0], folders: [], files: [],
    loading: false, busy: false, error: null, uploadProgress: null, canEdit: true, canEditSpace: () => true,
    isAuthenticated: true,
    async openSpace(id) { opened.push(id); state.activeSpaceId = id; state.activeSpace = spaces.find(candidate => candidate.id === id) ?? null; },
  };
  const load = loader({ mocks: {
    './hooks/useTestPlanWorkspace': { useTestPlanWorkspace: () => state },
    './TestPlanInspector': { TestPlanInspector: () => null },
    './TestPlanSpreadsheetEditor': { TestPlanSpreadsheetEditor: () => null },
    '@/components/ui/select': { Select, SelectValue, SelectItem, SelectTrigger, SelectContent: child },
    sonner: { toast: { success() {}, error() {} } },
  } });
  return { state, opened, Component: load('src/components/test-plan/TestPlanWorkspace.tsx').TestPlanWorkspace };
}
function rows(tree) {
  return tree.root.findAll(node => node.type === 'div' && /(?:^|\s)test-plan-space-row(?:\s|$)/.test(node.props.className ?? ''));
}
function openButton(row) {
  return row.findAll(node => node.type === 'button' && node.props['aria-label']?.startsWith('開啟 '))[0];
}
function trigger(tree) {
  const matches = tree.root.findAll(node => host(node) && node.props['aria-label'] === '其他使用者');
  assert.equal(matches.length, 1, 'other users have one accessible Select trigger');
  return matches[0];
}
function selector(tree) {
  let node = trigger(tree);
  while (node && !node.props['data-select-root']) node = node.parent;
  assert.ok(node, 'the user picker is a Select');
  return node;
}
function options(tree) { return selector(tree).findAll(node => host(node) && node.props['data-select-option']); }
function names(tree) { return rows(tree).map(row => row.findByType('strong').children.join('')); }
async function mount(f) { let tree; await act(async () => { tree = create(React.createElement(f.Component)); }); return tree; }
const rerender = async (tree, f) => act(async () => tree.update(React.createElement(f.Component)));
async function choose(tree, f, id) { await act(async () => selector(tree).props.onValueChange(id)); await rerender(tree, f); }
async function unmount(tree) { await act(async () => tree.unmount()); }

test('only the current user and verified administrator roles stay pinned; a misleading display name does not grant a pinned row', async () => {
  const f = fixture([
    space('space-me', 'me', '梁文樺', 'liang'),
    space('space-admin', 'admin', '管理員', 'admin', 'admin'),
    space('space-super', 'super', '平台管理', 'super', 'super_admin'),
    space('space-other', 'other', '管理員', 'ordinary.account'),
    space('space-unknown', 'unknown', '未知帳號', 'unknown', null),
  ]);
  const tree = await mount(f);
  assert.equal(names(tree)[0], '梁文樺');
  assert.deepEqual(names(tree).slice(1).sort(), ['平台管理', '管理員'].sort());
  assert.deepEqual(options(tree).map(option => option.props.value).sort(), ['space-other', 'space-unknown']);
  assert.match(text(options(tree).find(option => option.props.value === 'space-other')), /管理員/);
  assert.match(text(options(tree).find(option => option.props.value === 'space-other')), /@ordinary\.account/);
  assert.match(text(trigger(tree)), /選擇其他使用者/);
  assert.equal(rows(tree)[0].findAll(node => host(node) && text(node) === '我').length, 1);
  await unmount(tree);
});

test('an administrator viewing their own space appears once and keeps the ownership marker', async () => {
  const f = fixture([
    space('space-self-admin', 'self-admin', '管理員', 'self.admin', 'admin'),
    space('space-other-admin', 'other-admin', '第二管理員', 'other.admin', 'super_admin'),
    space('space-user', 'user', '一般使用者', 'ordinary'),
  ]);
  const tree = await mount(f);
  assert.deepEqual(names(tree), ['管理員', '第二管理員']);
  assert.equal(rows(tree).length, 2, 'the current administrator is not duplicated by the administrator group');
  const mine = rows(tree)[0];
  assert.equal(text(openButton(mine)), '管理員@self.admin我');
  assert.equal(openButton(mine).props['aria-current'], 'page');
  assert.deepEqual(options(tree).map(option => option.props.value), ['space-user']);
  await unmount(tree);
});

test('pinned Chinese names render once with decorative icons and a distinct account name', async () => {
  const f = fixture([space('space-me', 'me', '梁文樺', 'liang'), space('space-admin', 'admin', '管理員', 'admin', 'admin')]);
  const tree = await mount(f);
  for (const row of rows(tree)) {
    const button = openButton(row);
    const name = row.findByType('strong').children.join('');
    const account = row.findByType('small').children.join('');
    assert.equal(text(button), `${name}${account}${name === '梁文樺' ? '我' : ''}`);
    const icons = row.findAll(node => host(node) && node.props.className === 'file-library-user-icon');
    assert.equal(icons.length, 1);
    assert.equal(icons[0].props['aria-hidden'], 'true');
    assert.equal(text(icons[0]), '');
    assert.equal(button.props['aria-label'], `開啟 ${name}（${account}） 的檔案空間`);
  }
  await unmount(tree);
});

test('other accounts with identical names retain distinct UUID options, open the selected account, and retain their name on the trigger', async () => {
  const f = fixture([
    space('space-me', 'me', '我的帳號', 'mine'),
    space('space-alex-one', 'alex-one', 'Alex Chen', 'alex.one'),
    space('space-alex-two', 'alex-two', 'Alex Chen', 'alex.two'),
  ]);
  const tree = await mount(f);
  assert.deepEqual(options(tree).map(option => option.props.value), ['space-alex-one', 'space-alex-two']);
  assert.deepEqual(options(tree).map(option => text(option)), ['Alex Chen@alex.one', 'Alex Chen@alex.two']);
  await choose(tree, f, 'space-alex-two');
  assert.deepEqual(f.opened, ['space-alex-two']);
  assert.equal(f.state.activeSpaceId, 'space-alex-two');
  assert.equal(selector(tree).props.value, 'space-alex-two');
  assert.match(text(trigger(tree)), /Alex Chen/);
  assert.match(text(trigger(tree)), /@alex\.two/);
  assert.equal(openButton(rows(tree)[0]).props['aria-current'], undefined);
  await choose(tree, f, 'space-alex-one');
  assert.deepEqual(f.opened, ['space-alex-two', 'space-alex-one']);
  assert.equal(selector(tree).props.value, 'space-alex-one');
  assert.match(text(trigger(tree)), /@alex\.one/);
  await unmount(tree);
});

test('returning to a pinned user or administrator resets the other-user placeholder and active row', async () => {
  const f = fixture([
    space('space-me', 'me', '我的帳號', 'mine'),
    space('space-admin', 'admin', '管理員', 'admin', 'admin'),
    space('space-other', 'other', '同事', 'colleague'),
  ]);
  const tree = await mount(f);
  for (const id of ['space-admin', 'space-me']) {
    await choose(tree, f, 'space-other');
    const row = rows(tree).find(candidate => openButton(candidate).props['aria-label'].includes(id === 'space-me' ? '@mine' : '@admin'));
    await act(async () => openButton(row).props.onClick()); await rerender(tree, f);
    assert.equal(f.state.activeSpaceId, id);
    assert.equal(selector(tree).props.value, '');
    assert.match(text(trigger(tree)), /選擇其他使用者/);
    assert.equal(openButton(rows(tree).find(candidate => openButton(candidate).props['aria-label'].includes(id === 'space-me' ? '@mine' : '@admin'))).props['aria-current'], 'page');
  }
  await unmount(tree);
});

for (const status of ['busy', 'loading']) {
  test(`${status} disables pinned navigation and the other-user picker`, async () => {
    const f = fixture([space('space-me', 'me', '我的帳號', 'mine'), space('space-admin', 'admin', '管理員', 'admin', 'admin'), space('space-other', 'other', '同事', 'colleague')]);
    const tree = await mount(f);
    assert.equal(Boolean(selector(tree).props.disabled), false);
    f.state[status] = true; await rerender(tree, f);
    assert.equal(selector(tree).props.disabled, true);
    assert.equal(trigger(tree).props.disabled, true);
    for (const row of rows(tree)) assert.equal(openButton(row).props.disabled, true);
    await act(async () => selector(tree).props.onValueChange('space-other'));
    assert.equal(f.opened.length, 0);
    f.state[status] = false; await rerender(tree, f);
    assert.equal(Boolean(selector(tree).props.disabled), false);
    await unmount(tree);
  });
}

test('display-name changes never confer administrator status and actual role changes regroup the currently selected user', async () => {
  const f = fixture([space('space-me', 'me', '我的帳號', 'mine'), space('space-other', 'other', '同事', 'colleague'), space('space-stable', 'stable', '其他同事', 'stable')]);
  const tree = await mount(f);
  await choose(tree, f, 'space-other');
  f.state.spaces = f.state.spaces.map(candidate => candidate.id === 'space-other' ? { ...candidate, name: '管理員' } : candidate);
  f.state.activeSpace = f.state.spaces[1]; await rerender(tree, f);
  assert.deepEqual(names(tree), ['我的帳號']);
  assert.ok(options(tree).some(option => option.props.value === 'space-other'));
  assert.match(text(trigger(tree)), /管理員/);
  f.state.spaces = f.state.spaces.map(candidate => candidate.id === 'space-other' ? { ...candidate, ownerRole: 'admin' } : candidate);
  f.state.activeSpace = f.state.spaces[1]; await rerender(tree, f);
  assert.deepEqual(names(tree), ['我的帳號', '管理員']);
  assert.deepEqual(options(tree).map(option => option.props.value), ['space-stable']);
  assert.equal(selector(tree).props.value, '');
  assert.match(text(trigger(tree)), /選擇其他使用者/);
  f.state.spaces = f.state.spaces.map(candidate => candidate.id === 'space-other' ? { ...candidate, ownerRole: 'engineer', name: '已更新姓名' } : candidate);
  f.state.activeSpace = f.state.spaces[1]; await rerender(tree, f);
  assert.deepEqual(names(tree), ['我的帳號']);
  assert.equal(selector(tree).props.value, 'space-other');
  assert.match(text(trigger(tree)), /已更新姓名/);
  assert.match(text(options(tree).find(option => option.props.value === 'space-other')), /@colleague/);
  await unmount(tree);
});

test('switching accounts rebuilds the fixed self row without moving or duplicating the administrator', async () => {
  const f = fixture([space('space-me', 'me', '使用者 A', 'user.a'), space('space-admin', 'admin', '管理員', 'admin', 'admin'), space('space-other', 'other', '使用者 B', 'user.b')]);
  const tree = await mount(f);
  f.state.ownerId = 'other'; f.state.activeSpaceId = 'space-other'; f.state.activeSpace = f.state.spaces[2]; await rerender(tree, f);
  assert.deepEqual(names(tree), ['使用者 B', '管理員']);
  assert.equal(text(openButton(rows(tree)[0])), '使用者 B@user.b我');
  assert.equal(rows(tree)[1].findAll(node => host(node) && text(node) === '我').length, 0);
  assert.deepEqual(options(tree).map(option => option.props.value), ['space-me']);
  assert.match(text(trigger(tree)), /選擇其他使用者/);
  await unmount(tree);
});

test('long pinned and dropdown identities retain their full names and usernames', async () => {
  const name = 'Christopher Alexander Williamson 工程整合測試帳號';
  const username = 'christopher.alexander.williamson';
  const f = fixture([space('space-me', 'me', name, username), space('space-other', 'other', `${name} 第二位`, `${username}.two`)]);
  const tree = await mount(f);
  assert.equal(rows(tree)[0].findByType('strong').children.join(''), name);
  assert.equal(rows(tree)[0].findByType('small').children.join(''), `@${username}`);
  assert.equal(openButton(rows(tree)[0]).props.title, `${name} @${username}`);
  assert.equal(text(options(tree)[0]), `${name} 第二位@${username}.two`);
  await choose(tree, f, 'space-other');
  assert.equal(text(trigger(tree)), `${name} 第二位@${username}.two`);
  await unmount(tree);
});
