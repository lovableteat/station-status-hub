import { normalizePerformanceReview } from './performanceData.mjs';

// The manifest is RLS-filtered on every refresh, including access revocations.
// Never download embedded attachments just to discover that nothing changed.
const manifestColumns = 'id,cycle_id,updated_at,employee_id,employee_name,department,role,reviewer_name,status,score,due_date,goals,review_index';
const unchanged = (row, cached) => cached &&
  row.updated_at === cached.updatedAt && row.employee_id === cached.employeeId &&
  row.employee_name === cached.employeeName && row.reviewer_name === cached.reviewerName &&
  row.department === cached.department && row.role === cached.role && row.status === cached.status;
const manifestPageSize = 1000;

async function readManifest(buildQuery, signal) {
  const rows = [];
  for (let from = 0; ; from += manifestPageSize) {
    let query = buildQuery()
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + manifestPageSize - 1);
    if (signal) query = query.abortSignal(signal);
    const result = await query;
    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    if (page.length < manifestPageSize) return rows;
  }
}

// Memory only, bounded to 16 MB. A fresh RLS manifest must authorize a row and
// match its content version before a subsequent page mount can reuse it.
const contentCaches = new WeakMap();
export function clearAssessmentContentCache(db) { contentCaches.delete(db); }
function rememberContents(db, scope, rows) {
  if (!scope) return;
  const cache = contentCaches.get(db) || new Map();
  for (const row of rows) {
    const key = `${scope}:${row.id}`;
    cache.delete(key);
    const bytes = 2 * (row.selfFeedback.length + row.managerFeedback.length);
    if (bytes <= 16_000_000) cache.set(key, {row,bytes});
  }
  let bytes = [...cache.values()].reduce((sum,value) => sum+value.bytes,0);
  for (const [key,value] of cache) {
    if (bytes <= 16_000_000) break;
    bytes -= value.bytes; cache.delete(key);
  }
  contentCaches.set(db,cache);
}

export async function refreshAssessmentReviews(db, cached = [], isCurrent = () => true, signal, scope) {
  const manifest = await readManifest(() => db.from('performance_reviews').select(manifestColumns), signal);
  const existing = new Map(cached.map(row => [row.id, row]));
  if (!isCurrent()) return [];
  return manifest.flatMap(row => {
    const previous = existing.get(row.id) || (scope && contentCaches.get(db)?.get(`${scope}:${row.id}`)?.row);
    const value = unchanged(row, previous) ? previous : normalizePerformanceReview({
      ...row, self_feedback: row.review_index?.selfFeedback || '',
      manager_feedback: row.review_index?.managerFeedback || '', contentLoaded: false,
    });
    return [value];
  });
}

// Only an opened editor/detail or an explicit export reads the full payload.
// Every read still goes through the original review table and its RLS.
export async function loadAssessmentReviewContents(db, rows, isCurrent = () => true, signal, scope) {
  const complete = [];
  for (const row of rows) {
    if (!isCurrent()) throw new Error('考核存取狀態已更新，請重新開啟。');
    if (row.contentLoaded !== false) { complete.push(row); continue; }
    let query = db.from('performance_reviews').select('*').eq('id', row.id).single();
    if (signal) query = query.abortSignal(signal);
    const result = await query;
    if (result.error || !result.data || result.data.id !== row.id) throw result.error || new Error('無法讀取考核內容。');
    complete.push(normalizePerformanceReview(result.data));
  }
  if (!isCurrent()) throw new Error('考核存取狀態已更新，請重新開啟。');
  rememberContents(db,scope,complete);
  return complete;
}

export async function withAssessmentReadDeadline(read, timeoutMs = 15000, abort = () => {}) {
  let timer;
  try {
    return await Promise.race([read, new Promise((_, reject) => {
      timer = setTimeout(() => { abort(); reject(new Error('考核讀取逾時，請重試。')); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

export async function refreshSectionReportContents(db, cycle, cached = []) {
  // Names are joined by get_performance_section_reports; they are not stored
  // columns and therefore cannot be selected from the report table manifest.
  const manifest = await readManifest(() => db.from('performance_section_reports').select('id,updated_at').eq('cycle_id', cycle));
  const existing = new Map(cached.map(row => [row.id, row]));
  if (manifest.every(row => existing.get(row.id)?.updated_at === row.updated_at)) {
    return manifest.map(row => existing.get(row.id));
  }
  const result = await db.rpc('get_performance_section_reports', {p_cycle_id:cycle});
  if (result.error) throw result.error;
  return result.data || [];
}

export function synchronizeSectionReportNames(reports, organization) {
  const names = new Map((organization || []).map(member => [member.employee_id, member.display_name]));
  return (reports || []).map(report => {
    const chiefName = names.get(report.chief_id) || report.chief_name;
    const directorName = names.get(report.director_id) || report.director_name;
    if (chiefName === report.chief_name && directorName === report.director_name) return report;
    return {...report, chief_name: chiefName, director_name: directorName};
  });
}
