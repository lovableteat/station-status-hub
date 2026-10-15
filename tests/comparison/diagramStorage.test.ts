import assert from "node:assert/strict";
import test from "node:test";
import { deleteDiagram, listDiagrams, saveDiagram } from "../../src/components/comparison/diagramStorage.ts";
import type { DiagramDocument } from "../../src/components/comparison/diagramModel.ts";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const stamp = "2026-10-15T00:00:00.000Z";
const tick = () => new Promise(resolve => setImmediate(resolve));
const savedIndexedDB = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");

function document(id = "diagram-1", title = "未命名圖表", updatedAt = stamp): DiagramDocument {
  return { version: 1, id, title, createdAt: stamp, updatedAt, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
}

// A controllable IndexedDB event driver: writes stay staged until transaction
// completion, and a successful request can still be followed by an abort.
class IndexedDBDriver {
  records = new Map<string, { accountId: string; id: string; document: DiagramDocument }>();
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
                put: (value: { accountId: string; id: string; document: DiagramDocument }) => {
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

test("independent diagram storage isolates identical document IDs by canonical account UUID", async () => {
  const db = install();
  await saveDiagram(owner, document("same-id", "Owner drawing"));
  await saveDiagram(other, document("same-id", "Other drawing"));
  assert.equal((await listDiagrams(owner.toUpperCase()))[0].title, "Owner drawing");
  assert.equal((await listDiagrams(other))[0].title, "Other drawing");
  await deleteDiagram(owner, "same-id");
  assert.deepEqual(await listDiagrams(owner), []);
  assert.equal((await listDiagrams(other))[0].title, "Other drawing");
  assert.ok(db.connections.every(connection => connection.closed));
  assert.deepEqual(new Set(db.openedNames), new Set(["autocheck-diagrams-v1"]));
  assert.deepEqual(db.schema, { keyPath: ["accountId", "id"], index: "accountId" });
});

test("save snapshots caller data before opening the database and resolves only after transaction completion", async () => {
  const db = install();
  db.autoComplete = false;
  const original = document();
  let resolved = false;
  const pending = saveDiagram(owner, original).then(() => { resolved = true; });
  original.title = "Changed before open finished";
  original.viewport.zoom = 2;
  await tick();
  assert.equal(resolved, false);
  assert.equal(db.records.size, 0);
  assert.equal(db.connections[0].closed, false);
  db.transactions[0].complete();
  await pending;
  assert.equal(db.records.values().next().value?.document.title, "未命名圖表");
  assert.equal(db.records.values().next().value?.document.viewport.zoom, 1);
  assert.equal(db.connections[0].closed, true);
});

test("free arrows survive saving and reopening without any virtual canvas nodes", async () => {
  install();
  const doc = document("free-arrows");
  doc.edges = [{ id: "arrow", source: "", target: "", sourcePoint: { x: -125.5, y: 80 }, targetPoint: { x: 300, y: 270 }, lineType: "curve", arrowhead: "both", width: 5, style: "dashed", color: "#2563eb", label: "畫圖" }];
  await saveDiagram(owner, doc);
  const [reopened] = await listDiagrams(owner);
  assert.deepEqual(reopened, doc);
  reopened.edges[0].targetPoint!.x = 999;
  assert.deepEqual((await listDiagrams(owner))[0], doc);
  assert.deepEqual(reopened.nodes, []);
});

test("symbol rotation, net names, frame fills and crossing settings survive reopening", async () => {
  install();
  const doc = document("electrical-drawing");
  doc.nodes = [
    { id: "R1", x: 0, y: 0, width: 180, height: 120, shape: "resistor", label: "R1", detail: "10 kΩ", color: "#f97316", rotation: 90 },
    { id: "net", x: 300, y: 0, width: 180, height: 60, shape: "netlabel", label: "P3V3", detail: "", color: "#2563eb", fillColor: "#e2e8f0" },
  ];
  doc.edges = [{ id: "wire", source: "R1", target: "net", sourcePort: "bottom", targetPort: "left", color: "#f97316", label: "", jump: "arc", arrowhead: "both" }];
  await saveDiagram(owner, doc);
  assert.deepEqual((await listDiagrams(owner))[0], doc);
});

test("a successful write request followed by quota abort rejects and preserves the earlier saved document", async () => {
  const db = install();
  await saveDiagram(owner, document("same", "Saved before failure"));
  db.failNextCommit = true;
  await assert.rejects(saveDiagram(owner, document("same", "Must not commit")), /Quota exceeded/);
  assert.equal((await listDiagrams(owner))[0].title, "Saved before failure");
  assert.ok(db.connections.every(connection => connection.closed));
});

test("reads wait for transaction completion and return independently cloned documents sorted by update time", async () => {
  const db = install();
  await saveDiagram(owner, document("old", "Old"));
  await saveDiagram(owner, document("new", "New", "2026-10-15T01:00:00.000Z"));
  db.autoComplete = false;
  let resolved = false;
  const pending = listDiagrams(owner).then(value => { resolved = true; return value; });
  await tick();
  assert.equal(resolved, false);
  db.transactions.at(-1)!.complete();
  const documents = await pending;
  assert.deepEqual(documents.map(item => item.id), ["new", "old"]);
  documents[0].title = "Edited in memory";
  db.autoComplete = true;
  assert.equal((await listDiagrams(owner))[0].title, "New");
});

test("delete waits for commit; abort preserves the selected account's document", async () => {
  const db = install();
  await saveDiagram(owner, document());
  db.failNextCommit = true;
  await assert.rejects(deleteDiagram(owner, "diagram-1"), /Quota exceeded/);
  assert.equal((await listDiagrams(owner)).length, 1);
  db.autoComplete = false;
  let resolved = false;
  const pending = deleteDiagram(owner, "diagram-1").then(() => { resolved = true; });
  await tick();
  assert.equal(resolved, false);
  assert.equal(db.records.size, 1);
  db.transactions.at(-1)!.complete();
  await pending;
  assert.equal(db.records.size, 0);
});

test("invalid accounts and documents are rejected before opening or modifying any database", async () => {
  const db = install();
  for (const id of ["", "not-an-account", ` ${owner}`, null]) {
    await assert.rejects(saveDiagram(id as string, document()), /有效的登入帳號/);
    await assert.rejects(listDiagrams(id as string), /有效的登入帳號/);
    await assert.rejects(deleteDiagram(id as string, "diagram-1"), /有效的登入帳號/);
  }
  await assert.rejects(saveDiagram(owner, { ...document(), nodes: "invalid" } as unknown as DiagramDocument));
  await assert.rejects(deleteDiagram(owner, "../invalid"), /識別碼無效/);
  assert.equal(db.openedNames.length, 0);
});

test("foreign-account or corrupted records fail closed without erasing saved drawings", async () => {
  const db = install();
  await saveDiagram(owner, document());
  const saved = structuredClone([...db.records.values()]);
  db.forcedRead = [{ accountId: other, id: "diagram-1", document: document("diagram-1", "Foreign") }];
  await assert.rejects(listDiagrams(owner), /帳號資料不一致/);
  db.forcedRead = [{ accountId: owner, id: "different-id", document: document() }];
  await assert.rejects(listDiagrams(owner), /識別碼與儲存資料不一致/);
  db.forcedRead = [{ accountId: owner, id: "diagram-1", document: { ...document(), edges: "invalid" } }];
  await assert.rejects(listDiagrams(owner), /原有資料已保留/);
  assert.deepEqual([...db.records.values()], saved);
  assert.ok(db.connections.every(connection => connection.closed));
});

test("unavailable and blocked storage report actionable errors and close a late open connection", async () => {
  Reflect.deleteProperty(globalThis, "indexedDB");
  await assert.rejects(listDiagrams(owner), /不支援本機圖稿儲存/);
  const db = install();
  db.blocked = true;
  await assert.rejects(saveDiagram(owner, document()), /其他分頁占用/);
  db.blockedRequest?.();
  assert.equal(db.connections[0].closed, true);
  assert.equal(db.transactions.length, 0);
});
