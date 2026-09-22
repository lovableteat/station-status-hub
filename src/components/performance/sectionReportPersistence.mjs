import { safeManagerAttachments } from './assessmentAttachmentPolicy.mjs';

// Never retry a write blindly: a disconnected response may already be committed.
export async function confirmSectionReportSave(db, { mode, action, cycle, userId, report, summary, feedback, attachments = [] }) {
  summary = summary?.trim();
  feedback = feedback?.trim();
  attachments = safeManagerAttachments(attachments);
  let writeError;
  try {
    const result = mode === 'compose'
      ? await db.rpc('save_performance_section_report', { p_cycle_id: cycle, p_summary: summary, p_submit: action === 'submit', p_expected_updated_at: report?.updated_at || null })
      : await db.rpc('review_performance_section_report_v2', {
          p_id: report?.id,
          p_action: action,
          p_feedback: feedback,
          p_attachments: attachments,
          p_expected_updated_at: report?.updated_at,
        });
    writeError = result.error;
  } catch (error) { writeError = error; }
  // Explicit database rejections must remain errors, even if another actor wrote similar data.
  if (writeError?.code) throw writeError;
  const result = await db.rpc('get_performance_section_reports', { p_cycle_id: cycle });
  if (result.error) throw result.error;
  const saved = (result.data || []).find(row => report?.id ? row.id === report.id : row.chief_id === userId && row.cycle_id === cycle);
  const status = { draft: 'draft', submit: 'submitted', approve: 'approved', return: 'returned' }[action];
  if (!saved || saved.updated_at === report?.updated_at || saved.status !== status ||
      (mode === 'compose'
        ? saved.summary !== summary
        : saved.director_feedback !== feedback || JSON.stringify(safeManagerAttachments(saved.director_attachments)) !== JSON.stringify(attachments))) {
    throw writeError || new Error('尚未確認儲存結果；請重新確認紀錄，輸入仍保留。');
  }
  return saved;
}
