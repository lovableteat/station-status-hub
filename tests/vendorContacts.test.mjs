import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../src/components/material-requests/vendorContacts.ts", import.meta.url);
const source = existsSync(sourceUrl) ? await readFile(sourceUrl, "utf8") : "";
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contacts = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function contact(overrides = {}) {
  return { id: "original", vendor: "ACES", name: "Buyer", email: "buyer@example.com", cc: "", phone: "", note: "manual note", ...overrides };
}

test("email lists normalize separators, case and duplicates", () => {
  assert.equal(typeof contacts.normalizeContactEmails, "function");
  assert.equal(contacts.normalizeContactEmails(" A@Example.com; b@example.com, A@example.com\n C@example.com "), "a@example.com; b@example.com; c@example.com");
});

test("contact validation requires a vendor and valid To and CC addresses", () => {
  assert.equal(typeof contacts.validateVendorContact, "function");
  assert.deepEqual(contacts.validateVendorContact(contact()), []);
  assert.ok(contacts.validateVendorContact(contact({ vendor: " " })).some((message) => /廠商/.test(message)));
  assert.ok(contacts.validateVendorContact(contact({ email: "" })).some((message) => /收件/.test(message)));
  for (const email of ["not-an-email", "a@localhost", "a..b@example.com", ".a@example.com", "a@example.com\nBcc:bad@example.com"]) {
    assert.ok(contacts.validateVendorContact(contact({ email })).length > 0, email);
  }
  assert.ok(contacts.validateVendorContact(contact({ cc: "bad" })).some((message) => /副本/.test(message)));
});

test("preview validation rejects overlong fields and NUL before a database write", () => {
  const limits = { vendor: 200, name: 200, email: 2000, cc: 2000, phone: 160, note: 4000 };
  for (const [field, limit] of Object.entries(limits)) {
    assert.ok(contacts.validateVendorContact(contact({ [field]: "a".repeat(limit + 1) })).some(message => /長度|超過/.test(message)), field);
    assert.ok(contacts.validateVendorContact(contact({ [field]: `before\0after` })).some(message => /不允許|格式|控制/.test(message)), field);
  }
  const result = contacts.parseVendorContactRows([["Vendor", "Email", "Note"], ["ACES", "valid@example.com", "a".repeat(4001)]]);
  assert.equal(result.contacts.length, 0);
  assert.equal(result.issues[0].rowNumber, 2);
  assert.match(result.issues[0].message, /備註/);
});

test("imports Chinese columns after a title row and retains source row numbers for errors", () => {
  assert.equal(typeof contacts.parseVendorContactRows, "function");
  const result = contacts.parseVendorContactRows([
    ["供應商通訊錄"],
    ["廠商", "聯絡人", "電子郵件", "副本", "電話", "備註"],
    [" ACES ", " 王先生 ", " BUYER@example.com ", "cc@example.com", 123456, "人工可修改"],
    ["AMPHENOL", "Contact", "broken", "", "", ""],
    ["", "Contact", "valid@example.com"],
    [],
  ]);
  assert.equal(result.contacts.length, 1);
  assert.equal(typeof result.contacts[0].id, "string");
  assert.ok(result.contacts[0].id);
  assert.deepEqual({ ...result.contacts[0], id: "ignored" }, {
    id: "ignored", vendor: "ACES", name: "王先生", email: "buyer@example.com", cc: "cc@example.com", phone: "123456", note: "人工可修改",
  });
  assert.deepEqual(result.issues.map(({ rowNumber }) => rowNumber), [4, 5]);
  assert.ok(result.issues.every(({ message }) => message.length > 0));
});

test("recognizes common English headers and permits several contacts for one supplier", () => {
  const result = contacts.parseVendorContactRows([
    ["Supplier", "Contact", "E-mail", "CC", "Phone", "Note"],
    ["ACES", "One", "one@example.com"],
    ["ACES", "Two", "two@example.com"],
  ]);
  assert.equal(result.contacts.length, 2);
  assert.equal(new Set(result.contacts.map(({ id }) => id)).size, 2);
  assert.deepEqual(result.issues, []);
  for (const vendorHeader of ["Manufacturer", "Vendor", "供應商"]) {
    assert.equal(contacts.parseVendorContactRows([[vendorHeader, "To", "Name"], ["ACES", "a@example.com", "A"]]).contacts[0].name, "A");
  }
});

test("missing required header is explicit and malformed rows never disappear silently", () => {
  const result = contacts.parseVendorContactRows([["公司", "電話"], ["ACES", "123"]]);
  assert.equal(result.contacts.length, 0);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0].message, /廠商.*收件|廠商.*郵件/);
  const invalidCc = contacts.parseVendorContactRows([["Vendor", "Email", "CC"], ["ACES", "a@example.com", "invalid"]]);
  assert.equal(invalidCc.contacts.length, 0);
  assert.equal(invalidCc.issues[0].rowNumber, 2);
});

test("cell objects and prototype-looking vendor names are treated as untrusted data", () => {
  let converted = false;
  const unsafe = { toString() { converted = true; throw new Error("must not execute"); } };
  const result = contacts.parseVendorContactRows([
    ["Vendor", "Email", "Note"],
    ["__proto__", "a@example.com", unsafe],
    [unsafe, "b@example.com"],
  ]);
  assert.equal(converted, false);
  assert.equal(result.contacts[0].vendor, "__proto__");
  assert.equal(result.contacts[0].note, "");
  assert.equal(result.issues[0].rowNumber, 3);
  assert.equal({}.polluted, undefined);
});

test("merge skips duplicates without overwriting manually edited contacts", () => {
  assert.equal(typeof contacts.mergeVendorContacts, "function");
  const original = contact();
  const incoming = [
    contact({ id: "replace-attempt", vendor: " aces ", email: "BUYER@EXAMPLE.COM", note: "do not overwrite" }),
    contact({ id: "new", email: "another@example.com" }),
    contact({ id: "duplicate-new", email: "another@example.com" }),
  ];
  const result = contacts.mergeVendorContacts([original], incoming);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.contacts, [original, incoming[1]]);
  assert.equal(result.contacts[0], original);
  assert.equal(incoming.length, 3);
});

test("merge treats reordered recipient sets as the same contact", () => {
  const result = contacts.mergeVendorContacts(
    [contact({ email: "a@example.com; b@example.com" })],
    [contact({ id: "other", email: " B@example.com, A@example.com " })],
  );
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 1);
});

test("matching a vendor returns deduplicated To and CC without cross-vendor leakage", () => {
  assert.equal(typeof contacts.getVendorRecipients, "function");
  assert.deepEqual(contacts.getVendorRecipients([
    contact({ email: "A@example.com; b@example.com", cc: "cc@example.com; shared@example.com" }),
    contact({ id: "second", vendor: " aces ", email: "b@example.com; shared@example.com", cc: "cc@example.com" }),
    contact({ id: "unrelated", vendor: "AVNET", email: "private@example.com" }),
  ], " aces "), { to: "a@example.com; b@example.com; shared@example.com", cc: "cc@example.com" });
  assert.deepEqual(contacts.getVendorRecipients([contact()], "UNKNOWN"), { to: "", cc: "" });
});
