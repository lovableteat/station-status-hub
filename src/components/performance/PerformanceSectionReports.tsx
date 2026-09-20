import { SECTION_REPORT_FIELDS, readSectionReportContent, writeSectionReportContent } from "./sectionReportContent.mjs";
import { confirmSectionReportSave } from './sectionReportPersistence.mjs';
import { getSectionReportRoleCopy, readSectionReportFeedbackHistory } from "./sectionReportFeedback.mjs";
import { readAssessmentDraft, keepAssessmentDraft, forgetAssessmentDraft } from './assessmentDrafts.mjs';
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { AssessmentAttachments } from "./AssessmentAttachments";
import type { ReviewAttachment } from "./assessmentTypes";
import { privacyDb } from "./usePerformancePrivacy";
import type { OrganizationMember } from "./PerformanceOrganization";
import { watchPermissionRefresh } from "@/lib/permissionRefresh.mjs";

const STATUS = {
  draft: "彙整草稿",
  submitted: "待部長審閱",
  returned: "部長退回補充",
  approved: "部長已確認",
};
interface SectionReport {
  id: string;
  chief_id: string;
  chief_name: string;
  director_id: string;
  director_name: string;
  cycle_id: string;
  department: string;
  section: string;
  summary: string;
  status: keyof typeof STATUS;
  director_feedback: string;
  director_attachments?: ReviewAttachment[];
  feedback_history?: unknown;
  total_members: number;
  completed_members: number;
  updated_at: string;
}

function SectionReportFeedbackTimeline({ report }: { report: SectionReport }) {
  const history = readSectionReportFeedbackHistory(report.feedback_history);
  if (!history.length && !report.director_feedback && !report.director_attachments?.length) return null;
  return (
    <section className="rd2-section-report-history" aria-label="部長回覆歷程">
      <h4>部長回覆歷程</h4>
      {history.length ? history.slice().reverse().map((event, index) => (
        <details key={event.id} open={index === 0}>
          <summary>
            {event.action === "return" ? "退回補充" : "確認彙整"}
            {event.reviewedAt ? ` · ${new Date(event.reviewedAt).toLocaleString("zh-TW")}` : ""}
            {event.reviewerName ? ` · ${event.reviewerName}` : ""}
          </summary>
          {event.feedback && <p className="rd2-prewrap">{event.feedback}</p>}
          <AssessmentAttachments attachments={event.attachments} readonly />
        </details>
      )) : (
        <div>
          {report.director_feedback && <p className="rd2-prewrap">{report.director_feedback}</p>}
          <AssessmentAttachments attachments={report.director_attachments || []} readonly />
        </div>
      )}
    </section>
  );
}

export function PerformanceSectionReports({
  userId,
  cycle,
  ready,
  onEvaluate,
}: {
  userId: string;
  cycle: string;
  ready: boolean;
  onEvaluate: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const search = params.get("sectionReportSearch") || "";
  const status = params.get("sectionReportStatus") || "";
  const [rows, setRows] = useState<SectionReport[]>([]);
  const [own, setOwn] = useState<OrganizationMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{
    mode: "compose" | "review";
    report: SectionReport | null;
  } | null>(null);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<ReviewAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [content, setContent] = useState(readSectionReportContent());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const draftScope = (mode: string, report: SectionReport | null) => `section:${userId}:${cycle}:${mode}:${report?.id || 'new'}`;
  const editorDraftKey = editor ? draftScope(editor.mode, editor.report) : '';
  const dirty = !!editor && (editor.mode === 'compose'
    ? writeSectionReportContent(content) !== writeSectionReportContent(readSectionReportContent(editor.report?.summary || ''))
    : !!text.trim() || attachments.length > 0);
  const closeEditor = () => {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else {
      forgetAssessmentDraft(editorDraftKey);
      setEditor(null);
    }
  };
  useEffect(() => {
    if (editor && dirty) keepAssessmentDraft(editorDraftKey, editor.report?.updated_at || 'new', { content, text, attachments });
  }, [editor, dirty, editorDraftKey, content, text, attachments]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty && !saving) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);
  const request = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Invalidate every pending load, including background requests.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++request.current;
    };
  }, []);
  const update = (values: Record<string, string | null>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(values).forEach(([key, value]) =>
          value ? next.set(key, value) : next.delete(key),
        );
        return next;
      },
      { replace: true },
    );
  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    setError("");
    if (!ready) {
      setRows([]);
      setOwn(null);
      setEditor(null);
      setLoading(false);
      return;
    }
    try {
      const [reports, organization] = await Promise.all([
        privacyDb.rpc("get_performance_section_reports", { p_cycle_id: cycle }),
        privacyDb.rpc("get_performance_organization"),
      ]);
      if (version !== request.current) return;
      if (reports.error || organization.error) throw new Error("load");
      const next = (reports.data || []) as SectionReport[];
      const member =
        ((organization.data || []) as OrganizationMember[]).find(
          (m) => m.employee_id === userId,
        ) || null;
      setRows(next);
      setOwn(member);
      setEditor((current) => {
        if (!current) return null;
        if (current.mode === "compose" && member?.org_level !== "section_chief")
          return null;
        if (current.report && !next.some((r) => r.id === current.report?.id))
          return null;
        return current;
      });
    } catch {
      if (version === request.current) {
        setRows([]);
        setOwn(null);
        setError("無法讀取課長彙整，請確認連線及資料保護狀態後重新整理。");
      }
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [cycle, ready, userId]);
  useEffect(() => {
    void load();
    const stop = watchPermissionRefresh({
      windowTarget: window,
      documentTarget: document,
      refresh: () => void load(),
    });
    return () => {
      // The counter intentionally includes loads started after this effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++request.current;
      stop();
    };
  }, [load]);
  const open = (mode: "compose" | "review", report: SectionReport | null) => {
    const draft = readAssessmentDraft(draftScope(mode, report), report?.updated_at || 'new');
    setEditor({ mode, report });
    setContent(draft?.content || readSectionReportContent(report?.summary || ""));
    setText(
      draft?.text ?? "",
    );
    setAttachments(draft?.attachments || []);
    setSaveError("");
  };
  const submit = async (action: "draft" | "submit" | "approve" | "return") => {
    if (!editor || saving || attachmentBusy || !ready) return;
    if ((action === "submit" && !content.achievements.trim()) || (action === "return" && !text.trim())) {
      setSaveError(
        action === "return"
          ? "請填寫需要課長補充的內容。"
          : "請填寫本課彙整內容。",
      );
      return;
    }
    if (editor.mode === "compose" && writeSectionReportContent(content).length > 20000) {
      setSaveError("彙整內容過長，請縮短後再儲存（合計上限 20,000 字元）。");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await confirmSectionReportSave(privacyDb, {
        mode: editor.mode, action, cycle, userId, report: editor.report,
        summary: writeSectionReportContent(content), feedback: text, attachments,
      });
      if (!alive.current) return;
      forgetAssessmentDraft(editorDraftKey);
      setEditor(null);
      setNotice(
        action === "submit"
          ? "本課彙整已送交部長。"
          : action === "approve"
            ? "已確認課長彙整。"
            : action === "return"
              ? "已退回課長補充。"
              : "彙整草稿已儲存，尚未送交部長。",
      );
      await load();
    } catch (cause) {
      if (!alive.current) return;
      setSaveError(
        (cause as { code?: string }).code === "40001"
          ? "這份彙整已被更新，請關閉視窗並重新整理後再處理。"
          : "尚未確認儲存結果，輸入仍保留。請先重新確認紀錄狀態，避免重複送出；並檢查連線、主管歸屬與資料保護狀態。",
      );
    } finally {
      if (alive.current) setSaving(false);
    }
  };
  const filtered = rows.filter(
    (r) =>
      (!status || r.status === status) &&
      [r.chief_name, r.department, r.section]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const canCreate =
    own?.org_level === "section_chief" &&
    !!own.manager_id &&
    !rows.some((r) => r.chief_id === userId);
  const roleCopy = getSectionReportRoleCopy(own?.org_level);
  return (
    <section className="rd2-department-overview">
      <header className="rd2-section-header">
        <div>
          <h2>部門績效總覽</h2>
          <p>
            查看各課送交的成果、考核完成進度與待協助事項，將回饋交給課長。
          </p>
        </div>
        <div className="rd2-actions">
          {canCreate && (
            <Button
              onClick={() => open("compose", null)}
              disabled={loading || !ready || !!error}
            >
              <Plus />
              新增本期彙整
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading || saving}
          >
            <RefreshCw />
            重新整理彙整
          </Button>
        </div>
      </header>
      <div className="rd2-work-purpose">
        <div><span>個人評核</span><h3>{roleCopy.heading}</h3><p>{roleCopy.description}</p><Button variant="outline" onClick={onEvaluate}>前往主管評分</Button></div>
        <div data-current="true"><span>目前頁面 · 各課成果</span><h3>掌握進度、回覆課長</h3><p>課長整理成果、問題與資源需求；部長查看彙整並回覆。個人成績不在這頁展開。</p></div>
      </div>
      <div className="rd2-department-metrics" aria-label="本期彙整處理進度">
        {[['可查看彙整', rows.length], ['待部長回覆', rows.filter(r => r.status === 'submitted').length], ['待課長補充', rows.filter(r => r.status === 'returned').length], ['已確認', rows.filter(r => r.status === 'approved').length]].map(([label,value],index) => <div key={String(label)} data-tone={index}><span>{label}</span><strong>{loading || !ready || error ? '—' : value}</strong></div>)}
      </div>
      {!loading && ready && !error && !rows.length && <div className="rd2-overview-guidance" role="status"><h3>{own?.org_level === 'section_chief' ? '從本課成果開始' : '本期尚無可查看的課別彙整'}</h3><p>{own?.org_level === 'section_chief' ? '按「新增本期彙整」，填寫成果、問題與需要部長協助的事項，送出後部長才會收到。' : '課長送出後，這裡會顯示各課成果與待回覆事項。未送出的草稿或尚未解鎖的彙整不會顯示。'}</p><p>{roleCopy.selfHint} 管理員身分不會取得考核成績。</p></div>}
      {notice && (
        <p role="status" className="rd2-hint">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rd2-error">
          {error}
        </p>
      )}
      {!ready && (
        <p className="rd2-hint">
          正在確認資料保護狀態，解鎖後可查看授權範圍內的彙整。
        </p>
      )}
      <div className="rd2-card">
        <div className="rd2-section-report-filters">
          <Field>
            <FieldLabel htmlFor="section-report-search">搜尋</FieldLabel>
            <Input
              id="section-report-search"
              placeholder="課長、部門或課別"
              value={search}
              onChange={(e) => update({ sectionReportSearch: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="section-report-status">送審狀態</FieldLabel>
            <select
              id="section-report-status"
              value={status}
              onChange={(e) => update({ sectionReportStatus: e.target.value })}
            >
              <option value="">全部狀態</option>
              {Object.entries(STATUS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {(search || status) && (
          <div className="rd2-actions">
            {search && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => update({ sectionReportSearch: null })}
                aria-label={`清除搜尋：${search}`}
              >
                搜尋：{search}
                <X />
              </Button>
            )}
            {status && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => update({ sectionReportStatus: null })}
                aria-label="清除送審狀態"
              >
                送審狀態：{STATUS[status as keyof typeof STATUS] || status}
                <X />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                update({ sectionReportSearch: null, sectionReportStatus: null })
              }
            >
              全部清除
            </Button>
          </div>
        )}
        <p className="rd2-hint">
          {loading
            ? "正在讀取…"
            : `顯示 ${filtered.length} / ${rows.length} 份可查看彙整`}
        </p>
        <div className="rd2-section-report-list">
          {filtered.map((report) => (
            <article
              key={report.id}
              className="rd2-section-report"
              data-status={report.status}
              aria-label={`${report.section} ${report.chief_name} 的彙整`}
            >
              <header>
                <h3>
                  {report.section} · {report.chief_name}
                </h3>
                <span className="rd2-pill">{STATUS[report.status]}</span>
              </header>
              <p className="rd2-hint">
                {report.department} · 送交部長：{report.director_name} ·
                彙整時本課 {report.total_members} 人，已完成評核 {report.completed_members} 人
              </p>
              <div className="rd2-report-progress"><progress aria-label={report.section + ' 彙整時考核完成進度'} max={Math.max(1,report.total_members)} value={Math.min(report.total_members, report.completed_members)} /><span>彙整快照 · {new Date(report.updated_at).toLocaleDateString('zh-TW')}，非即時個人成績</span></div>
              <div className="rd2-report-content">{SECTION_REPORT_FIELDS.map(field => <section key={field.key}><h4>{field.label}</h4><p className="rd2-prewrap">{readSectionReportContent(report.summary)[field.key] || '未提供'}</p></section>)}</div>
              <SectionReportFeedbackTimeline report={report} />
              <div className="rd2-actions">
                {report.chief_id === userId &&
                  ["draft", "returned"].includes(report.status) && (
                    <Button
                      variant="outline"
                      disabled={loading || !ready}
                      onClick={() => open("compose", report)}
                    >
                      編輯彙整
                    </Button>
                  )}
                {report.director_id === userId &&
                  own?.org_level === "director" &&
                  report.status === "submitted" && (
                    <Button
                      disabled={loading || !ready}
                      onClick={() => open("review", report)}
                    >
                      審閱課長彙整
                    </Button>
                  )}
              </div>
            </article>
          ))}
          {!loading && !filtered.length && (
            <p className="rd2-empty">目前篩選條件沒有符合的彙整</p>
          )}
        </div>
      </div>
      <Dialog
        open={!!editor}
        onOpenChange={(value) => {
          if (!value) closeEditor();
        }}
      >
        <DialogContent className="rd2-section-report-dialog">
          <DialogHeader>
            <DialogTitle>
              {editor?.mode === "compose" ? "本課績效彙整" : "審閱課長彙整"}
            </DialogTitle>
            <DialogDescription>
              {editor?.mode === "compose"
                ? "整理本課成果、待改善事項及所需協助，完成後送交直屬部長。草稿只在送出後進入部長的審閱清單。"
                : "確認課長彙整，或說明需要補充的內容後退回課長。"}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {editor?.report && <SectionReportFeedbackTimeline report={editor.report} />}
            {editor?.mode === "compose" ? SECTION_REPORT_FIELDS.map(field => <Field key={field.key}><FieldLabel htmlFor={`report-${field.key}`}>{field.label}{field.key === "achievements" ? " *" : ""}</FieldLabel><Textarea id={`report-${field.key}`} rows={4} disabled={saving} value={content[field.key]} placeholder={field.placeholder} onChange={event => setContent(previous => ({ ...previous, [field.key]: event.target.value }))} /></Field>) : <>
            {editor?.report && <div className="rd2-report-content">{SECTION_REPORT_FIELDS.map(field => <section key={field.key}><h4>{field.label}</h4><p className="rd2-prewrap">{readSectionReportContent(editor.report.summary)[field.key] || "未提供"}</p></section>)}</div>}
            <Field>
              <FieldLabel htmlFor="section-report-content">
                本次部長回覆
              </FieldLabel>
              <Textarea
                id="section-report-content"
                rows={9}
                maxLength={10000}
                disabled={saving}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <AssessmentAttachments
              attachments={attachments}
              readonly={false}
              disabled={saving}
              buttonLabel="附加本次回覆檔案"
              label="部長彙整回覆附件"
              onBusy={setAttachmentBusy}
              onError={setSaveError}
              onChange={setAttachments}
            />
            </>}
            {saveError && (
              <p className="rd2-error" role="alert">
                {saveError}
              </p>
            )}
            <div className="rd2-actions">
              <Button
                variant="outline"
                disabled={saving || attachmentBusy}
                onClick={closeEditor}
              >
                取消
              </Button>
              {editor?.mode === "compose" ? (
                <>
                  <Button
                    variant="outline"
                    disabled={saving || attachmentBusy}
                    onClick={() => void submit("draft")}
                  >
                    儲存草稿
                  </Button>
                  <Button
                    disabled={saving || attachmentBusy}
                    onClick={() => void submit("submit")}
                  >
                    送交部長
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    disabled={saving || attachmentBusy}
                    onClick={() => void submit("return")}
                  >
                    退回課長補充
                  </Button>
                  <Button
                    disabled={saving || attachmentBusy}
                    onClick={() => void submit("approve")}
                  >
                    確認彙整
                  </Button>
                </>
              )}
            </div>
          </FieldGroup>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放棄未儲存的內容？</AlertDialogTitle>
            <AlertDialogDescription>本次彙整或回覆尚未儲存。選擇繼續編輯可保留輸入。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>繼續編輯</AlertDialogCancel>
            <AlertDialogAction onClick={() => { forgetAssessmentDraft(editorDraftKey); setEditor(null); }}>放棄並關閉</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
