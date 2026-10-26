const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { React, act, create, deferred, loader, flush } = require('./support/renderHarness.cjs');
const XLSX = require('xlsx');

const ownerA = '11111111-1111-4111-8111-111111111111';
const ownerB = '22222222-2222-4222-8222-222222222222';
const contact = { id: '33333333-3333-4333-8333-333333333333', vendor: 'ACES', name: 'Buyer', email: 'buyer@example.com', cc: '', phone: '012345', note: 'original', updatedAt: '2026-10-26T01:00:00Z' };

async function fixture(storage = {}, open = true) {
  assert.ok(fs.existsSync('src/components/material-requests/useVendorContacts.ts'), 'vendor contact controller must exist');
  let session = { user: { userId: ownerA }, sessionMode: 'authenticated' };
  const reads = [], writes = [];
  const load = loader({ globals: { Error }, mocks: {
    '@/components/auth/UserContext': { useUser: () => session },
    './vendorContactsStorage': {
      loadVendorContacts: async (owner) => { reads.push(owner); return storage.load ? storage.load(owner) : [contact]; },
      saveVendorContact: async (...args) => { writes.push(args); return storage.save ? storage.save(...args) : { ...args[1], updatedAt: '2026-10-26T02:00:00Z' }; },
      importVendorContacts: async (...args) => storage.import ? storage.import(...args) : { added: args[1].length, skipped: 0 },
    },
  }});
  const { useVendorContacts } = load('src/components/material-requests/useVendorContacts.ts');
  let book;
  const renders = [];
  function Probe({ active }) { book = useVendorContacts(active); renders.push({ owner: book.ownerId, contacts: book.contacts.map((row) => row.id) }); return null; }
  let root;
  await act(async () => { root = create(React.createElement(Probe, { active: open })); });
  await flush();
  return {
    get book() { return book; }, reads, writes, renders, root,
    async update(owner, active = true, mode = 'authenticated') {
      session = { user: owner ? { userId: owner } : null, sessionMode: mode };
      await act(async () => { root.update(React.createElement(Probe, { active })); });
      await flush();
    },
  };
}

test('contact book loads only when opened with an authenticated owner', async () => {
  const f = await fixture({}, false);
  try {
    assert.deepEqual(f.reads, []);
    await f.update(ownerA, true, 'demo');
    assert.equal(f.book.canEdit, false);
    assert.deepEqual(Array.from(f.book.contacts), []);
    assert.deepEqual(f.reads, []);
    await f.update(ownerA);
    assert.deepEqual(f.reads, [ownerA]);
    assert.equal(f.book.contacts[0].note, 'original');
  } finally { await act(async () => f.root.unmount()); }
});

test('account-switch renders never expose previous contacts and stale reads cannot repopulate them', async () => {
  const old = deferred(), next = deferred();
  const f = await fixture({ load: owner => owner === ownerA ? old.promise : next.promise });
  try {
    const token = f.book.capture();
    await f.update(ownerB);
    assert.throws(() => f.book.assertCurrent(token), /帳號|權限/);
    await act(async () => old.resolve([contact]));
    assert.equal(f.book.contacts.length, 0);
    await act(async () => next.resolve([{ ...contact, id: 'new-owner-contact' }]));
    assert.deepEqual(Array.from(f.book.contacts, row => row.id), ['new-owner-contact']);
    assert.ok(f.renders.filter(row => row.owner === ownerB).every(row => !row.contacts.includes(contact.id)));
  } finally { await act(async () => f.root.unmount()); }
});

test('already-loaded old rows are hidden in the first render after switching owners', async () => {
  const next = deferred();
  const f = await fixture({ load: owner => owner === ownerA ? [contact] : next.promise });
  try {
    await f.update(ownerB);
    assert.equal(f.book.contacts.length, 0);
    assert.ok(f.renders.filter(row => row.owner === ownerB).every(row => row.contacts.length === 0));
    next.resolve([]);
    await flush();
  } finally { await act(async () => f.root.unmount()); }
});

test('load generations reject older reload results and closed-book responses', async () => {
  const first = deferred(), second = deferred();
  let count = 0;
  const f = await fixture({ load: () => ++count === 1 ? first.promise : second.promise });
  try {
    let loading;
    await act(async () => { loading = f.book.reload(); });
    await act(async () => second.resolve([{ ...contact, note: 'latest' }]));
    await loading;
    await act(async () => first.resolve([{ ...contact, note: 'stale' }]));
    assert.equal(f.book.contacts[0].note, 'latest');
    const pending = deferred();
    const g = await fixture({ load: () => pending.promise });
    try {
      await g.update(ownerA, false);
      await act(async () => pending.resolve([contact]));
      assert.equal(g.book.contacts.length, 0);
    } finally { await act(async () => g.root.unmount()); }
  } finally { await act(async () => f.root.unmount()); }
});

test('failed saves retain loaded contacts and successful saves use the expected version', async () => {
  let fail = true;
  const f = await fixture({ save: async (_owner, row) => { if (fail) throw new Error('network unavailable'); return { ...row, updatedAt: '2026-10-26T02:00:00Z' }; } });
  try {
    await act(async () => { await assert.rejects(f.book.save({ ...contact, note: 'edited' }, contact.updatedAt), /network unavailable/); });
    assert.equal(f.book.contacts[0].note, 'original');
    assert.match(f.book.error, /network unavailable/);
    assert.equal(f.book.busy, false);
    fail = false;
    await act(async () => { await f.book.save({ ...contact, note: 'edited' }, contact.updatedAt); });
    assert.equal(f.writes[1][0], ownerA);
    assert.equal(f.writes[1][2], contact.updatedAt);
    assert.equal(f.book.contacts[0].note, 'edited');
  } finally { await act(async () => f.root.unmount()); }
});

test('an in-flight save cannot update a replacement owner and captured scope expires on unmount', async () => {
  const pending = deferred();
  const f = await fixture({ save: () => pending.promise });
  let error;
  const token = f.book.capture();
  await act(async () => { void f.book.save({ ...contact, note: 'old-owner-edit' }).catch(value => { error = value; }); });
  await f.update(ownerB);
  await act(async () => pending.resolve({ ...contact, note: 'old-owner-edit' }));
  assert.match(error.message, /帳號|權限/);
  assert.equal(f.book.contacts[0].note, 'original');
  const currentToken = f.book.capture();
  assert.doesNotThrow(() => f.book.assertCurrent(currentToken));
  await act(async () => f.root.unmount());
  assert.throws(() => f.book.assertCurrent(token), /帳號|權限/);
  assert.throws(() => f.book.assertCurrent(currentToken), /帳號|權限/);
});

test('saving invalidates refreshes started during the write and blocks duplicate writes', async () => {
  const write = deferred(), stale = deferred();
  let reads = 0;
  const f = await fixture({ load: () => ++reads === 1 ? [contact] : stale.promise, save: () => write.promise });
  try {
    let saved, refreshed;
    await act(async () => { saved = f.book.save({ ...contact, note: 'new value' }); });
    await act(async () => { await assert.rejects(f.book.save(contact), /正在儲存/); refreshed = f.book.reload(); });
    await act(async () => write.resolve({ ...contact, note: 'new value' }));
    await saved;
    await act(async () => stale.resolve([contact]));
    await refreshed;
    assert.equal(f.writes.length, 1);
    assert.equal(f.book.contacts[0].note, 'new value');
  } finally { await act(async () => f.root.unmount()); }
});

test('a committed import with a failed refresh reports saved data rather than a failed write', async () => {
  let reads = 0, writes = 0;
  const f = await fixture({
    load: () => { if (++reads > 1) throw new Error('refresh offline'); return [contact]; },
    import: () => { writes++; return { added: 2, skipped: 1 }; },
  });
  try {
    let result;
    await act(async () => { result = await f.book.importContacts([contact]); });
    assert.equal(writes, 1);
    assert.equal(result.added, 2);
    assert.match(f.book.error, /已儲存.*重新載入/);
    assert.equal(f.book.contacts[0].note, 'original');
  } finally { await act(async () => f.root.unmount()); }
});

test('panel retains an edited draft when saving fails and provides clearable persistent search', async () => {
  assert.ok(fs.existsSync('src/components/material-requests/VendorContactsPanel.tsx'), 'vendor contact panel must exist');
  const load = loader({ globals: { Error } });
  const { VendorContactsPanel } = load('src/components/material-requests/VendorContactsPanel.tsx');
  const book = { ownerId: ownerA, canEdit: true, loading: false, busy: false, error: null, contacts: [contact], capture: () => ({}), assertCurrent() {}, reload: async () => {}, save: async () => { throw new Error('save failed, retry'); }, importContacts: async () => ({ added: 0, skipped: 0 }) };
  let root;
  await act(async () => { root = create(React.createElement(VendorContactsPanel, { book })); });
  const button = label => root.root.find(node => node.type === 'stub' && node.props['aria-label'] === label);
  try {
    await act(async () => button('編輯 ACES 聯絡人 Buyer').props.onClick());
    const input = root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '聯絡人備註');
    await act(async () => input.props.onChange({ target: { value: 'must remain after failure' } }));
    await act(async () => { await root.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    assert.equal(root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '聯絡人備註').props.value, 'must remain after failure');
    assert.match(JSON.stringify(root.toJSON()), /save failed, retry/);
    const search = root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '搜尋聯絡人');
    await act(async () => search.props.onChange({ target: { value: 'not present' } }));
    assert.match(JSON.stringify(root.toJSON()), /目前篩選條件沒有符合的聯絡人/);
    await act(async () => button('清除搜尋條件').props.onClick());
    assert.equal(root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '搜尋聯絡人').props.value, '');
  } finally { await act(async () => root.unmount()); }
});

function panelText(root) {
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node?.children ?? []);
  return text(root.toJSON());
}

function workbookFile(sheets) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return { name: '聯絡人.xlsx', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

async function panelFixture(overrides = {}) {
  const imported = [];
  const load = loader({ globals: { Error, TextDecoder } });
  const { VendorContactsPanel } = load('src/components/material-requests/VendorContactsPanel.tsx');
  const book = { ownerId: ownerA, canEdit: true, loading: false, busy: false, error: null, contacts: [contact], capture: () => ({ ownerId: ownerA }), assertCurrent() {}, reload: async () => {}, save: async row => row,
    importContacts: async rows => { imported.push(rows); return { added: rows.length, skipped: 0 }; }, ...overrides };
  let root;
  await act(async () => { root = create(React.createElement(VendorContactsPanel, { book })); });
  return {
    root, imported,
    async read(file) { await act(async () => { root.root.findByType('input').props.onChange({ currentTarget: { files: [file], value: 'chosen' } }); }); await flush(); },
    button(label) { return root.root.find(node => node.type === 'stub' && node.children.some(child => child === label)); },
  };
}

test('Excel import previews every sheet, formatted phone and rejected rows before any cloud write', async () => {
  const f = await panelFixture();
  try {
    const file = workbookFile([
      ['First', [['廠商', '聯絡人', 'Email', '電話'], ['ACES', 'manual duplicate', 'BUYER@example.com'], ['AVNET', 'New', 'new@example.com', { t: 'n', v: 12345, z: '000000' }]]],
      ['Second', [['Supplier', 'Contact', 'E-mail'], ['AMPHENOL', 'Two', 'two@example.com'], ['BROKEN', 'Bad', 'not-email']]],
    ]);
    await f.read(file);
    assert.equal(f.imported.length, 0, 'choosing a file is preview-only');
    assert.match(panelText(f.root), /預計新增 2 筆、重複跳過 1 筆/);
    assert.match(panelText(f.root), /異常 1 列不會匯入/);
    assert.match(panelText(f.root), /Second 第 3 列/);
    assert.match(panelText(f.root), /012345/);
    await act(async () => f.button('匯入 2 筆有效聯絡人').props.onClick());
    await flush();
    assert.equal(f.imported.length, 1);
    assert.deepEqual(Array.from(f.imported[0], row => row.vendor), ['AVNET', 'AMPHENOL']);
    assert.equal(f.imported[0][0].phone, '012345');
    assert.match(panelText(f.root), /已匯入 2 筆聯絡人/);
  } finally { await act(async () => f.root.unmount()); }
});

test('invalid file type and oversized files never read bytes or write contacts', async () => {
  const f = await panelFixture();
  let read = false;
  try {
    await f.read({ name: 'contacts.exe', size: 1, arrayBuffer: async () => { read = true; } });
    assert.match(panelText(f.root), /請選擇 Excel/);
    await f.read({ name: 'contacts.csv', size: 5 * 1024 * 1024 + 1, arrayBuffer: async () => { read = true; } });
    assert.match(panelText(f.root), /不可超過 5 MiB/);
    assert.equal(read, false);
    assert.equal(f.imported.length, 0);
  } finally { await act(async () => f.root.unmount()); }
});

test('imports over 5000 contacts are rejected explicitly without truncation or a cloud write', async () => {
  const f = await panelFixture();
  try {
    const rows = [['Vendor', 'Email'], ...Array.from({ length: 5001 }, (_, index) => ['Supplier', `person${index}@example.com`])];
    await f.read(workbookFile([['Contacts', rows]]));
    assert.match(panelText(f.root), /每次最多匯入 5000 筆/);
    assert.match(panelText(f.root), /此次尚未儲存任何資料/);
    assert.equal(f.imported.length, 0);
    assert.equal(f.root.root.findAll(node => node.props['aria-label'] === '聯絡清單匯入預覽').length, 0);
  } finally { await act(async () => f.root.unmount()); }
});

test('workbooks with more than 50 sheets are rejected before parsing contacts', async () => {
  const f = await panelFixture();
  try {
    await f.read(workbookFile(Array.from({ length: 51 }, (_, index) => [`S${index}`, [['Vendor', 'Email']]])));
    assert.match(panelText(f.root), /最多 50 張工作表/);
    assert.equal(f.imported.length, 0);
    assert.equal(f.root.root.findAll(node => node.props['aria-label'] === '聯絡清單匯入預覽').length, 0);
  } finally { await act(async () => f.root.unmount()); }
});

test('sparse wide worksheet ranges are rejected instead of scanning unlimited empty columns', async () => {
  const f = await panelFixture();
  try {
    const header = ['Vendor', 'Email'];
    header[256] = 'Unrelated';
    await f.read(workbookFile([['Wide', [header, ['ACES', 'new@example.com']]]]));
    assert.match(panelText(f.root), /最多 256 欄/);
    assert.equal(f.imported.length, 0);
  } finally { await act(async () => f.root.unmount()); }
});

test('CSV import preserves a phone number with leading zeros', async () => {
  const f = await panelFixture();
  try {
    const bytes = Buffer.from('Vendor,Email,Phone\r\nAVNET,new@example.com,001234\r\n');
    await f.read({ name: 'contacts.csv', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    assert.match(panelText(f.root), /001234/);
    await act(async () => f.button('匯入 1 筆有效聯絡人').props.onClick());
    await flush();
    assert.equal(f.imported[0][0].phone, '001234');
  } finally { await act(async () => f.root.unmount()); }
});

test('UTF-8 Chinese CSV imports correctly with and without a BOM', async () => {
  const f = await panelFixture();
  try {
    const content = '廠商,聯絡人,Email,電話,備註\r\n台灣供應商,王先生,buyer@example.com,001234,測試備註\r\n';
    for (const bom of ['', '\uFEFF']) {
      const bytes = Buffer.from(bom + content, 'utf8');
      await f.read({ name: '中文聯絡人.csv', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
      assert.doesNotMatch(panelText(f.root), /找不到廠商及收件人/);
      assert.match(panelText(f.root), /台灣供應商/);
      assert.match(panelText(f.root), /王先生/);
      await act(async () => f.button('匯入 1 筆有效聯絡人').props.onClick());
      await flush();
    }
    assert.equal(f.imported.length, 2);
    assert.ok(f.imported.every(rows => rows[0].vendor === '台灣供應商' && rows[0].name === '王先生' && rows[0].phone === '001234' && rows[0].note === '測試備註'));
  } finally { await act(async () => f.root.unmount()); }
});

test('Big5 Chinese CSV falls back from strict UTF-8 without garbling names or phone', async () => {
  const f = await panelFixture();
  try {
    const bytes = Buffer.from('BC74B0D32CC170B5B8A4482C456D61696C2CB971B8DC0D0AA578C657A8D1C0B3B0D32CA4FDA5FDA5CD2C6275796572406578616D706C652E636F6D2C3030313233340D0A', 'hex');
    await f.read({ name: 'Big5聯絡人.csv', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    assert.match(panelText(f.root), /台灣供應商/);
    assert.match(panelText(f.root), /王先生/);
    await act(async () => f.button('匯入 1 筆有效聯絡人').props.onClick());
    await flush();
    assert.equal(f.imported[0][0].vendor, '台灣供應商');
    assert.equal(f.imported[0][0].name, '王先生');
    assert.equal(f.imported[0][0].phone, '001234');
  } finally { await act(async () => f.root.unmount()); }
});

test('bytes invalid in UTF-8 and Big5 show an encoding error without an import preview', async () => {
  const f = await panelFixture();
  try {
    const bytes = Buffer.from([0x81]);
    await f.read({ name: 'invalid.csv', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    assert.match(panelText(f.root), /CSV.*編碼.*UTF-8.*Big5/);
    assert.equal(f.imported.length, 0);
    assert.equal(f.root.root.findAll(node => node.props['aria-label'] === '聯絡清單匯入預覽').length, 0);
  } finally { await act(async () => f.root.unmount()); }
});

test('truncated workbook row ranges are rejected rather than silently imported', async () => {
  const f = await panelFixture();
  try {
    await f.read(workbookFile([['TooMany', [['Vendor', 'Email'], ...Array.from({ length: 10001 }, () => ['Supplier', 'invalid'])]]]));
    assert.match(panelText(f.root), /超過 10000 列/);
    assert.equal(f.imported.length, 0);
    assert.equal(f.root.root.findAll(node => node.props['aria-label'] === '聯絡清單匯入預覽').length, 0);
  } finally { await act(async () => f.root.unmount()); }
});

test('total parsed data rows over 10000 across sheets are rejected explicitly', async () => {
  const f = await panelFixture();
  try {
    const sheets = Array.from({ length: 2 }, (_, index) => [`Rows${index}`, [['Vendor', 'Email'], ...Array.from({ length: 5001 }, () => ['Supplier', 'invalid'])]]);
    await f.read(workbookFile(sheets));
    assert.match(panelText(f.root), /合計最多 10000 列資料/);
    assert.equal(f.imported.length, 0);
  } finally { await act(async () => f.root.unmount()); }
});

test('a captured file read cannot create a preview after the account scope changes', async () => {
  const pending = deferred();
  let current = true, checks = 0;
  const f = await panelFixture({ assertCurrent: () => { checks++; if (!current) throw new Error('帳號已變更'); } });
  try {
    await f.read({ name: 'contacts.xlsx', size: 10, arrayBuffer: () => pending.promise });
    current = false;
    await act(async () => pending.resolve(new ArrayBuffer(0)));
    await flush();
    assert.equal(checks, 1);
    assert.match(panelText(f.root), /帳號已變更/);
    assert.equal(f.imported.length, 0);
    assert.equal(f.root.root.findAll(node => node.props['aria-label'] === '聯絡清單匯入預覽').length, 0);
  } finally { await act(async () => f.root.unmount()); }
});
