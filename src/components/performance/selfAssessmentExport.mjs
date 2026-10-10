import { buildAssessmentReview } from './rd2Assessment.mjs';
import { commitAssessmentEntries } from './assessmentEntries.mjs';

// Export is a local snapshot, never a save or submission. Supervisor data is
// removed before either file builder receives an employee's snapshot.
export function createSelfAssessmentExport(form, previous, cycle, now = new Date().toISOString()) {
  const review = form ? buildAssessmentReview({form:commitAssessmentEntries(form), previous, mode:'self', action:'draft',
    cycleId:cycle, reviewerName:'', id:form.recordId, now}) : previous;
  if (!review) throw new Error('目前沒有可匯出的自評資料。');
  return {...review, contentLoaded:true, managerFeedback:'', score:null};
}
