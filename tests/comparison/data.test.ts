import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import JSZip from "jszip";
import { filePath, inspectRevision, readRevision, selectedRevisionFiles, validateRevision } from "../../src/components/comparison/files.ts";
import { exportBackup, importBackup } from "../../src/components/comparison/backup.ts";
import { listSessions, parseSessionSnapshot, readLibrary, saveLibrary, saveSession } from "../../src/components/comparison/storage.ts";
import type { ComparisonSession } from "../../src/components/comparison/types.ts";

const MiB = 1024 * 1024;

function input(path: string, size = 4): File {
  return { name: path.split("/").at(-1), webkitRelativePath: path, size, arrayBuffer: async () => new ArrayBuffer(size) } as File;
}

function revision(): File[] {
  return ["pstxnet.dat", "pstxprt.dat", "pstchip.dat", "bom.csv", "schematic.pdf"].map(name => input(`board/${name}`));
}

function session(): ComparisonSession {
  return {
    version: 1, projectName: "PDB", id: JSON.stringify(["PDB", "A", "B"]), savedAt: "2026-10-12T01:00:00.000Z",
    result: {
      meta: { tool_version: "1", generated: "2026-10-12 09:00:00", a: { label: "A", sources: [] }, b: { label: "B", sources: [] } },
      findings: [], rows: [{ key: "RULE|U1", gid: "DRC-1", category: "DRC", rule: "RULE", severity: "WARN", status: "OPEN", page: 1, page_title: "Power", refdes: ["U1"], pins: ["U1.1"], nets: ["VCC"], title: "Check", detail: "detail", related: [], dest: "RULE_U1" }],
      overview: [], capRows: [], railTodo: [], railDomain: [], powerTree: {}, powerTreeA: {}, i2cMap: {}, i2cMapA: {}, inputIssues: [], warnings: [], library: [],
      artifacts: [{ key: "report", name: "報告.pdf", mime: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.7\n").buffer }],
    },
    replies: { "RULE|U1": { disp: "確認", owner: "RD", target_rev: "C", note: "check", filled: "2026-10-12" } },
    history: [{ key: "RULE|U1", field: "owner", old: "", value: "RD", at: "2026-10-12T01:00:00.000Z" }],
  };
}

test("recognizes original loader roles and excludes generated PDFs and declared I2C BOM candidates", () => {
  const files = [...revision().filter(file => !/\.(csv|pdf)$/.test(file.name)), input("board/ERP.xlsx"), input("board/main.dsn"), input("board/main.pdf"), input("board/AutoCheck.pdf"), input("board/i2c_map_declared.csv")];
  const inventory = inspectRevision(files);
  assert.equal(inventory.roles.pstxnet.length, 1);
  assert.equal(inventory.roles.bom[0].name, "ERP.xlsx");
  assert.equal(inventory.roles.pdf[0].name, "main.pdf");
  assert.equal(inventory.ignored, 2);
  assert.deepEqual(validateRevision(inventory, {}), []);
});

test("blocks missing netlists and requires choosing among role candidates", async () => {
  assert.match(validateRevision(inspectRevision([input("pstxnet.dat")]), {}).join(" "), /pstxprt/);
  const inventory = inspectRevision([...revision(), input("other/pstxnet.dat")]);
  assert.match(validateRevision(inventory, {}).join(" "), /pstxnet/);
  const chosen = { pstxnet: "other/pstxnet.dat" };
  assert.deepEqual(validateRevision(inventory, chosen), []);
  const read = await readRevision(inventory, chosen);
  assert.equal(read.length, 5);
  assert.equal(read[0].path, "other/pstxnet.dat");
  assert.equal(read[0].bytes.byteLength, 4);
  assert.match(validateRevision(inventory, { pstxnet: "missing.dat" }).join(" "), /不存在/);
});

test("requires Netlist, BOM and circuit PDF while DSN stays optional", async () => {
  const complete = revision();
  for (const name of ["bom.csv", "schematic.pdf", "pstxnet.dat", "pstxprt.dat", "pstchip.dat"]) {
    const missing = inspectRevision(complete.filter(file => file.name !== name));
    assert.match(validateRevision(missing).join(" "), /缺少/);
    await assert.rejects(() => readRevision(missing), /缺少/);
  }
  const inventory = inspectRevision([...complete, input("board/main.dsn"), input("board/readme.md")]);
  const read = await readRevision(inventory, { dsn: "" });
  assert.equal(read.length, 5);
  assert.ok(read.some(file => file.path === "board/bom.csv"));
  assert.ok(read.some(file => file.path === "board/schematic.pdf"));
  assert.ok(!read.some(file => file.path.endsWith(".dsn") || file.path.endsWith(".md")));
  for (const role of ["bom", "pdf"] as const) {
    assert.match(validateRevision(inventory, { [role]: "" }).join(" "), /一定要選/);
    await assert.rejects(() => readRevision(inventory, { [role]: "" }), /一定要選/);
  }
  assert.equal(filePath({ name: "pstchip.dat" } as File), "pstchip.dat");
});

test("required BOM and PDF ambiguities must be resolved and are never recognized as DAT netlists", async () => {
  const inventory = inspectRevision([...revision(), input("board/other.csv"), input("board/other.pdf"), input("board/bom.dat"), input("board/pdf.dat")]);
  assert.equal(inventory.roles.bom.length, 2);
  assert.equal(inventory.roles.pdf.length, 2);
  assert.match(validateRevision(inventory).join(" "), /BOM.*好幾份/);
  assert.match(validateRevision(inventory).join(" "), /PDF.*好幾份/);
  const selected = { bom: "board/other.csv", pdf: "board/other.pdf" };
  assert.deepEqual(validateRevision(inventory, selected), []);
  const read = await readRevision(inventory, selected);
  assert.equal(read.length, 5);
  assert.ok(read.some(file => file.path === selected.bom));
  assert.ok(read.some(file => file.path === selected.pdf));
});

test("rejects unsafe and case-insensitive duplicate input paths", async () => {
  for (const path of ["../pstxnet.dat", "/pstxnet.dat", "C:/pstxnet.dat", "a/../pstxnet.dat", "a\\pstxnet.dat", "a//pstxnet.dat", "./pstxnet.dat"]) {
    const inventory = inspectRevision([...revision(), input(path)]);
    assert.ok(validateRevision(inventory, {}).length, path);
    await assert.rejects(readRevision(inventory, {}), /路徑/);
  }
  const duplicate = inspectRevision([...revision(), input("BOARD/PSTXNET.DAT")]);
  assert.match(validateRevision(duplicate, { pstxnet: "board/pstxnet.dat" }).join(" "), /重複/);
});

test("worker preflight counts only selected sources without reading file buffers", () => {
  let reads = 0;
  const files = [...revision(), input("board/other.csv"), input("board/main.dsn"), input("board/notes.txt")];
  for (const file of files) file.arrayBuffer = async () => { reads++; throw new Error("Preflight must not read file bytes"); };
  const selected = selectedRevisionFiles(inspectRevision(files), { bom: "board/other.csv", dsn: "" });
  assert.equal(selected.length, 5);
  assert.ok(selected.some(file => filePath(file) === "board/other.csv"));
  assert.ok(!selected.some(file => /bom\.csv|main\.dsn|notes\.txt/.test(filePath(file))));
  assert.equal(reads, 0);
});

test("bounds all picked files before reading, including files later ignored", async () => {
  for (const files of [[...revision(), input("ignored.bin", 64 * MiB + 1)], [...revision(), ...[1, 2, 3].map(n => input(`${n}.bin`, 48 * MiB))], [...revision(), ...Array.from({ length: 1000 }, (_, n) => input(`${n}.bin`))]]) {
    const inventory = inspectRevision(files);
    assert.ok(validateRevision(inventory, {}).length);
    await assert.rejects(readRevision(inventory, {}));
  }
});

test("validates complete snapshots and preserves replies for keys removed by a rerun", () => {
  const valid = session();
  valid.replies["OLD|U2"] = { disp: "", owner: "old", target_rev: "", note: "", filled: "" };
  assert.equal(parseSessionSnapshot(valid).replies["OLD|U2"].owner, "old");
});

test("rejects malformed or conflicting snapshot metadata, rows, replies, history and artifacts", () => {
  const changes: ((value: ComparisonSession) => void)[] = [
    value => { value.version = 2 as 1; },
    value => { value.id = "A_vs_B"; },
    value => { value.projectName = ""; },
    value => { value.savedAt = "not a date"; },
    value => { value.result.meta.b.label = ""; },
    value => { value.result.rows[0].page = -1; },
    value => { value.result.rows[0].category = ""; },
    value => { value.result.rows[0].category = "__proto__"; },
    value => { value.result.rows[0].status = "constructor"; },
    value => { value.result.rows.push(value.result.rows[0]); },
    value => { value.result.rows = Array(100001).fill(value.result.rows[0]); },
    value => { value.result.rows[0].pins = [3] as unknown as string[]; },
    value => { value.replies["RULE|U1"].owner = 4 as unknown as string; },
    value => { value.history[0].field = "script" as "owner"; },
    value => { value.result.artifacts[0].name = "../report.pdf"; },
    value => { value.result.artifacts[0].name = "report.js"; },
    value => { value.result.artifacts[0].mime = "text/html"; },
    value => { value.result.artifacts[0] = { key: "schematic", name: "payload.html", mime: "text/html", bytes: new TextEncoder().encode("<script>alert(1)</script>").buffer }; },
    value => { value.result.artifacts[0].bytes = {} as ArrayBuffer; },
    value => { delete (value.result as unknown as Record<string, unknown>).powerTreeA; },
  ];
  for (const change of changes) {
    const invalid = structuredClone(session());
    change(invalid);
    assert.throws(() => parseSessionSnapshot(invalid), /工作階段/);
  }
  assert.throws(() => parseSessionSnapshot(JSON.parse('{"__proto__": {"polluted": true}}')), /工作階段/);
});

test("only actual PDF artifacts can be used as the schematic navigation target", async () => {
  const valid = session();
  valid.result.artifacts[0].key = "schematic";
  valid.result.artifacts[0].bytes = new TextEncoder().encode("%PDF-1.7\n").buffer;
  assert.equal(parseSessionSnapshot(valid).result.artifacts[0].mime, "application/pdf");
  valid.result.artifacts[0].bytes = new TextEncoder().encode("<script>alert(1)</script>").buffer;
  assert.throws(() => parseSessionSnapshot(valid), /PDF/);
});

test("backup round trip retains reports, replies, history and project identity", async () => {
  const valid = session();
  valid.libraryYaml = "parts: []";
  const blob = await exportBackup(valid);
  const restored = await importBackup(new File([blob], "backup.zip"));
  assert.deepEqual(restored, valid);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.ok(zip.file("session.json"));
  assert.ok(Object.keys(zip.files).some(path => path.startsWith("reports/") && path.endsWith(".pdf")));
});

test("backup preserves all native DRAWIO comparison pages byte-for-byte alongside legacy reports and rejects altered MIME metadata", async () => {
  const valid = session();
  const legacy = structuredClone(valid.result.artifacts[0]);
  for (const [kind, revision] of [["power", "a"], ["power", "b"], ["i2c", "a"], ["i2c", "b"]] as const) {
    const key = `${kind}_drawio_${revision}`;
    const model = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="U1" value="${kind} ${revision} · 電源 &amp; I²C" vertex="1" parent="1"><mxGeometry x="40" y="80" width="160" height="60" as="geometry"/></mxCell></root></mxGraphModel>`;
    const compressed = deflateRawSync(encodeURIComponent(model)).toString("base64");
    const xml = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="AutoCheck" custom="${key}">\n<diagram id="compressed-page" name="壓縮電路頁">${compressed}</diagram>\n<diagram id="editable-page" name="另一頁">${model}</diagram>\n</mxfile>\n`;
    valid.result.artifacts.push({ key, name: `${key}.drawio`, mime: "application/vnd.jgraph.mxfile", bytes: new TextEncoder().encode(xml).buffer });
  }
  const blob = await exportBackup(valid);
  const restored = await importBackup(new File([blob], "native-drawio.autocheck.zip"));
  assert.deepEqual(restored, valid);
  assert.deepEqual(restored.result.artifacts[0], legacy, "existing PDF report remains unchanged");
  assert.deepEqual(restored.result.artifacts.slice(1).map(artifact => artifact.key), ["power_drawio_a", "power_drawio_b", "i2c_drawio_a", "i2c_drawio_b"]);
  for (const original of valid.result.artifacts.slice(1)) {
    const artifact = restored.result.artifacts.find(item => item.key === original.key)!;
    assert.equal(artifact.mime, "application/vnd.jgraph.mxfile");
    assert.deepEqual(new Uint8Array(artifact.bytes), new Uint8Array(original.bytes), `${original.key}: BOM, compressed pages and UTF-8 labels survive unchanged`);
  }
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.equal(Object.keys(archive.files).filter(path => path.endsWith(".drawio")).length, 4);
  const metadata = JSON.parse(await archive.file("session.json")!.async("string"));
  for (const original of valid.result.artifacts.slice(1)) {
    const altered = structuredClone(metadata);
    altered.result.artifacts.find((artifact: { key: string }) => artifact.key === original.key).mime = "text/xml";
    const zip = archive.clone().file("session.json", JSON.stringify(altered));
    await assert.rejects(importBackup(new File([await zip.generateAsync({ type: "uint8array" })], "wrong-drawio-mime.zip")), /MIME 與檔名不一致/);
  }
});

test("backup import rejects missing/unreferenced reports and sanitized traversal entries", async () => {
  const base = await JSZip.loadAsync(await (await exportBackup(session())).arrayBuffer());
  const reportPath = Object.keys(base.files).find(path => path.startsWith("reports/") && !base.files[path].dir)!;
  const missing = base.clone().remove(reportPath);
  await assert.rejects(importBackup(new File([await missing.generateAsync({ type: "uint8array" })], "missing.zip")), /報表/);
  const unknown = base.clone().file("reports/unknown.txt", "extra");
  await assert.rejects(importBackup(new File([await unknown.generateAsync({ type: "uint8array" })], "unknown.zip")), /報表/);
  const traversal = base.clone().file("../hidden.txt", "secret");
  await assert.rejects(importBackup(new File([await traversal.generateAsync({ type: "uint8array" })], "unsafe.zip")), /路徑/);
});

test("backup rejects archive size declarations, duplicate paths and unsupported payloads", async () => {
  const blob = await exportBackup(session());
  const oversized = { size: 128 * MiB + 1, arrayBuffer: async () => { throw new Error("must not read"); } } as File;
  await assert.rejects(importBackup(oversized), /128/);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let central = -1;
  for (let n = 0; n < bytes.length - 46; n++) if (view.getUint32(n, true) === 0x02014b50) { central = n; break; }
  assert.ok(central >= 0);
  view.setUint32(central + 24, 256 * MiB + 1, true);
  await assert.rejects(importBackup(new File([bytes], "bomb.zip")), /256/);
  const duplicates = new JSZip().file("reports/A.txt", "a").file("reports/a.txt", "b");
  await assert.rejects(importBackup(new File([await duplicates.generateAsync({ type: "uint8array" })], "duplicates.zip")), /重複/);
  await assert.rejects(importBackup(new File(["not zip"], "invalid.zip")), /備份/);
});

test("backup stops inflated entries at their declared size instead of accumulating undeclared bytes", async () => {
  const bytes = new Uint8Array(await (await exportBackup(session())).arrayBuffer());
  const view = new DataView(bytes.buffer);
  for (let n = 0; n < bytes.length - 46; n++) {
    if (view.getUint32(n, true) === 0x02014b50 && view.getUint32(n + 24, true) > 0) {
      view.setUint32(n + 24, 1, true);
      break;
    }
  }
  await assert.rejects(importBackup(new File([bytes], "hidden-size.zip")), /目錄宣告的大小/);
});

test("storage exposes browser failures and validates before attempting persistence", async () => {
  await assert.rejects(listSessions(""), /帳號/);
  await assert.rejects(listSessions("user-a"), /儲存/);
  await assert.rejects(saveSession("user-a", { ...session(), id: "wrong" }), /工作階段/);
  await assert.rejects(saveSession("user-a", session()), /儲存/);
});

test("independent I2C library persistence is account-scoped and bounded before browser writes", async () => {
  await assert.rejects(readLibrary(""), /帳號/);
  await assert.rejects(saveLibrary("user-a", "x".repeat(2 * MiB + 1)), /2 MiB/);
  await assert.rejects(saveLibrary("user-a", "字".repeat(MiB)), /2 MiB/);
  await assert.rejects(readLibrary("user-a"), /儲存/);
  await assert.rejects(saveLibrary("user-a", "parts: []"), /儲存/);
});
