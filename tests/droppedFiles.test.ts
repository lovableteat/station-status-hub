import assert from "node:assert/strict";
import test from "node:test";

const module = await import(new URL("../src/lib/droppedFiles.ts", import.meta.url).href);
const { isFileDrag, readDroppedFiles, withRelativePath } = module as typeof import("../src/lib/droppedFiles.ts");

type Tree = { [name: string]: Tree | string };

function fileEntry(name: string, body: string) {
  return { isFile: true, isDirectory: false, name, file: (ok: (file: File) => void) => ok(new File([body], name)) };
}

function directoryEntry(name: string, tree: Tree, batchSize = 2) {
  const children = Object.entries(tree).map(([child, value]) => (typeof value === "string" ? fileEntry(child, value) : directoryEntry(child, value, batchSize)));
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader() {
      let offset = 0;
      // Like Chrome, hand the children out in batches and finish with an empty one.
      return { readEntries(ok: (entries: unknown[]) => void) { const batch = children.slice(offset, offset + batchSize); offset += batch.length; queueMicrotask(() => ok(batch)); } };
    },
  };
}

function transfer(entries: Array<ReturnType<typeof fileEntry> | ReturnType<typeof directoryEntry> | null>, files: File[] = []) {
  return {
    types: ["Files"],
    files,
    items: entries.map((entry) => ({ kind: "file", webkitGetAsEntry: () => entry })),
  } as unknown as DataTransfer;
}

test("a dropped folder is walked recursively with picker-style relative paths", async () => {
  const dropped = readDroppedFiles(transfer([
    directoryEntry("TEST2", { Netlist: { "pstxnet.dat": "n", "pstxprt.dat": "p", "pstchip.dat": "c" }, "bom.xlsx": "b", "sch.pdf": "s" }),
    fileEntry("extra.dsn", "d"),
  ]));
  assert.equal(dropped.hasDirectory, true);
  const files = await dropped.files;
  assert.deepEqual(files.map((file) => [file.name, file.webkitRelativePath || ""]).sort(), [
    ["bom.xlsx", "TEST2/bom.xlsx"],
    ["extra.dsn", ""],
    ["pstchip.dat", "TEST2/Netlist/pstchip.dat"],
    ["pstxnet.dat", "TEST2/Netlist/pstxnet.dat"],
    ["pstxprt.dat", "TEST2/Netlist/pstxprt.dat"],
    ["sch.pdf", "TEST2/sch.pdf"],
  ]);
});

test("plain file drops and browsers without entries fall back to dataTransfer.files", async () => {
  const plain = [new File(["x"], "a.pdf")];
  const onlyFiles = readDroppedFiles(transfer([fileEntry("a.pdf", "x")], plain));
  assert.equal(onlyFiles.hasDirectory, false);
  assert.deepEqual(await onlyFiles.files, plain);
  const noEntries = readDroppedFiles(transfer([null], plain));
  assert.equal(noEntries.hasDirectory, false);
  assert.deepEqual(await noEntries.files, plain);
});

test("drag type checks and relative path tagging", () => {
  assert.equal(isFileDrag({ types: ["Files"] } as unknown as DataTransfer), true);
  assert.equal(isFileDrag({ types: ["text/plain"] } as unknown as DataTransfer), false);
  assert.equal(isFileDrag(null), false);
  assert.equal(withRelativePath(new File(["x"], "a.dat"), "EVT/a.dat").webkitRelativePath, "EVT/a.dat");
});
