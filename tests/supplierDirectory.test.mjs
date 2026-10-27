import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const url = new URL('../src/components/material-requests/supplierDirectory.ts', import.meta.url);
const compiled = ts.transpileModule(existsSync(url) ? readFileSync(url, 'utf8') : '', { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const lib = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const sheet = (rows, extra = {}) => ({ file: 'anything.xlsx', sheet: 'Contacts', group: '採購', rows, merges: [], ...extra });

test('maps bilingual company, explicit brands and dirty emails without losing unknown columns', () => {
  assert.equal(typeof lib.parseSupplierSheet, 'function');
  const result = lib.parseSupplierSheet(sheet([
    ['Company list'], ['Vendor 中文', 'Vendor 英文', '代理原廠英文+中文', 'Contact Window中文', 'Contact Window英文', 'E-Mail Address', '分機', '未知欄位'],
    ['甲公司', 'Example', 'BrandX', '王先生', 'Alex', 'Mail: Alex <alex@example.com>, www.example.com', '0123', '保持原值'],
  ]));
  assert.equal(result.contacts.length, 1);
  const contact = result.contacts[0];
  assert.equal(contact.data.company, '甲公司');
  assert.equal(contact.data.aliases, 'Example');
  assert.equal(contact.data.brands, 'BrandX');
  assert.match(contact.data.name, /王先生.*Alex/);
  assert.equal(contact.data.email, 'alex@example.com');
  assert.equal(contact.data.extension, '0123');
  assert.ok(contact.source.raw.some(x => x.label === '未知欄位' && x.value === '保持原值'));
  assert.equal(contact.source.row, 3);
  assert.ok(result.issues.some(x => /Email/.test(x.message)));
});

test('fills actual merged company cells only and splits Sales and manager duplicate headers', () => {
  assert.equal(typeof lib.parseSupplierSheet, 'function');
  const result = lib.parseSupplierSheet(sheet([
    ['Item', 'Vendor', 'Sales', 'Email', 'TEL', 'manager', 'Email', 'TEL'],
    [1, 'Example', 'Alex', 'alex@example.com', '123', 'Kim', 'kim@example.com', '456'],
    [2, '', 'Pat', '', '789'], [3, '', 'Lost', 'lost@example.com'],
  ], { merges: [{ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }] }));
  assert.equal(result.contacts.length, 3);
  assert.equal(result.contacts[1].data.name, 'Kim');
  assert.equal(result.contacts[1].data.title, '主管');
  assert.equal(result.contacts[1].data.email, 'kim@example.com');
  assert.equal(result.contacts[2].data.company, 'Example');
  assert.equal(result.contacts[2].data.email, '');
  assert.ok(result.issues.some(x => x.row === 4 && /公司/.test(x.message)));
});

test('different headers can be mapped manually without relying on filenames', () => {
  assert.equal(typeof lib.parseSupplierSheet, 'function');
  const result = lib.parseSupplierSheet(sheet([['Organization new', 'Point person', 'Inbox'], ['Example', 'Alex', 'alex@example.com']]), { header: 0, columns: ['company', 'name', 'email'] });
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].data.company, 'Example');
});

test('diff survives filename and row changes; manual edits become conflicts and absence never deletes', () => {
  assert.equal(typeof lib.diffSupplierImport, 'function');
  const parsed = lib.parseSupplierSheet(sheet([['Vendor', 'Name', 'Email'], ['Example', 'Alex', 'alex@example.com'], ['Missing', 'Pat', 'pat@example.com']]));
  const existing = parsed.contacts.map((x, i) => ({ ...x, id: `old-${i}`, version: 2, imported: { ...x.data } }));
  const incoming = lib.parseSupplierSheet(sheet([['Vendor', 'Name', 'Email'], ['Example', 'Alex', 'new@example.com']], { file: 'updated.xls' })).contacts;
  let diff = lib.diffSupplierImport(existing, incoming, ['採購']);
  assert.equal(diff.filter(x => x.kind === 'changed').length, 1);
  assert.equal(diff.filter(x => x.kind === 'missing').length, 1);
  existing[0].data.email = 'manual@example.com';
  diff = lib.diffSupplierImport(existing, incoming, ['採購']);
  assert.equal(diff[0].kind, 'conflict');
  assert.ok(diff[0].fields.includes('email'));
});

test('ambiguous identities never pick the first contact; recipients use exact aliases and explicit brands', () => {
  assert.equal(typeof lib.getCompanyRecipients, 'function');
  const parsed = lib.parseSupplierSheet(sheet([['公司', 'Brand Name', 'Name', 'Email'], ['Example', 'BrandX', 'Alex', 'alex@example.com'], ['Example', 'BrandX', 'Pat', 'pat@example.com']])).contacts;
  assert.equal(lib.getCompanyRecipients(parsed, 'brandx').to, 'alex@example.com; pat@example.com');
  assert.equal(lib.getCompanyRecipients(parsed, 'Exam').to, '');
  const row = { ...parsed[0], id: 'one', version: 1, imported: parsed[0].data };
  const duplicate = { ...row, id: 'two' };
  assert.equal(lib.diffSupplierImport([row, duplicate], [{ ...parsed[0], data: { ...parsed[0].data, email: 'new@example.com' } }], ['採購'])[0].kind, 'ambiguous');
});

test('recipient matching tolerates legal company suffixes without guessing regional or technical aliases', () => {
  const contact = { data: { ...lib.emptySupplierData(), company: 'Distributor Example', brands: 'BrandX', email: 'contact@example.invalid' } };
  for (const vendor of ['BrandX Corporation', 'BrandX Co., Ltd.', 'BRANDX, INC.']) assert.equal(lib.getCompanyRecipients([contact], vendor).to, 'contact@example.invalid', vendor);
  for (const vendor of ['Brand', 'BrandX Technologies', 'BrandX North America', 'Other BrandX']) assert.equal(lib.getCompanyRecipients([contact], vendor).to, '', vendor);
});

test('an import preserves manual fields not changed in the source and rejects malformed manual email lists', () => {
  const row = lib.parseSupplierSheet(sheet([['Vendor', 'Name', 'Email', 'Note'], ['Example', 'Alex', 'old@example.com', 'original']])).contacts[0];
  const existing = { ...row, version: 1, data: { ...row.data, note: 'manual note' } };
  const incoming = { ...row, data: { ...row.data, email: 'new@example.com' } };
  const diff = lib.diffSupplierImport([existing], [incoming], ['採購'])[0];
  assert.equal(diff.kind, 'changed');
  const change = lib.supplierImportChange(diff);
  assert.equal(change.data.note, 'manual note');
  assert.equal(change.imported.note, 'original');
  assert.equal(change.data.email, 'new@example.com');
  for (const email of ['a@example.com\nBcc: b@example.com', 'not an address', '.a@example.com', 'a..b@example.com']) {
    assert.ok(lib.validateSupplierData({ ...row.data, email }).length, email);
  }
});

test('columns absent from a newer format never clear existing values or its import baseline', () => {
  const old = lib.parseSupplierSheet(sheet([['Vendor','Name','Email','Mobile'],['Example','Alex','old@example.com','0900000000']])).contacts[0];
  const updated = lib.parseSupplierSheet(sheet([['Email','Vendor','Name'],['new@example.com','Example','Alex']])).contacts[0];
  const diff = lib.diffSupplierImport([{ ...old, version: 1 }], [updated], ['採購'])[0];
  assert.deepEqual(diff.fields, ['email']);
  const change = lib.supplierImportChange(diff);
  assert.equal(change.data.mobile, '0900000000');
  assert.equal(change.imported.mobile, '0900000000');
});

test('bilingual person names keep a stable order when columns move', () => {
  const first = lib.parseSupplierSheet(sheet([['Vendor','CN NAME','EN NAME','Email'],['Example','王','Alex','a@example.com']])).contacts[0];
  const second = lib.parseSupplierSheet(sheet([['EN NAME','Email','Vendor','CN NAME'],['Alex','a@example.com','Example','王']])).contacts[0];
  assert.equal(first.data.name, second.data.name);
});

test('matching can use an explicit company alias when the new format omits brand and category', () => {
  const old = lib.parseSupplierSheet(sheet([['Vendor 中文','Vendor 英文','Brand','Category','Name','Email'],['甲公司','Example','BrandX','IC','Alex','old@example.com']])).contacts[0];
  const updated = lib.parseSupplierSheet(sheet([['Company Name','Name','Email'],['Example','Alex','new@example.com']])).contacts[0];
  const diff = lib.diffSupplierImport([{ ...old, version: 1 }], [updated], ['採購'])[0];
  assert.equal(diff.kind, 'changed');
  assert.equal(diff.existing.id, old.id);
  assert.equal(lib.supplierImportChange(diff).data.brands, 'BrandX');
});

test('repeat imports do not add nameless or identical duplicate rows and unknown column changes stay visible', () => {
  const original = lib.parseSupplierSheet(sheet([['Vendor','Name','Email','Phone','Other'],['Example','','','123','one'],['Second','Alex','a@example.com','','same'],['Second','Alex','a@example.com','','same']])).contacts;
  const existing = original.map(x => ({ ...x, version: 1 }));
  const repeat = lib.diffSupplierImport(existing, original, ['採購']);
  assert.ok(repeat.every(x => x.kind === 'unchanged'));
  const updated = lib.parseSupplierSheet(sheet([['Vendor','Name','Email','Phone','Other'],['Example','','','123','two']])).contacts;
  const change = lib.diffSupplierImport(existing, updated, ['採購'])[0];
  assert.equal(change.kind, 'changed');
  assert.equal(change.rawChanged, true);
});

test('an explicitly unavailable distributor uses the stated maker brand while retaining the original marker', () => {
  const result = lib.parseSupplierSheet(sheet([['Brand','Disty','Name','Email'],['Brand X','N/A','Alex','a@example.com']]));
  assert.equal(result.contacts[0].data.company, 'Brand X');
  assert.ok(result.contacts[0].source.raw.some(x => x.label === 'Disty' && x.value === 'N/A'));
});
