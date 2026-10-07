import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ClipboardCheck, Cloud, Pencil, RefreshCw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { User } from "@/components/auth/UserContext";
import { replaceWorkspaceHistory } from "@/lib/workspaceHistory";
import type { SitePlan } from "./dataCenterTypes";
import { loadDailyWorkReports, saveDailyWorkReport, taipeiReportDate, WORK_REPORT_STATUSES, type DailyWorkReport, type WorkReportDraft } from "./dailyWorkReports";

const FILTER_KEYS = { search: "dcReportSearch", site: "dcReportSite", status: "dcReportStatus", owner: "dcReportOwner", date: "dcReportDate" };
function readFilters() {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(Object.entries(FILTER_KEYS).map(([key, param]) => [key, params.get(param) ?? ""])) as Record<keyof typeof FILTER_KEYS, string>;
}
const blankDraft = (siteId: string): WorkReportDraft => ({ report_date: taipeiReportDate(), site_id: siteId, status: "on-track", summary: "", next_steps: "", blockers: "" });
const errorText = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "操作未完成，請檢查連線後重試。";
const statusLabel = (status: string) => Object.prototype.hasOwnProperty.call(WORK_REPORT_STATUSES, status) ? WORK_REPORT_STATUSES[status as keyof typeof WORK_REPORT_STATUSES] : status;

function readDraft(key: string, siteId: string) {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
    const saved = JSON.parse(raw ?? "null");
    if (saved && ["report_date", "site_id", "status", "summary", "next_steps", "blockers"].every(field => typeof saved.draft?.[field] === "string")) {
      const previous = saved.previous && typeof saved.previous.id === "string" && typeof saved.previous.updated_at === "string" ? saved.previous as { id: string; updated_at: string } : null;
      return { draft: saved.draft as WorkReportDraft, previous, corruptRaw: null };
    }
  } catch { /* Preserve damaged drafts before replacing the browser recovery entry. */ }
  return { draft: blankDraft(siteId), previous: null, corruptRaw: raw };
}

interface Props {
  projectId: string;
  projectName: string;
  sites: SitePlan[];
  selectedSiteId: string;
  user: User | null;
  canEdit: boolean;
  onBack: () => void;
  onProjects: () => void;
}

export function DataCenterDailyReports({ projectId, projectName, sites, selectedSiteId, user, canEdit, onBack, onProjects }: Props) {
  const draftKey = `data-center-work-draft:${user?.userId}:${projectId}`;
  const [restored] = useState(() => readDraft(draftKey, selectedSiteId));
  const [draft, setDraft] = useState(restored.draft);
  const [previous, setPrevious] = useState(restored.previous);
  const [pendingReport, setPendingReport] = useState<DailyWorkReport | null>(null);
  const [filters, setFilters] = useState(readFilters);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [receipt, setReceipt] = useState("");
  const active = useRef(true);
  const queryClient = useQueryClient();
  const queryKey = ["data-center-work-reports", user?.userId, projectId];
  const reports = useQuery({ queryKey, queryFn: () => loadDailyWorkReports(projectId), enabled: Boolean(projectId && user), refetchOnWindowFocus: true, retry: 1 });
  const hasText = Boolean(draft.summary || draft.next_steps || draft.blockers);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    const sync = () => setFilters(readFilters());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    if (!user || !projectId) return;
    try {
      if (restored.corruptRaw) window.localStorage.setItem(`${draftKey}:recovery`, restored.corruptRaw);
      if (hasText) window.localStorage.setItem(draftKey, JSON.stringify({ draft, previous }));
      else window.localStorage.removeItem(draftKey);
      setStorageError("");
    } catch { setStorageError("瀏覽器無法暫存草稿，請勿關閉此頁，先複製文字或完成送出。"); }
  }, [draft, draftKey, hasText, previous, projectId, restored.corruptRaw, user]);

  const update = (field: keyof WorkReportDraft, value: string) => {
    setDraft(current => ({ ...current, [field]: value }));
    setReceipt("");
    setSaveError("");
  };
  const updateFilters = (changes: Partial<typeof filters>) => {
    const next = { ...filters, ...changes };
    setFilters(next);
    const url = new URL(window.location.href);
    for (const [key, param] of Object.entries(FILTER_KEYS)) {
      const value = next[key as keyof typeof next];
      if (value) url.searchParams.set(param, value); else url.searchParams.delete(param);
    }
    replaceWorkspaceHistory(url);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit || !user || saving) return;
    if (!sites.some(site => site.id === draft.site_id) && !previous) { setSaveError("回報站點已變更，請重新選擇。"); return; }
    setSaving(true);
    setSaveError("");
    try {
      const saved = await saveDailyWorkReport(projectId, user.userId, draft, previous ?? undefined);
      if (!active.current) return;
      setDraft(blankDraft(selectedSiteId));
      setPrevious(null);
      setReceipt(`已儲存至雲端 · ${new Date(saved.updated_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`);
      void queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      if (active.current) setSaveError(`儲存未確認：${errorText(error)} 草稿仍保留；請重新整理紀錄確認後再送出。`);
    } finally { if (active.current) setSaving(false); }
  };
  const loadForEdit = (report: DailyWorkReport) => {
    setPendingReport(null);
    setDraft({ report_date: report.report_date, site_id: report.site_id, status: report.status, summary: report.summary, next_steps: report.next_steps, blockers: report.blockers });
    setPrevious({ id: report.id, updated_at: report.updated_at });
    setReceipt(""); setSaveError("");
    document.getElementById("dc-work-summary")?.focus();
  };
  const edit = (report: DailyWorkReport) => {
    if (hasText) setPendingReport(report); else loadForEdit(report);
  };
  const rows = reports.data ?? [];
  const owners = new Map(rows.map(row => [row.author_id, row.author?.display_name ?? "未提供姓名"]));
  const siteName = (id: string) => sites.find(site => site.id === id)?.label ?? `${id}（原站點）`;
  const filtered = rows.filter(row => (!filters.search || [row.summary, row.next_steps, row.blockers, row.author?.display_name].join(" ").toLowerCase().includes(filters.search.trim().toLowerCase()))
    && (!filters.site || row.site_id === filters.site) && (!filters.status || row.status === filters.status)
    && (!filters.owner || row.author_id === filters.owner) && (!filters.date || row.report_date === filters.date));
  const chips = [
    ["search", "搜尋", filters.search], ["site", "站點", filters.site && siteName(filters.site)],
    ["status", "狀態", filters.status && statusLabel(filters.status)], ["owner", "回報人", filters.owner && (owners.get(filters.owner) ?? filters.owner)], ["date", "日期", filters.date],
  ].filter(([, , value]) => value);

  return (
    <section className="dc-work-reports" aria-label="每日工作回報">
      <header className="dc-work-heading">
        <div><h2>每日工作回報</h2><p>{projectName || "尚未選擇共用專案"} · 記錄今日完成、下一步與需要的協助。</p></div>
        <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" /> 返回場景</Button>
      </header>
      {!projectId ? <div className="dc-work-empty"><h3>先選擇共用專案</h3><p>回報依 Data Center 專案保存，不會影響機櫃配置。</p><Button onClick={onProjects}>選擇專案</Button></div> : (
        <div className="dc-work-layout">
          <form className="dc-work-form" onSubmit={submit}>
            <div className="dc-work-section-title"><ClipboardCheck className="h-5 w-5" /><h3>{previous ? "修改我的回報" : "填寫工作進度"}</h3></div>
            <p className="dc-work-helper">回報人：{user?.displayName ?? "尚未登入"}。提交後專案成員可查看。</p>
            {!canEdit && <p role="status" className="dc-work-notice">目前為唯讀權限，可查看紀錄，不能送出或修改。</p>}
            {restored.corruptRaw && <p role="status" className="dc-work-notice">原草稿格式無法讀取，已保留原始恢復資料，請勿清除瀏覽器資料。</p>}
            {pendingReport && <div className="dc-work-notice" role="alert"><p>已有未提交的草稿。載入這筆紀錄會取代目前文字。</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setPendingReport(null)}>保留草稿</Button><Button type="button" autoFocus onClick={() => loadForEdit(pendingReport)}>載入這筆回報</Button></div></div>}
            <fieldset disabled={!canEdit || saving}>
              <div className="dc-work-field-pair">
                <label>回報日期<input type="date" value={draft.report_date} min="2000-01-01" max={taipeiReportDate()} disabled={Boolean(previous)} required onChange={event => update("report_date", event.target.value)} /></label>
                <label>工作狀態<select aria-label="工作狀態" value={draft.status} onChange={event => update("status", event.target.value)}>{Object.entries(WORK_REPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <label>回報站點<select aria-label="回報站點" value={draft.site_id} disabled={Boolean(previous)} required onChange={event => update("site_id", event.target.value)}>{sites.map(site => <option key={site.id} value={site.id}>{site.label}</option>)}{!sites.some(site => site.id === draft.site_id) && <option value={draft.site_id}>{siteName(draft.site_id)}</option>}</select></label>
              <label htmlFor="dc-work-summary">今日完成 <span className="dc-work-required">必填</span></label>
              <textarea id="dc-work-summary" rows={5} maxLength={6000} required value={draft.summary} onChange={event => update("summary", event.target.value)} placeholder="做了什麼、完成哪些結果？例如：完成 TPE-B04 線路檢查與測試。" />
              <label htmlFor="dc-work-next">下一步 <span className="dc-work-helper">選填</span></label>
              <textarea id="dc-work-next" rows={2} maxLength={3000} value={draft.next_steps} onChange={event => update("next_steps", event.target.value)} placeholder="預計接著完成的工作。" />
              <label htmlFor="dc-work-blockers">阻礙與需要的協助 <span className="dc-work-helper">選填</span></label>
              <textarea id="dc-work-blockers" rows={2} maxLength={3000} value={draft.blockers} onChange={event => update("blockers", event.target.value)} placeholder="目前卡在哪裡、需要誰協助？" />
            </fieldset>
            {(saveError || storageError) && <p role="alert" className="dc-work-error">{saveError || storageError}</p>}
            <div className="dc-work-submit">
              <p role="status">{receipt ? <><Check className="h-4 w-4" /> {receipt}</> : <><Save className="h-4 w-4" /> {storageError ? "草稿尚未暫存，請先保留文字" : hasText ? "草稿已暫存此瀏覽器，尚未提交" : "填寫時自動暫存草稿"}</>}</p>
              <Button type="submit" disabled={!canEdit || saving || !draft.summary.trim()}><Cloud className="h-4 w-4" /> {saving ? "儲存中…" : previous ? "儲存修改" : "提交回報"}</Button>
            </div>
          </form>

          <section className="dc-work-history" aria-label="工作回報紀錄">
            <div className="dc-work-history-heading"><div><h3>工作回報紀錄</h3><p className="dc-work-helper">最近 500 筆 · {filtered.length} 筆符合</p></div><Button variant="outline" size="sm" onClick={() => void reports.refetch()} disabled={reports.isFetching} aria-label="重新整理回報紀錄"><RefreshCw className={`h-4 w-4 ${reports.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} /></Button></div>
            <div className="dc-work-filters" aria-label="回報篩選">
              <label>搜尋<input type="search" placeholder="搜尋工作內容" value={filters.search} onChange={event => updateFilters({ search: event.target.value })} /></label>
              <label>站點<select aria-label="站點" value={filters.site} onChange={event => updateFilters({ site: event.target.value })}><option value="">全部站點</option>{sites.map(site => <option key={site.id} value={site.id}>{site.label}</option>)}{filters.site && !sites.some(site => site.id === filters.site) && <option value={filters.site}>{siteName(filters.site)}</option>}</select></label>
              <label>狀態<select aria-label="狀態" value={filters.status} onChange={event => updateFilters({ status: event.target.value })}><option value="">全部狀態</option>{Object.entries(WORK_REPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}{filters.status && !Object.prototype.hasOwnProperty.call(WORK_REPORT_STATUSES, filters.status) && <option value={filters.status}>{filters.status}</option>}</select></label>
              <label>回報人<select aria-label="回報人" value={filters.owner} onChange={event => updateFilters({ owner: event.target.value })}><option value="">全部回報人</option>{[...owners].map(([id, name]) => <option key={id} value={id}>{name}</option>)}{filters.owner && !owners.has(filters.owner) && <option value={filters.owner}>{filters.owner}</option>}</select></label>
              <label>日期<input type="date" value={filters.date} onChange={event => updateFilters({ date: event.target.value })} /></label>
            </div>
            {chips.length > 0 && <div className="dc-work-filter-chips" aria-label="作用中的回報篩選">{chips.map(([key, label, value]) => <button key={key} type="button" aria-label={`清除${label}篩選`} onClick={() => updateFilters({ [key]: "" })}>{label}：{value}<X className="h-3.5 w-3.5" /></button>)}<button type="button" onClick={() => updateFilters({ search: "", site: "", status: "", owner: "", date: "" })}>全部清除</button></div>}
            <div className="dc-work-table-wrap">
              <table><thead><tr><th>日期／回報人</th><th>工作內容</th><th>狀態</th></tr></thead><tbody>
                {reports.isPending ? <tr><td colSpan={3} role="status"><div className="dc-work-skeleton" />正在讀取共用回報…</td></tr>
                  : reports.isError ? <tr><td colSpan={3}><p role="alert" className="dc-work-error">無法讀取回報：{errorText(reports.error)}</p><Button variant="outline" onClick={() => void reports.refetch()}>重試讀取</Button></td></tr>
                    : !filtered.length ? <tr><td colSpan={3} className="dc-work-empty"><ClipboardCheck className="mx-auto h-6 w-6" /><h4>{rows.length || chips.length ? "目前篩選條件沒有符合的回報" : "尚無工作回報"}</h4><p>{rows.length || chips.length ? "清除或調整上方條件即可查看其他紀錄。" : "在左側記錄今天完成的工作，提交後會出現在這裡。"}</p></td></tr>
                      : filtered.map(report => <tr key={report.id}><td><time>{report.report_date}</time><p>{report.author?.display_name ?? "未提供姓名"}</p><small>{siteName(report.site_id)}</small></td><td><p className="dc-work-summary">{report.summary}</p>{(report.next_steps || report.blockers) && <details><summary>查看下一步與阻礙</summary>{report.next_steps && <div><strong>下一步</strong><p>{report.next_steps}</p></div>}{report.blockers && <div><strong>需要協助</strong><p>{report.blockers}</p></div>}</details>}{canEdit && report.author_id === user?.userId && <button type="button" className="dc-work-edit" disabled={saving} onClick={() => edit(report)}><Pencil className="h-3.5 w-3.5" />修改我的回報</button>}</td><td><span className="dc-work-status" data-status={report.status}>{statusLabel(report.status)}</span></td></tr>)}
              </tbody></table>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
