import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  total_members: number;
  completed_members: number;
  updated_at: string;
}

export function PerformanceSectionReports({
  userId,
  cycle,
  ready,
}: {
  userId: string;
  cycle: string;
  ready: boolean;
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
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
        setEditor(null);
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
    setEditor({ mode, report });
    setText(
      mode === "compose"
        ? report?.summary || ""
        : report?.director_feedback || "",
    );
    setSaveError("");
  };
  const submit = async (action: "draft" | "submit" | "approve" | "return") => {
    if (!editor || saving || !ready) return;
    if ((action === "submit" || action === "return") && !text.trim()) {
      setSaveError(
        action === "return"
          ? "請填寫需要課長補充的內容。"
          : "請填寫本課彙整內容。",
      );
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const result =
        editor.mode === "compose"
          ? await privacyDb.rpc("save_performance_section_report", {
              p_cycle_id: cycle,
              p_summary: text,
              p_submit: action === "submit",
              p_expected_updated_at: editor.report?.updated_at || null,
            })
          : await privacyDb.rpc("review_performance_section_report", {
              p_id: editor.report?.id,
              p_action: action,
              p_feedback: text,
              p_expected_updated_at: editor.report?.updated_at,
            });
      if (!alive.current) return;
      if (result.error) throw result.error;
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
          : "未能儲存，請確認目前主管歸屬、資料保護與送審狀態後重試。",
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
  return (
    <section>
      <header className="rd2-section-header">
        <div>
          <h2>課長彙整與部長審閱</h2>
          <p>
            職員交給課長評核；課長彙整本課成果後送部長。部長查看課長提交的彙整，職員原始考核由直屬課長管理。
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
                彙整時本課 {report.total_members} 人，可查看已完成評核{" "}
                {report.completed_members} 人
              </p>
              <p className="rd2-prewrap">
                {report.summary || "尚未填寫彙整內容"}
              </p>
              {report.director_feedback && (
                <div className="rd2-section-report-feedback">
                  <strong>部長回覆</strong>
                  <p className="rd2-prewrap">{report.director_feedback}</p>
                </div>
              )}
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
          if (!value && !saving) setEditor(null);
        }}
      >
        <DialogContent>
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
            <Field>
              <FieldLabel htmlFor="section-report-content">
                {editor?.mode === "compose" ? "本課彙整" : "部長回覆"}
              </FieldLabel>
              <Textarea
                id="section-report-content"
                rows={9}
                maxLength={editor?.mode === "compose" ? 20000 : 10000}
                disabled={saving}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            {saveError && (
              <p className="rd2-error" role="alert">
                {saveError}
              </p>
            )}
            <div className="rd2-actions">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => setEditor(null)}
              >
                取消
              </Button>
              {editor?.mode === "compose" ? (
                <>
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() => void submit("draft")}
                  >
                    儲存草稿
                  </Button>
                  <Button
                    disabled={saving}
                    onClick={() => void submit("submit")}
                  >
                    送交部長
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() => void submit("return")}
                  >
                    退回課長補充
                  </Button>
                  <Button
                    disabled={saving}
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
    </section>
  );
}
