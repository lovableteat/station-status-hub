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
const hasClass = (node, name) => new RegExp(`(?:^|\\s)${name}(?:\\s|$)`).test(node.props.className ?? '');
const spaceLabel = candidate => `開啟 ${candidate.name}（${candidate.description}） 的檔案空間`;

function fixture(spaces, ownerId = spaces[0].ownerId) {
  const opened = [];
  const state = {
    spaces, ownerId, activeSpaceId: spaces[0].id, activeSpace: spaces[0], folders: [], files: [],
    loading: false, busy: false, error: null, uploadProgress: null, canEdit: true, canEditSpace: () => true,
    isAuthenticated: true,
    async openSpace(id) { opened.push(id); state.activeSpaceId = id; state.activeSpace = state.spaces.find(candidate => candidate.id === id) ?? null; },
    async refreshWorkspace() {},
  };
  const load = loader({ mocks: {
    './hooks/useTestPlanWorkspace': { useTestPlanWorkspace: () => state },
    './TestPlanInspector': { TestPlanInspector: () => null, FileTypeIcon: () => null, describeEntryType: () => '', formatEntryDate: () => '' },
    './TestPlanSpreadsheetEditor': { TestPlanSpreadsheetEditor: () => null },
    sonner: { toast: { success() {}, error() {}, warning() {} } },
  } });
  return { state, opened, Component: load('src/components/test-plan/TestPlanWorkspace.tsx').TestPlanWorkspace };
}

// ----- navigation pane queries ---------------------------------------------
function spaceList(tree) {
  const matches = tree.root.findAll(node => node.type === 'div' && hasClass(node, 'test-plan-space-list'));
  assert.equal(matches.length, 1, 'the navigation pane has one space list');
  return matches[0];
}
function rows(tree) {
  return tree.root.findAll(node => node.type === 'div' && hasClass(node, 'test-plan-space-row'));
}
function openButton(row) {
  const matches = row.findAll(node => node.type === 'button' && node.props['aria-label']?.startsWith('開啟 '));
  assert.equal(matches.length, 1, 'each space row has one open button');
  return matches[0];
}
function names(tree) { return rows(tree).map(row => row.findByType('strong').children.join('')); }
/** The space a row opens, resolved through its accessible name so identical display names stay apart. */
function idOf(f, row) {
  const label = openButton(row).props['aria-label'];
  const matches = f.state.spaces.filter(candidate => spaceLabel(candidate) === label);
  assert.equal(matches.length, 1, `exactly one space answers to ${label}`);
  return matches[0].id;
}
function rowFor(tree, f, id) {
  const matches = rows(tree).filter(row => idOf(f, row) === id);
  assert.equal(matches.length, 1, `${id} is listed exactly once`);
  return matches[0];
}
/** Space ids per navigation group, in screen order, read from the group headings that precede them. */
function groups(tree, f) {
  const result = { mine: [], team: [], others: [] };
  const headings = { 我的空間: 'mine', 管理員: 'team', 其他使用者: 'others', 跨使用者: 'all' };
  let current = null;
  for (const node of spaceList(tree).children) {
    if (typeof node === 'string') continue;
    if (node.type === 'p' && hasClass(node, 'file-library-rail-label')) {
      const heading = Object.keys(headings).find(candidate => text(node).startsWith(candidate));
      assert.ok(heading, `known navigation heading: ${text(node)}`);
      current = headings[heading];
      continue;
    }
    if (node.type === 'div' && hasClass(node, 'test-plan-space-row')) {
      assert.ok(current && current !== 'all', 'every space row sits under a group heading');
      result[current].push(idOf(f, node));
    }
  }
  return result;
}
/** The rows marked as the open space. */
function currentIds(tree, f) { return rows(tree).filter(row => openButton(row).props['aria-current'] === 'page').map(row => idOf(f, row)); }
/** The space whose row the folder tree is attached to (the tree follows the open space's row). */
function folderTreeOwners(tree, f) {
  const children = spaceList(tree).children.filter(node => typeof node !== 'string');
  return children.flatMap((node, index) => node.type === 'div' && hasClass(node, 'test-plan-folder-tree')
    ? [{ id: idOf(f, children[index - 1]), label: node.props['aria-label'] }]
    : []);
}
function control(tree, label) {
  const matches = tree.root.findAll(node => host(node) && node.props['aria-label'] === label);
  assert.equal(matches.length, 1, `one accessible control: ${label}`);
  return matches[0];
}
const controls = (tree, label) => tree.root.findAll(node => host(node) && node.props['aria-label'] === label);
const peopleFilter = tree => control(tree, '篩選其他使用者');
function emptyNotice(tree) {
  return spaceList(tree).findAll(node => node.type === 'p' && hasClass(node, 'file-library-rail-empty')).map(text);
}
function allFilesButton(tree) {
  const matches = tree.root.findAll(node => node.type === 'button' && hasClass(node, 'file-library-all'));
  assert.equal(matches.length, 1, 'one 所有檔案 entry');
  return matches[0];
}
function locationName(tree) {
  const nav = control(tree, '目前位置');
  return text(nav.findAll(node => node.type === 'button')[0]);
}

async function mount(f) { let tree; await act(async () => { tree = create(React.createElement(f.Component)); }); return tree; }
const rerender = async (tree, f) => act(async () => tree.update(React.createElement(f.Component)));
async function open(tree, f, id) { await act(async () => openButton(rowFor(tree, f, id)).props.onClick()); await rerender(tree, f); }
async function filterPeople(tree, value) { await act(async () => peopleFilter(tree).props.onChange({ target: { value } })); }
async function unmount(tree) { await act(async () => tree.unmount()); }

test('only the current user and verified administrator roles are pinned; a misleading display name stays among the other users', async () => {
  const f = fixture([
    space('space-me', 'me', '梁文樺', 'liang'),
    space('space-admin', 'admin', '管理員', 'admin', 'admin'),
    space('space-super', 'super', '平台管理', 'super', 'super_admin'),
    space('space-other', 'other', '管理員', 'ordinary.account'),
    space('space-unknown', 'unknown', '未知帳號', 'unknown', null),
  ]);
  const tree = await mount(f);
  const listed = groups(tree, f);
  assert.deepEqual(listed.mine, ['space-me']);
  assert.deepEqual(listed.team.sort(), ['space-admin', 'space-super']);
  assert.deepEqual(listed.others.sort(), ['space-other', 'space-unknown'], 'a missing role is not an administrator role');
  assert.equal(names(tree)[0], '梁文樺');
  const impostor = rowFor(tree, f, 'space-other');
  assert.equal(impostor.findByType('strong').children.join(''), '管理員');
  assert.equal(impostor.findAllByType('small').length, 0);
  assert.equal(openButton(impostor).props['aria-label'], '開啟 管理員（@ordinary.account） 的檔案空間');
  assert.equal(controls(tree, '其他使用者').length, 0, 'other users are listed directly, not behind a picker');
  assert.deepEqual(currentIds(tree, f), ['space-me'], 'no other user is open until one is clicked');
  assert.equal(rows(tree)[0].findAll(node => host(node) && text(node) === '我').length, 1);
  for (const id of ['space-admin', 'space-super', 'space-other', 'space-unknown']) {
    assert.equal(rowFor(tree, f, id).findAll(node => host(node) && text(node) === '我').length, 0, `${id} carries no ownership marker`);
  }
  await unmount(tree);
});

test('an administrator viewing their own space appears once and keeps the ownership marker', async () => {
  const f = fixture([
    space('space-self-admin', 'self-admin', '管理員', 'self.admin', 'admin'),
    space('space-other-admin', 'other-admin', '第二管理員', 'other.admin', 'super_admin'),
    space('space-user', 'user', '一般使用者', 'ordinary'),
  ]);
  const tree = await mount(f);
  assert.deepEqual(groups(tree, f), { mine: ['space-self-admin'], team: ['space-other-admin'], others: ['space-user'] });
  assert.deepEqual(names(tree), ['管理員', '第二管理員', '一般使用者']);
  assert.equal(rows(tree).length, 3, 'the current administrator is not duplicated by the administrator group');
  const mine = rows(tree)[0];
  assert.equal(text(openButton(mine)), '管理員我');
  assert.equal(openButton(mine).props['aria-current'], 'page');
  assert.deepEqual(folderTreeOwners(tree, f), [{ id: 'space-self-admin', label: '管理員 的資料夾' }]);
  await unmount(tree);
});

test('every listed person shows only their name and ownership marker while keeping accessible account identity', async () => {
  const f = fixture([space('space-me', 'me', '梁文樺', 'liang'), space('space-admin', 'admin', '管理員', 'admin', 'admin'), space('space-peer', 'peer', '陳怡君', 'yijun')]);
  const tree = await mount(f);
  assert.equal(rows(tree).length, 3);
  for (const row of rows(tree)) {
    const button = openButton(row);
    const name = row.findByType('strong').children.join('');
    const account = f.state.spaces.find(candidate => candidate.id === idOf(f, row)).description;
    assert.equal(row.findAllByType('small').length, 0, 'no username subtitle in any sidebar group');
    assert.equal(text(button), `${name}${name === '梁文樺' ? '我' : ''}`);
    assert.equal(button.props.title, name, 'hover text does not bring the username back');
    const icons = row.findAll(node => host(node) && node.props.className === 'file-library-user-icon');
    assert.equal(icons.length, 1);
    assert.equal(icons[0].props['aria-hidden'], 'true');
    assert.equal(text(icons[0]), '');
    assert.equal(button.props['aria-label'], `開啟 ${name}（${account}） 的檔案空間`);
  }
  await unmount(tree);

  const pinnedOnly = fixture([space('space-me', 'me', '梁文樺', 'liang'), space('space-admin', 'admin', '管理員', 'admin', 'admin')]);
  const pinnedTree = await mount(pinnedOnly);
  assert.deepEqual(groups(pinnedTree, pinnedOnly), { mine: ['space-me'], team: ['space-admin'], others: [] });
  assert.equal(controls(pinnedTree, '篩選其他使用者').length, 0, 'no people filter without other users to filter');
  await unmount(pinnedTree);
});

test('other accounts with identical names stay distinct rows by id, open the clicked account, and carry the folder tree under that row', async () => {
  const f = fixture([
    space('space-me', 'me', '我的帳號', 'mine'),
    space('space-alex-one', 'alex-one', 'Alex Chen', 'alex.one'),
    space('space-alex-two', 'alex-two', 'Alex Chen', 'alex.two'),
  ]);
  const tree = await mount(f);
  assert.deepEqual(groups(tree, f).others, ['space-alex-one', 'space-alex-two']);
  assert.deepEqual(groups(tree, f).others.map(id => text(openButton(rowFor(tree, f, id)))), ['Alex Chen', 'Alex Chen']);
  await open(tree, f, 'space-alex-two');
  assert.deepEqual(f.opened, ['space-alex-two']);
  assert.equal(f.state.activeSpaceId, 'space-alex-two');
  assert.deepEqual(currentIds(tree, f), ['space-alex-two']);
  assert.equal(openButton(rowFor(tree, f, 'space-me')).props['aria-current'], undefined);
  assert.deepEqual(folderTreeOwners(tree, f), [{ id: 'space-alex-two', label: 'Alex Chen 的資料夾' }]);
  assert.equal(locationName(tree), 'Alex Chen 的空間');
  await open(tree, f, 'space-alex-one');
  assert.deepEqual(f.opened, ['space-alex-two', 'space-alex-one']);
  assert.deepEqual(currentIds(tree, f), ['space-alex-one']);
  assert.deepEqual(folderTreeOwners(tree, f).map(owner => owner.id), ['space-alex-one']);
  assert.deepEqual(groups(tree, f).others, ['space-alex-one', 'space-alex-two'], 'opening a person does not reorder or drop the namesake');
  await unmount(tree);
});

test('returning to a pinned user, an administrator or 所有檔案 moves the current marker and folder tree off the other user', async () => {
  const f = fixture([
    space('space-me', 'me', '我的帳號', 'mine'),
    space('space-admin', 'admin', '管理員', 'admin', 'admin'),
    space('space-other', 'other', '同事', 'colleague'),
  ]);
  const tree = await mount(f);
  for (const id of ['space-admin', 'space-me']) {
    await open(tree, f, 'space-other');
    assert.deepEqual(currentIds(tree, f), ['space-other']);
    await open(tree, f, id);
    assert.equal(f.state.activeSpaceId, id);
    assert.deepEqual(currentIds(tree, f), [id]);
    assert.equal(openButton(rowFor(tree, f, 'space-other')).props['aria-current'], undefined);
    assert.deepEqual(folderTreeOwners(tree, f).map(owner => owner.id), [id]);
  }
  await open(tree, f, 'space-other');
  await act(async () => allFilesButton(tree).props.onClick()); await rerender(tree, f);
  assert.equal(f.opened.at(-1), null);
  assert.equal(f.state.activeSpaceId, null);
  assert.deepEqual(currentIds(tree, f), []);
  assert.deepEqual(folderTreeOwners(tree, f), []);
  assert.ok(hasClass(allFilesButton(tree), 'is-active'));
  assert.deepEqual(groups(tree, f), { mine: ['space-me'], team: ['space-admin'], others: ['space-other'] });
  await unmount(tree);
});

for (const status of ['busy', 'loading']) {
  test(`${status} disables navigation to every listed space, including other users`, async () => {
    const f = fixture([space('space-me', 'me', '我的帳號', 'mine'), space('space-admin', 'admin', '管理員', 'admin', 'admin'), space('space-other', 'other', '同事', 'colleague')]);
    const tree = await mount(f);
    assert.equal(rows(tree).length, 3);
    for (const row of rows(tree)) assert.equal(Boolean(openButton(row).props.disabled), false);
    f.state[status] = true; await rerender(tree, f);
    assert.deepEqual(groups(tree, f).others, ['space-other'], 'other users stay listed while navigation is locked');
    for (const row of rows(tree)) assert.equal(openButton(row).props.disabled, true, `${idOf(f, row)} cannot be opened while ${status}`);
    if (status === 'busy') assert.equal(allFilesButton(tree).props.disabled, true);
    assert.equal(f.opened.length, 0);
    f.state[status] = false; await rerender(tree, f);
    for (const row of rows(tree)) assert.equal(Boolean(openButton(row).props.disabled), false);
    await open(tree, f, 'space-other');
    assert.deepEqual(f.opened, ['space-other'], 'navigation resumes once the work finishes');
    await unmount(tree);
  });
}

test('display-name changes never confer administrator status and actual role changes regroup the currently selected user', async () => {
  const f = fixture([space('space-me', 'me', '我的帳號', 'mine'), space('space-other', 'other', '同事', 'colleague'), space('space-stable', 'stable', '其他同事', 'stable')]);
  const tree = await mount(f);
  await open(tree, f, 'space-other');
  f.state.spaces = f.state.spaces.map(candidate => candidate.id === 'space-other' ? { ...candidate, name: '管理員' } : candidate);
  f.state.activeSpace = f.state.spaces[1]; await rerender(tree, f);
  assert.deepEqual(groups(tree, f).mine, ['space-me']);
  assert.deepEqual(groups(tree, f).team, [], 'a display name of 管理員 does not join the administrator group');
  assert.deepEqual(groups(tree, f).others.sort(), ['space-other', 'space-stable']);
  assert.equal(rowFor(tree, f, 'space-other').findByType('strong').children.join(''), '管理員');
  assert.deepEqual(currentIds(tree, f), ['space-other']);

  f.state.spaces = f.state.spaces.map(candidate => candidate.id === 'space-other' ? { ...candidate, ownerRole: 'admin' } : candidate);
  f.state.activeSpace = f.state.spaces[1]; await rerender(tree, f);
  assert.deepEqual(groups(tree, f), { mine: ['space-me'], team: ['space-other'], others: ['space-stable'] });
  assert.deepEqual(names(tree), ['我的帳號', '管理員', '其他同事']);
  assert.deepEqual(currentIds(tree, f), ['space-other'], 'the open space follows its owner into the administrator group');
  assert.deepEqual(folderTreeOwners(tree, f), [{ id: 'space-other', label: '管理員 的資料夾' }]);

  f.state.spaces = f.state.spaces.map(candidate => candidate.id === 'space-other' ? { ...candidate, ownerRole: 'engineer', name: '已更新姓名' } : candidate);
  f.state.activeSpace = f.state.spaces[1]; await rerender(tree, f);
  assert.deepEqual(groups(tree, f).mine, ['space-me']);
  assert.deepEqual(groups(tree, f).team, []);
  assert.deepEqual(groups(tree, f).others.sort(), ['space-other', 'space-stable']);
  const demoted = rowFor(tree, f, 'space-other');
  assert.equal(demoted.findByType('strong').children.join(''), '已更新姓名');
  assert.equal(demoted.findAllByType('small').length, 0);
  assert.deepEqual(currentIds(tree, f), ['space-other']);
  assert.deepEqual(folderTreeOwners(tree, f).map(owner => owner.id), ['space-other']);
  assert.deepEqual(f.opened, ['space-other'], 'regrouping never reopens or switches the space');
  await unmount(tree);
});

test('switching accounts rebuilds the fixed self row without moving or duplicating the administrator', async () => {
  const f = fixture([space('space-me', 'me', '使用者 A', 'user.a'), space('space-admin', 'admin', '管理員', 'admin', 'admin'), space('space-other', 'other', '使用者 B', 'user.b')]);
  const tree = await mount(f);
  f.state.ownerId = 'other'; f.state.activeSpaceId = 'space-other'; f.state.activeSpace = f.state.spaces[2]; await rerender(tree, f);
  assert.deepEqual(groups(tree, f), { mine: ['space-other'], team: ['space-admin'], others: ['space-me'] });
  assert.deepEqual(names(tree), ['使用者 B', '管理員', '使用者 A']);
  assert.equal(rows(tree).length, 3, 'no space is listed twice after the switch');
  assert.equal(text(openButton(rows(tree)[0])), '使用者 B我');
  assert.equal(rows(tree)[1].findAll(node => host(node) && text(node) === '我').length, 0);
  assert.equal(rowFor(tree, f, 'space-me').findAll(node => host(node) && text(node) === '我').length, 0, 'the previous account loses the ownership marker');
  assert.deepEqual(currentIds(tree, f), ['space-other']);
  assert.equal(openButton(rowFor(tree, f, 'space-me')).props['aria-current'], undefined);
  assert.equal(locationName(tree), '我的空間');
  await unmount(tree);
});

test('long names keep full titles and location labels without displaying account usernames', async () => {
  const name = 'Christopher Alexander Williamson 工程整合測試帳號';
  const username = 'christopher.alexander.williamson';
  const f = fixture([space('space-me', 'me', name, username), space('space-other', 'other', `${name} 第二位`, `${username}.two`)]);
  const tree = await mount(f);
  const self = rowFor(tree, f, 'space-me');
  assert.equal(self.findByType('strong').children.join(''), name);
  assert.equal(self.findAllByType('small').length, 0);
  assert.equal(openButton(self).props.title, name);
  const other = rowFor(tree, f, 'space-other');
  assert.equal(text(openButton(other)), `${name} 第二位`);
  assert.equal(openButton(other).props.title, `${name} 第二位`);
  assert.equal(openButton(other).props['aria-label'], `開啟 ${name} 第二位（@${username}.two） 的檔案空間`);
  await open(tree, f, 'space-other');
  assert.deepEqual(currentIds(tree, f), ['space-other']);
  assert.equal(locationName(tree), `${name} 第二位 的空間`);
  assert.deepEqual(folderTreeOwners(tree, f), [{ id: 'space-other', label: `${name} 第二位 的資料夾` }]);
  await filterPeople(tree, username.toUpperCase());
  assert.equal(text(openButton(rowFor(tree, f, 'space-other'))), `${name} 第二位`);
  await unmount(tree);
});

test('the other-user filter narrows people by name or username, ignores case and width, and never hides pinned rows', async () => {
  const f = fixture([
    space('space-me', 'me', '我的帳號', 'mine'),
    space('space-admin', 'admin', '管理員', 'admin', 'admin'),
    space('space-alex', 'alex', 'Alex Chen', 'alex'),
    space('space-ming', 'ming', '陳小明', 'ming.chen'),
    space('space-datong', 'datong', '王大同', 'datong'),
  ]);
  const tree = await mount(f);
  const everyone = groups(tree, f).others;
  assert.deepEqual([...everyone].sort(), ['space-alex', 'space-datong', 'space-ming']);
  assert.equal(peopleFilter(tree).props.value, '');
  assert.equal(controls(tree, '清除人員篩選').length, 0, 'nothing to clear before typing');

  for (const value of ['chen', 'CHEN', '  Chen  ', 'ＣＨＥＮ']) {
    await filterPeople(tree, value);
    assert.equal(peopleFilter(tree).props.value, value);
    const listed = groups(tree, f);
    assert.deepEqual(listed.mine, ['space-me'], `${JSON.stringify(value)} keeps the self row`);
    assert.deepEqual(listed.team, ['space-admin'], `${JSON.stringify(value)} keeps the administrators`);
    assert.deepEqual([...listed.others].sort(), ['space-alex', 'space-ming'], `${JSON.stringify(value)} matches a name or a username`);
  }
  await filterPeople(tree, '小明');
  assert.deepEqual(groups(tree, f).others, ['space-ming']);
  await filterPeople(tree, '@datong');
  assert.deepEqual(groups(tree, f).others, ['space-datong']);
  await filterPeople(tree, 'space-alex');
  assert.deepEqual(groups(tree, f).others, [], 'hidden ids are not searchable');
  assert.deepEqual(emptyNotice(tree), ['沒有符合「space-alex」的人員']);
  assert.deepEqual(groups(tree, f).mine, ['space-me']);
  assert.deepEqual(groups(tree, f).team, ['space-admin']);

  await act(async () => control(tree, '清除人員篩選').props.onClick());
  assert.equal(peopleFilter(tree).props.value, '');
  assert.deepEqual(groups(tree, f).others, everyone, 'clearing restores every person in the original order');
  assert.deepEqual(emptyNotice(tree), []);
  assert.deepEqual(f.opened, [], 'filtering never opens a space');
  await unmount(tree);
});

test('the open other-user space stays listed while filtered out, and filtering never switches the space', async () => {
  const f = fixture([
    space('space-me', 'me', '我的帳號', 'mine'),
    space('space-alex', 'alex', 'Alex Chen', 'alex'),
    space('space-datong', 'datong', '王大同', 'datong'),
  ]);
  const tree = await mount(f);
  await open(tree, f, 'space-datong');
  await filterPeople(tree, 'alex');
  assert.deepEqual([...groups(tree, f).others].sort(), ['space-alex', 'space-datong']);
  assert.deepEqual(currentIds(tree, f), ['space-datong']);
  assert.deepEqual(folderTreeOwners(tree, f).map(owner => owner.id), ['space-datong']);
  await filterPeople(tree, 'zzz');
  assert.deepEqual(groups(tree, f).others, ['space-datong'], 'the open space is never filtered out of view');
  assert.deepEqual(emptyNotice(tree), [], 'the list is not empty while the open space is shown');
  assert.equal(f.state.activeSpaceId, 'space-datong');
  assert.deepEqual(f.opened, ['space-datong']);

  await open(tree, f, 'space-me');
  assert.deepEqual(groups(tree, f).others, [], 'once another space is open the filter applies again');
  assert.deepEqual(emptyNotice(tree), ['沒有符合「zzz」的人員']);
  assert.equal(peopleFilter(tree).props.value, 'zzz', 'navigating keeps the typed filter');
  await unmount(tree);
});

test('filtering by username separates identical display names and opens the matching account', async () => {
  const f = fixture([
    space('space-me', 'me', '我的帳號', 'mine'),
    space('space-alex-one', 'alex-one', 'Alex Chen', 'alex.one'),
    space('space-alex-two', 'alex-two', 'Alex Chen', 'alex.two'),
  ]);
  const tree = await mount(f);
  await filterPeople(tree, 'Alex Chen');
  assert.deepEqual(groups(tree, f).others, ['space-alex-one', 'space-alex-two']);
  await filterPeople(tree, '@alex.two');
  assert.deepEqual(groups(tree, f).others, ['space-alex-two']);
  await open(tree, f, 'space-alex-two');
  assert.deepEqual(f.opened, ['space-alex-two']);
  assert.deepEqual(currentIds(tree, f), ['space-alex-two']);
  await filterPeople(tree, '@alex.one');
  assert.deepEqual(groups(tree, f).others, ['space-alex-one', 'space-alex-two'], 'the match and the open namesake are both listed, each once');
  await open(tree, f, 'space-alex-one');
  assert.deepEqual(f.opened, ['space-alex-two', 'space-alex-one']);
  assert.deepEqual(currentIds(tree, f), ['space-alex-one']);
  assert.deepEqual(groups(tree, f).others, ['space-alex-one'], 'the previously open namesake drops out once it is no longer open');
  await unmount(tree);
});
