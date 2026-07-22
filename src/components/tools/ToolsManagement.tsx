import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import {
  Download,
  Eye,
  File,
  Files,
  Library,
  Loader2,
  Plus,
  Search,
  Terminal,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";

import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

import { CodeStorageManager } from "./CodeStorageManager";
import { CommandLibrary } from "./CommandLibrary";
import { FileUploadDialog, GENERAL_ASSET_CATEGORY } from "./FileUploadDialog";

type ToolRow = Database["public"]["Tables"]["tools_management"]["Row"];
type CodeRow = Database["public"]["Tables"]["code_snippets"]["Row"];
type CommandRow = Database["public"]["Tables"]["command_library"]["Row"];
type AssetKind = "tool" | "code" | "command";
type AssetClass = "tool" | "command" | "general";
type AssetFilter = "all" | AssetClass;
type WorkspaceTab = "applied" | "tools" | "code" | "commands" | "files";

type Asset =
  | {
      category: string;
      description: string;
      detail: string;
      id: string;
      kind: "tool";
      assetClass: AssetClass;
      name: string;
      raw: ToolRow;
      updatedAt: string | null;
    }
  | {
      category: string;
      description: string;
      detail: string;
      id: string;
      kind: "code";
      assetClass: "command";
      name: string;
      raw: CodeRow;
      updatedAt: string | null;
    }
  | {
      category: string;
      description: string;
      detail: string;
      id: string;
      kind: "command";
      assetClass: "command";
      name: string;
      raw: CommandRow;
      updatedAt: string | null;
    };

interface ToolDraft {
  category: string;
  description: string;
  is_required: boolean;
  sop_content: string;
  tool_name: string;
  version: string;
}

const EMPTY_DRAFT: ToolDraft = {
  category: "driver",
  description: "",
  is_required: false,
  sop_content: "",
  tool_name: "",
  version: "",
};

const CATEGORY_LABELS: Record<string, string> = {
  documentation: "文件",
  driver: "驅動程式",
  [GENERAL_ASSET_CATEGORY]: "檔案傳輸",
  other: "其他",
  software: "軟體",
  utility: "工具程式",
};

const ASSET_CLASS_META = {
  command: { icon: Terminal, label: "指令", tone: "border-amber-300/35 bg-amber-300/10 text-amber-100" },
  general: { icon: Files, label: "不特定", tone: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" },
  tool: { icon: Wrench, label: "工具", tone: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" },
};

const ASSET_FILTERS: Array<{ activeClass: string; label: string; value: AssetFilter }> = [
  { activeClass: "border-blue-300/50 bg-blue-300/15 text-blue-50", label: "全部", value: "all" },
  { activeClass: "border-cyan-300/50 bg-cyan-300/15 text-cyan-50", label: "工具", value: "tool" },
  { activeClass: "border-amber-300/50 bg-amber-300/15 text-amber-50", label: "指令", value: "command" },
  { activeClass: "border-emerald-300/50 bg-emerald-300/15 text-emerald-50", label: "不特定", value: "general" },
];

function getAssetClass(tool: ToolRow): AssetClass {
  return tool.category === GENERAL_ASSET_CATEGORY ? "general" : "tool";
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getFileType(fileName: string | null) {
  if (!fileName) return "檔案";
  const extension = fileName.split(".").pop();
  return extension && extension !== fileName ? extension.toUpperCase() : "FILE";
}

function getStoragePath(publicUrl: string | null) {
  if (!publicUrl) return null;
  const marker = "/storage/v1/object/public/task-attachments/";
  try {
    const pathname = new URL(publicUrl).pathname;
    const markerIndex = pathname.indexOf(marker);
    return markerIndex >= 0 ? decodeURIComponent(pathname.slice(markerIndex + marker.length)) : null;
  } catch {
    return null;
  }
}

function emptyAssignments() {
  return {
    code: new Set<string>(),
    command: new Set<string>(),
    tool: new Set<string>(),
  };
}

function formatDate(value: string | null) {
  if (!value) return "尚未更新";
  return new Intl.DateTimeFormat("zh-TW", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function toPlainText(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const sanitized = DOMPurify.sanitize(value, { ALLOWED_TAGS: [] });
  const documentNode = new DOMParser().parseFromString(sanitized, "text/html");
  return documentNode.body.textContent?.replace(/\s+/g, " ").trim() || fallback;
}

function isMissingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return ["42P01", "PGRST200", "PGRST205"].includes(error.code || "") ||
    Boolean(error.message?.includes("test_project_") && error.message?.includes("schema cache"));
}

export function ToolsManagement() {
  const { activeProject, activeProjectId } = useTestProject();
  const { toast } = useToast();
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [snippets, setSnippets] = useState<CodeRow[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [assignments, setAssignments] = useState(emptyAssignments);
  const [assignmentsReady, setAssignmentsReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<WorkspaceTab>(() => {
    if (typeof window === "undefined") return "applied";
    const requested = new URLSearchParams(window.location.search).get("assetView");
    if (requested === "library" || requested === "tools") return "tools";
    if (requested === "code" || requested === "commands" || requested === "files") return requested;
    return "applied";
  });
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<AssetFilter>("all");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editingTool, setEditingTool] = useState<ToolRow | null>(null);
  const [toolDraft, setToolDraft] = useState<ToolDraft>(EMPTY_DRAFT);
  const [toolSheetOpen, setToolSheetOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assigningKey, setAssigningKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAssets() {
      setLoading(true);
      const [toolResult, codeResult, commandResult] = await Promise.all([
        supabase.from("tools_management").select("*").order("updated_at", { ascending: false }),
        supabase.from("code_snippets").select("*").order("updated_at", { ascending: false }),
        supabase
          .from("command_library")
          .select("*")
          .eq("is_active", true)
          .order("updated_at", { ascending: false }),
      ]);

      if (!active) return;
      const firstError = toolResult.error || codeResult.error || commandResult.error;
      if (firstError) {
        toast({ title: "資產載入失敗", description: firstError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const nextTools = toolResult.data ?? [];
      const nextSnippets = codeResult.data ?? [];
      const nextCommands = commandResult.data ?? [];
      setTools(nextTools);
      setSnippets(nextSnippets);
      setCommands(nextCommands);

      if (!activeProjectId) {
        setAssignments(emptyAssignments());
        setAssignmentsReady(true);
        setLoading(false);
        return;
      }

      const [toolAssignments, codeAssignments, commandAssignments] = await Promise.all([
        supabase
          .from("test_project_tool_assignments")
          .select("tool_id")
          .eq("project_id", activeProjectId),
        supabase
          .from("test_project_code_assignments")
          .select("code_snippet_id")
          .eq("project_id", activeProjectId),
        supabase
          .from("test_project_command_assignments")
          .select("command_id")
          .eq("project_id", activeProjectId),
      ]);

      if (!active) return;
      const assignmentErrors = [toolAssignments.error, codeAssignments.error, commandAssignments.error];
      const migrationPending = assignmentErrors.some(isMissingRelation);
      const assignmentError = assignmentErrors.find((error) => error && !isMissingRelation(error));

      if (assignmentError) {
        toast({ title: "專案資產載入失敗", description: assignmentError.message, variant: "destructive" });
      }

      if (migrationPending) {
        setAssignments({
          code: new Set(nextSnippets.map((item) => item.id)),
          command: new Set(nextCommands.map((item) => item.id)),
          tool: new Set(nextTools.map((item) => item.id)),
        });
        setAssignmentsReady(false);
      } else {
        setAssignments({
          code: new Set((codeAssignments.data ?? []).map((item) => item.code_snippet_id)),
          command: new Set((commandAssignments.data ?? []).map((item) => item.command_id)),
          tool: new Set((toolAssignments.data ?? []).map((item) => item.tool_id)),
        });
        setAssignmentsReady(true);
      }
      setLoading(false);
    }

    void loadAssets();
    return () => {
      active = false;
    };
  }, [activeProjectId, refreshKey, toast]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("assetView", tab);
    window.history.replaceState({}, "", url);
  }, [tab]);

  const assets: Asset[] = [
    ...tools.map<Asset>((tool) => ({
      category: tool.category || "other",
      description: toPlainText(tool.description, "未填寫工具說明"),
      detail: tool.category === GENERAL_ASSET_CATEGORY
        ? [getFileType(tool.file_name), formatFileSize(tool.file_size)].filter(Boolean).join(" · ")
        : tool.version || tool.file_name || "未指定版本",
      id: tool.id,
      kind: "tool",
      assetClass: getAssetClass(tool),
      name: tool.tool_name,
      raw: tool,
      updatedAt: tool.updated_at,
    })),
    ...snippets.map<Asset>((snippet) => ({
      category: snippet.category,
      description: toPlainText(snippet.description, "未填寫程式碼說明"),
      detail: snippet.language,
      id: snippet.id,
      kind: "code",
      assetClass: "command",
      name: snippet.title,
      raw: snippet,
      updatedAt: snippet.updated_at,
    })),
    ...commands.map<Asset>((command) => ({
      category: command.category,
      description: toPlainText(command.description, "未填寫指令說明"),
      detail: command.platform,
      id: command.id,
      kind: "command",
      assetClass: "command",
      name: command.name,
      raw: command,
      updatedAt: command.updated_at,
    })),
  ];

  const normalizedSearch = search.trim().toLowerCase();
  const visibleAssets = assets.filter((asset) => {
    const isAssigned = assignments[asset.kind].has(asset.id);
    const matchesScope = tab === "applied"
      ? isAssigned
      : tab === "tools"
        ? asset.assetClass === "tool"
        : tab === "files"
          ? asset.assetClass === "general"
          : false;
    const matchesKind = tab !== "applied" || kindFilter === "all" || asset.assetClass === kindFilter;
    const matchesSearch =
      !normalizedSearch ||
      asset.name.toLowerCase().includes(normalizedSearch) ||
      asset.description.toLowerCase().includes(normalizedSearch) ||
      asset.category.toLowerCase().includes(normalizedSearch) ||
      ASSET_CLASS_META[asset.assetClass].label.toLowerCase().includes(normalizedSearch) ||
      asset.detail.toLowerCase().includes(normalizedSearch);
    return matchesScope && matchesKind && matchesSearch;
  });

  const appliedCount =
    assignments.tool.size + assignments.code.size + assignments.command.size;
  const classCounts = assets.reduce(
    (counts, asset) => ({ ...counts, [asset.assetClass]: counts[asset.assetClass] + 1 }),
    { command: 0, general: 0, tool: 0 },
  );

  const handleWorkspaceTabChange = (nextTab: WorkspaceTab) => {
    if ((tab === "code" || tab === "commands") && nextTab !== tab) {
      setRefreshKey((value) => value + 1);
    }
    setTab(nextTab);
  };

  const openNewTool = () => {
    setEditingTool(null);
    setToolDraft(EMPTY_DRAFT);
    setToolSheetOpen(true);
  };

  const openEditTool = (tool: ToolRow) => {
    setEditingTool(tool);
    setToolDraft({
      category: tool.category || "other",
      description: tool.description || "",
      is_required: Boolean(tool.is_required),
      sop_content: tool.sop_content || "",
      tool_name: tool.tool_name,
      version: tool.version || "",
    });
    setSelectedAsset(null);
    setToolSheetOpen(true);
  };

  const saveTool = async () => {
    if (!toolDraft.tool_name.trim()) {
      toast({ title: `請輸入${toolDraft.category === GENERAL_ASSET_CATEGORY ? "檔案顯示" : "工具"}名稱`, variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      category: toolDraft.category,
      description: toolDraft.description.trim() || null,
      is_required: toolDraft.is_required,
      sop_content: toolDraft.sop_content.trim() || null,
      tool_name: toolDraft.tool_name.trim(),
      upload_status: editingTool?.upload_status || "pending",
      version: toolDraft.version.trim() || null,
    };

    if (editingTool) {
      const { error } = await supabase
        .from("tools_management")
        .update(payload)
        .eq("id", editingTool.id);
      if (error) {
        toast({ title: "工具更新失敗", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("tools_management")
        .insert(payload)
        .select()
        .single();
      if (error) {
        toast({ title: "工具新增失敗", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      if (activeProjectId && assignmentsReady) {
        await supabase.from("test_project_tool_assignments").insert({
          is_required: toolDraft.is_required,
          pinned_version: toolDraft.version.trim() || null,
          project_id: activeProjectId,
          tool_id: data.id,
        });
      }
    }

    const savedAsGeneralAsset = toolDraft.category === GENERAL_ASSET_CATEGORY;
    toast({ title: editingTool ? `${savedAsGeneralAsset ? "檔案資訊" : "工具"}已更新` : "工具已建立並套用" });
    setSaving(false);
    setToolSheetOpen(false);
    setRefreshKey((value) => value + 1);
  };

  const toggleAssignment = async (asset: Asset) => {
    if (!activeProjectId) {
      toast({ title: "請先選擇專案", variant: "destructive" });
      return;
    }
    if (!assignmentsReady) {
      toast({
        title: "專案資產關聯尚未啟用",
        description: "完成資料庫遷移後即可逐項套用資產。",
        variant: "destructive",
      });
      return;
    }

    const assigned = assignments[asset.kind].has(asset.id);
    setAssigningKey(`${asset.kind}:${asset.id}`);
    let error: { message: string } | null = null;

    if (asset.kind === "tool") {
      const result = assigned
        ? await supabase
            .from("test_project_tool_assignments")
            .delete()
            .eq("project_id", activeProjectId)
            .eq("tool_id", asset.id)
        : await supabase.from("test_project_tool_assignments").insert({
            is_required: Boolean(asset.raw.is_required),
            pinned_version: asset.raw.version,
            project_id: activeProjectId,
            tool_id: asset.id,
          });
      error = result.error;
    } else if (asset.kind === "code") {
      const result = assigned
        ? await supabase
            .from("test_project_code_assignments")
            .delete()
            .eq("project_id", activeProjectId)
            .eq("code_snippet_id", asset.id)
        : await supabase.from("test_project_code_assignments").insert({
            code_snippet_id: asset.id,
            project_id: activeProjectId,
          });
      error = result.error;
    } else {
      const result = assigned
        ? await supabase
            .from("test_project_command_assignments")
            .delete()
            .eq("project_id", activeProjectId)
            .eq("command_id", asset.id)
        : await supabase.from("test_project_command_assignments").insert({
            command_id: asset.id,
            project_id: activeProjectId,
          });
      error = result.error;
    }

    if (error) {
      toast({ title: "套用狀態更新失敗", description: error.message, variant: "destructive" });
    } else {
      setAssignments((current) => {
        const next = {
          code: new Set(current.code),
          command: new Set(current.command),
          tool: new Set(current.tool),
        };
        if (assigned) next[asset.kind].delete(asset.id);
        else next[asset.kind].add(asset.id);
        return next;
      });
    }
    setAssigningKey(null);
  };

  const deleteTool = async (tool: ToolRow) => {
    const isGeneralAsset = tool.category === GENERAL_ASSET_CATEGORY;
    if (!window.confirm(`確定要刪除「${tool.tool_name}」？${isGeneralAsset ? "檔案也會從傳輸空間移除。" : ""}`)) return;
    const { error } = await supabase.from("tools_management").delete().eq("id", tool.id);
    if (error) {
      toast({ title: `${isGeneralAsset ? "檔案" : "工具"}刪除失敗`, description: error.message, variant: "destructive" });
      return;
    }
    const storagePath = getStoragePath(tool.file_path);
    if (storagePath) {
      const { error: storageError } = await supabase.storage.from("task-attachments").remove([storagePath]);
      if (storageError) {
        toast({
          title: "資料已刪除，但儲存檔案清理失敗",
          description: storageError.message,
          variant: "destructive",
        });
      }
    }
    setSelectedAsset(null);
    setRefreshKey((value) => value + 1);
    toast({ title: `${isGeneralAsset ? "檔案" : "工具"}已刪除` });
  };

  const downloadTool = async (tool: ToolRow) => {
    if (!tool.file_path) {
      toast({ title: "此資產沒有可下載的檔案", variant: "destructive" });
      return;
    }
    window.open(tool.file_path, "_blank", "noopener,noreferrer");
    await supabase
      .from("tools_management")
      .update({ download_count: (tool.download_count || 0) + 1 })
      .eq("id", tool.id);
  };

  const editingGeneralAsset = editingTool?.category === GENERAL_ASSET_CATEGORY;

  return (
    <div className="maintenance-page space-y-3">
      <MaintenancePageHeader
        icon={Wrench}
        title="工具與資產"
        description={`${activeProject?.name || "未選擇專案"} · 專案資產與公司共用庫`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />上傳不特定檔案
            </Button>
            <Button size="sm" onClick={openNewTool}>
              <Plus className="mr-2 h-4 w-4" />新增工具
            </Button>
          </>
        }
      />

      {!assignmentsReady && (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/[0.08] px-3 py-2 text-sm text-amber-100">
          目前以舊資料相容模式顯示全部資產；資料庫遷移完成後即可逐項套用到專案。
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => handleWorkspaceTabChange(value as WorkspaceTab)}>
        <div data-testid="asset-workspace-navigation" className="maintenance-toolbar flex flex-wrap items-center gap-2 p-2">
          <TabsList className="h-auto min-h-10 flex-wrap justify-start rounded-lg border border-[#23445d] bg-[#06111f] p-1">
            <TabsTrigger value="applied" className="h-8 rounded-md px-3 py-1.5 text-xs">專案已套用 <span className="ml-1.5 font-mono text-[10px] opacity-75">{appliedCount}</span></TabsTrigger>
            <TabsTrigger value="tools" className="h-8 rounded-md px-3 py-1.5 text-xs">工具 <span className="ml-1.5 font-mono text-[10px] opacity-75">{classCounts.tool}</span></TabsTrigger>
            <TabsTrigger value="code" className="h-8 rounded-md px-3 py-1.5 text-xs">程式碼 <span className="ml-1.5 font-mono text-[10px] opacity-75">{snippets.length}</span></TabsTrigger>
            <TabsTrigger value="commands" className="h-8 rounded-md px-3 py-1.5 text-xs">指令 <span className="ml-1.5 font-mono text-[10px] opacity-75">{commands.length}</span></TabsTrigger>
            <TabsTrigger value="files" className="h-8 rounded-md px-3 py-1.5 text-xs">不特定檔案 <span className="ml-1.5 font-mono text-[10px] opacity-75">{classCounts.general}</span></TabsTrigger>
          </TabsList>

          {(tab === "applied" || tab === "tools" || tab === "files") && (
            <>
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a9c0d1]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value.slice(0, 120))}
                  className="h-9 border-[#2a526f] bg-[#06111f] pl-9"
                  placeholder="搜尋名稱、分類、版本或說明"
                />
              </div>
              {tab === "applied" && <div className="flex min-h-9 items-center gap-1 overflow-x-auto rounded-lg border border-[#2a526f] bg-[#06111f] p-1" aria-label="資產分類">
                {ASSET_FILTERS.map((filter) => {
                  const count = filter.value === "all" ? assets.length : classCounts[filter.value];
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      aria-pressed={kindFilter === filter.value}
                      onClick={() => setKindFilter(filter.value)}
                      className={cn(
                        "flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-xs font-semibold text-[#9eb8c9] transition-colors hover:bg-[#10263a] hover:text-[#f3f8fc]",
                        kindFilter === filter.value && filter.activeClass,
                      )}
                    >
                      {filter.label}<span className="font-data text-[10px] opacity-80">{count}</span>
                    </button>
                  );
                })}
              </div>}
            </>
          )}
        </div>

        <TabsContent value="applied" className="mt-3">
          <AssetList
            assets={visibleAssets}
            assignments={assignments}
            assigningKey={assigningKey}
            loading={loading}
            onPreview={setSelectedAsset}
            onToggle={toggleAssignment}
          />
        </TabsContent>
        <TabsContent value="tools" className="mt-3">
          <AssetList
            assets={visibleAssets}
            assignments={assignments}
            assigningKey={assigningKey}
            loading={loading}
            onPreview={setSelectedAsset}
            onToggle={toggleAssignment}
          />
        </TabsContent>
        <TabsContent value="code" className="mt-3 rounded-xl border border-[#2a526f] bg-[#071522] p-3">
          <CodeStorageManager />
        </TabsContent>
        <TabsContent value="commands" className="mt-3 rounded-xl border border-[#2a526f] bg-[#071522] p-3">
          <CommandLibrary />
        </TabsContent>
        <TabsContent value="files" className="mt-3">
          <AssetList
            assets={visibleAssets}
            assignments={assignments}
            assigningKey={assigningKey}
            loading={loading}
            onPreview={setSelectedAsset}
            onToggle={toggleAssignment}
          />
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selectedAsset)} onOpenChange={(open) => !open && setSelectedAsset(null)}>
        <SheetContent className="w-full overflow-y-auto border-[#2a526f] bg-[#071522] sm:max-w-[580px]">
          {selectedAsset && (
            <AssetDetails
              asset={selectedAsset}
              assigned={assignments[selectedAsset.kind].has(selectedAsset.id)}
              onDeleteTool={deleteTool}
              onDownloadTool={downloadTool}
              onEditTool={openEditTool}
              onToggle={toggleAssignment}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={toolSheetOpen} onOpenChange={setToolSheetOpen}>
        <SheetContent className="w-full overflow-y-auto border-[#2a526f] bg-[#071522] sm:max-w-[540px]">
          <SheetHeader className="text-left">
            <SheetTitle className="text-xl text-[#f3f8fc]">{editingGeneralAsset ? "編輯檔案資訊" : editingTool ? "編輯工具" : "新增工具"}</SheetTitle>
            <SheetDescription className="text-[#a9c0d1]">
              {editingGeneralAsset ? "調整傳輸檔案的顯示名稱與說明，不會變更原始檔案。" : "工具建立後可套用到目前專案，也會保留在公司共用庫。"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="asset-tool-name">{editingGeneralAsset ? "顯示名稱" : "工具名稱"}</Label>
              <Input id="asset-tool-name" value={toolDraft.tool_name} onChange={(event) => setToolDraft((value) => ({ ...value, tool_name: event.target.value }))} />
            </div>
            {!editingGeneralAsset && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="asset-tool-version">版本</Label>
                  <Input id="asset-tool-version" value={toolDraft.version} onChange={(event) => setToolDraft((value) => ({ ...value, version: event.target.value }))} placeholder="例如 v1.4.2" />
                </div>
                <div className="space-y-2">
                  <Label>工具用途</Label>
                  <Select value={toolDraft.category} onValueChange={(category) => setToolDraft((value) => ({ ...value, category }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).filter(([value]) => value !== GENERAL_ASSET_CATEGORY).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="asset-tool-description">{editingGeneralAsset ? "檔案說明" : "工具說明"}</Label>
              <Textarea id="asset-tool-description" rows={4} value={toolDraft.description} onChange={(event) => setToolDraft((value) => ({ ...value, description: event.target.value }))} />
            </div>
            {!editingGeneralAsset && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="asset-tool-sop">SOP 內容</Label>
                  <Textarea id="asset-tool-sop" rows={8} value={toolDraft.sop_content} onChange={(event) => setToolDraft((value) => ({ ...value, sop_content: event.target.value }))} placeholder="輸入操作步驟、注意事項或驗證方式" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3">
                  <div><div className="text-sm font-medium text-[#f3f8fc]">必要工具</div><div className="text-xs text-[#a9c0d1]">套用時標示為專案必要資產</div></div>
                  <Switch checked={toolDraft.is_required} onCheckedChange={(is_required) => setToolDraft((value) => ({ ...value, is_required }))} />
                </div>
              </>
            )}
          </div>
          <SheetFooter className="mt-6 flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setToolSheetOpen(false)}>取消</Button>
            <Button onClick={saveTool} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingTool ? "儲存變更" : "建立工具"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <FileUploadDialog
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploadSuccess={() => setRefreshKey((value) => value + 1)}
        projectId={activeProjectId}
        canAssignToProject={assignmentsReady}
      />
    </div>
  );
}

function AssetList({
  assets,
  assignments,
  assigningKey,
  loading,
  onPreview,
  onToggle,
}: {
  assets: Asset[];
  assignments: ReturnType<typeof emptyAssignments>;
  assigningKey: string | null;
  loading: boolean;
  onPreview: (asset: Asset) => void;
  onToggle: (asset: Asset) => void;
}) {
  if (loading) {
    return <div className="maintenance-panel flex min-h-[300px] items-center justify-center text-sm text-[#a9c0d1]"><Loader2 className="mr-2 h-4 w-4 animate-spin" />載入資產中...</div>;
  }
  if (!assets.length) {
    return <div className="maintenance-panel flex min-h-[260px] flex-col items-center justify-center text-center"><Library className="h-8 w-8 text-cyan-100" /><div className="mt-3 font-medium text-[#f3f8fc]">目前沒有符合條件的資產</div><div className="mt-1 text-sm text-[#a9c0d1]">切換到公司共用庫，或調整搜尋與類型篩選。</div></div>;
  }

  return (
    <div className="maintenance-panel overflow-hidden">
      <div className="hidden grid-cols-[minmax(220px,1.4fr)_110px_minmax(150px,1fr)_110px_132px] gap-3 border-b border-[#2a526f] bg-[#0b1b2d] px-4 py-2 text-xs font-medium uppercase tracking-[0.08em] text-[#91aabd] lg:grid">
        <div>資產</div><div>分類</div><div>格式／版本</div><div>更新</div><div className="text-right">專案狀態</div>
      </div>
      <div className="divide-y divide-[#2a526f]/70">
        {assets.map((asset) => {
          const meta = ASSET_CLASS_META[asset.assetClass];
          const Icon = meta.icon;
          const assigned = assignments[asset.kind].has(asset.id);
          const assigning = assigningKey === `${asset.kind}:${asset.id}`;
          const sourceLabel = asset.assetClass === "general"
            ? "檔案傳輸"
            : asset.kind === "code"
              ? "程式碼片段"
              : asset.kind === "command"
                ? "指令範本"
                : CATEGORY_LABELS[asset.category] || asset.category;
          return (
            <div
              key={`${asset.kind}:${asset.id}`}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-l-2 px-4 py-3 transition-colors lg:grid-cols-[minmax(220px,1.4fr)_110px_minmax(150px,1fr)_110px_132px] lg:items-center lg:gap-3",
                asset.assetClass === "tool" && "border-l-cyan-300/45 hover:bg-cyan-300/[0.04]",
                asset.assetClass === "command" && "border-l-amber-300/45 hover:bg-amber-300/[0.04]",
                asset.assetClass === "general" && "border-l-emerald-300/45 hover:bg-emerald-300/[0.04]",
              )}
            >
              <button type="button" onClick={() => onPreview(asset)} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                <div className="truncate text-sm font-semibold text-[#f3f8fc]">{asset.name}</div>
                <div className="mt-0.5 truncate text-xs text-[#a9c0d1]">{asset.description}</div>
              </button>
              <div><Badge variant="outline" className={cn("rounded-md", meta.tone)}><Icon className="mr-1.5 h-3.5 w-3.5" />{meta.label}</Badge></div>
              <div className="min-w-0 text-xs text-[#c7d8e4]"><div className="truncate">{sourceLabel}</div><div className="font-data mt-0.5 truncate text-[#82a2b8]">{asset.detail}</div></div>
              <div className="font-data text-xs text-[#a9c0d1]">{formatDate(asset.updatedAt)}</div>
              <div className="col-span-2 flex items-center justify-end gap-2 lg:col-span-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPreview(asset)} aria-label={`查看 ${asset.name}`}><Eye className="h-4 w-4" /></Button>
                <Button variant={assigned ? "outline" : "default"} size="sm" className="h-8 min-w-[86px]" disabled={assigning} onClick={() => onToggle(asset)}>{assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : assigned ? "移出專案" : "套用專案"}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssetDetails({
  asset,
  assigned,
  onDeleteTool,
  onDownloadTool,
  onEditTool,
  onToggle,
}: {
  asset: Asset;
  assigned: boolean;
  onDeleteTool: (tool: ToolRow) => void;
  onDownloadTool: (tool: ToolRow) => void;
  onEditTool: (tool: ToolRow) => void;
  onToggle: (asset: Asset) => void;
}) {
  const meta = ASSET_CLASS_META[asset.assetClass];
  const Icon = meta.icon;
  const content = asset.kind === "code" ? asset.raw.code_content : asset.kind === "command" ? asset.raw.command : null;
  const isGeneralAsset = asset.assetClass === "general";

  return (
    <>
      <SheetHeader className="text-left">
        <div className="mb-2 flex items-center gap-2"><Badge variant="outline" className={cn("rounded-md", meta.tone)}><Icon className="mr-1.5 h-3.5 w-3.5" />{meta.label}</Badge>{assigned && <Badge variant="outline" className="rounded-md border-emerald-300/30 bg-emerald-300/10 text-emerald-100">已套用</Badge>}</div>
        <SheetTitle className="pr-8 text-xl text-[#f3f8fc]">{asset.name}</SheetTitle>
        <SheetDescription className="text-[#a9c0d1]">{asset.description}</SheetDescription>
      </SheetHeader>
      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3"><div className="text-xs text-[#91aabd]">分類</div><div className="mt-1 text-sm text-[#f3f8fc]">{meta.label}</div></div>
          <div className="rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3"><div className="text-xs text-[#91aabd]">{isGeneralAsset ? "格式／大小" : "版本／平台"}</div><div className="font-data mt-1 text-sm text-[#f3f8fc]">{asset.detail}</div></div>
        </div>
        {content && <pre className="max-h-[360px] overflow-auto whitespace-pre rounded-lg border border-[#2a526f] bg-[#06111f] p-4 font-mono text-sm leading-6 text-[#d9edf7]">{content}</pre>}
        {asset.kind === "tool" && asset.raw.sop_content && <div className="rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-4 text-sm leading-6 text-[#d8e6f0]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(asset.raw.sop_content) }} />}
        {asset.kind === "tool" && asset.raw.file_name && <div className="rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3 text-sm text-[#d8e6f0]"><div className="text-xs text-[#91aabd]">{isGeneralAsset ? "傳輸檔案" : "附件"}</div><div className="mt-1 truncate">{asset.raw.file_name}</div></div>}
      </div>
      <SheetFooter className="mt-6 flex-row flex-wrap justify-end gap-2">
        {asset.kind === "tool" && asset.raw.file_path && <Button variant="outline" onClick={() => onDownloadTool(asset.raw)}><Download className="mr-2 h-4 w-4" />下載</Button>}
        {asset.kind === "tool" && <Button variant="outline" onClick={() => onEditTool(asset.raw)}>{isGeneralAsset ? "編輯檔案資訊" : "編輯工具"}</Button>}
        {asset.kind === "tool" && <Button variant="destructive" onClick={() => onDeleteTool(asset.raw)}><Trash2 className="mr-2 h-4 w-4" />{isGeneralAsset ? "刪除檔案" : "刪除"}</Button>}
        <Button onClick={() => onToggle(asset)}>{assigned ? "移出目前專案" : "套用到目前專案"}</Button>
      </SheetFooter>
    </>
  );
}
