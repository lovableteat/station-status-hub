import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { downloadPerformanceExcel } from '../src/components/performance/performanceExport.ts';
import { DEFAULT_PERFORMANCE_REVIEWS } from '../src/components/performance/performanceData.mjs';
import { serializeSelfAssessment, serializeManagerAssessment } from '../src/components/performance/rd2Assessment.mjs';

const person = (name, number, score = 89) => ({
  ...DEFAULT_PERFORMANCE_REVIEWS[0], employeeName: name, department: '硬體研發部', role: '工程師', reviewerName: '課長',
  status: 'approved', score, dueDate: '2026-10-10', updatedAt: '2026-10-07T03:00:00Z',
  selfFeedback: serializeSelfAssessment({ employeeNumber: number, team: 'EE', level: 'senior', grade: '23', sections: {
    IDP: { selfScore: 95, entries: [{ id: 'idp', text: `${number}：我建立驗證工具，將測試時間由 30 分鐘縮短至 5 分鐘。` }] },
    OKR: { selfScore: 95, entries: [{ id: 'okr', text: '改善跨組流程，縮短交付時間。' }] },
    KPI: { selfScore: 95, entries: [{ id: 'kpi', text: '準時完成驗證與交付。' }] },
  } }),
  managerFeedback: serializeManagerAssessment({ feedback: '整體回覆：成果具體。', workInstructions: '下期擴大使用範圍。',
    categoryReviews: { IDP: { score: 90, feedback: '已驗證成果' } }, entryReviews: { IDP: { idp: { feedback: '保留原始 STAR 內容' } } },
  }),
});

async function exportedWorkbook(reviews, options = { includeOverview: true }) {
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL, document: globalThis.document };
  let blob;
  URL.createObjectURL = value => { blob = value; return 'blob:overview-test'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
  try {
    await downloadPerformanceExcel(reviews, '2026-q3', options);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    return workbook;
  } finally {
    URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; globalThis.document = original.document;
  }
}

const resolveLink = (workbook, link) => {
  const match = /^#'((?:[^']|'')+)'!A1$/.exec(link);
  assert.ok(match, `internal worksheet link expected: ${link}`);
  const sheet = workbook.getWorksheet(match[1].replaceAll("''", "'"));
  assert.ok(sheet, `missing hyperlink target: ${link}`);
  return sheet;
};

test('department workbook opens on a filterable personnel homepage and links each name to the complete matching STAR sheet', async () => {
  const reviews = [person('乙同仁', '000002', 0), person('甲同仁', '000001')];
  const workbook = await exportedWorkbook(reviews);
  assert.equal(workbook.worksheets.length, 3);
  const overview = workbook.worksheets[0];
  assert.equal(overview.name, '人員總覽');
  assert.equal(workbook.views[0].activeTab, 0);
  assert.match(overview.getCell('A2').value, /2026-q3.*2 人.*點擊員工姓名/);
  assert.deepEqual(overview.getRow(4).values.slice(1), ['員工', '工號', '部門', '職務／職級', '考核人', '狀態', '截止日期', '更新時間', '團隊', '職務角色', '數字職等', '員工加權自評', '主管加權評分']);
  assert.equal(overview.getCell('A4').fill.fgColor.argb, 'FFFFFF00');
  assert.equal(overview.views[0].state, 'frozen');
  assert.equal(overview.views[0].xSplit, 2); assert.equal(overview.views[0].ySplit, 4);
  assert.equal(overview.autoFilter, 'A4:M6');
  const expected = new Map(reviews.map(review => [review.employeeName, review]));
  for (const index of [5, 6]) {
    const row = overview.getRow(index);
    const nameCell = row.getCell(1), review = expected.get(nameCell.value.text);
    assert.ok(review);
    const number = review.employeeName === '甲同仁' ? '000001' : '000002';
    assert.equal(row.getCell(2).value, number);
    assert.equal(row.getCell(3).value, '硬體研發部');
    assert.equal(row.getCell(4).value, '工程師');
    assert.equal(row.getCell(5).value, '課長');
    assert.equal(row.getCell(6).value, '已完成');
    assert.ok(row.getCell(7).value instanceof Date); assert.ok(row.getCell(8).value instanceof Date);
    assert.equal(row.getCell(7).numFmt, 'yyyy-mm-dd');
    assert.equal(row.getCell(8).numFmt, 'yyyy-mm-dd hh:mm');
    assert.equal(row.getCell(9).value, 'EE'); assert.equal(row.getCell(10).value, 'senior');
    assert.equal(row.getCell(11).value, 23); assert.equal(row.getCell(12).value, 95);
    assert.equal(row.getCell(13).value, review.score);
    assert.equal(nameCell.font.underline, true);
    const detail = resolveLink(workbook, nameCell.value.hyperlink);
    assert.equal(detail.getRow(1).getCell(1).value.text, '回到首頁');
    assert.equal(resolveLink(workbook, detail.getCell('A1').value.hyperlink), overview);
    assert.equal(detail.views[0].ySplit, 1);
    const rows = detail.getSheetValues().filter(Boolean);
    assert.equal(rows.find(values => values[2] === '工號')[3], number);
    assert.match(rows.find(values => values[1] === 'IDP')[2], new RegExp(number + '：我建立驗證工具'));
    assert.equal(rows.find(values => values[1] === 'IDP')[3], '保留原始 STAR 內容');
    assert.equal(rows.find(values => values[2] === '整體回覆')[3], '整體回覆：成果具體。');
    assert.equal(rows.find(values => values[2] === '工作指示')[3], '下期擴大使用範圍。');
  }
});

test('homepage links remain unique after duplicate, long, apostrophe and reserved-name sanitization', async () => {
  const names = ["O'Neil [研發]", "O'Neil [研發]", '人員總覽', 'Case', 'case', '長姓名'.repeat(15), "'首尾引號'"];
  const reviews = names.map((name, index) => person(name, `0000${index}`));
  const workbook = await exportedWorkbook(reviews);
  assert.equal(workbook.worksheets.length, names.length + 1);
  assert.equal(new Set(workbook.worksheets.map(sheet => sheet.name.toLowerCase())).size, names.length + 1);
  const targets = [];
  for (let index = 5; index < 5 + names.length; index++) {
    const row = workbook.worksheets[0].getRow(index);
    const detail = resolveLink(workbook, row.getCell(1).value.hyperlink);
    targets.push(detail.name);
    assert.ok(detail.name.length <= 31);
    assert.equal(detail.getSheetValues().filter(Boolean).find(values => values[2] === '工號')[3], row.getCell(2).value);
  }
  assert.equal(new Set(targets).size, names.length);
});

test('missing scores stay blank and employee-only export never adds a manager overview', async () => {
  const review = { ...person('未完成同仁', '000003'), score: null, status: 'draft', selfFeedback: '', dueDate: '', updatedAt: '' };
  const workbook = await exportedWorkbook([review]);
  assert.equal(workbook.worksheets[0].getCell('L5').value, '');
  assert.equal(workbook.worksheets[0].getCell('M5').value, '');
  const self = await exportedWorkbook([review], { includeOverview: true, selfOnly: true });
  assert.equal(self.worksheets.length, 1);
  assert.equal(self.worksheets[0].name, '未完成同仁');
  assert.doesNotMatch(JSON.stringify(self.worksheets[0].getSheetValues()), /主管加權評分|人員總覽|回到首頁/);
});
