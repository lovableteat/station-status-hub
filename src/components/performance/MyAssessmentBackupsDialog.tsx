import { useEffect, useMemo, useState } from "react";
import { Archive, CalendarClock, Download, FileJson, LoaderCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CATEGORIES, readSelfAssessment } from "./rd2Assessment.mjs";

// The backup table is introduced by a staged migration and is intentionally
// kept outside the generated database types until the next type refresh.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const performanceDb = supabase as any;

interface AssessmentBackup {
  id: string;
  review_id: string;
  employee_id: string;
  cycle_id: string;
  version_no: number;
  employee_name: string;
  department: string;
  role: string;
  due_date: string | null;
  goals: unknown[];
  self_feedback: string;
  source_updated_at: string;
  submitted_at: string;
}

interface MyAssessmentBackupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const dateTime = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "未設定";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
}

function cycleLabel(cycleId: string) {
  return cycleId.replace(/^performance-/, "").replace(/-/g, " ").toUpperCase();
}

function downloadBackup(backup: AssessmentBackup) {
  const payload = {
    backupVersion: backup.version_no,
    submittedAt: backup.submitted_at,
    sourceUpdatedAt: backup.source_updated_at,
    cycleId: backup.cycle_id,
    employee: {
      id: backup.employee_id,
      name: backup.employee_name,
      department: backup.department,
      role: backup.role,
      dueDate: backup.due_date,
    },
    goals: backup.goals,
    selfFeedback: backup.self_feedback,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `self-assessment-${backup.cycle_id}-v${backup.version_no}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MyAssessmentBackupsDialog({
  open,
  onOpenChange,
}: MyAssessmentBackupsDialogProps) {
  const { toast } = useToast();
  const [backups, setBackups] = useState<AssessmentBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    setSelectedId(null);
    void (async () => {
      const { data, error: queryError } = await performanceDb
        .from("performance_self_assessment_backups")
        .select("id, review_id, employee_id, cycle_id, version_no, employee_name, department, role, due_date, goals, self_feedback, source_updated_at, submitted_at")
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (!active) return;
      if (queryError) {
        setError(queryError.message || "目前無法讀取自評備份。");
        setBackups([]);
      } else {
        setBackups((data || []) as AssessmentBackup[]);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [open]);

  const selected = useMemo(
    () => backups.find((backup) => backup.id === selectedId) || null,
    [backups, selectedId],
  );
  const selectedSelf = selected ? readSelfAssessment(selected.self_feedback) : null;

  const handleDownload = (backup: AssessmentBackup) => {
    try {
      downloadBackup(backup);
      toast({ title: "備份已下載", description: "檔案只包含你的自評內容，不包含主管評分。" });
    } catch {
      toast({ title: "下載失敗", description: "瀏覽器無法建立下載檔案。", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-accent/35 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Archive className="h-5 w-5 text-primary" />
            我的自評備份
          </DialogTitle>
          <DialogDescription>
            每次自評成功送出後自動保留一份，只能由你本人查看與下載。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-6 py-5">
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-accent/45 px-4 py-3 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <p className="leading-6">備份只保存自評、實績與附件資料，不會保存或顯示主管分數與主管回饋。</p>
          </div>

          {loading ? (
            <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
              正在讀取你的備份…
            </div>
          ) : error ? (
            <p className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive" role="alert">
              {error}
            </p>
          ) : backups.length === 0 ? (
            <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-background/25 px-4 text-center">
              <FileJson className="mb-2 h-7 w-7 text-muted-foreground" />
              <p className="font-semibold text-foreground">目前還沒有自評備份</p>
              <p className="mt-1 text-sm text-muted-foreground">下一次自評成功送出後，系統會自動建立備份。</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {backups.map((backup) => {
                const self = readSelfAssessment(backup.self_feedback);
                const isSelected = selectedId === backup.id;
                return (
                  <article key={backup.id} className="rounded-2xl border border-primary/15 bg-background/25 p-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.03)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-foreground">{cycleLabel(backup.cycle_id)}</h3>
                          <Badge variant="secondary">版本 {backup.version_no}</Badge>
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" />
                          送出於 {formatDate(backup.submitted_at)}
                        </p>
                        <p className="mt-2 text-sm text-foreground/80">
                          {backup.department || "未填部門"} · {backup.role || "未填職務"}
                          {self.grade ? ` · 職等 ${self.grade}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedId(isSelected ? null : backup.id)}>
                          {isSelected ? "收合內容" : "查看內容"}
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => handleDownload(backup)}>
                          <Download className="h-4 w-4" />
                          下載
                        </Button>
                      </div>
                    </div>

                    {isSelected && selected && selected.id === backup.id && selectedSelf ? (
                      <div className="mt-4 grid gap-3 border-t border-primary/10 pt-4">
                        {selectedSelf.legacyText ? (
                          <div className="rounded-xl border border-border/70 bg-secondary/40 px-3 py-2 text-sm leading-6 text-foreground/85 whitespace-pre-wrap">
                            {selectedSelf.legacyText}
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-3">
                          {CATEGORIES.map((category) => {
                            const section = selectedSelf.sections[category];
                            return (
                              <div key={category} className="rounded-xl border border-primary/10 bg-secondary/30 p-3">
                                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                                  <span>{category}</span>
                                  <span className="text-primary">{section.selfScore ?? "—"} 分</span>
                                </div>
                                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{section.text || "尚未填寫內容"}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
