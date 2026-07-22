import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bug,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  Image as ImageIcon,
  ListChecks,
  Search,
} from "lucide-react";
import DOMPurify from "dompurify";

import { MaintenanceMetricStrip } from "@/components/maintenance/MaintenanceMetricStrip";
import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import { IssueAnalyticsPanel } from "./IssueAnalyticsPanel";
import { IssueCreateDialog } from "./IssueCreateDialog";
import { IssuePDFExportManager } from "./IssuePDFExportManager";
import { type Issue, IssueTableView } from "./IssueTableView";

type PriorityFilter = "all" | "low" | "medium" | "high" | "critical";
type StatusFilter = "all" | "open" | "in_progress" | "resolved" | "closed";

interface WorkspaceIssue extends Issue {
  assigned_engineer?: string;
  serial_number?: string;
  station_order?: number;
  test_item_description?: string;
}

function priorityLabel(priority: string) {
  return {
    critical: "緊急",
    high: "高",
    low: "低",
    medium: "中",
  }[priority] || priority;
}

function statusLabel(status: string) {
  return {
    closed: "已關閉",
    in_progress: "處理中",
    open: "待處理",
    resolved: "已解決",
  }[status] || status;
}

function statusTone(status: string) {
  if (status === "open") return "border-rose-300/35 bg-rose-300/10 text-rose-100";
  if (status === "in_progress") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
}

function isImageAttachment(attachment: NonNullable<Issue["attachments"]>[number]) {
  return /\.(png|jpe?g|gif|bmp|webp)$/i.test(attachment.file_name);
}

export function IssueTracker() {
  const { activeProject, activeProjectId } = useTestProject();
  const { toast } = useToast();
  const [issues, setIssues] = useState<WorkspaceIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("system") || "";
  });
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeView, setActiveView] = useState("list");
  const [selectedIssue, setSelectedIssue] = useState<WorkspaceIssue | null>(null);
  const [previewImageIndex, setPreviewImageIndex] = useState<number | null>(null);

  const imageAttachments = useMemo(
    () => (selectedIssue?.attachments ?? []).filter(isImageAttachment),
    [selectedIssue]
  );
  const previewImage = previewImageIndex === null
    ? null
    : imageAttachments[previewImageIndex] ?? null;

  const showPreviousImage = useCallback(() => {
    setPreviewImageIndex((currentIndex) => {
      if (currentIndex === null || imageAttachments.length === 0) return null;
      return (currentIndex - 1 + imageAttachments.length) % imageAttachments.length;
    });
  }, [imageAttachments.length]);

  const showNextImage = useCallback(() => {
    setPreviewImageIndex((currentIndex) => {
      if (currentIndex === null || imageAttachments.length === 0) return null;
      return (currentIndex + 1) % imageAttachments.length;
    });
  }, [imageAttachments.length]);

  useEffect(() => {
    if (previewImageIndex === null) return;
    if (imageAttachments.length === 0) {
      setPreviewImageIndex(null);
    } else if (previewImageIndex >= imageAttachments.length) {
      setPreviewImageIndex(0);
    }
  }, [imageAttachments.length, previewImageIndex]);

  useEffect(() => {
    if (previewImageIndex === null || imageAttachments.length < 2) return;

    const handleGalleryKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPreviousImage();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextImage();
      }
    };

    window.addEventListener("keydown", handleGalleryKeyDown);
    return () => window.removeEventListener("keydown", handleGalleryKeyDown);
  }, [imageAttachments.length, previewImageIndex, showNextImage, showPreviousImage]);

  const loadIssues = useCallback(async (showLoading = true) => {
    if (!activeProjectId) {
      setIssues([]);
      setLoading(false);
      return;
    }

    if (showLoading) setLoading(true);
    const { data, error } = await supabase
      .from("issues")
      .select(`
        *,
        test_systems!issues_system_id_fkey (
          system_name,
          assigned_engineer,
          serial_number
        ),
        test_flow_stations!issues_station_id_fkey (
          station_name,
          station_order
        ),
        test_flow_items!issues_test_item_id_fkey (
          item_name,
          description
        )
      `)
      .eq("project_id", activeProjectId)
      .order("created_at", { ascending: false });

    if (error) {
      setLoading(false);
      toast({ title: "問題載入失敗", description: error.message, variant: "destructive" });
      return;
    }

    const issueIds = (data ?? []).map((issue) => issue.id);
    const attachmentResult = issueIds.length
      ? await supabase.from("issue_attachments").select("*").in("issue_id", issueIds)
      : { data: [], error: null };
    const attachmentsByIssue = new Map<string, NonNullable<Issue["attachments"]>>();
    (attachmentResult.data ?? []).forEach((attachment) => {
      const list = attachmentsByIssue.get(attachment.issue_id) ?? [];
      list.push(attachment);
      attachmentsByIssue.set(attachment.issue_id, list);
    });

    setIssues(
      (data ?? []).map((issue) => ({
        ...issue,
        assigned_engineer: issue.test_systems?.assigned_engineer,
        assigned_to: issue.assigned_to || "",
        attachments: attachmentsByIssue.get(issue.id) ?? [],
        priority: (issue.priority || "medium") as WorkspaceIssue["priority"],
        serial_number: issue.test_systems?.serial_number,
        station_name: issue.test_flow_stations?.station_name,
        station_order: issue.test_flow_stations?.station_order,
        status: (issue.status || "open") as WorkspaceIssue["status"],
        system_name: issue.test_systems?.system_name,
        test_item_description: issue.test_flow_items?.description,
        test_item_name: issue.test_flow_items?.item_name,
      }))
    );
    setLoading(false);
  }, [activeProjectId, toast]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  useEffect(() => {
    if (!activeProjectId) return;

    let reloadTimer: number | undefined;
    const channel = supabase
      .channel(`issues:${activeProjectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "issues",
          filter: `project_id=eq.${activeProjectId}`,
        },
        () => {
          if (reloadTimer) window.clearTimeout(reloadTimer);
          reloadTimer = window.setTimeout(() => {
            void loadIssues(false);
          }, 250);
        }
      )
      .subscribe();

    return () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
      void supabase.removeChannel(channel);
    };
  }, [activeProjectId, loadIssues]);

  useEffect(() => {
    const openIssueId = new URLSearchParams(window.location.search).get("openIssue");
    if (!openIssueId) return;
    const issue = issues.find((entry) => entry.id === openIssueId);
    if (issue) setSelectedIssue(issue);
  }, [issues]);

  const filteredIssues = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return issues.filter((issue) => {
      const plainDescription = DOMPurify.sanitize(issue.description || "", { ALLOWED_TAGS: [] }).toLowerCase();
      const matchesSearch =
        !keyword ||
        plainDescription.includes(keyword) ||
        issue.title?.toLowerCase().includes(keyword) ||
        issue.system_name?.toLowerCase().includes(keyword) ||
        issue.serial_number?.toLowerCase().includes(keyword) ||
        issue.station_name?.toLowerCase().includes(keyword) ||
        issue.category?.toLowerCase().includes(keyword);
      const matchesPriority = priorityFilter === "all" || issue.priority === priorityFilter;
      const matchesStatus = statusFilter === "all" || issue.status === statusFilter;
      return matchesSearch && matchesPriority && matchesStatus;
    });
  }, [issues, priorityFilter, searchTerm, statusFilter]);

  const counts = useMemo(
    () =>
      issues.reduce(
        (summary, issue) => {
          if (issue.status === "open") summary.open += 1;
          if (issue.status === "in_progress") summary.inProgress += 1;
          if (issue.status === "resolved" || issue.status === "closed") summary.resolved += 1;
          if (
            issue.priority === "critical" &&
            !["resolved", "closed"].includes(issue.status)
          ) {
            summary.critical += 1;
          }
          return summary;
        },
        { critical: 0, inProgress: 0, open: 0, resolved: 0 }
      ),
    [issues]
  );

  const downloadAttachment = async (
    attachment: NonNullable<Issue["attachments"]>[number]
  ) => {
    const { data, error } = await supabase.storage
      .from("issue-attachments")
      .download(attachment.file_path);
    if (error) return toast({ title: "附件下載失敗", description: error.message, variant: "destructive" });
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.file_name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const publicAttachmentUrl = (path: string) =>
    supabase.storage.from("issue-attachments").getPublicUrl(path).data.publicUrl;

  return (
    <div className="maintenance-page space-y-3">
      <MaintenancePageHeader
        icon={Bug}
        title="問題追蹤"
        description={`${activeProject?.name || "目前專案"} · ${filteredIssues.length} 筆符合條件`}
        actions={
          <>
            <IssuePDFExportManager issues={issues} />
            <IssueCreateDialog onIssueCreated={loadIssues} />
          </>
        }
      />

      <MaintenanceMetricStrip
        metrics={[
          { accent: "rose", icon: AlertTriangle, label: "待處理", value: counts.open },
          { accent: "amber", icon: Clock3, label: "處理中", value: counts.inProgress },
          { accent: "emerald", icon: CheckCircle2, label: "已解決", value: counts.resolved },
          { accent: "rose", icon: AlertTriangle, label: "緊急未結案", value: counts.critical },
        ]}
      />

      <Tabs value={activeView} onValueChange={setActiveView}>
        <div
          data-ui="issue-view-toolbar"
          className="flex flex-wrap items-center gap-2 border-b border-[#2a526f]/70 pb-2"
        >
          <TabsList
            data-ui="issue-view-switch"
            className="h-9 min-h-0 rounded-lg border-0 bg-[#0b1b2d] p-1 shadow-none"
          >
            <TabsTrigger value="list" className="h-7 rounded-md border-0 px-3 py-1 text-xs shadow-none data-[state=active]:border-0"><ListChecks className="mr-2 h-3.5 w-3.5" />問題列表</TabsTrigger>
            <TabsTrigger value="analytics" className="h-7 rounded-md border-0 px-3 py-1 text-xs shadow-none data-[state=active]:border-0"><BarChart3 className="mr-2 h-3.5 w-3.5" />統計報告</TabsTrigger>
          </TabsList>

          {activeView === "list" && (
            <>
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a9c0d1]" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value.slice(0, 120))}
                  className="h-9 border-[#2a526f] bg-[#06111f] pl-9"
                  placeholder="搜尋機台、序號、站點或問題內容"
                />
              </div>
              <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as PriorityFilter)}>
                <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部優先級</SelectItem>
                  <SelectItem value="critical">緊急</SelectItem>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部狀態</SelectItem>
                  <SelectItem value="open">待處理</SelectItem>
                  <SelectItem value="in_progress">處理中</SelectItem>
                  <SelectItem value="resolved">已解決</SelectItem>
                  <SelectItem value="closed">已關閉</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        <TabsContent value="list" className="mt-3">
          {loading ? (
            <div className="maintenance-panel flex min-h-[360px] items-center justify-center text-sm text-[#a9c0d1]">載入問題資料...</div>
          ) : (
            <IssueTableView
              issues={filteredIssues}
              onUpdate={loadIssues}
              onViewIssue={(issue) => setSelectedIssue(issue as WorkspaceIssue)}
            />
          )}
        </TabsContent>
        <TabsContent value="analytics" className="mt-3">
          <IssueAnalyticsPanel issues={issues} />
        </TabsContent>
      </Tabs>

      <Sheet
        open={Boolean(selectedIssue)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewImageIndex(null);
            setSelectedIssue(null);
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto border-[#2a526f] bg-[#071522] sm:max-w-[620px]">
          <SheetHeader className="text-left">
            <SheetTitle className="pr-8 text-xl text-[#f3f8fc]">{selectedIssue?.title || "問題詳情"}</SheetTitle>
            <SheetDescription className="text-[#a9c0d1]">
              {selectedIssue?.system_name || "未關聯機台"} · {selectedIssue?.station_name || "未指定站點"}
            </SheetDescription>
          </SheetHeader>

          {selectedIssue && (
            <div className="mt-5 space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={cn("rounded-md", statusTone(selectedIssue.status))}>{statusLabel(selectedIssue.status)}</Badge>
                <Badge variant="outline" className="rounded-md border-amber-300/35 bg-amber-300/10 text-amber-100">{priorityLabel(selectedIssue.priority)}</Badge>
                {selectedIssue.category && <Badge variant="outline" className="rounded-md">{selectedIssue.category}</Badge>}
              </div>

              <section>
                <h3 className="text-sm font-semibold text-[#f3f8fc]">問題描述</h3>
                <div
                  className="prose prose-invert mt-2 max-w-none rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-4 text-sm leading-6 text-[#d8e6f0]"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedIssue.description || "尚無描述") }}
                />
              </section>

              {selectedIssue.solution && (
                <section>
                  <h3 className="text-sm font-semibold text-[#f3f8fc]">處理方案</h3>
                  <div
                    className="prose prose-invert mt-2 max-w-none rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] p-4 text-sm leading-6 text-emerald-50"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedIssue.solution) }}
                  />
                </section>
              )}

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3"><div className="text-xs text-[#a9c0d1]">負責人</div><div className="mt-1 text-[#f3f8fc]">{selectedIssue.assigned_to || "未分配"}</div></div>
                <div className="rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3"><div className="text-xs text-[#a9c0d1]">建立時間</div><div className="font-data mt-1 text-[#f3f8fc]">{new Date(selectedIssue.created_at).toLocaleString("zh-TW")}</div></div>
              </div>

              {selectedIssue.attachments?.length ? (
                <section>
                  <h3 className="text-sm font-semibold text-[#f3f8fc]">附件</h3>
                  <div className="mt-2 space-y-2">
                    {selectedIssue.attachments.map((attachment) => {
                      const isImage = isImageAttachment(attachment);
                      const imageIndex = isImage
                        ? imageAttachments.findIndex((image) => image.id === attachment.id)
                        : -1;
                      return (
                        <div key={attachment.id} className="flex items-center gap-3 rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3">
                          <ImageIcon className="h-4 w-4 shrink-0 text-cyan-100" />
                          <span className="min-w-0 flex-1 truncate text-sm text-[#d8e6f0]">{attachment.file_name}</span>
                          {isImage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`預覽 ${attachment.file_name}`}
                              onClick={() => {
                                if (imageIndex >= 0) setPreviewImageIndex(imageIndex);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadAttachment(attachment)}><Download className="h-4 w-4" /></Button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={previewImageIndex !== null && Boolean(previewImage)}
        onOpenChange={(open) => !open && setPreviewImageIndex(null)}
      >
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden border-[#2a526f] bg-[#071522] p-0">
          <DialogHeader className="border-b border-[#2a526f] bg-[#0b1b2d] px-5 py-4 pr-14 text-left">
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="text-lg text-[#f3f8fc]">附件預覽</DialogTitle>
                <p className="mt-1 truncate text-sm text-[#a9c0d1]" title={previewImage?.file_name}>
                  {previewImage?.file_name}
                </p>
              </div>
              {previewImageIndex !== null && (
                <Badge variant="outline" className="shrink-0 border-cyan-300/30 bg-cyan-300/10 text-cyan-50">
                  第 {previewImageIndex + 1} / {imageAttachments.length} 張
                </Badge>
              )}
            </div>
          </DialogHeader>

          {previewImage && (
            <>
              <div className="relative flex min-h-[360px] items-center justify-center bg-[#030a11] px-14 py-4 sm:min-h-[520px]">
                <img
                  src={publicAttachmentUrl(previewImage.file_path)}
                  alt={previewImage.file_name}
                  className="max-h-[68vh] max-w-full object-contain"
                />
                {imageAttachments.length > 1 && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="上一張"
                      title="上一張（方向鍵 ←）"
                      className="absolute left-3 h-11 w-11 rounded-full border-[#4b7089] bg-[#10263a]/95 text-[#f3f8fc] hover:border-cyan-200 hover:bg-[#17344d]"
                      onClick={showPreviousImage}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="下一張"
                      title="下一張（方向鍵 →）"
                      className="absolute right-3 h-11 w-11 rounded-full border-[#4b7089] bg-[#10263a]/95 text-[#f3f8fc] hover:border-cyan-200 hover:bg-[#17344d]"
                      onClick={showNextImage}
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </>
                )}
              </div>

              {imageAttachments.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto border-t border-[#2a526f] bg-[#0b1b2d] px-4 py-3">
                  {imageAttachments.map((attachment, index) => (
                    <button
                      key={attachment.id}
                      type="button"
                      aria-label={`切換到第 ${index + 1} 張：${attachment.file_name}`}
                      aria-current={index === previewImageIndex ? "true" : undefined}
                      className={cn(
                        "h-14 w-20 shrink-0 overflow-hidden rounded-lg border bg-[#06111f] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                        index === previewImageIndex
                          ? "border-cyan-300 ring-2 ring-cyan-300/30"
                          : "border-[#2a526f] opacity-70 hover:border-[#5f849c] hover:opacity-100"
                      )}
                      onClick={() => setPreviewImageIndex(index)}
                    >
                      <img
                        src={publicAttachmentUrl(attachment.file_path)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
