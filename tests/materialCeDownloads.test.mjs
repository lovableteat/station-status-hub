import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as XLSX from "xlsx";
import ts from "typescript";
import { buildMaterialDataset, parseMaterialWorkbookFile } from "../src/components/material-requests/materialRequestUtils.ts";
import { MATERIAL_CE_EXAMPLE_ROWS, MATERIAL_CE_FIELDS } from "../src/components/material-requests/materialUploadContract.mjs";

const headers = MATERIAL_CE_FIELDS.map(field => field.header);
const fileBytes = name => readFile(new URL(`../public/${name}`, import.meta.url));

test("the downloadable CE reference imports the documented examples with both independent statuses", async () => {
  const bytes = await fileBytes("material-ce-reference.xlsx");
  const payload = await parseMaterialWorkbookFile(new File([bytes], "CE-reference.xlsx"));
  assert.equal(payload.sheetName, "CE交付範例");
  assert.equal(payload.recordCount, 4);
  assert.equal(payload.records[0].partNumber, "000-DEMO-001");
  assert.deepEqual(payload.records.map(record => record.symbolStatus), ["無", "C", "有", "無"]);
  assert.equal(payload.records[1].schematicPart, "CAP");
  assert.equal(payload.records[1].sourcingStatus, "Approved");
  assert.match(payload.records[1].partUsageStatus, /ODM 不建議用料/);
  assert.ok(payload.records.every(record => record.trackingHistory.length === 0));
  const dataset = buildMaterialDataset(payload);
  assert.equal(dataset.groups.length, 3);
  assert.equal(dataset.stats.riskRecords, 4);
  assert.deepEqual(new Set(dataset.groups.map(group => group.displayRef)), new Set(["C101, C102", "J20", "U10"]));
});

test("the downloadable blank template has no sample records and accepts one real row without selecting the guide", async () => {
  const bytes = await fileBytes("material-upload-template.xlsx");
  const workbook = XLSX.read(bytes, { type: "buffer", cellStyles: true });
  const sheet = workbook.Sheets["上傳資料"];
  assert.ok(sheet);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  assert.deepEqual(rows[3].slice(0, headers.length), headers);
  assert.ok(rows.slice(4).every(row => !row[1]), "a blank template must not contain sample part names");
  await assert.rejects(parseMaterialWorkbookFile(new File([bytes], "blank.xlsx")), /找不到可解析的料號資料/);

  XLSX.utils.sheet_add_aoa(sheet, [MATERIAL_CE_EXAMPLE_ROWS[1]], { origin: "A5" });
  const edited = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const payload = await parseMaterialWorkbookFile(new File([edited], "CE-filled.xlsx"));
  assert.equal(payload.sheetName, "上傳資料");
  assert.equal(payload.recordCount, 1);
  assert.equal(payload.records[0].manufacturerPartNumber, "DEMO-CAP-ALT");
  assert.equal(payload.records[0].symbolStatus, "C");
  assert.match(payload.records[0].partUsageStatus, /ODM 不建議用料/);
});

test("CE receives only a blank format while the separate internal reference retains its guidance", async () => {
  const blank = XLSX.read(await fileBytes("material-upload-template.xlsx"), { type: "buffer" });
  assert.deepEqual(blank.SheetNames, ["上傳資料"]);
  const blankRows = XLSX.utils.sheet_to_json(blank.Sheets["上傳資料"], { header: 1, defval: "" });
  assert.ok(blankRows[2].every(value => !value), "the CE format must not carry a responsibility row");
  const reference = XLSX.read(await fileBytes("material-ce-reference.xlsx"), { type: "buffer" });
  const guide = reference.Sheets["分工與欄位說明"];
  assert.ok(guide);
  const text = XLSX.utils.sheet_to_csv(guide);
  for (const required of ["公司現有系統", "CE", "RD", "料號追蹤工具", "零件狀態", "Sourcing Status", "待確認", "核准"]) {
    assert.ok(text.includes(required), `the internal reference is missing ${required}`);
  }
  assert.ok(!headers.includes("料號追蹤") && !headers.includes("單號") && !headers.includes("EE"), "RD workflow columns do not belong to the required CE handoff");
});

test("editing and saving a material preserves the imported usage restriction", async () => {
  const page = await readFile(new URL("../src/components/material-requests/MaterialRequestPage.tsx", import.meta.url), "utf8");
  const code = page.slice(page.indexOf("function toWorkbookRecord("), page.indexOf("function createRecordTemplate("));
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const toRecord = vm.runInNewContext(`${compiled}; toWorkbookRecord`);
  const payload = await parseMaterialWorkbookFile(new File([await fileBytes("material-ce-reference.xlsx")], "CE-reference.xlsx"));
  const saved = toRecord({ ...payload.records[1], remark: "RD 補上追蹤" });
  assert.equal(saved.partUsageStatus, payload.records[1].partUsageStatus);
  assert.equal(saved.sourcingStatus, "Approved");
  assert.equal(saved.symbolStatus, "C");
  assert.equal(saved.remark, "RD 補上追蹤");
  assert.equal(JSON.parse(JSON.stringify(saved)).partUsageStatus, saved.partUsageStatus, "the JSON record stored by the collaboration layer must retain CE state");
  assert.equal(JSON.parse(JSON.stringify(saved)).symbolStatus, "C", "saving a tracking edit must retain the original Symbol code");
  const { symbolStatus: _symbolStatus, ...legacyRecord } = payload.records[1];
  assert.equal(Object.hasOwn(toRecord(legacyRecord), "symbolStatus"), false, "saving a legacy record must not introduce a blank Symbol field");
});
