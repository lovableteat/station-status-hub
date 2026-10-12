const test = require('node:test');
const assert = require('node:assert/strict');
const { React, act, create, loader, browser } = require('./support/renderHarness.cjs');

const childrenText = value => Array.isArray(value) ? value.map(childrenText).join('') : typeof value === 'string' ? value : value?.props ? childrenText(value.props.children) : '';

async function fixture(t, options = {}) {
  const window = browser();
  const presence = { totalOnlineUsers: 3, totalOnlineSessions: 5, connectionStatus: 'online', ...options.presence };
  if (options.initialCount) window.addEventListener('collaboration-unread-request', () => window.dispatchEvent(new CustomEvent('collaboration-unread-change', { detail: { count: options.initialCount } })));
  const load = loader({ window, mocks: {
    '@/hooks/useUserPresence': { useUserPresence: () => presence },
    '@/components/ui/button': { Button: ({ children, ...props }) => React.createElement('button', props, children) },
  } });
  const { CollaborationIndicator } = load('src/components/common/CollaborationIndicator.tsx');
  let root;
  await act(async () => { root = create(React.createElement(CollaborationIndicator, options.props)); });
  t.after(() => act(async () => root.unmount()));
  return { root, window, button: () => root.root.findByType('button') };
}

test('combined entry requests the current unread count when mounted after the notification center', async t => {
  const { button } = await fixture(t, { initialCount: 7 });
  assert.match(button().props['aria-label'], /7 則未讀/);
});

test('one combined menu dispatches each destination without opening or sending private messages', async t => {
  const { root, window } = await fixture(t);
  const opened = [];
  window.addEventListener('open-global-collaboration', event => opened.push(event.detail.tab));
  const items = root.root.findAll(node => typeof node.props.onSelect === 'function' && node.type === 'stub');
  const notifications = items.find(node => childrenText(node.props.children).startsWith('通知'));
  const members = items.find(node => childrenText(node.props.children).startsWith('線上人員'));
  assert.ok(notifications);
  assert.match(childrenText(members.props.children), /3 人在線/);
  assert.doesNotMatch(childrenText(members.props.children), /5 人/);
  await act(async () => { notifications.props.onSelect(); members.props.onSelect(); });
  assert.deepEqual(opened, ['notifications', 'online']);
});

test('unread changes reset the badge and reject invalid counts', async t => {
  const { root, window, button } = await fixture(t);
  const emit = async count => act(async () => window.dispatchEvent(new CustomEvent('collaboration-unread-change', { detail: { count } })));
  await emit(120);
  assert.match(button().props['aria-label'], /120 則未讀/);
  assert.match(JSON.stringify(root.toJSON()), /99\+/);
  for (const count of [0, -3, Infinity, 'invalid']) {
    await emit(count);
    assert.doesNotMatch(button().props['aria-label'], /則未讀/);
    assert.doesNotMatch(JSON.stringify(root.toJSON()), /99\+/);
  }
});

test('unavailable features stay out of the combined menu and disconnected presence is explicit', async t => {
  const { root, button } = await fixture(t, { initialCount: 2, props: { showNotifications: false }, presence: { connectionStatus: 'offline' } });
  const items = root.root.findAll(node => typeof node.props.onSelect === 'function' && node.type === 'stub');
  assert.equal(items.length, 1);
  assert.match(childrenText(items[0].props.children), /連線已中斷/);
  assert.doesNotMatch(button().props['aria-label'], /則未讀/);
});
