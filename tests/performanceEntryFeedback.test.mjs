import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssessmentForm, buildAssessmentReview, readManagerAssessment, serializeManagerAssessment, validateAssessment } from '../src/components/performance/rd2Assessment.mjs';
import { buildPerformanceReturnNotification } from '../src/components/performance/performanceNotifications.mjs';

const formForTest = () => {
  const form = createAssessmentForm(null, { userId: 'employee', displayName: '測試員工' });
  form.self.sections.IDP.entries = [{ id: 'a', text: '第一筆實績' }, { id: 'b', text: '第二筆實績' }];
  form.manager.entryReviews = { IDP: { a: { feedback: '補上成果數字', returnRequested: true }, b: { feedback: '成果明確', returnRequested: false } }, OKR: {}, KPI: {} };
  return form;
};
const build = (form, previous, action = 'return', mode = 'manager') => buildAssessmentReview({ form, previous, mode, action, cycleId: '2026-q3', reviewerName: '主管', id: 'performance-test', now: '2026-09-15T01:00:00Z' });
const attachment = { id: 'file-a', name: '佐證.pdf', mimeType: 'application/pdf', size: 2, dataUrl: 'data:application/pdf;base64,AA==' };

test('entry feedback survives serialization without merging two achievements', () => {
  const manager = readManagerAssessment(serializeManagerAssessment(formForTest().manager));
  assert.equal(manager.entryReviews?.IDP.a.feedback, '補上成果數字');
  assert.equal(manager.entryReviews.IDP.b.feedback, '成果明確');
});
test('entry feedback keeps its own attachments and snapshots them on return', () => {
  const form = formForTest();
  form.manager.entryReviews.IDP.a.attachments = [attachment];
  form.manager.entryReviews.IDP.b.attachments = [{ ...attachment, name: '不安全.html', dataUrl: 'data:text/html;base64,AA==' }];
  const saved = readManagerAssessment(serializeManagerAssessment(form.manager));
  assert.deepEqual(saved.entryReviews.IDP.a.attachments, [attachment]);
  assert.deepEqual(saved.entryReviews.IDP.b.attachments, []);

  const review = build(form, build(form, null, 'draft', 'self'));
  assert.deepEqual(readManagerAssessment(review.managerFeedback).returnHistory[0].entries[0].attachments, [attachment]);
  const resubmitted = build(createAssessmentForm(review), review, 'draft', 'self');
  assert.equal(resubmitted.managerFeedback, review.managerFeedback);
  form.manager.entryReviews.IDP.a.attachments = [{ ...attachment, dataUrl: attachment.dataUrl + 'A'.repeat(3_000_000) }];
  form.manager.attachments = [{ ...attachment, dataUrl: attachment.dataUrl + 'A'.repeat(3_000_000) }];
  assert.match(validateAssessment(form, 'manager', 'draft'), /附件總量過大/);
});
test('each return appends immutable snapshots and self resubmission preserves them', () => {
  let form = formForTest();
  const initial = build(form, null, 'draft', 'self');
  const first = build(form, initial);
  const manager = readManagerAssessment(first.managerFeedback);
  assert.equal(manager.returnHistory?.length, 1);
  assert.equal(manager.returnHistory[0].entries.length, 1);
  assert.equal(manager.returnHistory[0].entries[0].entryId, 'a');
  assert.equal(manager.returnHistory[0].entries[0].text, '第一筆實績');
  assert.equal(manager.entryReviews.IDP.a.returnRequested, false);
  form = createAssessmentForm(first);
  form.manager.entryReviews.IDP.a = { feedback: '補充驗證方法', returnRequested: true };
  form.manager.returnHistory = []; // a stale/mutated client must not erase history
  const second = build(form, first);
  const history = readManagerAssessment(second.managerFeedback).returnHistory;
  assert.equal(history.length, 2);
  assert.equal(history[0].entries[0].feedback, '補上成果數字');
  assert.equal(history[1].entries[0].feedback, '補充驗證方法');
  const submitted = build(createAssessmentForm(second), second, 'draft', 'self');
  assert.equal(submitted.managerFeedback, second.managerFeedback);
});
test('return requires an existing selected achievement with its own reason', () => {
  const form = formForTest();
  assert.equal(validateAssessment(form, 'manager', 'return'), '');
  form.manager.entryReviews.IDP.a.feedback = ' ';
  form.manager.feedback = '總結不能取代逐筆原因';
  assert.match(validateAssessment(form, 'manager', 'return'), /每筆|該筆/);
  form.manager.entryReviews.IDP = { missing: { feedback: '不存在', returnRequested: true } };
  assert.match(validateAssessment(form, 'manager', 'return'), /選擇|勾選/);
});
test('text review IDs never enter a UUID reference column', () => {
  const notification = buildPerformanceReturnNotification({ review: { id: 'performance-abc', cycleId: '2026-q3' }, recipientId: 'employee', senderId: 'manager', currentUrl: 'https://example.test/' });
  assert.equal(notification.reference_id, null);
  assert.equal(notification.metadata.review_id, 'performance-abc');
  assert.match(notification.action_url, /performanceReview=performance-abc/);
});
test('retry uses the same event UUID and a single-entry notification links to that achievement', () => {
  const form = formForTest();
  const review = build(form, build(form, null, 'draft', 'self'));
  const options = { review, recipientId: 'employee', senderId: 'manager', currentUrl: 'https://example.test/' };
  const first = buildPerformanceReturnNotification(options);
  const retry = buildPerformanceReturnNotification(options);
  assert.equal(first.id, retry.id);
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  assert.match(first.action_url, /performanceEntry=a/);
  assert.match(first.action_url, /performanceCategory=IDP/);
  assert.doesNotMatch(JSON.stringify(first), /補上成果數字|第一筆實績/);
});
