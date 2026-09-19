import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmSectionReportSave } from '../src/components/performance/sectionReportPersistence.mjs';

test('section return confirms persisted state after a lost response without retrying the write', async () => {
  let writes = 0;
  const options = { mode: 'review', action: 'return', cycle: 'q3', userId: 'director', report: { id: 'report', updated_at: 'v1' }, feedback: '請補成果' };
  const saved = { id: 'report', updated_at: 'v2', status: 'returned', director_feedback: options.feedback };
  const db = { rpc: async name => {
    if (name === 'get_performance_section_reports') return { data: [saved] };
    writes++; throw new Error('connection lost');
  } };
  assert.equal(await confirmSectionReportSave(db, options), saved);
  assert.equal(writes, 1);
  saved.status = 'submitted';
  await assert.rejects(confirmSectionReportSave(db, options), /connection lost/);
  await assert.rejects(confirmSectionReportSave({ rpc: async () => ({ error: { code: '40001' } }) }, options), error => error.code === '40001');
});
