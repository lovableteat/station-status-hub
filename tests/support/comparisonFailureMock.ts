// Stand-ins for the sign-in, the permissions and the backend, for tests/comparisonFailureLog.browser.cjs.
// The backend part applies the checks of comparison_feedback_private.create_draft (migration 20261013113330), so a
// record the page sends in the test is one the real backend would take.
type Row = Record<string, unknown>;
interface QA { role: "admin" | "member"; rows: Row[]; calls: string[]; offline: boolean; refuse: string }
declare global { interface Window { __failureQA: QA } }

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const query = new URLSearchParams(window.location.search);
// The stand-in backend keeps its rows over a reload of the page, as a real one does.
const KEPT = "comparison-failure-qa-rows";
window.__failureQA ??= { role: query.get("role") === "member" ? "member" : "admin", rows: JSON.parse(sessionStorage.getItem(KEPT) ?? "[]"), calls: [], offline: false, refuse: "" };
const qa = window.__failureQA;
const keep = () => sessionStorage.setItem(KEPT, JSON.stringify(qa.rows));

const user = { userId: ACCOUNT, username: "qa", displayName: "QA 測試員", role: qa.role };
export function useUser() { return { user, sessionMode: "authenticated" as const }; }
export function usePermissions() { return { canEditModule: () => true, canViewModule: () => true }; }

const reply = <T,>(data: T, count?: number) => qa.offline ? { data: null, count: null, error: { message: "TypeError: Failed to fetch" } } : { data, count: count ?? null, error: null };
const fail = (message: string) => ({ data: null, count: null, error: { message } });

function createDraft(args: Row) {
  const title = String(args.p_title ?? ""), description = String(args.p_description ?? ""), context = args.p_context as Row;
  if (args.p_reporter_id !== ACCOUNT) return fail("需要安全登入與比對系統檢視權限");
  if (title.trim().length < 1 || title.trim().length > 120 || description.trim().length < 1 || description.trim().length > 4000
    || !["bug", "ui", "suggestion", "other"].includes(String(args.p_category)) || !["compare", "review", "power", "i2c", "library"].includes(String(args.p_tab))
    || typeof args.p_project !== "string" || args.p_project.length > 120) return fail("回報內容格式不正確");
  if (!context || typeof context !== "object" || JSON.stringify(context).length > 4096 || Object.keys(context).some(key => !["browser", "width", "height", "revisionA", "revisionB"].includes(key))) return fail("頁面資訊格式不正確");
  if (!Array.isArray(args.p_images) || args.p_images.length > 5) return fail("最多可附上 5 張截圖");
  if (JSON.stringify(args).includes("\\u0000")) return fail("unsupported Unicode escape sequence");
  const existing = qa.rows.find(row => row.id === args.p_id);
  if (existing?.is_submitted) return reply(existing);
  const now = new Date().toISOString();
  const row: Row = { id: args.p_id, reporter_id: ACCOUNT, attachment_owner_id: ACCOUNT, reporter_name: user.displayName, reporter_username: user.username, title: title.trim(), description: description.trim(),
    category: args.p_category, comparison_tab: args.p_tab, project_name: args.p_project, page_context: context, screenshots: args.p_images, is_submitted: false, status: "new", admin_note: "", reviewed_by: null, created_at: now, submitted_at: null, updated_at: now };
  qa.rows = [...qa.rows.filter(item => item.id !== row.id), row]; keep();
  return reply(row);
}

async function rpc(name: string, args: Row = {}) {
  qa.calls.push(name);
  if (qa.offline) return reply(null);
  if (qa.refuse && name === "create_comparison_feedback_draft") return fail(qa.refuse);
  if (name === "create_comparison_feedback_draft") return createDraft(args);
  if (name === "submit_comparison_feedback") {
    const row = qa.rows.find(item => item.id === args.p_id);
    if (!row) return fail("無法存取這份回報");
    row.is_submitted = true; row.submitted_at = row.updated_at = new Date().toISOString(); keep();
    return reply(row);
  }
  if (name === "comparison_feedback_is_admin") return reply(qa.role === "admin");
  if (name === "review_comparison_feedback") {
    const row = qa.rows.find(item => item.id === args.p_id);
    if (!row) return fail("回報不存在");
    Object.assign(row, { status: args.p_status, admin_note: args.p_note, updated_at: new Date().toISOString() }); keep();
    return reply(row);
  }
  return reply(null);
}

/** Just enough of the query builder for the calls the comparison page makes. */
function from(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let head = false, single = false;
  const builder = {
    select(_columns?: string, options?: { head?: boolean }) { head = Boolean(options?.head); return builder; },
    eq(column: string, value: unknown) { filters.push(row => row[column] === value); return builder; },
    gt(column: string, value: string) { filters.push(row => String(row[column]) > value); return builder; },
    like(column: string, pattern: string) { const prefix = pattern.replace(/%$/, ""); filters.push(row => String(row[column]).startsWith(prefix)); return builder; },
    order() { return builder; },
    limit() { return builder; },
    maybeSingle() { single = true; return builder; },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      qa.calls.push(`from:${table}`);
      const rows = table === "comparison_feedback" ? qa.rows.filter(row => filters.every(test => test(row))).sort((a, b) => String(a.id).localeCompare(String(b.id))) : [];
      return Promise.resolve(head ? reply(null, rows.length) : single ? reply(rows[0] ?? null) : reply(rows)).then(resolve, reject);
    },
  };
  return builder;
}

const bucket = { upload: async () => reply(null), remove: async () => reply(null), download: async () => reply(new Blob()) };
export const supabase = { rpc, from, storage: { from: () => bucket } };
