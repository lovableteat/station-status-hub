import { normalizePerformanceReview } from './performanceData.mjs';

// The manifest is RLS-filtered on every refresh, including access revocations.
// Never download embedded attachments just to discover that nothing changed.
const manifestColumns = 'id,updated_at,employee_id,employee_name,reviewer_name,status';
const unchanged = (row, cached) => cached &&
  row.updated_at === cached.updatedAt && row.employee_id === cached.employeeId &&
  row.employee_name === cached.employeeName && row.reviewer_name === cached.reviewerName &&
  row.status === cached.status;

export async function refreshAssessmentReviews(db, cached = [], isCurrent = () => true) {
  const manifest = await db.from('performance_reviews').select(manifestColumns)
    .order('updated_at', { ascending: false });
  if (manifest.error) throw manifest.error;
  const existing = new Map(cached.map(row => [row.id, row]));
  const changed = (manifest.data || []).filter(row => !unchanged(row, existing.get(row.id)));
  const fresh = new Map();
  // Bound individual responses rather than downloading every employee's files
  // in a single request. Requests are sequential to limit shared DB pressure.
  for (let start = 0; start < changed.length; start += 10) {
    if (!isCurrent()) return [];
    const result = await db.from('performance_reviews').select('*')
      .in('id', changed.slice(start, start + 10).map(row => row.id));
    if (result.error) throw result.error;
    for (const row of result.data || []) fresh.set(row.id, normalizePerformanceReview(row));
  }
  return (manifest.data || []).flatMap(row => {
    const value = unchanged(row, existing.get(row.id)) ? existing.get(row.id) : fresh.get(row.id);
    // A row revoked/deleted between manifest and content reads stays absent.
    return value ? [value] : [];
  });
}
