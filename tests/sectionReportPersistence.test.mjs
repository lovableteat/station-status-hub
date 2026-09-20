import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmSectionReportSave } from '../src/components/performance/sectionReportPersistence.mjs';

test('section return confirms persisted feedback and attachments after a lost response without retrying the write', async () => {
  let writes = 0;
  const attachments = [{ id: 'file', name: '回覆.csv', mimeType: 'text/csv', size: 3, dataUrl: 'data:text/csv;base64,QUJD' }];
  const options = { mode: 'review', action: 'return', cycle: 'q3', userId: 'director', report: { id: 'report', updated_at: 'v1' }, feedback: '請補成果', attachments };
  const saved = { id: 'report', updated_at: 'v2', status: 'returned', director_feedback: options.feedback, director_attachments: [{ dataUrl: attachments[0].dataUrl, size: 3, mimeType: 'text/csv', name: '回覆.csv', id: 'file' }] };
  const db = { rpc: async name => {
    if (name === 'get_performance_section_reports') return { data: [saved] };
    writes++; throw new Error('connection lost');
  } };
  assert.equal(await confirmSectionReportSave(db, options), saved);
  assert.equal(writes, 1);
  assert.equal((await db.rpc('get_performance_section_reports')).data[0].director_attachments[0].name, '回覆.csv');
  saved.status = 'submitted';
  await assert.rejects(confirmSectionReportSave(db, options), /connection lost/);
  await assert.rejects(confirmSectionReportSave({ rpc: async () => ({ error: { code: '40001' } }) }, options), error => error.code === '40001');
});
