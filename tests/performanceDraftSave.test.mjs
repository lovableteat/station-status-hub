import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as persistence from '../src/components/performance/assessmentPersistence.mjs';

test('a self-assessment draft saves only employee fields and keeps its draft status', async () => {
  assert.equal(typeof persistence.saveSelfAssessmentDraft, 'function');
  const calls = [];
  let payload;
  const db = { from(table) {
    calls.push(['from', table]);
    return {
      insert(value) { payload = value; calls.push(['insert']); return this; },
      update(value) { payload = value; calls.push(['update']); return this; },
      eq(column, value) { calls.push(['eq', column, value]); return this; },
      select() { return this; },
      async single() { return { data: { ...payload, id: 'performance-1', status: 'draft', updated_at: '2026-09-29T00:00:00Z' }, error: null }; },
    };
  } };
  const review = {
    id: 'performance-1', cycleId: '2026-q3', employeeId: 'employee-1', employeeName: '員工',
    department: 'EE', role: '工程師', dueDate: '2026-09-30', goals: [], selfFeedback: '部分內容',
    managerFeedback: '不可覆蓋的主管評語', score: 92, reviewerName: '主管',
  };
  const saved = await persistence.saveSelfAssessmentDraft(db, review, null);
  assert.equal(saved.status, 'draft');
  assert.deepEqual(calls.slice(0, 2), [['from', 'performance_reviews'], ['insert']]);
  assert.equal(payload.status, 'draft');
  assert.equal(payload.self_feedback, '部分內容');
  assert.equal('manager_feedback' in payload, false);
  assert.equal('score' in payload, false);
  assert.equal('reviewer_name' in payload, false);
});

test('a returned assessment draft cannot overwrite supervisor fields or advance review status', async () => {
  assert.equal(typeof persistence.saveSelfAssessmentDraft, 'function');
  const calls = [];
  let payload;
  const db = { from() { return {
    update(value) { payload = value; return this; },
    eq(column, value) { calls.push([column, value]); return this; },
    select() { return this; },
    async single() { return { data: { id: 'performance-1', status: 'in-progress', self_feedback: '修正中', updated_at: '2026-09-29T01:00:00Z' }, error: null }; },
  }; } };
  const review = { id: 'performance-1', employeeName: '員工', department: 'EE', role: '工程師',
    dueDate: '2026-09-30', goals: [], selfFeedback: '修正中', managerFeedback: '主管評語', score: 90 };
  const saved = await persistence.saveSelfAssessmentDraft(db, review, { id: 'performance-1', status: 'in-progress', updatedAt: '2026-09-28T00:00:00Z' });
  assert.equal(saved.status, 'in-progress');
  assert.equal('status' in payload, false);
  assert.equal('manager_feedback' in payload, false);
  assert.ok(calls.some(([column, value]) => column === 'updated_at' && value === '2026-09-28T00:00:00Z'));
});

test('the self-assessment editor offers an explicit draft save action', async () => {
  const editor = await readFile(new URL('../src/components/performance/AssessmentEditor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /儲存草稿/);
  assert.match(editor, /submit\("draft"\)/);
  assert.match(editor, /mode === "self"[\s\S]*?主管評分編輯中會暫存於本分頁/);
});

test('a supervisor cannot select an unsubmitted draft through records or a direct link', async () => {
  const page = await readFile(new URL('../src/components/performance/PerformanceAppraisalPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /tab !== "manager" \|\| review\.status !== "draft"/);
  assert.match(page, /managedReviews = reviews\.filter\(\(review\) => !matchesUser\(review, user\) && review\.status !== "draft"\)/);
});

test('session drafts survive a fresh page module and remain scoped to the source version', async () => {
  const data = new Map();
  const priorWindow = globalThis.window;
  globalThis.window = { sessionStorage: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }, addEventListener() {} };
  try {
    const first = await import(`../src/components/performance/assessmentDrafts.mjs?first=${Date.now()}`);
    first.keepAssessmentDraft('employee:2026-q3:self', 'version-1', { text: '已填一半' });
    const reloaded = await import(`../src/components/performance/assessmentDrafts.mjs?reloaded=${Date.now()}`);
    assert.deepEqual(reloaded.readAssessmentDraft('employee:2026-q3:self', 'version-1'), { text: '已填一半' });
    assert.equal(reloaded.readAssessmentDraft('employee:2026-q3:self', 'newer-version'), undefined);
  } finally {
    globalThis.window = priorWindow;
  }
});

test('a rejected or stale cloud save never reports success', async () => {
  const db = { from() { return {
    update() { return this; }, eq() { return this; }, select() { return this; },
    async single() { return { data: null, error: { code: 'PGRST116' } }; },
  }; } };
  await assert.rejects(
    persistence.saveSelfAssessmentDraft(db,
      { id: 'performance-1', employeeName: '員工', goals: [], selfFeedback: '內容' },
      { id: 'performance-1', status: 'draft', updatedAt: '2026-09-28T00:00:00Z' }),
    /草稿尚未確認儲存/,
  );
});

test('a cloud response with the right record but wrong content is not accepted as a saved draft', async () => {
  const db = { from() { return {
    insert() { return this; }, select() { return this; },
    async single() { return { data: { id: 'performance-1', status: 'draft', self_feedback: '舊內容' }, error: null }; },
  }; } };
  await assert.rejects(
    persistence.saveSelfAssessmentDraft(db,
      { id: 'performance-1', cycleId: '2026-q3', employeeId: 'employee-1', employeeName: '員工', goals: [], selfFeedback: '新內容' },
      null),
    /草稿尚未確認儲存/,
  );
});

test('a submitted or approved review cannot be overwritten by the draft path', async () => {
  const db = { from() { throw new Error('must not write'); } };
  const review = { id: 'performance-1', selfFeedback: '未送出內容' };
  for (const status of ['submitted', 'approved']) {
    await assert.rejects(
      persistence.saveSelfAssessmentDraft(db, review, { id: review.id, status, updatedAt: '2026-09-29T00:00:00Z' }),
      /不能儲存草稿/,
    );
  }
});
