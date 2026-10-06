import { withAssessmentReadDeadline } from './assessmentRefresh.mjs';
import { normalizePerformanceReview } from './performanceData.mjs';

// Reuse the department read API: a director's section members are not all
// accessible through the direct-supervisor review table. Read only on export.
export async function loadDepartmentExportReviews(db, rows, cycle, isCurrent, onProgress = () => {}) {
  const complete = new Array(rows.length);
  let next = 0;
  let finished = 0;
  let failed = false;
  const check = () => {
    if (failed || !isCurrent()) throw new Error('資料保護狀態已更新，請重新選擇匯出人員。');
  };
  const worker = async () => {
    while (next < rows.length) {
      check();
      const index = next++;
      const row = rows[index];
      if (row.locked || !row.review_id) throw new Error('請先解鎖，並選擇已儲存考核的人員。');
      const result = await withAssessmentReadDeadline(db.rpc('get_performance_department_assessment', {
        p_review_id: row.review_id, p_cycle_id: cycle,
      }));
      check();
      if (result.error || !result.data) throw new Error('無法讀取完整考核資料，請確認群組已解鎖後重試。');
      const review = normalizePerformanceReview(result.data);
      if (review.id !== row.review_id || review.cycleId !== cycle) throw new Error('考核資料不一致，請重新整理後重試。');
      complete[index] = review;
      onProgress(++finished, rows.length);
    }
  };
  try {
    // Bound database traffic instead of fetching every attachment at once.
    await Promise.all(Array.from({ length: Math.min(2, rows.length) }, worker));
    check();
    return complete;
  } catch (error) {
    failed = true;
    throw error;
  }
}
