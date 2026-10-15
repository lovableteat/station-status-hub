import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { deleteDrawioDocument, listDrawioDocuments, saveDrawioDocument } from "../../src/components/comparison/drawioStorage.ts";
import { MAX_DRAWIO_BYTES, type DrawioDocument } from "../../src/components/comparison/drawioDocument.ts";

const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || "../qa-tools", "package.json"));
const { JSDOM } = qa("jsdom");
const browser = new JSDOM();
const originalParser = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
Object.defineProperty(globalThis, "DOMParser", { configurable: true, value: browser.window.DOMParser });
test.after(() => {
  browser.window.close();
  if (originalParser) Object.defineProperty(globalThis, "DOMParser", originalParser);
  else Reflect.deleteProperty(globalThis, "DOMParser");
});

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const stamp = "2026-10-15T00:00:00.000Z";
const tick = () => new Promise(resolve => setImmediate(resolve));
const savedIndexedDB = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");

function document(id = "drawio-1", title = "未命名圖表", updatedAt = stamp): DrawioDocument {
  return { version: 1, id, title, createdAt: stamp, updatedAt, xml: '<mxfile><diagram id="page-1" name="First">compressed-page-payload</diagram><diagram id="page-2" name="Second"><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>' };
}

// A controllable IndexedDB event driver: writes stay staged until transaction
// completion, and a successful request can still be followed by an abort.
class IndexedDBDriver {
  records = new Map<string, { accountId: string; id: string; document: DrawioDocument }>();
  connections: Array<{ closed: boolean; close(): void }> = [];
  transactions: Array<{ complete(): void; abort(): void }> = [];
  openedNames: string[] = [];
  initialized = false;
  autoComplete = true;
  failNextCommit = false;
  blocked = false;
  blockedRequest: (() => void) | null = null;
  forcedRead: unknown[] | null = null;
  schema: { keyPath?: string[]; index?: string } = {};

  open(name: string, version: number) {
    this.openedNames.push(name);
    assert.equal(version, 1);
    const request = { result: undefined as unknown, error: null, onupgradeneeded: null as null | (() => void), onblocked: null as null | (() => void), onerror: null as null | (() => void), onsuccess: null as null | (() => void) };
    const ready = () => {
      const db = {
        closed: false,
        onversionchange: null as null | (() => void),
        close() { this.closed = true; },
        createObjectStore: (store: string, options: { keyPath: string[] }) => {
          assert.equal(store, "documents");
          this.schema.keyPath = options.keyPath;
          return { createIndex: (index: string, key: string) => { assert.equal(index, "accountId"); this.schema.index = key; } };
        },
        transaction: (storeName: string, mode: string) => {
          assert.equal(storeName, "documents");
          const staged: Array<() => void> = [];
          let finished = false;
          const tx = {
            error: null as Error | null,
            oncomplete: null as null | (() => void),
            onerror: null as null | (() => void),
            onabort: null as null | (() => void),
            complete: () => {
              if (finished) return;
              if (this.failNextCommit) { this.failNextCommit = false; tx.error = new Error("Quota exceeded after request success"); tx.abort(); return; }
              finished = true;
              staged.forEach(operation => operation());
              tx.oncomplete?.();
            },
            abort: () => {
              if (finished) return;
              finished = true;
              queueMicrotask(() => { if (tx.error) tx.onerror?.(); tx.onabort?.(); });
            },
            objectStore: () => {
              const request = (result: unknown, operation?: () => void) => {
                if (operation) staged.push(operation);
                const request = { result, onsuccess: null as null | (() => void) };
                queueMicrotask(() => {
                  if (finished) return;
                  request.onsuccess?.();
                  if (this.autoComplete) queueMicrotask(tx.complete);
                });
                return request;
              };
              return {
                put: (value: { accountId: string; id: string; document: DrawioDocument }) => {
                  assert.equal(mode, "readwrite");
                  const copy = structuredClone(value);
                  return request(undefined, () => this.records.set(JSON.stringify([copy.accountId, copy.id]), copy));
                },
                delete: (key: string[]) => {
                  assert.equal(mode, "readwrite");
                  return request(undefined, () => { this.records.delete(JSON.stringify(key)); });
                },
                index: (name: string) => {
                  assert.equal(name, "accountId");
                  return { getAll: (accountId: string) => request(structuredClone(this.forcedRead ?? [...this.records.values()].filter(row => row.accountId === accountId))) };
                },
              };
            },
          };
          this.transactions.push(tx);
          return tx;
        },
      };
      this.connections.push(db);
      request.result = db;
      if (!this.initialized) { this.initialized = true; request.onupgradeneeded?.(); }
      request.onsuccess?.();
    };
    queueMicrotask(() => {
      if (this.blocked) { this.blockedRequest = ready; request.onblocked?.(); }
      else ready();
    });
    return request;
  }
}

function install(): IndexedDBDriver {
  const driver = new IndexedDBDriver();
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, writable: true, value: driver });
  return driver;
}

test.afterEach(() => {
  if (savedIndexedDB) Object.defineProperty(globalThis, "indexedDB", savedIndexedDB);
  else Reflect.deleteProperty(globalThis, "indexedDB");
});

test("native DRAWIO storage uses an independent database and isolates canonical account UUIDs", async () => {
  const db = install();
  await saveDrawioDocument(owner, document("same-id", "Owner drawing"));
  await saveDrawioDocument(other, document("same-id", "Other drawing"));
  assert.equal((await listDrawioDocuments(owner.toUpperCase()))[0].title, "Owner drawing");
  assert.equal((await listDrawioDocuments(other))[0].title, "Other drawing");
  await deleteDrawioDocument(owner, "same-id");
  assert.deepEqual(await listDrawioDocuments(owner), []);
  assert.equal((await listDrawioDocuments(other))[0].title, "Other drawing");
  assert.ok(db.connections.every(connection => connection.closed));
  assert.deepEqual(new Set(db.openedNames), new Set(["autocheck-drawio-v1"]));
  assert.deepEqual(db.schema, { keyPath: ["accountId", "id"], index: "accountId" });
});

test("save snapshots raw XML before opening and waits for the whole transaction to commit", async () => {
  const db = install();
  db.autoComplete = false;
  const original = document();
  const xml = original.xml;
  let resolved = false;
  const pending = saveDrawioDocument(owner, original).then(() => { resolved = true; });
  original.title = "Caller mutation";
  original.xml = "<mxGraphModel/>";
  await tick();
  assert.equal(resolved, false);
  assert.equal(db.records.size, 0);
  assert.equal(db.connections[0].closed, false);
  db.transactions[0].complete();
  await pending;
  const [saved] = db.records.values();
  assert.equal(saved.document.title, "未命名圖表");
  assert.equal(saved.document.xml, xml);
  assert.equal(db.connections[0].closed, true);
});

test("compressed payload, every page and XML whitespace survive save and reopen without conversion", async () => {
  install();
  const input = document();
  input.xml = `\uFEFF<?xml version="1.0"?>\n${input.xml}\n`;
  await saveDrawioDocument(owner, input);
  const [reopened] = await listDrawioDocuments(owner);
  assert.deepEqual(reopened, input);
  assert.equal(Buffer.compare(Buffer.from(reopened.xml), Buffer.from(input.xml)), 0);
  reopened.xml = "<mxGraphModel/>";
  assert.equal((await listDrawioDocuments(owner))[0].xml, input.xml);
});

test("a quota abort after request success preserves the prior saved DRAWIO document", async () => {
  const db = install();
  await saveDrawioDocument(owner, document("same", "Saved before failure"));
  db.failNextCommit = true;
  await assert.rejects(saveDrawioDocument(owner, document("same", "Must not commit")), /Quota exceeded/);
  assert.equal((await listDrawioDocuments(owner))[0].title, "Saved before failure");
  assert.ok(db.connections.every(connection => connection.closed));
});

test("reads wait for completion, sort by update and ID, and return detached plain records", async () => {
  const db = install();
  await saveDrawioDocument(owner, document("old", "Old"));
  await saveDrawioDocument(owner, document("new-z", "New Z", "2026-10-15T01:00:00.000Z"));
  await saveDrawioDocument(owner, document("new-a", "New A", "2026-10-15T01:00:00.000Z"));
  db.autoComplete = false;
  let resolved = false;
  const pending = listDrawioDocuments(owner).then(value => { resolved = true; return value; });
  await tick();
  assert.equal(resolved, false);
  db.transactions.at(-1)!.complete();
  const documents = await pending;
  assert.deepEqual(documents.map(item => item.id), ["new-a", "new-z", "old"]);
  documents[0].title = "Changed in memory";
  db.autoComplete = true;
  assert.equal((await listDrawioDocuments(owner))[0].title, "New A");
});

test("deletion waits for commit and an abort retains the account's original XML", async () => {
  const db = install();
  await saveDrawioDocument(owner, document());
  db.failNextCommit = true;
  await assert.rejects(deleteDrawioDocument(owner, "drawio-1"), /Quota exceeded/);
  assert.equal((await listDrawioDocuments(owner)).length, 1);
  db.autoComplete = false;
  let resolved = false;
  const pending = deleteDrawioDocument(owner, "drawio-1").then(() => { resolved = true; });
  await tick();
  assert.equal(resolved, false);
  assert.equal(db.records.size, 1);
  db.transactions.at(-1)!.complete();
  await pending;
  assert.equal(db.records.size, 0);
});

test("invalid accounts, malformed XML, byte bounds and accessors reject before the database opens", async () => {
  const db = install();
  for (const accountId of ["", "not-an-account", ` ${owner}`, null]) {
    await assert.rejects(saveDrawioDocument(accountId as string, document()), /有效的登入帳號/);
    await assert.rejects(listDrawioDocuments(accountId as string), /有效的登入帳號/);
    await assert.rejects(deleteDrawioDocument(accountId as string, "drawio-1"), /有效的登入帳號/);
  }
  await assert.rejects(saveDrawioDocument(owner, { ...document(), xml: "<mxfile>" }));
  await assert.rejects(saveDrawioDocument(owner, { ...document(), xml: "x".repeat(MAX_DRAWIO_BYTES + 1) }), /20 MB/);
  let invoked = false;
  const accessor = document();
  Object.defineProperty(accessor, "xml", { get() { invoked = true; return "<mxGraphModel/>"; } });
  await assert.rejects(saveDrawioDocument(owner, accessor), /存取器/);
  await assert.rejects(deleteDrawioDocument(owner, "../invalid"), /識別碼無效/);
  assert.equal(invoked, false);
  assert.equal(db.openedNames.length, 0);
});

test("corrupt or foreign records fail closed and preserve every previously saved drawing", async () => {
  const db = install();
  await saveDrawioDocument(owner, document());
  const snapshot = structuredClone([...db.records.values()]);
  db.forcedRead = [{ accountId: other, id: "drawio-1", document: document() }];
  await assert.rejects(listDrawioDocuments(owner), /帳號資料不一致/);
  db.forcedRead = [{ accountId: owner, id: "different", document: document() }];
  await assert.rejects(listDrawioDocuments(owner), /識別碼與儲存資料不一致/);
  db.forcedRead = [{ accountId: owner, id: "drawio-1", document: { ...document(), xml: "<mxfile>" } }];
  await assert.rejects(listDrawioDocuments(owner), /原有資料已保留/);
  assert.deepEqual([...db.records.values()], snapshot);
  assert.ok(db.connections.every(connection => connection.closed));
});

test("missing and blocked IndexedDB errors offer native backup and close late connections", async () => {
  Reflect.deleteProperty(globalThis, "indexedDB");
  await assert.rejects(listDrawioDocuments(owner), /匯出 \.drawio/);
  const db = install();
  db.blocked = true;
  await assert.rejects(saveDrawioDocument(owner, document()), /其他分頁占用/);
  db.blockedRequest?.();
  assert.equal(db.connections[0].closed, true);
  assert.equal(db.transactions.length, 0);
});

test("a denied database open rejects with a native backup instruction", async () => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open() { throw new Error("Denied"); } } });
  await assert.rejects(saveDrawioDocument(owner, document()), /無法開啟.*匯出 \.drawio/);
});
