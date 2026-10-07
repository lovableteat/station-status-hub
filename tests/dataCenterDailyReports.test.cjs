const test = require('node:test');
const assert = require('node:assert/strict');
const { loader, database } = require('./support/renderHarness.cjs');

const draft = { report_date: '2026-10-07', site_id: 'taipei', status: 'on-track', summary: '  完成機櫃檢查  ', next_steps: '', blockers: '' };
function service(run) {
  const db = database(run);
  return { db, ...loader({ globals: { AbortSignal }, mocks: { '@/integrations/supabase/client': { supabase: db } } })('src/components/data-center/dailyWorkReports.ts') };
}

test('validates required work, actual calendar dates, status and bounded fields before any write', async () => {
  const h = service(() => assert.fail('invalid input must not reach database'));
  for (const change of [{ summary: '  ' }, { report_date: '2026-02-30' }, { report_date: '2026-1-1' }, { site_id: '' }, { status: 'invented' }, { status: 'toString' }, { summary: 'a'.repeat(6001) }]) {
    await assert.rejects(h.saveDailyWorkReport('project', 'author', { ...draft, ...change }));
  }
  assert.equal(h.db.reads.length, 0);
  assert.equal(h.taipeiReportDate(new Date('2026-10-06T16:30:00Z')), '2026-10-07');
});

test('a created report returns a durable receipt with authenticated author and trimmed text', async () => {
  const h = service(q => ({ data: { id: 'saved', ...q.payload, updated_at: 'v1' }, error: null }));
  const receipt = await h.saveDailyWorkReport('project', 'author', draft);
  assert.equal(receipt.id, 'saved');
  assert.equal(h.db.reads[0].table, 'data_center_work_reports');
  assert.equal(h.db.reads[0].method, 'insert');
  assert.equal(receipt.project_id, 'project');
  assert.equal(receipt.author_id, 'author');
  assert.equal(receipt.summary, '完成機櫃檢查');
});

test('editing checks ownership and original version; zero-row conflicts never claim success', async () => {
  const h = service(() => ({ data: null, error: null }));
  await assert.rejects(h.saveDailyWorkReport('project', 'author', draft, { id: 'saved', updated_at: 'v1' }), /版本|重新/);
  assert.equal(h.db.reads[0].filters.author_id, 'author');
  assert.equal(h.db.reads[0].filters.project_id, 'project');
  assert.equal(h.db.reads[0].filters.updated_at, 'v1');
  assert.deepEqual(Object.keys(h.db.reads[0].payload).sort(), ['blockers', 'next_steps', 'status', 'summary']);
});

test('duplicate and network errors are surfaced, not silently upserted over another session', async () => {
  for (const error of [{ code: '23505', message: 'duplicate' }, { message: 'offline' }]) {
    const h = service(() => ({ data: null, error }));
    await assert.rejects(h.saveDailyWorkReport('project', 'author', draft));
    assert.equal(h.db.reads[0].method, 'insert');
  }
});
