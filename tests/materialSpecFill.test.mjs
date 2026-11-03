import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import ExcelJS from "exceljs";
import { buildSpecFillPrompt, parseSpecFillResult, parseSpecFillTables, specFillTsv, specFillHtml, specFillTablesTsv, specFillTablesHtml } from "../src/components/material-requests/materialSpecFill.ts";
const native = createRequire(import.meta.url);
const catalogue = [{ id: "spec-1", name: "QA-SPEC.pdf" }];
const sourceCell = { value: "001.20 V", kind: "source", sourceId: "spec-1", page: "5", quote: "VCC: 001.20 V at 25°C" };
const answer = (cell = sourceCell, partMatch = "matched") => JSON.stringify({ title: "照片欄位", partMatch, columns: ["項目", "數據"], rows: [[{ kind: "label", value: "VCC" }, cell]], warnings: [] });

test("photo columns, units, zeros, conditions and evidence survive parsing and TSV", () => {
  const result = parseSpecFillResult("```json\n" + answer() + "\n```", catalogue);
  assert.deepEqual(result.columns, ["項目", "數據"]);
  assert.equal(result.rows[0][1].value, "001.20 V");
  assert.equal(result.rows[0][1].quote, sourceCell.quote);
  assert.equal(specFillTsv(result), "項目\t數據\r\nVCC\t001.20 V");
  assert.match(buildSpecFillPrompt({ manufacturerPartNumber: "QA-01-A", manufacturer: "QA", name: "test", refDes: "U1" }, catalogue, "工作電壓"), /QA-01-A/);
});

test("unknown documents, missing pages/quotes and mismatched part numbers cannot become verified values", () => {
  for (const cell of [{ ...sourceCell, sourceId: "invented" }, { ...sourceCell, page: "" }, { ...sourceCell, quote: "" }]) {
    const result = parseSpecFillResult(answer(cell), catalogue);
    assert.equal(result.rows[0][1].value, "待確認");
    assert.equal(result.rows[0][1].kind, "missing");
  }
  for (const match of ["mismatch", "not-confirmed", "invalid"]) assert.equal(parseSpecFillResult(answer(sourceCell, match), catalogue).rows[0][1].value, "待確認");
});

test("broken/truncated/oversized model output cannot be rendered as a partial table", () => {
  for (const raw of ["not JSON", "null", JSON.stringify({ columns: ["a", "b"], rows: [[sourceCell]] }), "x".repeat(1_000_001)]) assert.throws(() => parseSpecFillResult(raw, catalogue));
});

test("clipboard preserves multiline cells and protects formula-like values", () => {
  const result = parseSpecFillResult(answer(), catalogue);
  result.rows = [[{ value: '=HYPERLINK("bad")', kind: "label" }, { value: "-40 °C\nTyp: 25 °C", kind: "label" }]];
  const tsv = specFillTsv(result);
  assert.match(tsv, /'=HYPERLINK/);
  assert.match(tsv, /"-40 °C\nTyp: 25 °C"/);
  result.rows[0][0].value = '<script>alert("x")</script>';
  assert.equal(specFillHtml(result).includes("<script>"), false);
  assert.match(specFillHtml(result), /mso-number-format/);
});

test("Excel round-trip preserves original columns, evidence, bold headers and text values", async () => {
  const source = await readFile("src/components/material-requests/materialSpecFillExport.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)(native, exports);
  const workbook = await exports.createSpecFillWorkbook(parseSpecFillResult(answer(), catalogue), catalogue, "000-QA-MPN", "test model");
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(reopened.getWorksheet("依照片填表").getCell("B2").value, "001.20 V");
  assert.equal(reopened.getWorksheet("依照片填表").getRow(1).font.bold, true);
  assert.equal(reopened.getWorksheet("依照片填表").getCell("B2").numFmt, "@");
  assert.equal(reopened.getWorksheet("來源查核").getCell("F5").value, sourceCell.quote);
});

test("every photo maps back to its own original table in input order; incomplete or repeated results are rejected", () => {
  const templates=[{id:'template-1',name:'form-a.png'},{id:'template-2',name:'form-b.png'}];
  const first={...JSON.parse(answer()),templateId:'template-1'};
  const second={...JSON.parse(answer()),templateId:'template-2',columns:['Only one column'],rows:[[sourceCell]]};
  const tables=parseSpecFillTables(JSON.stringify({tables:[second,first]}),catalogue,templates);
  assert.deepEqual(tables.map(t=>[t.templateId,t.templateName,t.columns]),[['template-1','form-a.png',['項目','數據']],['template-2','form-b.png',['Only one column']]]);
  for(const bad of [answer(),JSON.stringify({tables:[first]}),JSON.stringify({tables:[first,first]}),JSON.stringify({tables:[first,{...second,templateId:'invented'}]}),JSON.stringify({tables:[first,{...second,rows:[]}]}),'null']) assert.throws(()=>parseSpecFillTables(bad,catalogue,templates));
  const single=parseSpecFillTables(answer(),catalogue,[templates[0]]);
  assert.equal(single[0].rows[0][1].value,'001.20 V','old single-photo responses stay compatible');
  assert.match(specFillTablesTsv(tables),/form-a.png/);
  assert.match(specFillTablesTsv(tables),/Only one column/);
  tables[1].templateName='<script>alert(1)</script>.png';
  assert.equal(specFillTablesHtml(tables).includes('<script>'),false);
  assert.equal(specFillTablesTsv(single),specFillTsv(single[0]));
});

test("multi-photo Excel keeps each photo in a separate sheet and every source reference is attributed", async () => {
  const source=await readFile('src/components/material-requests/materialSpecFillExport.ts','utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('require','exports',compiled)(native,exports);
  const tables=parseSpecFillTables(JSON.stringify({tables:[{...JSON.parse(answer()),templateId:'template-1'},{...JSON.parse(answer()),templateId:'template-2',columns:['Pins'],rows:[[{...sourceCell,value:'0016'}]]}]}),catalogue,[{id:'template-1',name:'same.png'},{id:'template-2',name:'same.png'}]);
  const workbook=await exports.createSpecFillPhotosWorkbook(tables,catalogue,'000-QA','test');
  const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(reopened.getWorksheet('照片1').getCell('B2').value,'001.20 V');
  assert.equal(reopened.getWorksheet('照片2').getCell('A1').value,'Pins');
  assert.equal(reopened.getWorksheet('照片2').getCell('A2').value,'0016');
  assert.equal(reopened.getWorksheet('照片2').getCell('A2').numFmt,'@');
  assert.equal(reopened.getWorksheet('照片2').getRow(1).font.bold,true);
  assert.equal(reopened.getWorksheet('來源查核').getCell('A5').value,'照片1：same.png');
  assert.equal(reopened.getWorksheet('來源查核').getCell('A6').value,'照片2：same.png');
  assert.equal(reopened.getWorksheet('來源查核').getCell('G6').value,sourceCell.quote);
});
