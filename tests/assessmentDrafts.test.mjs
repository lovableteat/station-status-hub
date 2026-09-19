import test from 'node:test';
import assert from 'node:assert/strict';
import { readAssessmentDraft, keepAssessmentDraft, forgetAssessmentDraft } from '../src/components/performance/assessmentDrafts.mjs';

test('navigation retains edits, isolates accounts/cycles, and discards stale or saved drafts', () => {
  const key = 'employee-a:2026-q3:self';
  keepAssessmentDraft(key, 'version-1', { text: 'unsaved entry' });
  assert.deepEqual(readAssessmentDraft(key, 'version-1'), { text: 'unsaved entry' });
  assert.equal(readAssessmentDraft('employee-b:2026-q3:self', 'version-1'), undefined);
  assert.equal(readAssessmentDraft('employee-a:2026-q2:self', 'version-1'), undefined);
  assert.equal(readAssessmentDraft(key, 'version-2'), undefined);
  keepAssessmentDraft(key, 'version-2', { text: 'submitted' });
  forgetAssessmentDraft(key);
  assert.equal(readAssessmentDraft(key, 'version-2'), undefined);
});
