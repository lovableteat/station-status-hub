const assert = require('node:assert/strict');
const test = require('node:test');
const { React, create, act, loader } = require('../support/renderHarness.cjs');

const stamp = '2026-10-14T00:00:00.000Z';
function space(id, ownerId, name, username) {
  return { id, ownerId, name, description: `@${username}`, isPersonal: true, projectId: null, color: '#5fae94', createdAt: stamp, updatedAt: stamp };
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node.children.map(text).join('');
}
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

test('Chinese display names render once, with decorative person icons instead of repeated text avatars', async () => {
  const f = fixture([space('space-admin', 'admin-id', '管理員', 'admin-account'), space('space-liang', 'liang-id', '梁文樺', 'liang-account')]);
  let tree;
  await act(async () => { tree = create(React.createElement(f.Component)); });
  const rendered = rows(tree);
  assert.equal(rendered.length, 2);
  for (const row of rendered) {
    const button = openButton(row);
    const name = row.findByType('strong').children.join('');
    const account = row.findByType('small').children.join('');
    assert.equal(text(button), `${name}${account}${name === '管理員' ? '我' : ''}`);
    const icons = row.findAll(node => node.type === 'stub' && node.props.className === 'file-library-user-icon');
    assert.equal(icons.length, 1);
    assert.equal(icons[0].props['aria-hidden'], 'true');
    assert.equal(text(icons[0]), '');
    assert.equal(button.props['aria-label'], `開啟 ${name}（${account}） 的檔案空間`);
  }
  await act(async () => tree.unmount());
});

test('accounts sharing a display name remain separate by username and open their original space UUID', async () => {
  const f = fixture([space('space-alex-one', 'alex-one', 'Alex Chen', 'alex.one'), space('space-alex-two', 'alex-two', 'Alex Chen', 'alex.two')]);
  let tree;
  await act(async () => { tree = create(React.createElement(f.Component)); });
  const rendered = rows(tree);
  assert.equal(rendered.length, 2, 'same display names must not be deduplicated');
  assert.deepEqual(rendered.map(row => row.findByType('small').children.join('')), ['@alex.one', '@alex.two']);
  assert.deepEqual(rendered.map(row => openButton(row).props['aria-label']), [
    '開啟 Alex Chen（@alex.one） 的檔案空間', '開啟 Alex Chen（@alex.two） 的檔案空間',
  ]);
  assert.equal(openButton(rendered[0]).props['aria-current'], 'page');
  assert.equal(openButton(rendered[1]).props['aria-current'], undefined);
  assert.equal(rendered[0].findAll(node => node.type === 'stub' && text(node) === '我').length, 1);
  assert.equal(rendered[1].findAll(node => node.type === 'stub' && text(node) === '我').length, 0);
  await act(async () => { await openButton(rendered[1]).props.onClick(); tree.update(React.createElement(f.Component)); });
  assert.deepEqual(f.opened, ['space-alex-two']);
  const next = rows(tree);
  assert.equal(openButton(next[0]).props['aria-current'], undefined);
  assert.equal(openButton(next[1]).props['aria-current'], 'page');
  assert.equal(next[0].findAll(node => node.type === 'stub' && text(node) === '我').length, 1, 'ownership marker must not move with selection');
  await act(async () => tree.unmount());
});

test('long names and usernames retain their full text and busy state keeps navigation disabled', async () => {
  const name = 'Christopher Alexander Williamson 工程整合測試帳號';
  const username = 'christopher.alexander.williamson';
  const f = fixture([space('space-long', 'long-owner', name, username)]);
  let tree;
  await act(async () => { tree = create(React.createElement(f.Component)); });
  const row = rows(tree)[0];
  assert.equal(row.findByType('strong').children.join(''), name);
  assert.equal(row.findByType('small').children.join(''), `@${username}`);
  assert.equal(openButton(row).props.title, `${name} @${username}`);
  assert.equal(openButton(row).props.disabled, false);
  f.state.busy = true;
  await act(async () => tree.update(React.createElement(f.Component)));
  assert.equal(openButton(rows(tree)[0]).props.disabled, true);
  await act(async () => tree.unmount());
});
