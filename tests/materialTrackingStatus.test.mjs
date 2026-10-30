import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { MATERIAL_TRACKING_STATUS_OPTIONS, materialTrackingStatusTone, materialTrackingStatusPresentation, normalizeMaterialTrackingStatus } from '../src/components/material-requests/materialTrackingStatus.ts';

const source = await readFile(new URL('../src/components/material-requests/MaterialRequestPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['normalizeTrackingWorkflowStatus', 'getTrackingWorkflowStatus', 'buildTrackingStatusFilterOptions', 'getTrackingStatusDisplayLabel'];
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(ast)).join('\n');
const compiled = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const pageStatus = new Function('normalizeMaterialTrackingStatus', 'MATERIAL_TRACKING_STATUS_OPTIONS', 'getLatestTrackingEntry', 'inferFilterOptionTone', `${compiled};return {getTrackingWorkflowStatus,buildTrackingStatusFilterOptions};`)(normalizeMaterialTrackingStatus, MATERIAL_TRACKING_STATUS_OPTIONS, record => record.trackingHistory?.at(-1), () => 'slate');

test('each application stage has its own colour in cards and badges', () => {
  const colours = MATERIAL_TRACKING_STATUS_OPTIONS.map(status => materialTrackingStatusPresentation(status));
  assert.equal(new Set(colours.map(tone => tone.badge)).size, 9);
  assert.equal(new Set(colours.map(tone => tone.surface)).size, 9);
  assert.equal(new Set(colours.map(tone => tone.text)).size, 9);
  MATERIAL_TRACKING_STATUS_OPTIONS.forEach((status, index) => assert.equal(materialTrackingStatusTone(status), colours[index].badge));
});

test('the table preserves every manual stage, even with notes and older records', () => {
  for (const status of [...MATERIAL_TRACKING_STATUS_OPTIONS, '新增追蹤', '處理中', '未完成']) {
    assert.equal(pageStatus.getTrackingWorkflowStatus({ trackingStatus: status, trackingHistory: [{ status, note: '備註', createdBy: 'CE' }] }), status);
    assert.equal(pageStatus.getTrackingWorkflowStatus({ trackingStatus: status }), status);
  }
  assert.equal(pageStatus.getTrackingWorkflowStatus({}), '未處理');
  assert.equal(pageStatus.getTrackingWorkflowStatus({ trackingHistory: [{ note: '舊版追蹤沒有狀態' }] }), '處理中');
  assert.equal(normalizeMaterialTrackingStatus('未完成'), '未完成', 'negative or unknown labels must never become completed');
});

test('the status column filter keeps all nine stages separate and retains legacy options', () => {
  const statuses = [...MATERIAL_TRACKING_STATUS_OPTIONS, '新增追蹤', '處理中', '未完成', '已發信'];
  const options = pageStatus.buildTrackingStatusFilterOptions(statuses.map(status => [status]));
  assert.deepEqual(options.map(option => option.value), statuses.slice(0, -1));
  assert.equal(options.find(option => option.value === '已發信').count, 2);
  assert.ok(options.every(option => option.label === option.value));
});
