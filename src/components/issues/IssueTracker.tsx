import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  X,
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
import { fetchAllPages } from "@/hooks/fetchAllPages";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { getEffectivePriority } from "@/lib/issuePriority";
import { replaceWorkspaceHistory } from "@/lib/workspaceHistory";

import { IssueAnalyticsPanel } from "./IssueAnalyticsPanel";
import { IssueCreateDialog } from "./IssueCreateDialog";
import { IssuePDFExportManager } from "./IssuePDFExportManager";
import { IssueProcessHistory } from "./IssueProcessHistory";
import { type Issue, IssueTableView } from "./IssueTableView";
import { type IssueFilters, matchesIssueConditions, readIssueFilters, writeIssueFilters } from "./issueFilters";

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
    pending: "未結問題",
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
  const loadRequest = useRef(0);
  const [filters, setFilters] = useState(() => readIssueFilters(typeof window === "undefined" ? "" : window.location.search));
  const updateFilter = <K extends keyof IssueFilters>(key: K, value: IssueFilters[K]) => {
    const next = { ...filters, [key]: value };
    const url = new URL(window.location.href);
    writeIssueFilters(url, next);
    replaceWorkspaceHistory(url);
    setFilters(next);
  };
  const clearFilters = () => {
    const next = readIssueFilters("");
    const url = new URL(window.location.href);
    writeIssueFilters(url, next);
    replaceWorkspaceHistory(url);
    setFilters(next);
  };
  useEffect(() => {
    const restoreFilters = () => setFilters(readIssueFilters(window.location.search));
    window.addEventListener("popstate", restoreFilters);
    return () => window.removeEventListener("popstate", restoreFilters);
  }, []);
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
    const request = ++loadRequest.current;
    if (!activeProjectId) {
      setIssues([]);
      setLoading(false);
      return;
    }

    if (showLoading) setLoading(true);
    const { data, error } = await fetchAllPages((from, to) =>
      supabase
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
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );

    if (request !== loadRequest.current) return;
    if (error) {
      setLoading(false);
      toast({ title: "問題載入失敗", description: error.message, variant: "destructive" });
      return;
    }

    const issueIds = (data ?? []).map((issue) => issue.id);
    const attachmentRows: Tables<"issue_attachments">[] = [];
    let attachmentError: { message: string } | null = null;
    for (let index = 0; index < issueIds.length; index += 200) {
      const issueIdChunk = issueIds.slice(index, index + 200);
      const attachmentResult = await fetchAllPages((from, to) =>
        supabase
          .from("issue_attachments")
          .select("*")
          .in("issue_id", issueIdChunk)
          .order("id")
          .range(from, to)
      );
      if (request !== loadRequest.current) return;
      if (attachmentResult.error) {
        attachmentError = attachmentResult.error as { message: string };
        break;
      }
      attachmentRows.push(...(attachmentResult.data ?? []));
    }
    if (attachmentError) {
      toast({
        title: "附件載入失敗",
        description: attachmentError.message,
        variant: "destructive",
      });
    }
    const attachmentsByIssue = new Map<string, NonNullable<Issue["attachments"]>>();
    attachmentRows.forEach((attachment) => {
      const list = attachmentsByIssue.get(attachment.issue_id) ?? [];
      list.push(attachment);
      attachmentsByIssue.set(attachment.issue_id, list);
    });

    const normalizedIssues = (data ?? []).map((issue) => ({
        ...issue,
        assigned_engineer: issue.test_systems?.assigned_engineer,
        assigned_to: issue.assigned_to || "",
        attachments: attachmentsByIssue.get(issue.id) ?? [],
        priority: getEffectivePriority(issue.priority, issue.priority_manual, issue.created_at),
        serial_number: issue.test_systems?.serial_number,
        station_name: issue.test_flow_stations?.station_name,
        station_order: issue.test_flow_stations?.station_order,
        status: (issue.status || "open") as WorkspaceIssue["status"],
        system_name: issue.test_systems?.system_name,
        test_item_description: issue.test_flow_items?.description,
        test_item_name: issue.test_flow_items?.item_name,
      }));
    setIssues(normalizedIssues);
    setSelectedIssue((current) => {
      if (!current) return null;
      return normalizedIssues.find((issue) => issue.id === current.id) ?? current;
    });
    setLoading(false);
  }, [activeProjectId, toast]);

  useEffect(() => {
    setIssues([]);
    setSelectedIssue(null);
    void loadIssues();
    return () => { loadRequest.current += 1; };
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
          schema: "workspace",
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
    const keyword = filters.query.trim().toLowerCase();
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
      return matchesSearch && matchesIssueConditions(issue, filters);
    });
  }, [issues, filters]);

  const stationOptions = useMemo(() => [...new Map(issues.filter(issue => issue.station_id).map(issue => [issue.station_id!, issue.station_name || issue.station_id!])).entries()].sort((left, right) => left[1].localeCompare(right[1], "zh-Hant")), [issues]);
  const ownerOptions = useMemo(() => [...new Set(issues.map(issue => issue.assigned_to?.trim()).filter((owner): owner is string => Boolean(owner)))].sort((left, right) => left.localeCompare(right, "zh-Hant")), [issues]);
  const activeFilterChips = [
    { key: "query" as const, field: "搜尋", label: filters.query, active: Boolean(filters.query) },
    { key: "station" as const, field: "站點", label: stationOptions.find(([id]) => id === filters.station)?.[1] || filters.station, active: filters.station !== "all" },
    { key: "status" as const, field: "狀態", label: statusLabel(filters.status), active: filters.status !== "all" },
    { key: "owner" as const, field: "負責人", label: filters.owner === "unassigned" ? "未指派" : filters.owner, active: filters.owner !== "all" },
    { key: "priority" as const, field: "嚴重度", label: priorityLabel(filters.priority), active: filters.priority !== "all" },
    { key: "followUp" as const, field: "追蹤", label: "七日未更新", active: filters.followUp === "stale" },
  ].filter(chip => chip.active);

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
        wrapActionsOnMobile
        description={`${activeProject?.name || "目前專案"} · ${filteredIssues.length} 筆符合條件`}
        actions={
          <>
            <div className="order-2 sm:order-1"><IssuePDFExportManager issues={issues} /></div>
            <div className="order-1 sm:order-2"><IssueCreateDialog onIssueCreated={loadIssues} /></div>
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

        </div>

        <TabsContent value="list" className="mt-3">
          <div data-ui="issue-persistent-filters" className="space-y-2 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 basis-full sm:min-w-[220px] sm:flex-1 sm:basis-auto">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input aria-label="搜尋問題" value={filters.query} onChange={event => updateFilter("query", event.target.value.slice(0, 120))} className="h-11 bg-background pl-9 sm:h-9" placeholder="搜尋機台、序號、站點或問題內容" />
              </div>
              <Select value={filters.station} onValueChange={value => updateFilter("station", value)}>
                <SelectTrigger aria-label="篩選站點" className="h-11 min-w-0 flex-1 basis-[140px] sm:h-9 sm:flex-none sm:basis-auto sm:w-[150px]"><SelectValue placeholder="全部站點" /></SelectTrigger>
                <SelectContent><SelectItem value="all">全部站點</SelectItem>{stationOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}{filters.station !== "all" && !stationOptions.some(([id]) => id === filters.station) && <SelectItem value={filters.station}>{filters.station}</SelectItem>}</SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={value => updateFilter("status", value as IssueFilters["status"])}>
                <SelectTrigger aria-label="篩選狀態" className="h-11 min-w-0 flex-1 basis-[140px] sm:h-9 sm:flex-none sm:basis-auto sm:w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">全部狀態</SelectItem><SelectItem value="pending">未結問題</SelectItem><SelectItem value="open">待處理</SelectItem><SelectItem value="in_progress">處理中</SelectItem><SelectItem value="resolved">已解決</SelectItem><SelectItem value="closed">已關閉</SelectItem></SelectContent>
              </Select>
              <Select value={filters.owner} onValueChange={value => updateFilter("owner", value)}>
                <SelectTrigger aria-label="篩選負責人" className="h-11 min-w-0 flex-1 basis-[140px] sm:h-9 sm:flex-none sm:basis-auto sm:w-[150px]"><SelectValue placeholder="全部負責人" /></SelectTrigger>
                <SelectContent><SelectItem value="all">全部負責人</SelectItem><SelectItem value="unassigned">未指派</SelectItem>{ownerOptions.map(owner => <SelectItem key={owner} value={owner}>{owner}</SelectItem>)}{!["all", "unassigned"].includes(filters.owner) && !ownerOptions.includes(filters.owner) && <SelectItem value={filters.owner}>{filters.owner}</SelectItem>}</SelectContent>
              </Select>
              <Select value={filters.priority} onValueChange={value => updateFilter("priority", value as IssueFilters["priority"])}>
                <SelectTrigger aria-label="篩選嚴重度" className="h-11 min-w-0 flex-1 basis-[140px] sm:h-9 sm:flex-none sm:basis-auto sm:w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">全部嚴重度</SelectItem><SelectItem value="critical">緊急</SelectItem><SelectItem value="high">高</SelectItem><SelectItem value="medium">中</SelectItem><SelectItem value="low">低</SelectItem></SelectContent>
              </Select>
              <Select value={filters.followUp} onValueChange={value => updateFilter("followUp", value as IssueFilters["followUp"])}>
                <SelectTrigger aria-label="篩選追蹤狀態" className="h-11 min-w-0 flex-1 basis-[140px] sm:h-9 sm:flex-none sm:basis-auto sm:w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">全部追蹤狀態</SelectItem><SelectItem value="stale">七日未更新</SelectItem></SelectContent>
              </Select>
            </div>
            {activeFilterChips.length > 0 && <div className="flex flex-wrap gap-2" aria-label="作用中篩選">
              {activeFilterChips.map(chip => <Button key={chip.key} variant="outline" size="sm" className="h-auto min-h-11 max-w-full whitespace-normal break-words px-3 text-xs sm:min-h-9" aria-label={`清除${chip.field}：${chip.label}`} onClick={() => updateFilter(chip.key, readIssueFilters("")[chip.key])}>{chip.field}：{chip.label}<X className="ml-2 h-3.5 w-3.5 shrink-0" aria-hidden="true" /></Button>)}
              <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={clearFilters}>全部清除</Button>
            </div>}
          </div>
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

              <IssueProcessHistory
                processNotes={selectedIssue.process_notes}
                status={selectedIssue.status}
                updatedAt={selectedIssue.updated_at}
              />

              {selectedIssue.solution && (
                <section>
                  <h3 className="text-sm font-semibold text-[#f3f8fc]">解決方案</h3>
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
