const assert = require('node:assert/strict');
const test = require('node:test');
const {React, create, act, loader, browser, flush} = require('./support/renderHarness.cjs');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

for (const extension of ['xlsx', 'xls']) {
  test(`actual ${extension} editor inserts rows/columns with valid selection and saves retained cells`, async () => {
    let source;
    if (extension === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.addWorksheet('Data').addRows([['Part', 'Qty'], ['A', 2], ['B', 3]]);
      source = await workbook.xlsx.writeBuffer();
    } else {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Part', 'Qty'], ['A', 2], ['B', 3]]), 'Data');
      source = XLSX.write(workbook, {type: 'buffer', bookType: 'biff8'});
    }
    const win = browser();
    win.requestAnimationFrame = callback => callback();
    let saved;
    const load = loader({window: win, globals: {Blob}, transform: (text, file) => {
      if (!file.endsWith('TestPlanSpreadsheetEditor.tsx')) return text;
      if (process.env.AUDIT_SPREADSHEET_BEFORE === '1') {
        text = text.replaceAll('revealSelection(insertedSelection);', 'revealSelection({ anchor: insertedSelection, focus: insertedSelection });');
      }
      // Load the actual parsers through the synchronous renderer harness.
      return text.replaceAll('import("exceljs"),', 'Promise.resolve(require("exceljs")),')
        .replaceAll('import("xlsx")', 'Promise.resolve(require("xlsx"))');
    }});
    const {TestPlanSpreadsheetEditor} = load('src/components/test-plan/TestPlanSpreadsheetEditor.tsx');
    let view;
    await act(async () => { view = create(React.createElement(TestPlanSpreadsheetEditor, {
      open: true, canEdit: true, file: {id: 'isolated', extension, originalName: `ISOLATED_QA.${extension}`},
      downloadFile: async () => new Blob([source]), onOpenChange() {}, onSave: async (_, blob) => { saved = blob; },
    })); });
    try {
      for (let attempt = 0; attempt < 100 && !view.root.findAllByProps({role: 'grid'}).length; attempt++) await flush(10);
      const cell = address => view.root.findByProps({'data-cell-address': address});
      const button = label => view.root.findAll(node => node.props['aria-label'] === label && typeof node.props.onClick === 'function').at(-1);
      assert.ok(view.root.findAllByProps({role: 'grid'}).length, 'workbook loads');
      await act(async () => cell('A2').props.onMouseDown({button: 0, shiftKey: false, preventDefault() {}}));
      await act(async () => button('向下插入列').props.onClick());
      assert.match(view.root.findByProps({role: 'grid'}).props['aria-label'], /A3/);
      assert.doesNotMatch(view.root.findByProps({role: 'grid'}).props['aria-label'], /NaN|undefined/);
      const text = node => typeof node === 'string' ? node : node.children.map(text).join('');
      assert.equal(text(cell('A4')), 'B');
      await act(async () => button('向右插入欄').props.onClick());
      assert.match(view.root.findByProps({role: 'grid'}).props['aria-label'], /B3/);
      assert.ok(cell('B3'), 'inserted selection remains visible');
      const save = view.root.findAll(node => typeof node.props.onClick === 'function' && node.children.some(child => child === '儲存回原檔')).at(-1);
      assert.ok(save, 'save action exists');
      await act(async () => save.props.onClick());
      for (let attempt = 0; attempt < 100 && !saved; attempt++) await flush(10);
      assert.ok(saved?.size > 0, 'actual editor produces a workbook');
      const data = await saved.arrayBuffer();
      if (extension === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(data);
        assert.equal(workbook.getWorksheet('Data').getCell('A4').value, 'B');
        assert.equal(workbook.getWorksheet('Data').getCell('C4').value, 3);
      } else {
        const workbook = XLSX.read(data, {type: 'array'});
        assert.equal(workbook.Sheets.Data.A4.v, 'B');
        assert.equal(workbook.Sheets.Data.C4.v, 3);
      }
    } finally { await act(async () => view.unmount()); }
  });
}
