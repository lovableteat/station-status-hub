import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';

const { React, create, act, loader, ui, browser } = createRequire(import.meta.url)('./support/renderHarness.cjs');
const timers = new Map();
let nextTimer = 0;
const runTimers = async () => {
  const scheduled = [...timers.values()];
  timers.clear();
  await act(async () => scheduled.forEach(run => run()));
};
const load = loader({
  window: Object.assign(browser(), {
    setTimeout: run => { timers.set(++nextTimer, run); return nextTimer; },
    clearTimeout: id => timers.delete(id),
  }),
  globals: {
    MATERIAL_NOTE_MAX_LENGTH: 2000, CHIP_BASE: '', CHIP_TONES: {},
    BomRecordConflictError: class extends Error {},
    stopRowToggle: event => event.stopPropagation(),
    getTrackingWorkflowStatus: record => record.trackingStatus || '未處理',
    getTrackingStatusDisplayLabel: value => value,
    getTrackingStatusCardTone: () => ({ wrapper: '', icon: '' }),
    getTrackingStatusTone: () => '', materialTrackingStatusTone: () => '',
    getLatestTrackingEntry: record => record.trackingHistory?.at(-1),
    getTrackingRequestMeta: () => ({ ticket: '', url: '' }),
    cn: (...values) => values.filter(Boolean).join(' '),
  },
  transform(source, file) {
    if (!file.endsWith('MaterialRequestPage.tsx')) return source;
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const components = ['MaterialNoteCell', 'TrackingHistoryCell'].map(name => ast.statements.find(node =>
      ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast)).join('\n');
    return `import {useState, useRef, useEffect, useCallback} from 'react';
      import {Input} from '@/components/ui/input'; import {Button} from '@/components/ui/button';
      import {RotateCcw, Check, TriangleAlert, Pencil, History} from 'lucide-react';
      ${components} export {MaterialNoteCell, TrackingHistoryCell};`;
  },
});
const { MaterialNoteCell, TrackingHistoryCell } = load('src/components/material-requests/MaterialRequestPage.tsx');
const record = { id: 'same-shared-record', refDes: 'R1', name: 'Synthetic resistor', manufacturerPartNumber: 'ALT-829', note: 'Existing shared note' };
const input = root => root.root.find(node => node.type === 'stub' && node.props['data-testid'] === 'material-note-input');

test('Note saves the same record once with Enter, and a subsequent blur does not duplicate the write', async () => {
  const writes = []; let root;
  act(() => { root = create(React.createElement(MaterialNoteCell, {record, disabled: false, onSave: async (...args) => writes.push(args)})); });
  try {
    act(() => input(root).props.onChange({target: {value: ' Shared update '}}));
    await act(async () => input(root).props.onKeyDown({key: 'Enter', preventDefault() {}}));
    await act(async () => input(root).props.onBlur());
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], record);
    assert.equal(writes[0][1], 'Shared update');
    assert.equal(input(root).props.value, 'Shared update');
    act(() => root.update(React.createElement(MaterialNoteCell, {record: {...record, note: 'Another colleague update'}, disabled: false, onSave: async () => {}})));
    assert.equal(input(root).props.value, 'Another colleague update', 'shared record refresh updates this editor');
  } finally { act(() => root.unmount()); }
});

test('Note saves after a pause and keeps accepting a newer draft during the first request', async () => {
  let finishFirst, root;
  const writes = [];
  const onSave = (...args) => {
    writes.push(args);
    return writes.length === 1 ? new Promise(resolve => { finishFirst = resolve; }) : Promise.resolve();
  };
  act(() => { root = create(React.createElement(MaterialNoteCell, {record, disabled: false, onSave})); });
  try {
    act(() => input(root).props.onChange({target: {value: 'first'}}));
    act(() => input(root).props.onChange({target: {value: 'first draft'}}));
    assert.equal(writes.length, 0);
    await runTimers();
    assert.equal(writes.length, 1);
    assert.equal(input(root).props.disabled, false);
    act(() => input(root).props.onChange({target: {value: 'newest draft'}}));
    await runTimers();
    assert.equal(writes.length, 1);
    await act(async () => finishFirst());
    await runTimers();
    assert.deepEqual(writes.map(([, note, expected]) => [note, expected]), [
      ['first draft', record.note], ['newest draft', 'first draft'],
    ]);
    assert.equal(input(root).props.value, 'newest draft');
  } finally { act(() => root.unmount()); }
});

test('a remote Note arriving while typing preserves the draft and requires explicit confirmation', async () => {
  const writes = [];
  const onSave = async (...args) => { writes.push(args); };
  const render = item => React.createElement(MaterialNoteCell, {record: item, disabled: false, onSave});
  let root;
  act(() => { root = create(render(record)); });
  try {
    act(() => input(root).props.onChange({target: {value: 'my unsaved note'}}));
    act(() => root.update(render({...record, note: 'colleague note'})));
    assert.equal(input(root).props.value, 'my unsaved note');
    await runTimers();
    await act(async () => input(root).props.onBlur());
    assert.equal(writes.length, 0);
    const keepDraft = root.root.find(node => node.type === 'stub' && node.props['data-testid'] === 'material-note-keep-draft');
    await act(async () => keepDraft.props.onClick());
    assert.deepEqual(writes.map(([, note, expected]) => [note, expected]), [['my unsaved note', 'colleague note']]);
  } finally { act(() => root.unmount()); }
});

test('a Chinese input method can finish composition without sending an intermediate Note', async () => {
  const writes = [];
  let root;
  act(() => { root = create(React.createElement(MaterialNoteCell, {record, disabled: false, onSave: async (_record, note) => writes.push(note)})); });
  try {
    act(() => input(root).props.onCompositionStart());
    act(() => input(root).props.onChange({target: {value: 'ㄅㄟ'}}));
    await act(async () => input(root).props.onKeyDown({key: 'Enter', nativeEvent: {isComposing: true}, preventDefault() {}}));
    await runTimers();
    assert.deepEqual(writes, []);
    act(() => input(root).props.onCompositionEnd({currentTarget: {value: '備註完成'}}));
    await runTimers();
    assert.deepEqual(writes, ['備註完成']);
  } finally { act(() => root.unmount()); }
});

test('read-only Note never writes; a failed save retains the draft for retry and Escape discards it', async () => {
  let disabled = true, fail = true; const writes = []; let root;
  const render = () => React.createElement(MaterialNoteCell, {record, disabled, onSave: async (_record, note) => {
    if (fail) throw new Error('Conflict'); writes.push(note);
  }});
  act(() => { root = create(render()); });
  try {
    assert.equal(input(root).props.disabled, true);
    act(() => input(root).props.onChange({target: {value: 'draft'}}));
    await act(async () => input(root).props.onBlur());
    assert.deepEqual(writes, []);
    disabled = false; act(() => root.update(render()));
    await act(async () => input(root).props.onBlur());
    assert.equal(input(root).props.value, 'draft');
    assert.ok(root.root.findAllByProps({'aria-label': 'Note 儲存失敗'}).length);
    fail = false;
    const retry = root.root.find(node => node.type === 'stub' && node.props.children === '重試');
    await act(async () => retry.props.onClick());
    assert.deepEqual(writes, ['draft']);
    act(() => input(root).props.onChange({target: {value: 'discard'}}));
    act(() => input(root).props.onKeyDown({key: 'Escape', preventDefault() {}, currentTarget: {blur() {}}}));
    await act(async () => input(root).props.onBlur());
    assert.equal(input(root).props.value, 'draft');
    assert.equal(writes.length, 1);
  } finally { act(() => root.unmount()); }
});

test('table status and edit are independent semantic controls for the same alternative record', () => {
  const history = [], details = []; let root;
  act(() => { root = create(React.createElement(TrackingHistoryCell, {record, embedded: true,
    onOpen: item => history.push(item), onEdit: item => details.push(item)})); });
  try {
    const status = root.root.find(node => node.type === 'stub' && node.props['data-testid'] === 'material-status-button');
    const edit = root.root.find(node => node.type === 'stub' && node.props['data-testid'] === 'material-edit-button');
    assert.equal(status.props.type, 'button'); assert.equal(edit.props.type, 'button');
    assert.match(status.props['aria-label'], /查看追蹤紀錄/);
    assert.match(edit.props['aria-label'], /編輯料件 ALT-829/);
    assert.equal(status.findAllByType(ui.Button).length, 0, 'buttons must not be nested');
    act(() => status.props.onClick()); assert.deepEqual(history, [record]); assert.deepEqual(details, []);
    act(() => edit.props.onClick()); assert.deepEqual(details, [record]); assert.equal(history.length, 1);
  } finally { act(() => root.unmount()); }
});
